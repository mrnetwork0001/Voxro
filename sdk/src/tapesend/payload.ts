/**
 * TAP-10 §5 — payload encoding, sealing and opening. Byte-identical to `@tapekit/send` v2:
 *   P (93 B) = "TS" ‖ 0x02 ‖ 0x01 ‖ E(32) ‖ N(24) ‖ commit(32) ‖ slotCount(1)
 *   S        = slotCount × (fingerprint(8) ‖ XChaCha20-Poly1305(kek, N, P ‖ T).encrypt(K) (48))
 *   C        = XChaCha20-Poly1305(K, N, P ‖ S ‖ T).encrypt(content)
 *   T        = "TAP-10/X/v2" ‖ to(32) ‖ from(32) ‖ ref(32) ‖ hub(20)
 *   kek      = HKDF-SHA256(x25519(e, R), salt "TAP-10/wrap/v2", info E ‖ R ‖ T, 32)
 */
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { randomBytes } from '@noble/hashes/utils.js';
import { XLAYER_CHAIN_ID } from '../tapeout/addresses.js';
import type { Address } from '../tapeout/netlist.js';
import { TapeSendError, addressBytes, ascii, bytesToHex, concat, equalBytes, hexBytes, uint256 } from './bytes.js';
import { fingerprint } from './keys.js';

export const MAGIC = Uint8Array.of(0x54, 0x53);
export const FORMAT_VERSION = 0x02;
export const KIND_PUBLIC = 0x00;
export const KIND_SEALED = 0x01;
export const MAX_PAYLOAD = 16_000;
export const MAX_SLOTS = 16;
export const PREAMBLE_LENGTH = 93;
export const SLOT_LENGTH = 56;
const TAG = 16;

export const ZERO_REF: `0x${string}` = `0x${'00'.repeat(32)}`;
const ZERO_REF_BYTES = new Uint8Array(32);
const P_FIELD = (1n << 255n) - 19n;

export type Hex = `0x${string}`;

/** Endpoint (32 bytes): uint32(0) ‖ uint64(chainId) ‖ container. Accepts a 20-byte address or a 32-byte endpoint. */
export function endpointBytes(endpoint: string, chainId: number | bigint = XLAYER_CHAIN_ID): Uint8Array {
  const s = String(endpoint);
  if (/^0x[0-9a-fA-F]{64}$/.test(s)) {
    const b = hexBytes(s, 32);
    if (b[0]! | b[1]! | b[2]! | b[3]!) throw new TapeSendError('bad-input', 'endpoint reserved bits must be zero');
    if (b.slice(4, 12).every((x) => x === 0) || b.slice(12).every((x) => x === 0)) {
      throw new TapeSendError('bad-input', 'endpoint chain id and container must be non-zero');
    }
    return b;
  }
  if (!(BigInt(chainId) >= 1n && BigInt(chainId) < 1n << 64n)) throw new TapeSendError('bad-input', 'chainId must fit in 64 bits');
  return concat(new Uint8Array(4), uint256(chainId).slice(24), addressBytes(s));
}

export function endpointHex(container: string, chainId: number | bigint = XLAYER_CHAIN_ID): Hex {
  return bytesToHex(endpointBytes(container, chainId));
}

export function parseEndpoint(endpoint: string): { chainId: bigint; container: Address } {
  const b = endpointBytes(endpoint);
  let chainId = 0n;
  for (let i = 4; i < 12; i++) chainId = (chainId << 8n) | BigInt(b[i]!);
  return { chainId, container: bytesToHex(b.slice(12)) as Address };
}

export interface MessageContext {
  to: string;
  from: string;
  hub: string;
  ref?: string | Uint8Array | null;
  chainId?: number | bigint;
}

function refBytes(ref: MessageContext['ref']): Uint8Array {
  const b = ref === undefined || ref === null ? ZERO_REF_BYTES : typeof ref === 'string' ? hexBytes(ref, 32) : ref;
  if (!(b instanceof Uint8Array) || b.length !== 32) throw new TapeSendError('bad-input', 'ref must be 32 bytes');
  return b;
}

