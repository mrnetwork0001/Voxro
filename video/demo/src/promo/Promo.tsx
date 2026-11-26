// "Voxro, inside TapeTape": 16:9 promo built around a phone screen recording (public/promo/main.mp4,
// 576x1228 @30fps, status bar cropped). Narration timing comes from src/promo/vo.json (scripts/promo-vo.mjs).
import React from "react";
import { AbsoluteFill, Audio, Easing, Freeze, Img, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame } from "remotion";
import { C, mono, sans } from "../theme";
import vo from "./vo.json";

export const PFPS = 30;
const SRC_W = 576, SRC_H = 1228;
const SCREEN_H = 900, K = SCREEN_H / SRC_H, SCREEN_W = Math.round(SRC_W * K);
const BEZEL = 14;

type Clip = { a: number; b: number; sp?: number };
type CamKey = { src: number; z: number; fx: number; fy: number };
type SceneDef = { id: string; clips: Clip[]; minDur?: number; cams?: CamKey[]; maxBoost?: number };

// Source windows chosen where TapeTape's address bar shows the green check (or where it is zoomed out of frame),
// and never 81.2–83.5 s (keyboard autofill showed email addresses there).
const DEFS: SceneDef[] = [
  { id: "intro", clips: [{ a: 0, b: 2.6 }, { a: 15, b: 19.8 }] },
  {
    id: "open", clips: [{ a: 20, b: 29.5, sp: 3 }, { a: 33.6, b: 44.8 }],
    cams: [{ src: 35.9, z: 1, fx: 150, fy: 30 }, { src: 36.6, z: 2.1, fx: 120, fy: 30 }, { src: 38.8, z: 2.1, fx: 120, fy: 30 }, { src: 39.6, z: 1, fx: 120, fy: 30 }],
  },
  {
    id: "connect", clips: [{ a: 61, b: 78.8 }], maxBoost: 2.2,
    cams: [{ src: 66.6, z: 1, fx: 288, fy: 560 }, { src: 67.2, z: 1.6, fx: 288, fy: 560 }, { src: 69.0, z: 1.6, fx: 288, fy: 560 }, { src: 69.7, z: 1, fx: 288, fy: 560 }],
  },
  {
    id: "find", clips: [{ a: 79.2, b: 81.2 }, { a: 85, b: 99 }], maxBoost: 2.4,
    cams: [{ src: 79.2, z: 1.22, fx: 288, fy: 300 }, { src: 99, z: 1.22, fx: 288, fy: 300 }],
  },
  {
    id: "proof", clips: [{ a: 106, b: 110.6, sp: 2.5 }, { a: 110.9, b: 120.6 }], maxBoost: 1.6,
    cams: [{ src: 111.6, z: 1, fx: 20, fy: 600 }, { src: 112.4, z: 1.7, fx: 20, fy: 600 }, { src: 114.4, z: 1.7, fx: 20, fy: 600 }, { src: 115.2, z: 1, fx: 20, fy: 600 }],
  },
  { id: "outro", clips: [{ a: 120.5, b: 120.6 }], minDur: 6.2 },
];

type Line = { id: string; text: string; start: number; end: number };
type Scene = SceneDef & { from: number; dur: number; lines: Line[]; boost: number; footage: number };

const LAST = <T,>(a: T[]): T => a[a.length - 1];
const VO = vo as { scenes: Array<{ id: string; lead: number; tail: number; lines: Array<{ id: string; text: string; gap: number; dur: number }> }> };

export const SCENES: Scene[] = (() => {
  let t = 0;
  return DEFS.map((d) => {
    const v = VO.scenes.find((s) => s.id === d.id)!;
    let c = t + v.lead;
    const lines: Line[] = v.lines.map((l, i) => {
      if (i > 0) c += l.gap;
      const ln = { id: l.id, text: l.text, start: c, end: c + l.dur };
      c += l.dur;
      return ln;
    });
    const dur = Math.max(c + v.tail - t, d.minDur ?? 0);
    const footage = d.clips.reduce((s, k) => s + (k.b - k.a) / (k.sp ?? 1), 0);
    const boost = Math.min(Math.max(footage / dur, 1), d.maxBoost ?? 2);
    const sc: Scene = { ...d, from: t, dur, lines, boost, footage };
    t += dur;
    return sc;
  });
})();
export const PROMO_TOTAL = LAST(SCENES).from + LAST(SCENES).dur;

