/**
 * TapeOut circuit netlists: record encoding, decoding, well-formedness and the
 * static structure (signal numbering, state layout, gate count) of TAP-02 §2–§4.
 *
 * Error reasons use the exact revert strings of `Circuits.tapeout` (TAP-02 §3) so
 * that a netlist rejected locally is rejected for the same stated reason on chain.
 */
import { bytesToHex, hexToBytes } from './pack.js';

export const OP_NAND = 0x00;
export const OP_LATCH = 0x01;
export const OP_REF = 0x02;

/** Signal 0 is constant 0, signal 1 is constant 1, inputs start at 2. */
export const SIG_ZERO = 0;
export const SIG_ONE = 1;

export const MAX_SIGNALS = 1 << 24;
export const MAX_PINS = 1 << 16;
export const MAX_GATES = 0xffff_ffff;
export const MAX_REF_PINS = 255;

export type Address = `0x${string}`;

export interface NandElement { op: typeof OP_NAND; a: number; b: number }
export interface LatchElement { op: typeof OP_LATCH; d: number }
export interface RefElement { op: typeof OP_REF; cpu: Address; id: bigint; ins: number[]; nOuts: number }
export type Element = NandElement | LatchElement | RefElement;

export interface Netlist {
  nIn: number;
  nOut: number;
  elements: Element[];
}

/** `(nIn, nOut, nState, gateCount)` as returned by `circuitInfo(id)`. */
export interface CircuitShape {
  nIn: number;
  nOut: number;
  nState: number;
  gateCount: number;
}

export class IllFormedError extends Error {
  constructor(public readonly reason: string, detail?: string) {
    super(detail ? `${reason} (${detail})` : reason);
    this.name = 'IllFormedError';
  }
}

export function signalsProduced(e: Element): number {
  return e.op === OP_REF ? e.nOuts : 1;
}

function u24(bytes: Uint8Array, p: number): number {
  return (bytes[p]! << 16) | (bytes[p + 1]! << 8) | bytes[p + 2]!;
}

/** Decode the records of a netlist (TAP-02 §2). Throws `bad opcode` / `truncated record`. */
export function decodeNetlist(bytes: Uint8Array): Element[] {
  const els: Element[] = [];
  let p = 0;
  const need = (k: number) => {
    if (p + k > bytes.length) throw new IllFormedError('truncated record', `at byte ${p}`);
  };
  while (p < bytes.length) {
    const op = bytes[p]!;
    if (op === OP_NAND) {
      need(7);
      els.push({ op: OP_NAND, a: u24(bytes, p + 1), b: u24(bytes, p + 4) });
      p += 7;
    } else if (op === OP_LATCH) {
      need(4);
      els.push({ op: OP_LATCH, d: u24(bytes, p + 1) });
      p += 4;
    } else if (op === OP_REF) {
      need(31);
      const cpu = bytesToHex(bytes.subarray(p + 1, p + 21));
      let id = 0n;
      for (let i = 0; i < 8; i++) id = (id << 8n) | BigInt(bytes[p + 21 + i]!);
      const nIns = bytes[p + 29]!;
      const nOuts = bytes[p + 30]!;
      need(31 + 3 * nIns);
      const ins: number[] = [];
      for (let i = 0; i < nIns; i++) ins.push(u24(bytes, p + 31 + 3 * i));
      els.push({ op: OP_REF, cpu, id, ins, nOuts });
      p += 31 + 3 * nIns;
    } else {
      throw new IllFormedError('bad opcode', `0x${op.toString(16).padStart(2, '0')} at byte ${p}`);
    }
  }
  return els;
}

/** Encode records back to the exact on-chain byte format. */
export function encodeNetlist(elements: readonly Element[]): Uint8Array {
  let size = 0;
  for (const e of elements) size += e.op === OP_NAND ? 7 : e.op === OP_LATCH ? 4 : 31 + 3 * e.ins.length;
  const out = new Uint8Array(size);
  let p = 0;
  const putU24 = (v: number) => {
    if (!Number.isInteger(v) || v < 0 || v >= MAX_SIGNALS) throw new IllFormedError('signal index out of u24 range', String(v));
    out[p++] = v >>> 16;
    out[p++] = (v >>> 8) & 0xff;
    out[p++] = v & 0xff;
  };
  for (const e of elements) {
    out[p++] = e.op;
    if (e.op === OP_NAND) {
      putU24(e.a);
      putU24(e.b);
    } else if (e.op === OP_LATCH) {
      putU24(e.d);
    } else {
      const cpu = hexToBytes(e.cpu);
      if (cpu.length !== 20) throw new IllFormedError('REF cpu must be 20 bytes', e.cpu);
      out.set(cpu, p);
      p += 20;
      if (e.id < 0n || e.id >= 1n << 64n) throw new IllFormedError('REF id must fit in u64', e.id.toString());
      for (let i = 7; i >= 0; i--) out[p++] = Number((e.id >> BigInt(8 * i)) & 0xffn);
      if (e.ins.length > MAX_REF_PINS || e.nOuts > MAX_REF_PINS) throw new IllFormedError('REF: pin mismatch', 'REF pin counts must fit in u8');
      out[p++] = e.ins.length;
      out[p++] = e.nOuts;
      for (const s of e.ins) putU24(s);
    }
  }
  return out;
}

