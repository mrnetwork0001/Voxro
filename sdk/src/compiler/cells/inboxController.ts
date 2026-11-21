/**
 * Circuits #4–#7 — InboxController: REF composition of the three standard cells.
 *   inputs : [active, dir, p0, p1, isAllowlisted, holdsPartnerCircuit]
 *   state  : 3 bits = the SaturatingQueue3 depth (REF is the first element, so state bits 0..2)
 *   outputs: [effTier0, effTier1, vipDiscount50, canSend, Q'0, Q'1, Q'2]
 * Presets hard-wire P to constant signals 0/1 and ignore the p0/p1 inputs; the `configurable`
 * variant routes them through. Every variant burns exactly 6 top-level NANDs (3 buffers that
 * re-emit Q' after the VIP stage so the outputs are the last 7 signals).
 */
import { bitsFromInt, intFromBits, packBits, unpackBits, type Bit } from '../../tapeout/pack.js';
import type { Address } from '../../tapeout/netlist.js';
import { NetlistBuilder, type BuiltCircuit } from '../builder.js';
import { modelSaturatingQueue3, SATURATING_QUEUE3 } from './saturatingQueue3.js';
import { modelSurgeCurveDecoder, SURGE_BPS, SURGE_CURVE_DECODER } from './surgeCurveDecoder.js';
import { modelVipPassGate, VIP_PASS_GATE } from './vipPassGate.js';
import { curveBits, curveCode, curveFromBits, CURVE_PROFILES, type CurveProfile } from './types.js';

export const INBOX_CONTROLLER = Object.freeze({ name: 'InboxController', nIn: 6, nOut: 7, nState: 3 });

export type ControllerPreset = CurveProfile | 'configurable';
export const CONTROLLER_PRESETS = [...CURVE_PROFILES, 'configurable'] as const satisfies readonly ControllerPreset[];

/** Launch presets and their marketing names. */
export const PRESET_NAMES: Readonly<Record<ControllerPreset, string>> = Object.freeze({
  balanced: 'FounderBalancedInbox',
  fortress: 'VcFortressInbox',
  gentle: 'AuditorDisclosureInbox',
  steep: 'SteepInbox',
  configurable: 'ConfigurableInbox',
});

export const CONTROLLER_IN = Object.freeze({ active: 0, dir: 1, p0: 2, p1: 3, allowlisted: 4, holdsPartner: 5 });
export const CONTROLLER_OUT = Object.freeze({ effTier0: 0, effTier1: 1, vipDiscount50: 2, canSend: 3, q0: 4, q1: 5, q2: 6 });

export interface CellRefs {
  cpu: Address;
  saturatingQueue3: bigint;
  surgeCurveDecoder: bigint;
  vipPassGate: bigint;
}

export function buildInboxController(preset: ControllerPreset, refs: CellRefs): BuiltCircuit {
  const b = new NetlistBuilder(INBOX_CONTROLLER.nIn);
  const [active, dir, p0, p1, a, h] = b.inputs() as [number, number, number, number, number, number];
  const [q0, q1, q2] = b.ref(refs.cpu, refs.saturatingQueue3, [active, dir], SATURATING_QUEUE3.nOut) as [number, number, number];
  const nq0 = b.nandFresh(q0, q0);
  const nq1 = b.nandFresh(q1, q1);
  const nq2 = b.nandFresh(q2, q2);
  let sel0: number;
  let sel1: number;
  if (preset === 'configurable') {
    sel0 = p0;
    sel1 = p1;
  } else {
    const bits = curveBits(preset);
    sel0 = bits.p0 ? b.one : b.zero;
    sel1 = bits.p1 ? b.one : b.zero;
  }
  const [s0, s1, pause] = b.ref(refs.cpu, refs.surgeCurveDecoder, [q0, q1, q2, sel0, sel1], SURGE_CURVE_DECODER.nOut) as [number, number, number];
  const [e0, e1, disc, canSend] = b.ref(refs.cpu, refs.vipPassGate, [a, h, s0, s1, pause], VIP_PASS_GATE.nOut) as [number, number, number, number];
  const y0 = b.nandFresh(nq0, nq0);
  const y1 = b.nandFresh(nq1, nq1);
  const y2 = b.nandFresh(nq2, nq2);
  return b.build([e0, e1, disc, canSend, y0, y1, y2]);
}

