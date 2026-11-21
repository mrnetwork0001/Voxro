/**
 * Circuit #1 — SaturatingQueue3 (sequential standard cell).
 *   inputs : in[0] = active (1 = transition enabled), in[1] = dir (1 = enqueue, 0 = dequeue)
 *   state  : LATCH q0, q1, q2 = unread queue depth Q ∈ 0..7 (state bits 0..2, LSB first)
 *   outputs: out[2:0] = next depth Q' (also latched), so a single step() both previews and advances
 */
import type { Bit } from '../../tapeout/pack.js';
import { NetlistBuilder, type BuiltCircuit } from '../builder.js';

export const SATURATING_QUEUE3 = Object.freeze({ name: 'SaturatingQueue3', nIn: 2, nOut: 3, nState: 3 });

export function buildSaturatingQueue3(): BuiltCircuit {
  const b = new NetlistBuilder(SATURATING_QUEUE3.nIn);
  const [active, dir] = b.inputs() as [number, number];
  const q0 = b.latch();
  const q1 = b.latch();
  const q2 = b.latch();
  const nq0 = b.not(q0);
  const nq1 = b.not(q1);
  const nq2 = b.not(q2);

  const full = b.and3(q0, q1, q2);
  const empty = b.and3(nq0, nq1, nq2);
  const inc = b.and(b.and(active, dir), b.not(full));
  const dec = b.and(b.and(active, b.not(dir)), b.not(empty));

  // Q + 1
  const n0 = nq0;
  const n1 = b.xor(q1, q0);
  const n2 = b.xor(q2, b.and(q1, q0));
  // Q - 1
  const d0 = nq0;
  const d1 = b.xor(q1, nq0);
  const d2 = b.xor(q2, b.and(nq0, nq1));

  // m = dec ? Q-1 : Q ; next = inc ? Q+1 : m   (final NANDs placed last so they are the outputs)
  const m0 = b.mux(dec, q0, d0);
  const m1 = b.mux(dec, q1, d1);
  const m2 = b.mux(dec, q2, d2);
  const ninc = b.not(inc);
  const t0 = b.nand(m0, ninc), u0 = b.nand(n0, inc);
  const t1 = b.nand(m1, ninc), u1 = b.nand(n1, inc);
  const t2 = b.nand(m2, ninc), u2 = b.nand(n2, inc);
  const x0 = b.nandFresh(t0, u0);
  const x1 = b.nandFresh(t1, u1);
  const x2 = b.nandFresh(t2, u2);
  b.drive(q0, x0);
  b.drive(q1, x1);
  b.drive(q2, x2);
  return b.build([x0, x1, x2]);
}

/** Reference model: next queue depth. */
export function modelSaturatingQueue3(q: number, active: Bit | number, dir: Bit | number): number {
  if (!active) return q;
  return dir ? Math.min(7, q + 1) : Math.max(0, q - 1);
}
