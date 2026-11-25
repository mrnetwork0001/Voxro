import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from "remotion";
import { C, mono, sans, serif } from "./theme";
import { expo, inOut, pop, ramp, useT } from "./lib";

export const Grain: React.FC<{ o?: number }> = ({ o = 0.07 }) => {
  const s = (Math.floor(useCurrentFrame() / 2) % 8) + 1;
  return (
    <AbsoluteFill style={{ mixBlendMode: "overlay", opacity: o, pointerEvents: "none" }}>
      <svg width="100%" height="100%"><filter id={`g${s}`}><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={s} stitchTiles="stitch" /><feColorMatrix type="saturate" values="0" /></filter><rect width="100%" height="100%" filter={`url(#g${s})`} /></svg>
    </AbsoluteFill>
  );
};

/** Voxro's own surface: navy, blue light from above, faint 40px grid drifting slowly. */
export const Dark: React.FC<{ children?: React.ReactNode; glow?: number }> = ({ children, glow = 1 }) => {
  const t = useT();
  return (
    <AbsoluteFill style={{ background: C.navy, overflow: "hidden" }}>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 70% 75% at 50% -5%, rgba(75,123,245,0.28), transparent 70%)", opacity: glow }} />
      <div style={{ position: "absolute", inset: -80, backgroundImage: "linear-gradient(rgba(255,255,255,0.028) 1.5px, transparent 1.5px), linear-gradient(90deg, rgba(255,255,255,0.028) 1.5px, transparent 1.5px)", backgroundSize: "60px 60px", transform: `translate(${-(t * 8) % 60}px, ${(t * 5) % 60}px)` }} />
      {children}
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.5))" }} />
    </AbsoluteFill>
  );
};

export interface K { w: string; t: number; serif?: string; color?: string; br?: boolean }
/** Kinetic type: each word rises out of a mask on its own spoken moment. */
export const Type: React.FC<{ words: K[]; size: number; color?: string; align?: "left" | "center"; lh?: number; cursor?: boolean; weight?: number }> = ({ words, size, color = C.ink, align = "left", lh = 1.04, cursor, weight = 700 }) => {
  const t = useT();
  const lines: K[][] = [[]];
  for (const w of words) { if (w.br) lines.push([]); lines[lines.length - 1].push(w); }
  const lastShown = words.filter((w) => t >= w.t).pop();
  return (
    <div style={{ fontFamily: sans, fontWeight: weight, fontSize: size, letterSpacing: "-0.048em", lineHeight: lh, color, textAlign: align, whiteSpace: "nowrap" }}>
      {lines.map((ln, i) => (
        <div key={i}>
          {ln.map((w, j) => {
            const p = ramp(t, w.t, w.t + 0.5);
            return (
              <React.Fragment key={j}>
                <span style={{ display: "inline-block", overflow: "hidden", verticalAlign: "bottom", padding: "0 0.06em 0.14em", margin: "0 -0.06em -0.14em" }}>
                  <span style={{ display: "inline-block", transform: `translateY(${(1 - p) * 115}%) rotate(${(1 - p) * 5}deg)`, transformOrigin: "0 100%", filter: p < 1 ? `blur(${(1 - p) * 8}px)` : undefined, ...(w.color ? { color: w.color } : {}), ...(w.serif ? { fontFamily: serif, fontStyle: "italic", fontWeight: 400, color: w.serif, fontSize: "1.14em", letterSpacing: "-0.02em", lineHeight: 0.9 } : {}) }}>{w.w}</span>
                </span>
                {cursor && lastShown === w && <Caret h={size * 0.82} left={size * 0.1} low={size * 0.12} blink={t - w.t > 0.6} />}
                {j < ln.length - 1 ? <span style={{ display: "inline-block", width: "0.23em" }} /> : null}
              </React.Fragment>
            );
          })}
        </div>
      ))}
    </div>
  );
};

/** The motif: Voxro's terminal block cursor. It becomes the gate, the wipe and the scanner. */
export const Caret: React.FC<{ h: number; left?: number; blink?: boolean; color?: string; low?: number }> = ({ h, left = 0, blink, color = C.green, low }) => {
  const t = useT();
  return <span style={{ display: "inline-block", width: 0, height: 0, position: "relative", verticalAlign: low == null ? "baseline" : "bottom" }}><span style={{ position: "absolute", left, bottom: low ?? -h * 0.12, width: h * 0.2, height: h, background: color, boxShadow: `0 0 ${h * 0.28}px ${color}88`, opacity: blink && (t * 1.9) % 1 > 0.55 ? 0 : 1 }} /></span>;
};

