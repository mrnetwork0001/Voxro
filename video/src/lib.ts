import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import raw from "./timing.json";
interface W { word: string; start: number; end: number }
interface L { text: string; file: string; start: number; end: number; words: W[] }
export interface S { id: string; from: number; dur: number; lines: L[] }
export const TM = raw as unknown as { total: number; scenes: S[] };
export const FPS = 60;
export const sc = (id: string) => TM.scenes.find((s) => s.id === id)!;
const norm = (w: string) => w.toLowerCase().replace(/[^a-z']/g, "");
export const at = (id: string, word: string) => {
  const w = sc(id).lines.flatMap((l) => l.words).find((x) => norm(x.word) === norm(word));
  if (!w) throw new Error(`${word} not in ${id}`);
  return w.start;
};
export const expo = Easing.bezier(0.16, 1, 0.3, 1);
export const inOut = Easing.bezier(0.76, 0, 0.24, 1);
export const inn = Easing.bezier(0.7, 0, 0.84, 0);
/** Absolute film time in seconds (scenes are drawn on one timeline, never in nested sequences). */
export const useT = () => useCurrentFrame() / useVideoConfig().fps;
export const ramp = (t: number, a: number, b: number, e: (x: number) => number = expo) => interpolate(t, [a, b], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: e });
export const mix = (a: number, b: number, p: number) => a + (b - a) * p;
export const pop = (t: number, a: number, damping = 13, stiffness = 180) => spring({ frame: Math.max(0, (t - a) * FPS), fps: FPS, config: { damping, stiffness, mass: 0.7 } });
export const rnd = (i: number, k = 0) => { const x = Math.sin(i * 127.1 + k * 311.7 + 17.3) * 43758.5453; return x - Math.floor(x); };
