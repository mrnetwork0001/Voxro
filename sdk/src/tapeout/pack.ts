/**
 * Bit vectors and byte packing exactly as TapeOut contracts use them (TAP-02 §5):
 * bit i of a vector is bit (i mod 8) of byte floor(i / 8), least significant bit first.
 */
export type Bit = 0 | 1;

/** Pack bits into exactly ceil(n / 8) bytes, unused high bits of the last byte zero. */
export function packBits(bits: ArrayLike<number | boolean>): Uint8Array {
  const out = new Uint8Array((bits.length + 7) >> 3);
  for (let i = 0; i < bits.length; i++) if (bits[i]) out[i >> 3]! |= 1 << (i & 7);
  return out;
}

/**
 * Unpack `n` bits the way the deployed evaluator reads inputs and state:
 * a byte beyond the end reads as 0, bits and bytes beyond `n` are ignored.
 */
export function unpackBits(bytes: Uint8Array, n: number): Bit[] {
  const out = new Array<Bit>(n);
  for (let i = 0; i < n; i++) {
    const byte = i >> 3;
    out[i] = byte < bytes.length ? (((bytes[byte]! >> (i & 7)) & 1) as Bit) : 0;
  }
  return out;
}

/** Integer -> LSB-first bit vector of length n (n <= 31). */
export function bitsFromInt(value: number, n: number): Bit[] {
  if (!Number.isInteger(n) || n < 0 || n > 31) throw new RangeError('bitsFromInt: n must be 0..31');
  if (!Number.isInteger(value) || value < 0 || value >= 2 ** n) {
    throw new RangeError(`bitsFromInt: value ${value} does not fit in ${n} bits`);
  }
  const out = new Array<Bit>(n);
  for (let i = 0; i < n; i++) out[i] = ((value >>> i) & 1) as Bit;
  return out;
}

/** LSB-first bit vector -> integer (at most 31 bits). */
export function intFromBits(bits: ArrayLike<number | boolean>): number {
  if (bits.length > 31) throw new RangeError('intFromBits: at most 31 bits');
  let v = 0;
  for (let i = 0; i < bits.length; i++) if (bits[i]) v |= 1 << i;
  return v >>> 0;
}

const HEX = '0123456789abcdef';

export function bytesToHex(bytes: Uint8Array): `0x${string}` {
  let s = '0x';
  for (let i = 0; i < bytes.length; i++) s += HEX[bytes[i]! >> 4]! + HEX[bytes[i]! & 15]!;
  return s as `0x${string}`;
}

export function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex;
  if (h.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(h)) throw new TypeError(`invalid hex string: ${hex}`);
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
