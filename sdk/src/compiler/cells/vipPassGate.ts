/**
 * Circuit #3 — VipPassGate (combinational standard cell).
 *   inputs : in[0] = isAllowlisted, in[1] = holdsPartnerCircuit, in[3:2] = raw surge tier, in[4] = rawPauseCold
 *   outputs: out[1:0] = effective tier (allowlisted → 0; partner holder → one tier down),
 *            out[2] = vipDiscount50 (partner holder), out[3] = canSend (!pause || allowlisted || holder)
 */
import type { Bit } from '../../tapeout/pack.js';
import { NetlistBuilder, type BuiltCircuit } from '../builder.js';

export const VIP_PASS_GATE = Object.freeze({ name: 'VipPassGate', nIn: 5, nOut: 4, nState: 0 });

export function buildVipPassGate(): BuiltCircuit {
  const b = new NetlistBuilder(VIP_PASS_GATE.nIn);
  const [a, h, s0, s1, pause] = b.inputs() as [number, number, number, number, number];
  const na = b.not(a);
  const nh = b.not(h);
  // saturating tier - 1
  const d0 = b.and(b.not(s0), s1);
  const d1 = b.and(s1, s0);
  const m0 = b.mux(h, s0, d0);
  const m1 = b.mux(h, s1, d1);
  const n0 = b.nand(na, m0);
  const n1 = b.nand(na, m1);
  const z = b.and(na, nh);
  const e0 = b.nandFresh(n0, n0);
  const e1 = b.nandFresh(n1, n1);
  const disc = b.nandFresh(nh, nh);
  const canSend = b.nandFresh(pause, z);
  return b.build([e0, e1, disc, canSend]);
}

/** Reference model. */
export function modelVipPassGate(a: Bit | number, h: Bit | number, tier: number, pause: Bit | number): { effTier: number; disc: Bit; canSend: Bit } {
  const effTier = a ? 0 : h ? Math.max(0, tier - 1) : tier;
  return { effTier, disc: h ? 1 : 0, canSend: !pause || a || h ? 1 : 0 };
}
