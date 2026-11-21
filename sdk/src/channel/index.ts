/**
 * TAP-14 (Private Channels Between Containers), the subset Voxro uses for relay notifications:
 *  - canonical JSON (RFC 8785 for the plain values used here),
 *  - the channel key record (§3) and its EIP-712 `ChannelKeys` signature,
 *  - inbox rooms and sealed inbox wires, wire type 0x03 (§6.1),
 *  - the relay methods `relaySend` / `relayRecv` over TAP-13 requests (§11).
 * Verified byte-for-byte against TapeOutProtocol/TAPs assets/tap-14 (inbox.json, channel-keys.json).
 */
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { hashTypedData, keccak256, recoverTypedDataAddress, toHex, type Hex } from 'viem';
import { endpointHex } from '../tapesend/index.js';
import { bytesToHex, hexToBytes } from '../tapeout/pack.js';

export const TAP10_HUB = '0xe61A9C7213a6Aa616C246a2B569e555B417b25ee' as const;
export const CHANNEL_RECORD_PATH = '.well-known/tape-channel.json';
const INBOX_LABEL = new TextEncoder().encode('tape-channel/inbox/v1');
const MAX_WIRE = 16_448;

// ─── canonical JSON (RFC 8785 / TAP-11 §6) for strings, safe integers, booleans, null, arrays, objects ───
export function canonicalJSON(v: unknown): string {
  if (v === null) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || Object.is(v, -0) || (Number.isInteger(v) && Math.abs(v) > Number.MAX_SAFE_INTEGER)) throw new Error('canonicalJSON: number has no canonical form');
    return JSON.stringify(v);
  }
  if (typeof v === 'string') {
    if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(v)) throw new Error('canonicalJSON: unpaired surrogate');
    return JSON.stringify(v);
  }
  if (Array.isArray(v)) return `[${v.map(canonicalJSON).join(',')}]`;
  if (typeof v === 'object') {
    const keys = Object.keys(v as object).filter((k) => (v as Record<string, unknown>)[k] !== undefined);
    for (const k of keys) if (k === '__proto__' || k === 'constructor' || k === 'prototype') throw new Error(`canonicalJSON: forbidden member ${k}`);
    keys.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)); // UTF-16 code-unit order, as RFC 8785 requires
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJSON((v as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  throw new Error('canonicalJSON: unsupported value');
}

/** Strict JSON (TAP-14 §2): RFC 8259, no repeated member names, no __proto__/constructor/prototype. */
export function parseStrictJSON(text: string): unknown {
  let i = 0;
  const ws = () => {
    while (i < text.length && ' \t\n\r'.includes(text[i]!)) i++;
  };
  const fail = (m: string): never => {
    throw new Error(`strict JSON: ${m} at ${i}`);
  };
  const str = (): string => {
    const start = i;
    if (text[i] !== '"') fail('expected string');
    i++;
    while (i < text.length && text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
    if (text[i] !== '"') fail('unterminated string');
    i++;
    return JSON.parse(text.slice(start, i)) as string;
  };
  const value = (): unknown => {
    ws();
    const c = text[i];
    if (c === '{') {
      i++;
      const out: Record<string, unknown> = {};
      const seen = new Set<string>();
      ws();
      if (text[i] === '}') return i++, out;
      for (;;) {
        ws();
        const k = str();
        if (k === '__proto__' || k === 'constructor' || k === 'prototype') fail(`forbidden member ${k}`);
        if (seen.has(k)) fail(`repeated member ${k}`);
        seen.add(k);
        ws();
        if (text[i++] !== ':') fail('expected :');
        Object.defineProperty(out, k, { value: value(), enumerable: true, writable: true, configurable: true });
        ws();
        if (text[i] === ',') { i++; continue; }
        if (text[i] === '}') return i++, out;
        fail('expected , or }');
      }
    }
    if (c === '[') {
      i++;
      const out: unknown[] = [];
      ws();
      if (text[i] === ']') return i++, out;
      for (;;) {
        out.push(value());
        ws();
        if (text[i] === ',') { i++; continue; }
        if (text[i] === ']') return i++, out;
        fail('expected , or ]');
      }
    }
    if (c === '"') return str();
    const m = /^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/.exec(text.slice(i));
    if (!m) fail('unexpected token');
    i += m![0].length;
    return JSON.parse(m![0]);
  };
  const v = value();
  ws();
  if (i !== text.length) fail('trailing data');
  return v;
}

// ─── keys & rooms ─────────────────────────────────────────────────────────────────────────────
/** TAP-10 §14.4 step 3: 32 bytes, top bit clear, canonical, not low order (an all-zero DH also rejects). */
export function checkX25519Public(pk: Uint8Array) {
  if (pk.length !== 32 || (pk[31]! & 0x80) !== 0) throw new Error('bad X25519 public key');
  const u = pk.reduceRight((acc, b) => (acc << 8n) | BigInt(b), 0n);
  if (u >= (1n << 255n) - 19n) throw new Error('non-canonical X25519 public key');
}
function dh(secret: Uint8Array, pub: Uint8Array): Uint8Array {
  checkX25519Public(pub);
  const s = x25519.getSharedSecret(secret, pub);
  if (s.every((b) => b === 0)) throw new Error('low-order X25519 key');
  return s;
}

/** inboxRoom(container, chainId) = SHA-256("tape-channel/inbox/v1" ‖ endpoint(container, chainId)). */
export function inboxRoom(container: string, chainId: number): Uint8Array {
  return sha256(new Uint8Array([...INBOX_LABEL, ...hexToBytes(endpointHex(container, chainId))]));
}

/** §6.1 seal: wire = 0x03 ‖ E ‖ N ‖ XChaCha20-Poly1305(K, N, canonicalJSON(m), aad = label ‖ E ‖ room). */
export function sealInboxWire(p: { recipientKey: Uint8Array; room: Uint8Array; message: object; random: (n: number) => Uint8Array }): Uint8Array {
  const e = p.random(32);
  const E = x25519.getPublicKey(e);
  const N = p.random(24);
  const K = hkdf(sha256, dh(e, p.recipientKey), INBOX_LABEL, new Uint8Array([...E, ...p.recipientKey, ...p.room]), 32);
  e.fill(0);
  const C = xchacha20poly1305(K, N, new Uint8Array([...INBOX_LABEL, ...E, ...p.room])).encrypt(new TextEncoder().encode(canonicalJSON(p.message)));
  const wire = new Uint8Array([0x03, ...E, ...N, ...C]);
  if (wire.length > MAX_WIRE) throw new Error('inbox wire exceeds 16,448 bytes');
  return wire;
}

/** §6.1 open with the recipient's static secret; returns the object (v = 1, string kind) or throws. */
export function openInboxWire(p: { secretKey: Uint8Array; room: Uint8Array; wire: Uint8Array }): { v: 1; kind: string; [k: string]: unknown } {
  const w = p.wire;
  if (w.length < 1 + 32 + 24 + 16 || w[0] !== 0x03) throw new Error('not an inbox wire');
  const E = w.slice(1, 33);
  const N = w.slice(33, 57);
  const R = x25519.getPublicKey(p.secretKey);
  const K = hkdf(sha256, dh(p.secretKey, E), INBOX_LABEL, new Uint8Array([...E, ...R, ...p.room]), 32);
  const plain = xchacha20poly1305(K, N, new Uint8Array([...INBOX_LABEL, ...E, ...p.room])).decrypt(w.slice(57));
  const m = parseStrictJSON(new TextDecoder('utf-8', { fatal: true }).decode(plain)) as Record<string, unknown>;
  if (typeof m !== 'object' || m === null || Array.isArray(m) || m.v !== 1 || typeof m.kind !== 'string') throw new Error('inbox message is not { v: 1, kind }');
  return m as { v: 1; kind: string };
}

// ─── channel key record (§3) ──────────────────────────────────────────────────────────────────
export interface RelayRef {
  url: string;
  container: string;
}
export interface ChannelRecord {
  tapechannel: '1';
  container: string;
  chainId: number;
  x25519: Hex;
  ed25519: Hex;
  issued: number;
  expires: number;
  sig: Hex;
  inbox?: { relays?: RelayRef[]; bus?: string };
}

/** inbox hash = keccak256(canonicalJSON({ relays: [{url, container}…], bus? })). */
export function channelInboxHash(inbox: ChannelRecord['inbox']): Hex {
  const norm: Record<string, unknown> = { relays: (inbox?.relays ?? []).map((r) => ({ url: r.url, container: r.container })) };
  if (inbox?.bus !== undefined) norm.bus = inbox.bus;
  return keccak256(toHex(new TextEncoder().encode(canonicalJSON(norm))));
}

/** EIP-712 typed data the holder signs (§3.2). Pass it to a wallet's signTypedData. */
export function channelKeysTypedData(r: Omit<ChannelRecord, 'sig' | 'tapechannel'>) {
  return {
    domain: { name: 'TapeAPI', version: '1', chainId: r.chainId, verifyingContract: TAP10_HUB },
    types: { ChannelKeys: [
      { name: 'container', type: 'address' },
      { name: 'x25519', type: 'bytes32' },
      { name: 'ed25519', type: 'bytes32' },
      { name: 'inbox', type: 'bytes32' },
      { name: 'issued', type: 'uint64' },
      { name: 'expires', type: 'uint64' },
    ] },
    primaryType: 'ChannelKeys' as const,
    message: { container: r.container as Hex, x25519: r.x25519, ed25519: r.ed25519, inbox: channelInboxHash(r.inbox), issued: BigInt(r.issued), expires: BigInt(r.expires) },
  };
}
export const channelKeysDigest = (r: Omit<ChannelRecord, 'sig' | 'tapechannel'>) => hashTypedData(channelKeysTypedData(r));

/**
 * §3.3 checks that need no chain reads: strict members, key checks, validity window, signature by
 * `holder` (65-byte ECDSA; EIP-1271 holders are not supported here). Returns the parsed record.
 */
export async function verifyChannelRecord(text: string, expect: { container: string; chainId: number; holder: string; now?: number }): Promise<ChannelRecord> {
  if (new TextEncoder().encode(text).length > 4096) throw new Error('record over 4,096 bytes');
  const r = parseStrictJSON(text) as ChannelRecord;
  const hex = (s: unknown, n: number) => typeof s === 'string' && new RegExp(`^0x[0-9a-fA-F]{${n}}$`).test(s);
  if (r.tapechannel !== '1' || !hex(r.container, 40) || !hex(r.x25519, 64) || !hex(r.ed25519, 64) || !Number.isSafeInteger(r.issued) || !Number.isSafeInteger(r.expires) || typeof r.sig !== 'string' || !/^0x([0-9a-fA-F]{2}){65,1024}$/.test(r.sig)) throw new Error('record members invalid');
  if (r.container.toLowerCase() !== expect.container.toLowerCase() || r.chainId !== expect.chainId) throw new Error('record is for another container');
  checkX25519Public(hexToBytes(r.x25519));
  const now = expect.now ?? Math.floor(Date.now() / 1000);
  if (r.issued < 0 || r.issued > now + 300 || r.expires <= now || r.expires <= r.issued || r.expires > now + 31_622_400) throw new Error('record outside its validity window');
  for (const rel of r.inbox?.relays ?? []) if (!hex(rel.container, 40) || typeof rel.url !== 'string' || rel.url.length > 512 || !/^https:\/\//.test(rel.url)) throw new Error('bad relay reference');
  if ((r.inbox?.relays?.length ?? 0) > 4) throw new Error('too many relays');
  const signer = await recoverTypedDataAddress({ ...channelKeysTypedData(r), signature: r.sig });
  if (signer.toLowerCase() !== expect.holder.toLowerCase()) throw new Error('record not signed by the circuit holder');
  return r;
}

// ─── relay methods (§11) over TAP-13 requests ─────────────────────────────────────────────────
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
let reqSeq = 0;
async function call<T>(base: string, method: string, params: object, signal?: AbortSignal): Promise<T> {
  const id = `voxro-${Date.now().toString(36)}-${(reqSeq++).toString(36)}`;
  const res = await fetch(`${base.replace(/\/$/, '')}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, method, params }), ...(signal ? { signal } : {}) });
  const env = (await res.json()) as { id: string; ok: boolean; result?: T; error?: { code: string; message: string } };
  if (!env.ok) throw new Error(`relay ${method}: ${env.error?.code ?? 'error'} ${env.error?.message ?? ''}`.trim());
  if (env.id !== id) throw new Error(`relay ${method}: answer for another request`);
  return env.result as T;
}
export const relaySend = (base: string, room: Uint8Array, wire: Uint8Array) => call<{ i: number; epoch: string }>(base, 'relaySend', { room: bytesToHex(room).slice(2), frame: b64(wire) });
export async function relayRecv(base: string, room: Uint8Array, after: number, epoch: string | null, waitMs = 0, signal?: AbortSignal) {
  const r = await call<{ frames: Array<{ i: number; frame: string }>; next: number; epoch: string | null }>(base, 'relayRecv', { room: bytesToHex(room).slice(2), after, waitMs, epoch }, signal);
  return { ...r, frames: r.frames.map((f) => ({ i: f.i, wire: unb64(f.frame) })) };
}