/** An unread message, with no invented text. */
export const Msg: React.FC<{ i: number; light?: boolean; hot?: boolean }> = ({ i, light, hot }) => {
  const bar = hot ? "rgba(4,20,10,0.55)" : light ? "#c9ced6" : "#4a5674";
  return (
    <div style={{ width: 460, height: 132, borderRadius: 24, background: hot ? C.green : light ? "#ffffff" : "#1d2742", boxShadow: hot ? `0 0 90px ${C.green}77` : light ? "0 0 0 1.5px rgba(10,14,23,0.08), 0 22px 50px rgba(10,14,23,0.16)" : "0 0 0 1.5px rgba(255,255,255,0.09), 0 22px 50px rgba(0,0,0,0.5)", display: "flex", alignItems: "center", gap: 22, padding: "0 28px", position: "relative", boxSizing: "border-box" }}>
      <div style={{ width: 66, height: 66, borderRadius: 33, flex: "none", background: hot ? C.greenInk : light ? ["#dfe3ea", "#cfd5de", "#e6e2da", "#d5dde6"][i % 4] : ["#34405f", "#3b4769", "#2f3d5e"][i % 3] }} />
      <div style={{ flex: 1 }}>
        <div style={{ height: 17, width: `${48 + (i * 17) % 34}%`, borderRadius: 9, background: hot ? C.greenInk : light ? "#8d95a3" : "#8592b0", marginBottom: 16 }} />
        <div style={{ height: 13, width: `${70 + (i * 13) % 28}%`, borderRadius: 7, background: bar }} />
      </div>
      {!hot && <div style={{ position: "absolute", top: -11, right: -11, width: 34, height: 34, borderRadius: 17, background: C.red, boxShadow: "0 4px 14px rgba(255,59,48,0.45)" }} />}
    </div>
  );
};

export const Shield: React.FC<{ size: number }> = ({ size }) => (
  <div style={{ width: size, height: size, borderRadius: size, overflow: "hidden", background: "#000" }}><Img src={staticFile("brand/shieldsuite.png")} style={{ width: size, height: size, transform: "scale(1.02)" }} /></div>
);

/** X Layer's own mark (xlayer-icon.svg): its real squares, snapping into place one by one. */
const XR: Array<[number, number, number, number]> = [[0, 0.543, 16.32, 1], [32.637, 0.543, 16.32, 1], [16.367, 16.902, 16.24, 1], [0, 33.186, 16.32, 1], [32.637, 33.186, 16.32, 1]];
const XF: Array<[number, number, number]> = [[41, 0.543, 0.5], [41, 33.222, 0.5], [46.54, 0.543, 0.3], [46.54, 33.222, 0.3]];
export const XLayer: React.FC<{ h: number; t0?: number }> = ({ h, t0 }) => {
  const t = useT();
  const w = (h * 63) / 50;
  if (t0 == null || t > t0 + 1.1) return <Img src={staticFile("brand/xlayer-icon.svg")} style={{ width: w, height: h, display: "block" }} />;
  return (
    <svg width={w} height={h} viewBox="0 0 63 50" style={{ overflow: "visible", display: "block" }}>
      {XF.map(([x, y, o], i) => { const p = ramp(t, t0 + 0.55 + (i >> 1) * 0.09, t0 + 0.95 + (i >> 1) * 0.09); const W = i < 2 ? 5.54 : 2.76; const X = i < 2 ? 51.77 : 60.12; return <rect key={i} x={X - (1 - p) * 10} y={y} width={W} height={16.32} rx={0.6} fill="#fff" fillOpacity={o * p} data-x={x} />; })}
      {XR.map(([x, y, s], i) => { const p = pop(t, t0 + [2, 1, 0, 3, 2][i] * 0.09, 12, 210); return <rect key={i} x={x} y={y} width={s} height={s} rx={1.09} fill="#fff" style={{ transformBox: "fill-box", transformOrigin: "center", transform: `scale(${p}) rotate(${(1 - p) * 90}deg)` }} />; })}
    </svg>
  );
};

/** TapeOut's own mark (tapeout-mark.svg), its two strokes drawn on. */
export const TapeOut: React.FC<{ h: number; t0?: number }> = ({ h, t0 }) => {
  const t = useT();
  const p = t0 == null ? 1 : ramp(t, t0, t0 + 0.95, inOut);
  return (
    <svg width={h} height={h} viewBox="50 58 300 270" fill="none" stroke="#d7dde8" strokeWidth={11} strokeLinejoin="miter" style={{ display: "block" }}>
      {["M64 76 L189 152 L189 236 L64 310 Z", "M336 76 L211 152 L211 236 L336 310 Z"].map((d) => <path key={d} d={d} pathLength={1} strokeDasharray={p >= 1 ? undefined : "1 1"} strokeDashoffset={p >= 1 ? undefined : 1 - p} />)}
    </svg>
  );
};

export const Chip: React.FC<{ children: React.ReactNode; t0: number }> = ({ children, t0 }) => {
  const t = useT(); const p = ramp(t, t0, t0 + 0.5, expo);
  return <div style={{ fontFamily: mono, fontSize: 27, color: C.green, letterSpacing: "0.02em", opacity: p, transform: `translateY(${(1 - p) * 18}px)` }}>{children}</div>;
};
