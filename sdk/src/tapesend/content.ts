/** TAP-10 §6 — message content (UTF-8 JSON) encoding, strict decoding, and §7 message ids. */
import { keccak_256 } from '@noble/hashes/sha3.js';
import { TapeSendError, ascii, bytesToHex, concat, hexBytes, uint256 } from './bytes.js';
import type { Hex } from './payload.js';

export const SUBJECT_MAX = 200;
export const ATTACHMENTS_MAX = 4;
export const IMAGE_MAX_BYTES = 11_000;
export const IMAGE_MIME = Object.freeze(['image/webp', 'image/jpeg', 'image/png']);
export const IMAGE_MAX_SIDE = 2048;
export const MAX_DEPTH = 32;

const HEX20 = /^0x[0-9a-f]{40}$/;
const HEX32 = /^0x[0-9a-f]{64}$/;
const DECIMAL = /^(0|[1-9][0-9]{0,77})$/;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

export type ImageAttachment = { type: 'image'; mime: string; data: string; w: number; h: number; size?: number };
export type NativeAttachment = { type: 'native'; chainId: number; amount: string; tx: string };
export type Erc20Attachment = { type: 'erc20'; chainId: number; token: string; amount: string; tx: string };
export type Erc721Attachment = { type: 'erc721'; chainId: number; token: string; tokenId: string; tx: string };
export type Attachment = ImageAttachment | NativeAttachment | Erc20Attachment | Erc721Attachment;

function base64Bytes(b64: unknown): Uint8Array | null {
  if (typeof b64 !== 'string' || b64.length % 4 !== 0 || !BASE64.test(b64)) return null;
  try {
    const bin = atob(b64);
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

function imageMagicOk(mime: string, b: Uint8Array): boolean {
  if (mime === 'image/jpeg') return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (mime === 'image/png') return b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  if (mime === 'image/webp') {
    return b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
  }
  return false;
}

/** Real pixel size from the file header (PNG IHDR / WebP VP8, VP8L, VP8X / baseline JPEG SOF); null when unreadable or animated. */
export function imageSize(mime: string, b: Uint8Array): { w: number; h: number } | null {
  const u16be = (i: number) => (b[i]! << 8) | b[i + 1]!;
  const u16le = (i: number) => b[i]! | (b[i + 1]! << 8);
  const u24le = (i: number) => b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16);
  if (mime === 'image/png') {
    if (b.length < 24 || String.fromCharCode(b[12]!, b[13]!, b[14]!, b[15]!) !== 'IHDR') return null;
    const w = ((b[16]! << 24) | (b[17]! << 16) | (b[18]! << 8) | b[19]!) >>> 0;
    const h = ((b[20]! << 24) | (b[21]! << 16) | (b[22]! << 8) | b[23]!) >>> 0;
    for (let i = 8; i + 8 <= b.length; ) {
      const len = ((b[i]! << 24) | (b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!) >>> 0;
      const type = String.fromCharCode(b[i + 4]!, b[i + 5]!, b[i + 6]!, b[i + 7]!);
      if (type === 'acTL') return null;
      if (type === 'IDAT' || type === 'IEND') break;
      i += 12 + len;
    }
    return { w, h };
  }
  if (mime === 'image/webp') {
    if (b.length < 30) return null;
    const fourcc = String.fromCharCode(b[12]!, b[13]!, b[14]!, b[15]!);
    if (fourcc === 'VP8 ') {
      if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
      return { w: u16le(26) & 0x3fff, h: u16le(28) & 0x3fff };
    }
    if (fourcc === 'VP8L') {
      if (b[20] !== 0x2f) return null;
      const bits = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24);
      return { w: (bits & 0x3fff) + 1, h: ((bits >>> 14) & 0x3fff) + 1 };
    }
    if (fourcc === 'VP8X') return b[20]! & 0x02 ? null : { w: u24le(24) + 1, h: u24le(27) + 1 };
    return null;
  }
  if (mime === 'image/jpeg') {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const m = b[i + 1]!;
      if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01 || m === 0xff) {
        i += m === 0xff ? 1 : 2;
        continue;
      }
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return m === 0xc0 || m === 0xc1 ? { h: u16be(i + 5), w: u16be(i + 7) } : null;
      i += 2 + u16be(i + 2);
    }
    return null;
  }
  return null;
}

