/** Byte helpers shared by the TAP-10 code. Hex is always lower-case with a 0x prefix. */
import { keccak_256 } from '@noble/hashes/sha3.js';
import type { Address } from '../tapeout/netlist.js';
import { bytesToHex, concatBytes } from '../tapeout/pack.js';

export type TapeSendErrorCode =
  | 'bad-input'
  | 'bad-key'
  | 'too-large'
  | 'unsupported'
  | 'damaged'
  | 'not-for-key'
  | 'bad-signature'
  | 'signer-mismatch';

/** Error codes match the reference implementation (`@tapekit/send`). */
export class TapeSendError extends Error {
  constructor(
    public readonly code: TapeSendErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'TapeSendError';
  }
}

export function hexBytes(hex: string, expectedLength?: number): Uint8Array {
  if (typeof hex !== 'string' || !/^0x([0-9a-fA-F]{2})*$/.test(hex)) {
    throw new TapeSendError('bad-input', `not 0x hex: ${String(hex).slice(0, 20)}`);
  }
  const out = new Uint8Array((hex.length - 2) / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(2 + i * 2, 4 + i * 2), 16);
  if (expectedLength !== undefined && out.length !== expectedLength) {
    throw new TapeSendError('bad-input', `expected ${expectedLength} bytes, got ${out.length}`);
  }
  return out;
}

/** 32-byte big-endian unsigned integer. */
export function uint256(value: bigint | number | string): Uint8Array {
  let v = BigInt(value);
  if (v < 0n || v >= 1n << 256n) throw new TapeSendError('bad-input', 'uint256 out of range');
  const out = new Uint8Array(32);
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

export const ascii = (text: string): Uint8Array => new TextEncoder().encode(text);

/** Constant-time equality. */
export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/** 20-byte address; accepts any casing. */
export function addressBytes(address: string): Uint8Array {
  return hexBytes(String(address).toLowerCase(), 20);
}

/** EIP-55 checksum. */
export function checksumAddress(address: string): Address {
  const lower = String(address).toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(lower)) throw new TapeSendError('bad-input', `not an address: ${address}`);
  const hash = keccak_256(ascii(lower.slice(2)));
  let out = '0x';
  for (let i = 0; i < 40; i++) {
    const nibble = (hash[i >> 1]! >> (i % 2 === 0 ? 4 : 0)) & 0x0f;
    const ch = lower[2 + i]!;
    out += nibble >= 8 ? ch.toUpperCase() : ch;
  }
  return out as Address;
}

export { bytesToHex, concatBytes as concat };
