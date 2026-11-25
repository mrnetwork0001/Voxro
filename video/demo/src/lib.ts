import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import raw from "./timing.json";
export interface W { word: string; start: number; end: number }
export interface L { text: string; file: string; start: number; end: number; words: W[] }
export interface S { id: string; from: number; dur: number; lines: L[] }
export const TM = raw as unknown as { total: number; scenes: S[] };
export const FPS = 30;
export const sc = (id: string) => {
  const s = TM.scenes.find((x) => x.id === id);
  if (!s) throw new Error(`scene ${id} missing`);
  return s;
};
const norm = (w: string) => w.toLowerCase().replace(/[^a-z0-9']/g, "").replace(/^voxroh$/, "voxro");
/** Absolute film second at which `word` (nth match) starts in a scene. Pass several spellings for words the
 *  voice is given respelled (TapeSend is said "Tape Send"): the first one found wins. */
export const at = (id: string, word: string | string[], nth = 0) => {
  const all = sc(id).lines.flatMap((l) => l.words);
  for (const cand of Array.isArray(word) ? word : [word]) {
    const hits = all.filter((x) => norm(x.word) === norm(cand));
    const w = hits[nth] ?? hits[0];
    if (w) return w.start;
  }
  throw new Error(`${word} not in ${id}`);
};
export const lineAt = (id: string, i: number) => sc(id).lines[i].start;
export const lineEnd = (id: string, i: number) => sc(id).lines[i].end;
export const end = (id: string) => sc(id).from + sc(id).dur;
export const expo = Easing.bezier(0.16, 1, 0.3, 1);
export const inOut = Easing.bezier(0.76, 0, 0.24, 1);
export const soft = Easing.bezier(0.22, 0.7, 0.25, 1);
/** Absolute film time in seconds: scenes are drawn on one timeline, never in nested sequences. */
export const useT = () => useCurrentFrame() / useVideoConfig().fps;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const ramp = (t: number, a: number, b: number, e: (x: number) => number = expo) => interpolate(t, [a, b], [0, 1], { ...clamp, easing: e });
export const win = (t: number, a: number, b: number, i = 0.35, o = 0.35) => interpolate(t, [a, a + i, b - o, b], [0, 1, 1, 0], clamp);
export const mix = (a: number, b: number, p: number) => a + (b - a) * p;
export const pop = (t: number, a: number, damping = 13, stiffness = 180) => spring({ frame: Math.max(0, (t - a) * FPS), fps: FPS, config: { damping, stiffness, mass: 0.7 } });
export const rnd = (i: number, k = 0) => { const x = Math.sin(i * 127.1 + k * 311.7 + 17.3) * 43758.5453; return x - Math.floor(x); };