/** T = "TAP-10/X/v2" ‖ to ‖ from ‖ ref ‖ hub. */
export function context(p: MessageContext): Uint8Array {
  const chainId = p.chainId ?? XLAYER_CHAIN_ID;
  return concat(ascii('TAP-10/X/v2'), endpointBytes(p.to, chainId), endpointBytes(p.from, chainId), refBytes(p.ref), addressBytes(p.hub));
}

function sharedSecret(secretKey: Uint8Array, publicKey: Uint8Array): Uint8Array {
  let ss: Uint8Array;
  try {
    ss = x25519.getSharedSecret(secretKey, publicKey);
  } catch {
    throw new TapeSendError('bad-key', 'X25519 key agreement failed (invalid or low-order key)');
  }
  if (ss.every((b) => b === 0)) throw new TapeSendError('bad-key', 'all-zero X25519 shared secret');
  return ss;
}

/** TAP-10 §4.4: canonical encoding (top bit clear, u < p) and not a low-order point. */
export function assertValidPublicKey(publicKey: Uint8Array): void {
  if (!(publicKey instanceof Uint8Array) || publicKey.length !== 32) throw new TapeSendError('bad-key', 'public key must be 32 bytes');
  if (publicKey[31]! & 0x80) throw new TapeSendError('bad-key', 'public key top bit set');
  let u = 0n;
  for (let i = 31; i >= 0; i--) u = (u << 8n) | BigInt(publicKey[i]!);
  if (u >= P_FIELD) throw new TapeSendError('bad-key', 'public key not canonical');
  sharedSecret(Uint8Array.of(...new Uint8Array(31).fill(0x11), 0x41), publicKey);
}

const commitment = (K: Uint8Array): Uint8Array => sha256(concat(ascii('TAP-10/commit/v2'), K));
const kek = (ss: Uint8Array, E: Uint8Array, R: Uint8Array, T: Uint8Array): Uint8Array => hkdf(sha256, ss, ascii('TAP-10/wrap/v2'), concat(E, R, T), 32);

/** §5.2 public (unencrypted) message. */
export function encodePublic(content: Uint8Array): Uint8Array {
  const payload = concat(MAGIC, Uint8Array.of(FORMAT_VERSION, KIND_PUBLIC), content);
  if (payload.length > MAX_PAYLOAD) throw new TapeSendError('too-large', `payload ${payload.length} > ${MAX_PAYLOAD}`);
  return payload;
}

export interface SealParams extends MessageContext {
  content: Uint8Array;
  /** 1..16 X25519 recipient public keys. */
  recipients: Uint8Array[];
  /** Test-vector injection only; production uses the default CSPRNG. */
  random?: (n: number) => Uint8Array;
}

/** §5.3 seal. */
export function seal(p: SealParams): Uint8Array {
  const rand = p.random ?? randomBytes;
  const keys = p.recipients;
  if (!Array.isArray(keys) || keys.length < 1 || keys.length > MAX_SLOTS) throw new TapeSendError('bad-input', `1..${MAX_SLOTS} recipient keys required`);
  for (let i = 0; i < keys.length; i++) {
    assertValidPublicKey(keys[i]!);
    for (let j = 0; j < i; j++) if (equalBytes(keys[i]!, keys[j]!)) throw new TapeSendError('bad-input', 'duplicate recipient key');
  }
  const T = context(p);
  const e = rand(32);
  const E = x25519.getPublicKey(e);
  const N = rand(24);
  const K = rand(32);
  const P = concat(MAGIC, Uint8Array.of(FORMAT_VERSION, KIND_SEALED), E, N, commitment(K), Uint8Array.of(keys.length));
  const slots = keys.map((R) => {
    const kk = kek(sharedSecret(e, R), E, R, T);
    if (equalBytes(kk, K)) throw new TapeSendError('bad-input', 'content key collides with a key-encryption key');
    return concat(fingerprint(R), xchacha20poly1305(kk, N, concat(P, T)).encrypt(K));
  });
  const S = concat(...slots);
  const C = xchacha20poly1305(K, N, concat(P, S, T)).encrypt(p.content);
  const payload = concat(P, S, C);
  if (payload.length > MAX_PAYLOAD) throw new TapeSendError('too-large', `payload ${payload.length} > ${MAX_PAYLOAD}`);
  return payload;
}

