import type { Bit } from '../../tapeout/pack.js';

/** Surge curve profiles; the array index is the 2-bit profile code P[1:0]. */
export type CurveProfile = 'gentle' | 'balanced' | 'steep' | 'fortress';
export const CURVE_PROFILES = ['gentle', 'balanced', 'steep', 'fortress'] as const satisfies readonly CurveProfile[];

export function curveCode(profile: CurveProfile): number {
  const p = CURVE_PROFILES.indexOf(profile);
  if (p < 0) throw new RangeError(`unknown curve profile ${profile}`);
  return p;
}

export function curveBits(profile: CurveProfile): { p0: Bit; p1: Bit } {
  const p = curveCode(profile);
  return { p0: (p & 1) as Bit, p1: ((p >> 1) & 1) as Bit };
}

export function curveFromBits(p0: Bit | number, p1: Bit | number): CurveProfile {
  return CURVE_PROFILES[((p1 ? 2 : 0) | (p0 ? 1 : 0)) as 0 | 1 | 2 | 3];
}
