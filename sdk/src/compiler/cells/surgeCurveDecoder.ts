/**
 * Circuit #2 — SurgeCurveDecoder (combinational standard cell).
 *   inputs : in[2:0] = queue depth Q, in[4:3] = profile P (00 gentle, 01 balanced, 10 steep, 11 fortress)
 *   outputs: out[1:0] = surge tier (0: 1.0×, 1: 1.5×, 2: 2.5×, 3: 4.0×), out[2] = pauseCold (fortress && Q == 7)
 */
import type { Bit } from '../../tapeout/pack.js';
import { NetlistBuilder, type BuiltCircuit } from '../builder.js';
import { CURVE_PROFILES, type CurveProfile } from './types.js';

export const SURGE_CURVE_DECODER = Object.freeze({ name: 'SurgeCurveDecoder', nIn: 5, nOut: 3, nState: 0 });

/** Queue depth (0..7) -> surge tier (0..3) per profile. Balanced yields the demo's 10 → 15 → 25 → 40 USD₮0 sequence. */
export const SURGE_TABLES: Readonly<Record<CurveProfile, readonly number[]>> = Object.freeze({
  gentle:   [0, 0, 0, 0, 1, 1, 2, 3],
  balanced: [0, 0, 1, 1, 2, 2, 3, 3],
  steep:    [0, 1, 1, 2, 2, 3, 3, 3],
  fortress: [0, 1, 2, 2, 3, 3, 3, 3],
});

/** Price multiplier per tier in basis points of basePrice. */
export const SURGE_BPS = Object.freeze([10_000n, 15_000n, 25_000n, 40_000n] as const);
export const SURGE_LABELS = Object.freeze(['1.0×', '1.5×', '2.5×', '4.0×'] as const);

export function buildSurgeCurveDecoder(): BuiltCircuit {
  const b = new NetlistBuilder(SURGE_CURVE_DECODER.nIn);
  const [q0, q1, q2, p0, p1] = b.inputs() as [number, number, number, number, number];
  const nq1 = b.not(q1);
  const q01 = b.and(q1, q0);
  const full = b.and(q2, q01);

  // gentle   [0,0,0,0,1,1,2,3]
  const g0 = b.and(q2, b.or(nq1, q0));
  const g1 = b.and(q2, q1);
  // balanced [0,0,1,1,2,2,3,3]  = Q >> 1
  const bl0 = q1;
  const bl1 = q2;
  // steep    [0,1,1,2,2,3,3,3]
  const s0 = b.or(b.xor(q0, q1), full);
  const s1 = b.or(q2, q01);
  // fortress [0,1,2,2,3,3,3,3]
  const f0 = b.or(q2, b.and(q0, nq1));
  const f1 = b.or(q2, q1);

  // 4:1 select by P: p0 picks within a pair, p1 picks the pair (final NANDs last = outputs)
  const lo0 = b.mux(p0, g0, bl0), hi0 = b.mux(p0, s0, f0);
  const lo1 = b.mux(p0, g1, bl1), hi1 = b.mux(p0, s1, f1);
  const np1 = b.not(p1);
  const t0 = b.nand(lo0, np1), u0 = b.nand(hi0, p1);
  const t1 = b.nand(lo1, np1), u1 = b.nand(hi1, p1);
  const pn = b.nand(b.and(p1, p0), full);
  const out0 = b.nandFresh(t0, u0);
  const out1 = b.nandFresh(t1, u1);
  const pause = b.nandFresh(pn, pn);
  return b.build([out0, out1, pause]);
}

/** Reference model. */
export function modelSurgeCurveDecoder(q: number, profileCode: number): { tier: number; pause: Bit } {
  const profile = CURVE_PROFILES[profileCode as 0 | 1 | 2 | 3];
  if (!profile || q < 0 || q > 7) throw new RangeError('q must be 0..7 and profileCode 0..3');
  return { tier: SURGE_TABLES[profile][q]!, pause: profileCode === 3 && q === 7 ? 1 : 0 };
}
