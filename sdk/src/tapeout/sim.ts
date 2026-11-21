/** One-beat evaluation of a resolved circuit, exactly as TAP-02 §4 defines it. */
import { OP_LATCH, OP_NAND, refKey, type ResolvedCircuit } from './netlist.js';
import { packBits, unpackBits, type Bit } from './pack.js';

export interface BeatResult {
  newState: Bit[];
  outputs: Bit[];
}

/**
 * One beat: (state, inputs) -> (newState, outputs).
 * LATCH outputs its state bit from `state`; after all elements are evaluated every LATCH
 * samples `d`. A REF runs one beat of the referenced circuit with its contiguous state block.
 */
export function beat(c: ResolvedCircuit, state: ArrayLike<number | boolean>, inputs: ArrayLike<number | boolean>): BeatResult {
  if (state.length !== c.nState) throw new RangeError(`state has ${state.length} bits, circuit has nState = ${c.nState}`);
  if (inputs.length !== c.nIn) throw new RangeError(`inputs has ${inputs.length} bits, circuit has nIn = ${c.nIn}`);
  const s = new Uint8Array(c.nSignals);
  s[1] = 1;
  for (let i = 0; i < c.nIn; i++) s[2 + i] = inputs[i] ? 1 : 0;
  const st = new Array<Bit>(c.nState);
  for (let i = 0; i < c.nState; i++) st[i] = state[i] ? 1 : 0;
  const newState = st.slice();

  for (let idx = 0; idx < c.elements.length; idx++) {
    const e = c.elements[idx]!;
    const first = c.firstOut[idx]!;
    const base = c.stateBase[idx]!;
    if (e.op === OP_NAND) {
      s[first] = 1 - (s[e.a]! & s[e.b]!);
    } else if (e.op === OP_LATCH) {
      s[first] = st[base]!;
    } else {
      const sub = c.subs.get(refKey(e.cpu, e.id));
      if (!sub) throw new Error(`unresolved REF ${e.cpu}#${e.id}`);
      const r = beat(sub, st.slice(base, base + sub.nState), e.ins.map((i) => s[i]!));
      for (let k = 0; k < sub.nState; k++) newState[base + k] = r.newState[k]!;
      for (let k = 0; k < sub.nOut; k++) s[first + k] = r.outputs[k]!;
    }
  }
  for (let idx = 0; idx < c.elements.length; idx++) {
    const e = c.elements[idx]!;
    if (e.op === OP_LATCH) newState[c.stateBase[idx]!] = s[e.d]! as Bit;
  }
  const outputs = new Array<Bit>(c.nOut);
  for (let k = 0; k < c.nOut; k++) outputs[k] = s[c.nSignals - c.nOut + k]! as Bit;
  return { newState, outputs };
}

/** `step(id, state, inputs)` on packed bytes with the contracts' lenient input reading. */
export function stepBytes(c: ResolvedCircuit, state: Uint8Array, inputs: Uint8Array): { newState: Uint8Array; outputs: Uint8Array } {
  const r = beat(c, unpackBits(state, c.nState), unpackBits(inputs, c.nIn));
  return { newState: packBits(r.newState), outputs: packBits(r.outputs) };
}

export class HasLatchError extends Error {
  constructor() {
    super('has latch: use step');
    this.name = 'HasLatchError';
  }
}

/** `eval(id, inputs)`: combinational circuits only. */
export function evalBytes(c: ResolvedCircuit, inputs: Uint8Array): Uint8Array {
  if (c.nState > 0) throw new HasLatchError();
  return stepBytes(c, new Uint8Array(0), inputs).outputs;
}