/** Source time shown at scene-local time `lt` (seconds); holds the last frame when footage runs out. */
const srcAt = (s: Scene, lt: number) => {
  let left = lt;
  for (const k of s.clips) {
    const rate = (k.sp ?? 1) * s.boost, len = (k.b - k.a) / rate;
    if (left <= len) return k.a + left * rate;
    left -= len;
  }
  return LAST(s.clips).b;
};
const localOf = (s: Scene, src: number) => {
  for (let lt = 0; lt <= s.dur; lt += 1 / PFPS) if (srcAt(s, lt) >= src) return lt;
  return s.dur;
};

const ease = Easing.bezier(0.45, 0, 0.2, 1);
const camAt = (s: Scene, lt: number) => {
  const keys = (s.cams ?? []).map((k) => ({ ...k, t: localOf(s, k.src) }));
  if (!keys.length) return { z: 1, fx: SRC_W / 2, fy: SRC_H / 2 };
  if (lt <= keys[0].t) return keys[0];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (lt <= b.t) {
      const p = ease(Math.min(1, Math.max(0, (lt - a.t) / Math.max(0.001, b.t - a.t))));
      return { z: a.z + (b.z - a.z) * p, fx: a.fx + (b.fx - a.fx) * p, fy: a.fy + (b.fy - a.fy) * p };
    }
  }
  return LAST(keys);
};

const Screen: React.FC<{ s: Scene }> = ({ s }) => {
  // One Sequence per clip so OffthreadVideo seeks exactly; the last frame is frozen after footage ends.
  let at = 0;
  const parts: React.ReactNode[] = [];
  s.clips.forEach((k, i) => {
    const rate = (k.sp ?? 1) * s.boost, len = (k.b - k.a) / rate;
    const from = Math.round(at * PFPS), dur = Math.max(1, Math.round(len * PFPS));
    parts.push(
      <Sequence key={i} from={from} durationInFrames={dur} layout="none">
        <OffthreadVideo src={staticFile("promo/main.mp4")} startFrom={Math.round(k.a * PFPS)} playbackRate={rate} muted style={{ width: SCREEN_W, height: SCREEN_H, display: "block" }} />
      </Sequence>,
    );
    at += len;
  });
  const hold = Math.round(at * PFPS), last = LAST(s.clips);
  parts.push(
    <Sequence key="hold" from={hold} layout="none">
      <Freeze frame={0}>
        <OffthreadVideo src={staticFile("promo/main.mp4")} startFrom={Math.max(0, Math.round(last.b * PFPS) - 1)} muted style={{ width: SCREEN_W, height: SCREEN_H, display: "block" }} />
      </Freeze>
    </Sequence>,
  );
  return <>{parts}</>;
};

const Phone: React.FC<{ s: Scene; lt: number; x: number; y: number; scale?: number; opacity?: number }> = ({ s, lt, x, y, scale = 1, opacity = 1 }) => {
  const cam = camAt(s, lt);
  return (
    <div style={{ position: "absolute", left: x - (SCREEN_W + 2 * BEZEL) / 2, top: y - (SCREEN_H + 2 * BEZEL) / 2, width: SCREEN_W + 2 * BEZEL, height: SCREEN_H + 2 * BEZEL, transform: `scale(${scale})`, opacity }}>
      <div style={{ position: "absolute", inset: -40, borderRadius: 120, background: "radial-gradient(closest-side, rgba(51,255,0,0.20), rgba(51,255,0,0) 75%)", filter: "blur(30px)" }} />
      <div style={{ position: "absolute", inset: 0, borderRadius: 62, background: "linear-gradient(145deg,#2a3242,#0d1118 45%,#1c2230)", boxShadow: "0 40px 120px rgba(0,0,0,0.65), inset 0 0 0 2px rgba(255,255,255,0.08)" }} />
      <div style={{ position: "absolute", left: BEZEL, top: BEZEL, width: SCREEN_W, height: SCREEN_H, borderRadius: 48, overflow: "hidden", background: "#000" }}>
        <div style={{ width: SCREEN_W, height: SCREEN_H, transformOrigin: `${cam.fx * K}px ${cam.fy * K}px`, transform: `scale(${cam.z})` }}>
          <Sequence key={s.id} from={Math.round(s.from * PFPS)} durationInFrames={Math.max(1, Math.round(s.dur * PFPS))} layout="none">
            <Screen s={s} />
          </Sequence>
        </div>
      </div>
    </div>
  );
};

const Kick: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontFamily: mono, fontSize: 22, letterSpacing: 4, color: C.green, textTransform: "uppercase", marginBottom: 22 }}>{children}</div>
);