/** Validate one attachment; returns the normalised attachment or null (an invalid attachment is hidden, not fatal). */
export function checkAttachment(a: unknown): Attachment | null {
  if (!a || typeof a !== 'object' || Array.isArray(a)) return null;
  const o = a as Record<string, unknown>;
  if (o.type === 'image') {
    if (typeof o.mime !== 'string' || !IMAGE_MIME.includes(o.mime)) return null;
    const bytes = base64Bytes(o.data);
    if (!bytes || bytes.length === 0 || bytes.length > IMAGE_MAX_BYTES || !imageMagicOk(o.mime, bytes)) return null;
    const real = imageSize(o.mime, bytes);
    if (!real || real.w < 1 || real.h < 1 || real.w > IMAGE_MAX_SIDE || real.h > IMAGE_MAX_SIDE) return null;
    if (o.w !== real.w || o.h !== real.h) return null;
    return { type: 'image', mime: o.mime, data: o.data as string, w: real.w, h: real.h, size: bytes.length };
  }
  if (o.type !== 'native' && o.type !== 'erc20' && o.type !== 'erc721') return null;
  if (!Number.isSafeInteger(o.chainId) || (o.chainId as number) <= 0) return null;
  const chainId = o.chainId as number;
  const tx = typeof o.tx === 'string' ? o.tx.toLowerCase() : '';
  if (!HEX32.test(tx)) return null;
  if (o.type === 'native') {
    if (typeof o.amount !== 'string' || !DECIMAL.test(o.amount) || o.amount === '0') return null;
    return { type: 'native', chainId, amount: o.amount, tx };
  }
  const token = typeof o.token === 'string' ? o.token.toLowerCase() : '';
  if (!HEX20.test(token)) return null;
  if (o.type === 'erc20') {
    if (typeof o.amount !== 'string' || !DECIMAL.test(o.amount) || o.amount === '0') return null;
    return { type: 'erc20', chainId, token, amount: o.amount, tx };
  }
  if (typeof o.tokenId !== 'string' || !DECIMAL.test(o.tokenId)) return null;
  return { type: 'erc721', chainId, token, tokenId: o.tokenId, tx };
}

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const BIDI = /[\u061c\u115f\u180e\u200b\u200e\u200f\u2028\u2029\u202a-\u202e\u2060-\u2064\u2066-\u2069\u3164\ufeff\uffa0]/g;
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;

/** §6 display rule: bidi and control characters become visible `\u{..}` escapes; render the result as plain text only. */
export function displayText(s: string): string {
  const visible = (c: string) => `\\u{${c.codePointAt(0)!.toString(16)}}`;
  return String(s).replace(BIDI, visible).replace(CONTROL, visible);
}

export interface MessageContent {
  subject?: string;
  body: string;
  ts?: number;
  attachments?: Attachment[];
}

export function encodeContent(m: MessageContent): Uint8Array {
  if (typeof m.body !== 'string') throw new TapeSendError('bad-input', 'body must be a string');
  const obj: Record<string, unknown> = { v: 1, kind: 'message' };
  if (m.subject !== undefined && m.subject !== '') {
    if (typeof m.subject !== 'string') throw new TapeSendError('bad-input', 'subject must be a string');
    if ([...m.subject].length > SUBJECT_MAX) throw new TapeSendError('bad-input', `subject longer than ${SUBJECT_MAX} characters`);
    obj.subject = m.subject;
  }
  obj.body = m.body;
  if (m.attachments !== undefined && m.attachments.length) {
    if (!Array.isArray(m.attachments) || m.attachments.length > ATTACHMENTS_MAX) throw new TapeSendError('bad-input', `at most ${ATTACHMENTS_MAX} attachments`);
    obj.attachments = m.attachments.map((a) => {
      const c = checkAttachment(a);
      if (!c) throw new TapeSendError('bad-input', 'invalid attachment');
      const { size: _size, ...wire } = c as ImageAttachment;
      return wire;
    });
  }
  if (m.ts !== undefined) {
    if (!Number.isSafeInteger(m.ts) || m.ts < 0) throw new TapeSendError('bad-input', 'ts must be a non-negative integer');
    obj.ts = m.ts;
  }
  return new TextEncoder().encode(JSON.stringify(obj));
}

export type DecodedContent =
  | { kind: 'message'; subject: string; body: string; ts: number | null; attachments: Attachment[]; badAttachments: number }
  | { kind: 'unsupported'; value: Record<string, unknown> };