export type ParsedPayload =
  | { kind: 'public'; content: Uint8Array }
  | {
      kind: 'sealed';
      E: Uint8Array;
      N: Uint8Array;
      commit: Uint8Array;
      slots: { fingerprint: Uint8Array; wrapped: Uint8Array }[];
      P: Uint8Array;
      S: Uint8Array;
      C: Uint8Array;
    };

/** Parse the header without decrypting. */
export function parsePayload(payload: Uint8Array): ParsedPayload {
  if (!(payload instanceof Uint8Array) || payload.length < 4) throw new TapeSendError('unsupported', 'payload too short');
  if (payload.length > MAX_PAYLOAD) throw new TapeSendError('unsupported', 'payload too large');
  if (payload[0] !== MAGIC[0] || payload[1] !== MAGIC[1] || payload[2] !== FORMAT_VERSION) throw new TapeSendError('unsupported', 'unknown magic or version');
  if (payload[3] === KIND_PUBLIC) return { kind: 'public', content: payload.slice(4) };
  if (payload[3] !== KIND_SEALED) throw new TapeSendError('unsupported', 'unknown kind');
  if (payload.length < PREAMBLE_LENGTH) throw new TapeSendError('damaged', 'sealed payload too short');
  const n = payload[92]!;
  if (n < 1 || n > MAX_SLOTS || payload.length < PREAMBLE_LENGTH + SLOT_LENGTH * n + TAG) throw new TapeSendError('damaged', 'bad slot count or length');
  const slots: { fingerprint: Uint8Array; wrapped: Uint8Array }[] = [];
  for (let i = 0; i < n; i++) {
    const at = PREAMBLE_LENGTH + SLOT_LENGTH * i;
    slots.push({ fingerprint: payload.slice(at, at + 8), wrapped: payload.slice(at + 8, at + SLOT_LENGTH) });
  }
  return {
    kind: 'sealed',
    E: payload.slice(4, 36),
    N: payload.slice(36, 60),
    commit: payload.slice(60, 92),
    slots,
    P: payload.slice(0, PREAMBLE_LENGTH),
    S: payload.slice(PREAMBLE_LENGTH, PREAMBLE_LENGTH + SLOT_LENGTH * n),
    C: payload.slice(PREAMBLE_LENGTH + SLOT_LENGTH * n),
  };
}

export interface OpenParams extends MessageContext {
  payload: Uint8Array;
  secretKey?: Uint8Array;
}

/** §5.3 open. */
export function openPayload(p: OpenParams): { kind: 'public' | 'sealed'; content: Uint8Array } {
  const parsed = parsePayload(p.payload);
  if (parsed.kind === 'public') return { kind: 'public', content: parsed.content };
  try {
    assertValidPublicKey(parsed.E);
  } catch {
    throw new TapeSendError('damaged', 'ephemeral key is invalid');
  }
  if (!p.secretKey) throw new TapeSendError('not-for-key', 'a secret key is required to open a sealed message');
  const T = context(p);
  const R = x25519.getPublicKey(p.secretKey);
  const fp = fingerprint(R);
  let K: Uint8Array | null = null;
  let ss: Uint8Array | null = null;
  let matched = false;
  for (const slot of parsed.slots) {
    if (!equalBytes(slot.fingerprint, fp)) continue;
    matched = true;
    ss ??= sharedSecret(p.secretKey, parsed.E);
    let candidate: Uint8Array;
    try {
      candidate = xchacha20poly1305(kek(ss, parsed.E, R, T), parsed.N, concat(parsed.P, T)).decrypt(slot.wrapped);
    } catch {
      continue;
    }
    if (!equalBytes(commitment(candidate), parsed.commit)) continue;
    K = candidate;
    break;
  }
  if (!K) {
    if (matched) throw new TapeSendError('damaged', 'a key slot for this key did not open');
    throw new TapeSendError('not-for-key', 'no key slot opens with this key');
  }
  try {
    return { kind: 'sealed', content: xchacha20poly1305(K, parsed.N, concat(parsed.P, parsed.S, T)).decrypt(parsed.C) };
  } catch {
    throw new TapeSendError('damaged', 'content failed authentication');
  }
}