export interface ControllerInputs {
  active: Bit;
  dir: Bit;
  p0: Bit;
  p1: Bit;
  allowlisted: Bit;
  holdsPartner: Bit;
}

export interface ControllerOutputs {
  effTier: number;
  vipDiscount50: Bit;
  canSend: Bit;
  /** Queue depth after this step. */
  q: number;
}

export function controllerInputBits(i: ControllerInputs): Bit[] {
  return [i.active, i.dir, i.p0, i.p1, i.allowlisted, i.holdsPartner];
}

export function controllerInputsFromInt(v: number): ControllerInputs {
  const [active, dir, p0, p1, allowlisted, holdsPartner] = bitsFromInt(v, INBOX_CONTROLLER.nIn) as [Bit, Bit, Bit, Bit, Bit, Bit];
  return { active, dir, p0, p1, allowlisted, holdsPartner };
}

export function controllerOutputsFromBits(bits: ArrayLike<number>): ControllerOutputs {
  const bit = (k: number): Bit => (bits[k] ? 1 : 0);
  return {
    effTier: bit(CONTROLLER_OUT.effTier0) | (bit(CONTROLLER_OUT.effTier1) << 1),
    vipDiscount50: bit(CONTROLLER_OUT.vipDiscount50),
    canSend: bit(CONTROLLER_OUT.canSend),
    q: bit(CONTROLLER_OUT.q0) | (bit(CONTROLLER_OUT.q1) << 1) | (bit(CONTROLLER_OUT.q2) << 2),
  };
}

export function controllerOutputsToInt(o: ControllerOutputs): number {
  return o.effTier | (o.vipDiscount50 << 2) | (o.canSend << 3) | (o.q << 4);
}

/** Pack the 6 controller input bits as the escrow does: `active, dir, p0, p1, allowlisted, holdsPartner`. */
export function packControllerInputs(i: ControllerInputs): Uint8Array {
  return packBits(controllerInputBits(i));
}

export function decodeControllerOutputs(bytes: Uint8Array): ControllerOutputs {
  return controllerOutputsFromBits(unpackBits(bytes, INBOX_CONTROLLER.nOut));
}

export function controllerInputsFor(args: { enqueue: boolean; profile?: CurveProfile; allowlisted?: boolean; holdsPartner?: boolean; active?: boolean }): ControllerInputs {
  const bits = args.profile ? curveBits(args.profile) : { p0: 0 as Bit, p1: 0 as Bit };
  return {
    active: args.active === false ? 0 : 1,
    dir: args.enqueue ? 1 : 0,
    p0: bits.p0,
    p1: bits.p1,
    allowlisted: args.allowlisted ? 1 : 0,
    holdsPartner: args.holdsPartner ? 1 : 0,
  };
}

/** Reference model of a whole controller step. */
export function modelInboxController(preset: ControllerPreset, q: number, i: ControllerInputs): ControllerOutputs {
  const newQ = modelSaturatingQueue3(q, i.active, i.dir);
  const profile: CurveProfile = preset === 'configurable' ? curveFromBits(i.p0, i.p1) : preset;
  const { tier, pause } = modelSurgeCurveDecoder(newQ, curveCode(profile));
  const vip = modelVipPassGate(i.allowlisted, i.holdsPartner, tier, pause);
  return { effTier: vip.effTier, vipDiscount50: vip.disc, canSend: vip.canSend, q: newQ };
}

/** Exact integer price the escrow charges: basePrice × tier multiplier, halved for a VIP discount. */
export function quotePrice(basePrice: bigint, o: Pick<ControllerOutputs, 'effTier' | 'vipDiscount50'>): bigint {
  const bps = SURGE_BPS[o.effTier as 0 | 1 | 2 | 3];
  if (bps === undefined) throw new RangeError(`bad tier ${o.effTier}`);
  let p = (basePrice * bps) / 10_000n;
  if (o.vipDiscount50) p /= 2n;
  return p;
}

export { intFromBits };