const Chip: React.FC<{ children: React.ReactNode; on?: boolean }> = ({ children, on }) => (
  <div style={{ display: "inline-flex", alignItems: "center", gap: 14, fontFamily: mono, fontSize: 26, color: on ? C.greenInk : C.ink, background: on ? C.green : "rgba(255,255,255,0.06)", border: `1px solid ${on ? C.green : "rgba(255,255,255,0.14)"}`, borderRadius: 12, padding: "12px 20px", marginRight: 14, marginTop: 14 }}>{children}</div>
);

const Check: React.FC<{ t: number; at: number; children: React.ReactNode }> = ({ t, at, children }) => {
  const p = spring({ frame: Math.round((t - at) * PFPS), fps: PFPS, config: { damping: 200 } });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 32, color: C.ink, marginTop: 20, opacity: p, transform: `translateX(${(1 - p) * -24}px)` }}>
      <span style={{ width: 40, height: 40, borderRadius: 20, background: C.green, color: C.greenInk, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 800 }}>✓</span>
      {children}
    </div>
  );
};

const LEFT = 150, COLW = 760;

const Panel: React.FC<{ s: Scene; lt: number; t: number }> = ({ s, lt, t }) => {
  const inP = spring({ frame: Math.round(lt * PFPS), fps: PFPS, config: { damping: 200 } });
  const outP = interpolate(lt, [s.dur - 0.35, s.dur], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const T = (title: string) => <div style={{ fontFamily: sans, fontWeight: 800, fontSize: 76, lineHeight: 1.04, letterSpacing: -1.5, color: C.ink }}>{title}</div>;
  const a = s.from;
  let body: React.ReactNode = null;
  if (s.id === "intro") body = <><Kick>Voxro × TapeTape</Kick>{T("Voxro, now inside TapeTape.")}<div style={{ fontSize: 34, color: C.dim, marginTop: 26, lineHeight: 1.35 }}>The whole app, served from X Layer and opened in TapeOut's own messenger.</div></>;
  if (s.id === "open") body = <><Kick>DeWEB browser</Kick>{T("Open it by its on-chain name.")}<div style={{ marginTop: 26 }}><Chip on>5.2.212</Chip><Chip>tape://5.2.212.tape</Chip></div><Check t={t} at={a + localOf(s, 36.6)}>No web server, no hosting</Check></>;
  if (s.id === "connect") body = <><Kick>Verified · built-in wallet</Kick>{T("Read from the chain. Connect in one tap.")}<Check t={t} at={a + 0.6}>Every file checked against its SHA-256</Check><Check t={t} at={a + localOf(s, 67.2)}>TapeTape's own X Layer wallet</Check></>;
  if (s.id === "find") body = <><Kick>Directory</Kick>{T("Priced by a circuit. No reply, full refund.")}<div style={{ marginTop: 26 }}><Chip on>@gsucoin · 1 USD₮0</Chip></div><Check t={t} at={a + (s.lines[1]?.start ?? a + 3) - a}>100% back if they don't reply</Check></>;
  if (s.id === "proof") body = <><Kick>TapeTape status page</Kick>{T("Don't trust us. Check.")}<Check t={t} at={a + localOf(s, 112.4)}>4 files verified against chain</Check><Check t={t} at={a + localOf(s, 112.9)}>No off-chain references</Check><Check t={t} at={a + localOf(s, 113.4)}>No off-chain access seen</Check></>;
  if (!body) return null;
  return <div style={{ position: "absolute", left: LEFT, top: 250, width: COLW, opacity: inP * outP, transform: `translateY(${(1 - inP) * 30}px)`, fontFamily: sans }}>{body}</div>;
};

const Caption: React.FC<{ t: number }> = ({ t }) => {
  const line = SCENES.flatMap((s) => s.lines).find((l) => t >= l.start - 0.05 && t <= l.end + 0.25);
  if (!line || SCENES.find((s) => s.id === "outro")!.from <= t) return null;
  const o = interpolate(t, [line.start - 0.05, line.start + 0.15, line.end + 0.05, line.end + 0.25], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", left: LEFT, top: 880, width: COLW, opacity: o, fontFamily: sans, fontSize: 30, lineHeight: 1.35, color: "rgba(240,242,245,0.9)", borderLeft: `4px solid ${C.green}`, paddingLeft: 22 }}>{line.text}</div>
  );
};

const Outro: React.FC<{ lt: number; s: Scene }> = ({ lt, s }) => {
  const p = spring({ frame: Math.round(lt * PFPS), fps: PFPS, config: { damping: 200 } });
  const p2 = spring({ frame: Math.round((lt - (s.lines[1]?.start ?? s.from + 3) + s.from) * PFPS), fps: PFPS, config: { damping: 200 } });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", fontFamily: sans, opacity: p }}>
      <div style={{ textAlign: "center", transform: `translateY(${(1 - p) * 30}px)` }}>
        <div style={{ fontWeight: 800, fontSize: 84, letterSpacing: -2, color: C.ink, lineHeight: 1.08 }}>TapeTape for people you know.</div>
        <div style={{ fontWeight: 800, fontSize: 84, letterSpacing: -2, color: C.green, lineHeight: 1.08 }}>Voxro for people you don't.</div>
        <div style={{ marginTop: 56, opacity: p2, display: "flex", gap: 22, justifyContent: "center", alignItems: "center" }}>
          <Img src={staticFile("brand/shieldsuite.png")} style={{ width: 64, height: 64 }} />
          <div style={{ fontFamily: mono, fontSize: 30, color: C.ink, textAlign: "left", lineHeight: 1.5 }}>
            Open <span style={{ color: C.green }}>5.2.212</span> in TapeTape · voxro.shieldsuite.xyz<br />
            <span style={{ color: C.dim }}>A ShieldSuite product · @ShieldSuite_ · built on X Layer</span>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Background: React.FC<{ t: number }> = ({ t }) => (
  <AbsoluteFill style={{ background: `radial-gradient(1200px 800px at 70% 50%, #10203a 0%, ${C.navy} 55%, ${C.black} 100%)` }}>
    <AbsoluteFill style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)", backgroundSize: "64px 64px", backgroundPosition: `0 ${(t * 6) % 64}px`, maskImage: "radial-gradient(circle at 60% 50%, black, transparent 75%)" }} />
  </AbsoluteFill>
);

const SFX: Array<{ f: string; t: number; vol: number }> = [
  ...SCENES.slice(1).map((s) => ({ f: "whoosh", t: s.from - 0.15, vol: 0.28 })),
  { f: "chime", t: SCENES[1].from + localOf(SCENES[1], 36.6), vol: 0.35 },
  { f: "pop", t: SCENES[2].from + localOf(SCENES[2], 69.3), vol: 0.4 },
  { f: "chime", t: SCENES[4].from + localOf(SCENES[4], 112.4), vol: 0.35 },
];

export const Promo: React.FC = () => {
  const f = useCurrentFrame(), t = f / PFPS;
  const s = SCENES.find((x) => t >= x.from && t < x.from + x.dur) ?? LAST(SCENES);
  const lt = t - s.from;
  const outro = s.id === "outro";
  const phoneIn = spring({ frame: f, fps: PFPS, config: { damping: 200 } });
  const music = (fr: number) => {
    const tt = fr / PFPS;
    return 0.16 * interpolate(tt, [0, 1.2, PROMO_TOTAL - 2.5, PROMO_TOTAL], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  };
  return (
    <AbsoluteFill style={{ backgroundColor: C.black }}>
      <Background t={t} />
      {!outro && <Phone s={s} lt={lt} x={1360} y={540 + (1 - phoneIn) * 80} opacity={phoneIn * interpolate(t, [LAST(SCENES).from - 0.4, LAST(SCENES).from], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} />}
      {!outro && <Panel s={s} lt={lt} t={t} />}
      <Caption t={t} />
      {outro && <Outro lt={lt} s={s} />}
      <div style={{ position: "absolute", left: LEFT, top: 92, display: "flex", alignItems: "center", gap: 16, fontFamily: mono, fontSize: 22, color: C.dim, letterSpacing: 2, opacity: outro ? 0 : 1 }}>
        <Img src={staticFile("brand/shieldsuite.png")} style={{ width: 36, height: 36 }} /> VOXRO · A SHIELDSUITE PRODUCT
      </div>
      <Audio src={staticFile("audio/groove.mp3")} volume={music} endAt={Math.round(PROMO_TOTAL * PFPS)} />
      {SCENES.flatMap((sc) => sc.lines).map((l) => (
        <Sequence key={l.id} from={Math.round(l.start * PFPS)} layout="none"><Audio src={staticFile(`audio/vo/${l.id}.mp3`)} /></Sequence>
      ))}
      {SFX.map((x, i) => (
        <Sequence key={i} from={Math.max(0, Math.round(x.t * PFPS))} layout="none"><Audio src={staticFile(`audio/sfx/${x.f}.mp3`)} volume={x.vol} /></Sequence>
      ))}
    </AbsoluteFill>
  );
};