/** Transistors burned by `tapeout`: top-level NAND and LATCH records only (REF'd gates are never burned again). */
export function topLevelBurn(elements: readonly Element[]): { nand: number; latch: number } {
  let nand = 0;
  let latch = 0;
  for (const e of elements) {
    if (e.op === OP_NAND) nand++;
    else if (e.op === OP_LATCH) latch++;
  }
  return { nand, latch };
}

export const refKey = (cpu: string, id: bigint): string => `${cpu.toLowerCase()}:${id.toString()}`;

/** A netlist whose REF targets are loaded and whose static structure has been computed. */
export interface ResolvedCircuit extends Netlist {
  /** 2 + nIn + signals produced by all elements. */
  nSignals: number;
  nState: number;
  gateCount: number;
  /** Index of the first signal each element produces. */
  firstOut: number[];
  /** First state bit owned by each element (LATCH: 1 bit; REF: nState(sub) bits). */
  stateBase: number[];
  subs: Map<string, ResolvedCircuit>;
}

export type Resolver = (cpu: Address, id: bigint) => ResolvedCircuit | undefined;

export interface ResolveOptions {
  resolve?: Resolver;
  /** `factory.isCPU(cpu)`; when omitted the registration check is skipped (local-only use). */
  isCPU?: (cpu: Address) => boolean;
}

/**
 * Check well-formedness (TAP-02 §3) and compute the static structure (§4).
 * Throws IllFormedError with the chain's revert reason.
 */
export function resolveCircuit(nl: Netlist, opts: ResolveOptions = {}): ResolvedCircuit {
  const { nIn, nOut, elements } = nl;
  if (!Number.isInteger(nIn) || !Number.isInteger(nOut) || nIn < 0 || nOut < 0) throw new IllFormedError('too many pins', 'nIn/nOut must be non-negative integers');
  if (nOut === 0) throw new IllFormedError('no outputs');
  if (nIn > MAX_PINS || nOut > MAX_PINS) throw new IllFormedError('too many pins');

  let nSignals = 2 + nIn;
  const firstOut: number[] = [];
  for (const e of elements) {
    firstOut.push(nSignals);
    nSignals += signalsProduced(e);
  }
  if (nSignals > MAX_SIGNALS) throw new IllFormedError('size overflow', 'more than 2^24 signals');
  if (nSignals - 2 - nIn < nOut) throw new IllFormedError('too few signals for outputs');

  const stateBase: number[] = [];
  const subs = new Map<string, ResolvedCircuit>();
  let nState = 0;
  let gateCount = 0;
  for (let i = 0; i < elements.length; i++) {
    const e = elements[i]!;
    const first = firstOut[i]!;
    stateBase.push(nState);
    if (e.op === OP_NAND) {
      if (e.a >= first || e.b >= first) throw new IllFormedError('NAND: future signal', `element ${i}`);
      gateCount += 1;
    } else if (e.op === OP_LATCH) {
      if (e.d >= nSignals) throw new IllFormedError('LATCH d out of range', `element ${i}`);
      nState += 1;
      gateCount += 1;
    } else {
      for (const s of e.ins) if (s >= first) throw new IllFormedError('REF: future signal', `element ${i}`);
      if (opts.isCPU && !opts.isCPU(e.cpu)) throw new IllFormedError('REF: target not a registered CPU', e.cpu);
      const sub = opts.resolve?.(e.cpu, e.id);
      if (!sub) throw new IllFormedError('no circuit', `REF ${e.cpu}#${e.id}`);
      if (sub.nIn !== e.ins.length || sub.nOut !== e.nOuts) {
        throw new IllFormedError('REF: pin mismatch', `REF ${e.cpu}#${e.id} has (${sub.nIn} in, ${sub.nOut} out), record says (${e.ins.length}, ${e.nOuts})`);
      }
      if (sub.nState > MAX_SIGNALS) throw new IllFormedError('REF size');
      subs.set(refKey(e.cpu, e.id), sub);
      nState += sub.nState;
      gateCount += sub.gateCount;
    }
  }
  if (nState > MAX_SIGNALS || gateCount > MAX_GATES) throw new IllFormedError('size overflow');
  return { nIn, nOut, elements, nSignals, nState, gateCount, firstOut, stateBase, subs };
}

/** Human-readable listing of a netlist, one element per line. */
export function formatNetlist(nl: Netlist): string {
  const lines: string[] = [];
  let sig = 2 + nl.nIn;
  for (let i = 0; i < nl.nIn; i++) lines.push(`s${2 + i} = in[${i}]`);
  for (const e of nl.elements) {
    if (e.op === OP_NAND) lines.push(`s${sig} = NAND(s${e.a}, s${e.b})`);
    else if (e.op === OP_LATCH) lines.push(`s${sig} = LATCH(d = s${e.d})`);
    else lines.push(`s${sig}..s${sig + e.nOuts - 1} = REF(${e.cpu}#${e.id}, ins = [${e.ins.map((s) => `s${s}`).join(', ')}])`);
    sig += signalsProduced(e);
  }
  lines.push(`outputs = s${sig - nl.nOut}..s${sig - 1}`);
  return lines.join('\n');
}
