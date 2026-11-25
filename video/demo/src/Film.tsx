import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { C } from "./theme";
import { FPS, TM, at, lineAt, sc } from "./lib";
import { Grain } from "./ui";
import { Captions } from "./kit";
import * as S from "./scenes";
import { existsSync } from "./exists";

const SCENES: Record<string, React.FC> = {
  open: S.Open, problem: S.Problem, evidence: S.Evidence, turn: S.Turn, stack: S.Stack, send: S.Send,
  surge: S.Surge, settle: S.Settle, proof: S.Proof, live: S.Live, reach: S.Reach, unique: S.Unique, close: S.Close,
};
const XF = 0.4;
const VOX = at("turn", "voxro");
const ramp = (t: number, a: number, b: number) => interpolate(t, [a, b], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
// Music ducks under every spoken line.
const LINES = TM.scenes.flatMap((s) => s.lines.map((l) => [l.start, l.end] as const));
const musicVol = (t: number) => {
  let d = 0;
  for (const [a, b] of LINES) d = Math.max(d, interpolate(t, [a - 0.3, a, b, b + 0.45], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  return (0.62 - 0.42 * d) * ramp(t, 0, 0.6) * (1 - ramp(t, TM.total - 2.2, TM.total));
};
interface Fx { f: string; at: number; vol: number; dur?: number }
function effects(): Fx[] {
  const w = (id: string, word: string | string[], n = 0) => at(id, word, n);
  const from = (id: string) => sc(id).from;
  const fx: Fx[] = [
    { f: "gates", at: w("open", "logic") - 0.05, vol: 0.32 },
    { f: "count", at: w("open", ["hundred", "157"]), vol: 0.2 },
    { f: "whoosh", at: from("problem") - 0.35, vol: 0.25 },
    { f: "ping", at: lineAt("problem", 1) + 0.1, vol: 0.3 },
    { f: "swarm", at: lineAt("problem", 1) + 0.3, vol: 0.22 },
    { f: "stamp", at: w("problem", "stop") - 0.05, vol: 0.5 },
    ...["deal,", "bug", "partnership,"].map((x) => ({ f: "pop", at: w("problem", x) - 0.05, vol: 0.35 })),
    { f: "whoosh", at: from("evidence") - 0.35, vol: 0.25 },
    { f: "count", at: w("evidence", "coinbase"), vol: 0.3 },
    { f: "riser", at: VOX - 3.0, vol: 0.38 },
    { f: "boom", at: VOX - 0.08, vol: 0.55 },
    { f: "whoosh", at: from("stack") - 0.35, vol: 0.25 },
    { f: "pop", at: w("stack", "okx"), vol: 0.3 },
    ...[["circuits"], ["tapesend", "tape"], ["deweb", "dee"]].map((x) => ({ f: "pop", at: w("stack", x) - 0.05, vol: 0.35 })),
    { f: "whoosh", at: from("send") - 0.35, vol: 0.25 },
    { f: "typing", at: from("send") + 0.2, vol: 0.18, dur: 1.6 },
    { f: "typing", at: lineAt("send", 2), vol: 0.18, dur: 3.2 },
    { f: "lock", at: w("send", "sealed") - 0.05, vol: 0.4 },
    { f: "lock", at: w("send", "escrow."), vol: 0.35 },
    { f: "whoosh", at: from("surge") - 0.35, vol: 0.25 },
    ...[["fifteen."], ["twenty-five.", "twentyfive."], ["forty."], ["cools"], ["down."]].map((x) => ({ f: "relay", at: w("surge", x) - 0.03, vol: 0.45 })),
    { f: "whoosh", at: from("settle") - 0.35, vol: 0.25 },
    ...[0, 1, 2].map((i) => ({ f: "pop", at: w("settle", "checks") + 0.25 + i * 0.3, vol: 0.3 })),
    { f: "chime", at: w("settle", "ninety-five"), vol: 0.4 },
    { f: "count", at: w("settle", "full"), vol: 0.25 },
    { f: "whoosh", at: from("proof") - 0.35, vol: 0.25 },
    { f: "scan", at: w("proof", "replays") - 0.1, vol: 0.3 },
    { f: "count", at: lineAt("proof", 2), vol: 0.3 },
    { f: "chime", at: w("proof", "zero"), vol: 0.35 },
    { f: "whoosh", at: from("live") - 0.35, vol: 0.25 },
    ...[["voxr"], ["eight"], ["escrow,"], ["inbox."]].map((x) => ({ f: "pop", at: w("live", x) - 0.05, vol: 0.32 })),
    { f: "whoosh", at: from("reach") - 0.35, vol: 0.25 },
    { f: "ping", at: w("reach", "telegram,"), vol: 0.35 },
    { f: "pop", at: w("reach", ["agents", "a"]), vol: 0.3 },
    { f: "lock", at: w("reach", ["x402.", "x"]) + 1.05, vol: 0.3 },
    { f: "whoosh", at: from("unique") - 0.35, vol: 0.25 },
    ...[["server"], ["plaintext."], ["fee"], ["change"]].map((x) => ({ f: "relay", at: w("unique", x) - 0.25, vol: 0.4 })),
    { f: "whoosh", at: from("close") - 0.35, vol: 0.25 },
    { f: "boom", at: w("close", "voxro") - 0.1, vol: 0.35 },
  ];
  return fx.filter((x) => x.at >= 0 && x.at < TM.total);
} // seconds each scene dissolves in over the previous one

export const Film: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / FPS;
  return (
    <AbsoluteFill style={{ background: C.navy }}>
      {TM.scenes.map((s, i) => {
        const Sc = SCENES[s.id];
        const a = i === 0 ? 0 : s.from - XF;
        const b = s.from + s.dur;
        if (!Sc || t < a || t >= b) return null;
        const p = i === 0 ? 1 : interpolate(t, [a, s.from], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        return (
          <AbsoluteFill key={s.id} style={{ opacity: p, transform: `scale(${1.03 - 0.03 * p})`, filter: p < 1 ? `blur(${(1 - p) * 10}px)` : undefined }}>
            <Sc />
          </AbsoluteFill>
        );
      })}
      <Grain o={0.06} />
      <Captions hidden={(tt, id) => ["open", "turn", "unique", "close"].includes(id) || (id === "problem" && tt < lineAt("problem", 1) - 0.2) || (id === "evidence" && tt < lineAt("evidence", 0) + 1.2 && false)} />
      {existsSync("audio/tension.mp3") && <Audio src={staticFile("audio/tension.mp3")} volume={(fr) => musicVol(fr / FPS) * (1 - ramp(fr / FPS, VOX - 0.15, VOX + 0.05))} endAt={Math.round((VOX + 0.4) * FPS)} />}
      {existsSync("audio/groove.mp3") && <Sequence from={Math.round((VOX - 0.05) * FPS)} name="groove"><Audio src={staticFile("audio/groove.mp3")} volume={(fr) => musicVol(VOX - 0.05 + fr / FPS) * 0.92} /></Sequence>}
      {effects().map((x, i) => (
        <Sequence key={`fx${i}`} from={Math.max(0, Math.round(x.at * FPS))} durationInFrames={Math.round((x.dur ?? 4) * FPS)} name={`fx ${x.f}`}>
          <Audio src={staticFile(`audio/sfx/${x.f}.mp3`)} volume={x.vol} />
        </Sequence>
      ))}
      {TM.scenes.flatMap((s) => s.lines).map((l, i) => (
        existsSync(l.file) ? <Sequence key={`vo${i}`} from={Math.round(l.start * FPS)} durationInFrames={Math.ceil((l.end - l.start + 1) * FPS)} name={`vo ${l.text.slice(0, 20)}`}>
          <Audio src={staticFile(l.file)} />
        </Sequence> : null
      ))}
    </AbsoluteFill>
  );
};
