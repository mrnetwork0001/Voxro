import React from "react";
import { AbsoluteFill, Freeze, OffthreadVideo, staticFile, useCurrentFrame } from "remotion";
import footage from "./footage.json";
import { C, mono, sans } from "./theme";
import { FPS, TM, expo, mix, pop, ramp, soft, useT } from "./lib";

// ─── footage ────────────────────────────────────────────────────────────────────────────────
export interface Rect { x: number; y: number; w: number; h: number }
interface Clip { file: string; width: number; height: number; durationFrames: number; marks?: Record<string, number> }
const LIB = footage as unknown as Record<string, Clip>;
/** Clip second of a capture mark. */
export const mark = (name: string, m: string) => (LIB[name]?.marks?.[m] ?? 0) / 30;
/** The page the footage was recorded at, in CSS px. */
export const PAGE = { w: 1600, h: 900 };
/** Cut: from film second `t`, play the clip from clip second `from` (at `speed`). */
export interface Cut { t: number; from: number; speed?: number }
/** Camera key: at film second `t`, centre on `r` (page CSS px) at zoom `z`. */
export interface Cam { t: number; r?: Rect; z?: number }

function camAt(t: number, cams: Cam[]) {
  const pts = cams.map((c) => ({ t: c.t, z: c.z ?? (c.r ? Math.min(PAGE.w / c.r.w, PAGE.h / c.r.h) * 0.92 : 1), cx: c.r ? c.r.x + c.r.w / 2 : PAGE.w / 2, cy: c.r ? c.r.y + c.r.h / 2 : PAGE.h / 2 }));
  if (!pts.length) return { z: 1, cx: PAGE.w / 2, cy: PAGE.h / 2 };
  if (t <= pts[0].t) return pts[0];
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i].t) {
      const a = pts[i - 1], b = pts[i];
      const p = ramp(t, a.t, b.t, soft);
      // zoom eases in log space so push-ins feel even
      const z = Math.exp(mix(Math.log(a.z), Math.log(b.z), p));
      return { z, cx: mix(a.cx, b.cx, p), cy: mix(a.cy, b.cy, p) };
    }
  }
  return pts[pts.length - 1];
}