/** Strict decode (§6): invalid UTF-8, BOM, non-object, duplicate member names, lone surrogates and deep nesting are `damaged`. */
export function decodeContent(bytes: Uint8Array): DecodedContent {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new TapeSendError('damaged', 'content is not valid UTF-8');
  }
  if (text.charCodeAt(0) === 0xfeff) throw new TapeSendError('damaged', 'content starts with a BOM');
  assertNoDuplicateKeys(text);
  let value: unknown;
  try {
    value = JSON.parse(text, (_k, v) => {
      if (typeof v === 'string' && LONE_SURROGATE.test(v)) throw new TapeSendError('damaged', 'lone surrogate in string');
      return v;
    });
  } catch (e) {
    if (e instanceof TapeSendError) throw e;
    throw new TapeSendError('damaged', 'content is not JSON');
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TapeSendError('damaged', 'content is not a JSON object');
  const o = value as Record<string, unknown>;
  if (o.v !== 1 || o.kind !== 'message') {
    if ((typeof o.v === 'number' && o.v !== 1) || (typeof o.kind === 'string' && o.kind !== 'message')) return { kind: 'unsupported', value: o };
    throw new TapeSendError('damaged', 'v or kind missing or of the wrong type');
  }
  if (typeof o.body !== 'string') throw new TapeSendError('damaged', 'body missing');
  if (o.subject !== undefined && typeof o.subject !== 'string') throw new TapeSendError('damaged', 'subject is not a string');
  const subject = o.subject === undefined ? '' : [...(o.subject as string)].slice(0, SUBJECT_MAX).join('');
  const ts = Number.isSafeInteger(o.ts) && (o.ts as number) >= 0 ? (o.ts as number) : null;
  const raw = Array.isArray(o.attachments) ? o.attachments.slice(0, ATTACHMENTS_MAX) : [];
  const attachments = raw.map(checkAttachment).filter((x): x is Attachment => x !== null);
  const declared = Array.isArray(o.attachments) ? o.attachments.length : o.attachments === undefined ? 0 : 1;
  return { kind: 'message', subject, body: o.body, ts, attachments, badAttachments: declared - attachments.length };
}

function assertNoDuplicateKeys(text: string): void {
  const stack: Array<Set<string> | null> = [];
  let i = 0;
  let expectKey = false;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') {
      let j = i + 1;
      let raw = '';
      while (j < text.length && text[j] !== '"') {
        if (text[j] === '\\') {
          raw += text[j]! + (text[j + 1] ?? '');
          j += 2;
        } else {
          raw += text[j]!;
          j += 1;
        }
      }
      if (j >= text.length) throw new TapeSendError('damaged', 'unterminated string');
      const top = stack[stack.length - 1];
      if (expectKey && top instanceof Set) {
        let key: string;
        try {
          key = JSON.parse(`"${raw}"`) as string;
        } catch {
          throw new TapeSendError('damaged', 'bad string escape');
        }
        if (LONE_SURROGATE.test(key)) throw new TapeSendError('damaged', 'lone surrogate in member name');
        if (top.has(key)) throw new TapeSendError('damaged', 'duplicate member name');
        top.add(key);
        expectKey = false;
      }
      i = j + 1;
      continue;
    }
    if ((ch === '{' || ch === '[') && stack.length >= MAX_DEPTH) throw new TapeSendError('damaged', `nesting deeper than ${MAX_DEPTH}`);
    if (ch === '{') {
      stack.push(new Set());
      expectKey = true;
    } else if (ch === '[') {
      stack.push(null);
      expectKey = false;
    } else if (ch === '}' || ch === ']') {
      stack.pop();
      expectKey = false;
    } else if (ch === ',') {
      expectKey = stack[stack.length - 1] instanceof Set;
    }
    i += 1;
  }
}

/** §7 message id: keccak256("TAP-10/msg/v2" ‖ uint256(chainId) ‖ hub ‖ to ‖ uint256(inboxIndex)). */
export function messageId(chainId: number | bigint, hub: string, to: string, inboxIndex: number | bigint): Hex {
  return bytesToHex(keccak_256(concat(ascii('TAP-10/msg/v2'), uint256(chainId), hexBytes(hub, 20), hexBytes(to, 32), uint256(inboxIndex))));
}

/** On-chain digest stored by `DeWebHub.send`: keccak256(ref ‖ keccak256(payload)). */
export function digestOf(ref: string | Uint8Array, payload: Uint8Array): Hex {
  const r = typeof ref === 'string' ? hexBytes(ref, 32) : ref;
  if (r.length !== 32) throw new TapeSendError('bad-input', 'ref must be 32 bytes');
  return bytesToHex(keccak_256(concat(r, keccak_256(payload))));
}
