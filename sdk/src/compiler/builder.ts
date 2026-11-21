/**
 * Straight-line netlist builder. Every derived gate is expanded to NAND records, identical
 * NAND(a, b) requests are shared (pure combinational logic, so sharing is always safe), and
 * the final `build()` enforces TAP-02's rule that the outputs are the last `nOut` signals.
 */
import {
  IllFormedError,
  OP_LATCH,
  OP_NAND,
  OP_REF,
  SIG_ONE,
  SIG_ZERO,
  encodeNetlist,
  topLevelBurn,
  type Address,
  type Element,
  type LatchElement,
} from '../tapeout/netlist.js';
import { bytesToHex } from '../tapeout/pack.js';

export type Sig = number;

export interface BuiltCircuit {
  nIn: number;
  nOut: number;
  elements: Element[];
  bytes: Uint8Array;
  hex: `0x${string}`;
  /** Top-level NAND / LATCH records = transistors burned by `tapeout`. */
  burn: { nand: number; latch: number };
  /** Buffer gates `build()` had to add to move the outputs to the end (0 when hand-aligned). */
  alignmentBuffers: number;
}

export class NetlistBuilder {
  readonly elements: Element[] = [];
  private nextSignal: number;
  private readonly memo = new Map<string, Sig>();
  private readonly latchByOutput = new Map<Sig, number>();

  constructor(readonly nIn: number) {
    if (!Number.isInteger(nIn) || nIn < 0) throw new RangeError('nIn must be a non-negative integer');
    this.nextSignal = 2 + nIn;
  }

  get zero(): Sig { return SIG_ZERO; }
  get one(): Sig { return SIG_ONE; }
  get signalCount(): number { return this.nextSignal; }

  in(i: number): Sig {
    if (!Number.isInteger(i) || i < 0 || i >= this.nIn) throw new RangeError(`input ${i} out of range (nIn = ${this.nIn})`);
    return 2 + i;
  }

  inputs(): Sig[] {
    return Array.from({ length: this.nIn }, (_, i) => 2 + i);
  }

  private check(s: Sig): void {
    if (!Number.isInteger(s) || s < 0 || s >= this.nextSignal) throw new RangeError(`signal ${s} is not available yet`);
  }

  /** A new NAND record even if an identical one exists (used to place outputs last). */
  nandFresh(a: Sig, b: Sig): Sig {
    this.check(a);
    this.check(b);
    this.elements.push({ op: OP_NAND, a, b });
    return this.nextSignal++;
  }

  nand(a: Sig, b: Sig): Sig {
    const key = a <= b ? `${a},${b}` : `${b},${a}`;
    const hit = this.memo.get(key);
    if (hit !== undefined) return hit;
    const s = this.nandFresh(a, b);
    this.memo.set(key, s);
    return s;
  }

  /** Declare a LATCH; wire its `d` later with `drive()` (d may point forward). */
  latch(): Sig {
    this.elements.push({ op: OP_LATCH, d: -1 });
    const s = this.nextSignal++;
    this.latchByOutput.set(s, this.elements.length - 1);
    return s;
  }

  drive(q: Sig, d: Sig): void {
    const idx = this.latchByOutput.get(q);
    if (idx === undefined) throw new Error(`signal ${q} is not a LATCH output`);
    const e = this.elements[idx] as LatchElement;
    if (e.d !== -1) throw new Error(`LATCH ${q} is already driven`);
    if (!Number.isInteger(d) || d < 0) throw new RangeError('d must be a signal index');
    e.d = d;
  }

  ref(cpu: Address, id: bigint, ins: Sig[], nOuts: number): Sig[] {
    for (const s of ins) this.check(s);
    if (ins.length > 255 || nOuts < 1 || nOuts > 255) throw new RangeError('REF pin counts must be 0..255 in, 1..255 out');
    this.elements.push({ op: OP_REF, cpu, id, ins: [...ins], nOuts });
    const first = this.nextSignal;
    this.nextSignal += nOuts;
    return Array.from({ length: nOuts }, (_, k) => first + k);
  }

  not(a: Sig): Sig { return this.nand(a, a); }
  and(a: Sig, b: Sig): Sig { return this.not(this.nand(a, b)); }
  or(a: Sig, b: Sig): Sig { return this.nand(this.not(a), this.not(b)); }
  xor(a: Sig, b: Sig): Sig {
    const n = this.nand(a, b);
    return this.nand(this.nand(a, n), this.nand(b, n));
  }
  /** `sel ? a1 : a0` */
  mux(sel: Sig, a0: Sig, a1: Sig): Sig { return this.nand(this.nand(a0, this.not(sel)), this.nand(a1, sel)); }
  and3(a: Sig, b: Sig, c: Sig): Sig { return this.and(this.and(a, b), c); }
  or3(a: Sig, b: Sig, c: Sig): Sig { return this.or(this.or(a, b), c); }
  buf(a: Sig): Sig { return this.not(this.not(a)); }

  /**
   * Finish the circuit. `outputs` must be the last `nOut` signals in order; with `autoAlign`
   * two NAND buffers per output are appended instead of throwing.
   */
  build(outputs: Sig[], opts: { autoAlign?: boolean } = {}): BuiltCircuit {
    for (const s of outputs) this.check(s);
    for (const [q, idx] of this.latchByOutput) {
      if ((this.elements[idx] as LatchElement).d === -1) throw new Error(`LATCH ${q} is not driven`);
    }
    const nOut = outputs.length;
    if (nOut < 1) throw new IllFormedError('no outputs');
    let aligned = true;
    for (let k = 0; k < nOut; k++) if (outputs[k] !== this.nextSignal - nOut + k) { aligned = false; break; }
    let alignmentBuffers = 0;
    let finalOutputs = outputs;
    if (!aligned) {
      if (!opts.autoAlign) throw new Error('outputs must be the last nOut signals in order (pass { autoAlign: true } to insert buffers)');
      const mids = outputs.map((s) => this.nandFresh(s, s));
      finalOutputs = mids.map((m) => this.nandFresh(m, m));
      alignmentBuffers = 2 * nOut;
    }
    void finalOutputs;
    const elements = this.elements.map((e) => (e.op === OP_REF ? { ...e, ins: [...e.ins] } : { ...e }));
    const bytes = encodeNetlist(elements);
    return { nIn: this.nIn, nOut, elements, bytes, hex: bytesToHex(bytes), burn: topLevelBurn(elements), alignmentBuffers };
  }
}