/** A browser window playing the recorded live app, cut and framed by a camera. Holds the last frame. */
export const Browser: React.FC<{
  name: string; url: string; x: number; y: number; w: number; cuts: Cut[]; cams?: Cam[];
  enter?: number; exit?: number; light?: boolean; style?: React.CSSProperties;
}> = ({ name, url, x, y, w, cuts, cams = [], enter, exit, light, style }) => {
  const t = useT();
  const c = LIB[name];
  const bar = 46;
  const k = w / PAGE.w;
  const vh = PAGE.h * k;
  const cam = camAt(t, cams);
  const s = cam.z;
  const tx = Math.min(0, Math.max(w - PAGE.w * k * s, w / 2 - cam.cx * k * s));
  const ty = Math.min(0, Math.max(vh - PAGE.h * k * s, vh / 2 - cam.cy * k * s));
  const cut = [...cuts].reverse().find((q) => t >= q.t) ?? cuts[0];
  const clipF = c ? Math.max(0, Math.min(c.durationFrames - 2, Math.round((cut.from + Math.max(0, t - cut.t) * (cut.speed ?? 1)) * 30))) : 0;
  const inP = enter != null ? ramp(t, enter, enter + 0.7) : 1;
  const outP = exit != null ? ramp(t, exit, exit + 0.45) : 0;
  return (
    <div style={{
      position: "absolute", left: x, top: y, width: w, height: vh + bar, borderRadius: 20, overflow: "hidden", background: C.navy,
      boxShadow: light ? "0 0 0 1px rgba(10,14,23,0.14), 0 50px 110px rgba(10,14,23,0.3)" : `0 0 0 1px rgba(255,255,255,0.12), 0 60px 120px rgba(0,0,0,0.65), 0 0 90px ${C.green}14`,
      opacity: inP * (1 - outP), transform: `translateY(${(1 - inP) * 60 - outP * 30}px) scale(${0.965 + 0.035 * inP})`, ...style,
    }}>
      <div style={{ height: bar, display: "flex", alignItems: "center", gap: 9, padding: "0 20px", background: "#0d121d", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        {[0, 1, 2].map((i) => <span key={i} style={{ width: 12, height: 12, borderRadius: 6, background: "rgba(255,255,255,0.16)" }} />)}
        <div style={{ marginLeft: 16, flex: 1, height: 28, borderRadius: 8, background: "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", padding: "0 14px", fontFamily: mono, fontSize: 16, color: "rgba(255,255,255,0.62)" }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: C.green, marginRight: 11, boxShadow: `0 0 8px ${C.green}` }} />{url}
        </div>
      </div>
      <div style={{ position: "relative", width: w, height: vh, overflow: "hidden" }}>
        <div style={{ position: "absolute", left: 0, top: 0, width: PAGE.w, height: PAGE.h, transformOrigin: "0 0", transform: `translate(${tx}px, ${ty}px) scale(${k * s})` }}>
          {c ? (
            <Freeze frame={clipF}><OffthreadVideo src={staticFile(c.file)} muted style={{ width: PAGE.w, height: PAGE.h }} /></Freeze>
          ) : <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", fontFamily: sans, color: C.dim, fontSize: 28 }}>footage “{name}” pending</AbsoluteFill>}
        </div>
      </div>
    </div>
  );
};

// ─── type & cards ───────────────────────────────────────────────────────────────────────────
export const Count: React.FC<{ to: number; t0: number; dur?: number; decimals?: number; style?: React.CSSProperties }> = ({ to, t0, dur = 1.2, decimals = 0, style }) => {
  const t = useT();
  const v = to * ramp(t, t0, t0 + dur);
  return <span style={{ fontVariantNumeric: "tabular-nums", ...style }}>{v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}</span>;
};

export const Kicker: React.FC<{ children: React.ReactNode; color?: string; style?: React.CSSProperties }> = ({ children, color = C.green, style }) => (
  <div style={{ fontFamily: mono, fontSize: 22, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color, ...style }}>{children}</div>
);

/** A card that pops in at t0 (and out at t1). */
export const Card: React.FC<{ t0: number; t1?: number; x: number; y: number; w?: number; children: React.ReactNode; hot?: boolean; light?: boolean; style?: React.CSSProperties }> = ({ t0, t1, x, y, w, children, hot, light, style }) => {
  const t = useT();
  const p = pop(t, t0);
  const o = t1 != null ? 1 - ramp(t, t1, t1 + 0.35) : 1;
  return (
    <div style={{
      position: "absolute", left: x, top: y, width: w, padding: "26px 30px", boxSizing: "border-box", borderRadius: 18,
      background: light ? "#ffffff" : hot ? "#06120a" : "rgba(13,18,32,0.92)", backdropFilter: "blur(10px)",
      border: `1.5px solid ${hot ? C.green : light ? "rgba(10,14,23,0.1)" : "rgba(255,255,255,0.1)"}`,
      boxShadow: hot ? `0 0 70px ${C.green}33, 0 30px 70px rgba(0,0,0,0.5)` : light ? "0 30px 70px rgba(10,14,23,0.16)" : "0 30px 70px rgba(0,0,0,0.5)",
      opacity: Math.min(1, p * 1.4) * o, transform: `translateY(${(1 - p) * 40}px) scale(${0.9 + 0.1 * p})`, transformOrigin: "50% 100%", ...style,
    }}>{children}</div>
  );
};

// ─── the motif: the LATCH queue and its price ladder ───────────────────────────────────────
/** @voxro's real ladder for a cold sender (balanced curve [0 0 1 1 2 2 3 3] on a 10 USD₮0 base). */
export const LADDER = [10, 15, 15, 25, 25, 40, 40, 40];
export const tierColor = (p: number) => (p <= 10 ? C.green : p <= 15 ? "#e8d33a" : p <= 25 ? "#ff9f1a" : "#ff453a");

/** Eight rungs, one per queue depth; rungs up to `depth` light up. `depth` may be fractional while it moves. */
export const Ladder: React.FC<{ depth: number; x: number; y: number; cell?: number; gap?: number; t0?: number; labels?: boolean }> = ({ depth, x, y, cell = 150, gap = 16, t0, labels = true }) => {
  const t = useT();
  return (
    <div style={{ position: "absolute", left: x, top: y, display: "flex", gap, alignItems: "flex-end" }}>
      {LADDER.map((p, i) => {
        const inP = t0 == null ? 1 : pop(t, t0 + i * 0.05);
        const lit = Math.max(0, Math.min(1, depth - i + 1));
        const cur = depth >= i && depth < i + 1;
        const col = tierColor(p);
        const h = cell * (0.85 + i * 0.16);
        return (
          <div key={i} style={{ width: cell, opacity: inP, transform: `translateY(${(1 - inP) * 40}px)` }}>
            <div style={{ height: h, borderRadius: 14, border: `2px solid ${lit > 0 ? col : "rgba(255,255,255,0.12)"}`, background: `linear-gradient(180deg, ${col}${Math.round(lit * 40).toString(16).padStart(2, "0")}, transparent)`, boxShadow: cur ? `0 0 50px ${col}66` : undefined, display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: 16, boxSizing: "border-box" }}>
              <div style={{ fontFamily: sans, fontWeight: 800, fontSize: cell * 0.36, letterSpacing: "-0.04em", color: lit > 0 ? col : "rgba(255,255,255,0.28)", lineHeight: 1 }}>{p}</div>
              <div style={{ fontFamily: mono, fontSize: cell * 0.11, color: lit > 0 ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.22)", marginTop: 6 }}>USD₮0</div>
            </div>
            {labels && <div style={{ fontFamily: mono, fontSize: cell * 0.12, color: cur ? C.ink : C.dim, textAlign: "center", marginTop: 12 }}>Q{i}</div>}
          </div>
        );
      })}
    </div>
  );
};

// ─── captions ───────────────────────────────────────────────────────────────────────────────
/** The spoken line on a frosted pill, each word lighting as it is said. */
export const Captions: React.FC<{ hidden: (t: number, scene: string) => boolean }> = ({ hidden }) => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const s = TM.scenes.find((x) => t >= x.from && t < x.from + x.dur);
  if (!s || hidden(t, s.id)) return null;
  const line = s.lines.find((l) => t >= l.start - 0.15 && t <= l.end + 0.45);
  if (!line) return null;
  // show the written script, not the respelling given to the voice ("Vox-roh", "M C P"): when the counts
  // differ, spread the written words over the spoken span
  const written = line.text.split(" ");
  const words = written.length === line.words.length
    ? line.words.map((w, i) => ({ ...w, word: written[i]! }))
    : written.map((word, i) => {
        const a = line.words[Math.floor((i / written.length) * line.words.length)]!;
        return { word, start: a.start, end: a.end };
      });
  const chunks: typeof line.words[] = [];
  let cur: typeof line.words = [];
  for (const w of words) {
    cur.push(w);
    if ((/[.,?]$/.test(w.word) && cur.length >= 4) || cur.length >= 9) { chunks.push(cur); cur = []; }
  }
  if (cur.length) chunks.push(cur);
  let shown = chunks[0];
  for (const c of chunks) if (t >= c[0].start - 0.1) shown = c;
  const op = ramp(t, line.start - 0.15, line.start + 0.1) * (1 - ramp(t, line.end + 0.2, line.end + 0.45));
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 58, display: "flex", justifyContent: "center", opacity: op }}>
      <div style={{ fontFamily: sans, fontSize: 34, fontWeight: 600, letterSpacing: "-0.015em", padding: "12px 30px", borderRadius: 999, background: "rgba(5,7,12,0.62)", backdropFilter: "blur(18px)", boxShadow: "0 0 0 1px rgba(255,255,255,0.1)" }}>
        {shown.map((w, i) => <span key={i} style={{ color: C.ink, opacity: t >= w.start - 0.06 ? 1 : 0.36 }}>{w.word} </span>)}
      </div>
    </div>
  );
};

export { expo };
