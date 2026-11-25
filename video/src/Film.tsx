import React from "react";
import { AbsoluteFill, Audio, Img, Sequence, interpolate, staticFile } from "remotion";
import { C, mono, sans, serif } from "./theme";
import { FPS, TM, at, expo, inOut, inn, mix, pop, ramp, rnd, sc, useT } from "./lib";
import { Caret, Dark, Grain, Msg, Shield, TapeOut, Type, XLayer } from "./ui";

const W = 1920, H = 1080;
// --- cues (seconds), all taken from the spoken words
const Q = {
  problem: at("open", "That's"), noise: sc("noise").from, so: at("noise", "So"), through: at("noise", "through"),
  turn: sc("turn").from, gate: at("turn", "gate") + 0.06, thisIs: at("turn", "This"), voxro: at("turn", "Voxroh"),
  live: sc("live").from, xl: at("live", "X"), built: at("live", "Built"), tape: at("live", "Tape"), close: sc("close").from, end: TM.total,
};
const PASS = Q.gate + 0.85; // the one message that gets through
const FILL = Q.thisIs - 0.22; // gate opens to full-bleed green
const BARX = 1130;

// ---------- 1. Open
const Open: React.FC = () => {
  const t = useT(); if (t > Q.noise + 0.25) return null;
  const up = ramp(t, Q.problem - 0.12, Q.problem + 0.55);
  return (
    <Dark>
      {Array.from({ length: 9 }).map((_, i) => {
        const a = 1.5 + i * 0.33; if (t < a) return null;
        const p = pop(t, a, 15, 120); const s = 0.62 + rnd(i, 2) * 0.35;
        return <div key={i} style={{ position: "absolute", left: 1290 + rnd(i) * 420 + (1 - p) * 700, top: 60 + ((i * 0.618) % 1) * 830, transform: `scale(${s}) rotate(${(rnd(i, 3) - 0.5) * 10}deg)`, opacity: Math.min(1, p) * (0.35 + s * 0.4), filter: `blur(${(1 - s) * 8}px)` }}><Msg i={i} /></div>;
      })}
      <div style={{ position: "absolute", left: 150, top: 340 - up * 130, transform: `scale(${1 - up * 0.45})`, transformOrigin: "0 0", opacity: 1 - up * 0.62 }}>
        <Type size={188} cursor={up < 0.01} words={[{ w: "Your", t: 0.28 }, { w: "inbox", t: at("open", "inbox") }, { w: "is", t: at("open", "is"), br: true }, { w: "free", t: at("open", "free"), serif: C.green }, { w: "to", t: at("open", "to") }, { w: "enter.", t: at("open", "enter") }]} />
      </div>
      <div style={{ position: "absolute", left: 150, top: 470 }}>
        <Type size={236} cursor words={[{ w: "That's", t: Q.problem }, { w: "the", t: at("open", "the") }, { w: "problem.", t: at("open", "problem"), br: true, serif: C.red }]} />
      </div>
      {t < 0.32 && <div style={{ position: "absolute", left: 160, top: 540 }}><Caret h={154} /></div>}
    </Dark>
  );
};

// ---------- 2 + 3a. The flood, then the gate
const N = 150;
const flood = Array.from({ length: N }).map((_, i) => ({
  born: Q.noise + 0.05 + Math.pow(i / N, 0.7) * 3.9, y: -60 + rnd(i, 1) * (H + 20), z: 0.5 + rnd(i, 2) * 0.95, sp: 620 + rnd(i, 3) * 520, rot: (rnd(i, 4) - 0.5) * 12, i,
}));
const Flood: React.FC = () => {
  const t = useT(); if (t < Q.noise - 0.02 || t > FILL + 0.5) return null;
  const inP = ramp(t, Q.noise, Q.noise + 0.3, inOut);
  const g = t - Q.gate; const gated = g >= 0;
  const shake = gated ? Math.exp(-g * 7) * 26 : 0;
  const drop = ramp(t, Q.gate - 0.16, Q.gate, inn);
  const cards = [...flood].sort((a, b) => a.z - b.z).map((c) => {
    if (t < c.born) return null;
    // before the gate: drift left and pile up in the frame; a soft stop makes it crowd
    const rest = 60 + rnd(c.i, 6) * (W - 520);
    const xFree = (tt: number) => mix(W + 60, rest, ramp(tt, c.born, c.born + 1.15, expo)) - Math.max(0, tt - c.born) * 22;
    let x = xFree(t), y = c.y, o = 1, sx = 1, rot = c.rot, blur = c.z > 1.28 ? 5 : 0;
    const w = 460 * c.z;
    if (gated) {
      const x0 = xFree(Q.gate);
      if (x0 + w / 2 < BARX) { const p = ramp(g, 0, 0.7); x = x0 - p * (900 + 500 * rnd(c.i, 7)); rot += -p * 35 * (rnd(c.i, 8) - 0.3); o = 1 - ramp(g, 0.1, 0.6); y += p * (c.y - H / 2) * 0.5; }
      else { const p = ramp(g, 0, 0.35); x = Math.max(x0, BARX + 40) + p * (90 + rnd(c.i, 7) * 260); o = 1 - ramp(g, 0.25 + rnd(c.i, 9) * 0.4, 0.75 + rnd(c.i, 9) * 0.4); rot *= 1 - p; }
    }
    if (o <= 0) return null;
    return <div key={c.i} style={{ position: "absolute", left: x, top: y, width: 460, transform: `scale(${c.z * sx}, ${c.z}) rotate(${rot}deg)`, transformOrigin: "0 50%", opacity: o, filter: blur ? `blur(${blur}px)` : undefined }}><Msg i={c.i} light={!gated} /></div>;
  });
  // after the gate: a stream keeps coming and breaks on the bar
  const stream = gated ? Array.from({ length: 52 }).map((_, i) => {
    const hit = Q.gate + 0.3 + i * 0.033 + rnd(i, 11) * 0.05; const y = 40 + rnd(i, 12) * 880; const s = 0.6 + rnd(i, 13) * 0.35;
    if (Math.abs(hit - PASS) < 0.03) return null;
    const dt = t - hit; if (dt < -0.5 || dt > 0.75) return null;
    if (dt < 0) return <div key={i} style={{ position: "absolute", left: BARX + 34 + -dt * 1900, top: y, transform: `scale(${s})`, transformOrigin: "0 50%" }}><Msg i={i} /></div>;
    return <React.Fragment key={i}>
      {Array.from({ length: 16 }).map((_, k) => { const p = ramp(dt, 0, 0.7); const a = (rnd(i * 31 + k, 1) - 0.5) * 2.5; const d = (120 + rnd(i * 17 + k, 2) * 420) * p; const z = (8 + rnd(k, i) * 20) * (1 - p); return <div key={k} style={{ position: "absolute", left: BARX + 36 + Math.cos(a) * d, top: y + 66 + (k / 16 - 0.5) * 110 + Math.sin(a) * d, width: z, height: z, background: k % 5 === 0 ? C.red : "#66728c", opacity: 1 - p }} />; })}
      <div style={{ position: "absolute", left: BARX + 26, top: y - 30, width: 6, height: 200, background: "#fff", opacity: (1 - ramp(dt, 0, 0.3)) * 0.9, filter: "blur(3px)" }} />
    </React.Fragment>;
  }) : null;
  const pass = t - PASS;
  const px = pass < 0 ? BARX + 34 + -pass * 1500 : mix(BARX + 34, 300, ramp(pass, 0, 1.0));
  const fade2 = ramp(t, Q.so - 0.12, Q.so + 0.1);
  const content = (
    <>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", opacity: gated ? 0 : 1 - fade2, transform: `scale(${1 + fade2 * 0.08})` }}>
        <Type size={250} color={C.black} align="center" words={[{ w: "Everyone", t: at("noise", "Everyone") }, { w: "gets", t: at("noise", "gets"), br: true }, { w: "in.", t: at("noise", "in"), serif: C.red }]} />
      </div>
      {t >= Q.so - 0.1 && !gated && t < Q.gate && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Type size={250} color={C.black} align="center" words={[{ w: "Nothing", t: Q.so + 0.12 }, { w: "gets", t: at("noise", "gets") + 0.96, br: true }, { w: "through.", t: Q.through - 0.1, serif: C.red }]} />
      </div>}
    </>
  );
  const under = cards.filter((_, k) => k % 2 === 0), over = cards.filter((_, k) => k % 2 === 1);
  return (
    <AbsoluteFill style={{ clipPath: `inset(0 0 0 ${(1 - inP) * 100}%)`, overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `translate(${Math.sin(g * 90) * shake}px, ${Math.cos(g * 70) * shake}px) scale(${gated ? 1 + shake / 300 : 1})` }}>
        {gated ? <Dark /> : <AbsoluteFill style={{ background: C.paper }}><div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(rgba(10,14,23,0.13) 2px, transparent 2.2px)", backgroundSize: "26px 26px" }} /></AbsoluteFill>}
        {/* cards under the words, then the rest bury them */}
        {!gated ? <><AbsoluteFill>{under}</AbsoluteFill><AbsoluteFill style={{ background: "radial-gradient(ellipse 52% 46% at 50% 50%, rgba(243,245,241,0.94) 30%, rgba(243,245,241,0))", opacity: 1 - ramp(t, Q.through + 0.35, Q.turn + 0.5) }} />{content}<AbsoluteFill style={{ opacity: ramp(t, Q.through + 0.28, Q.through + 0.8, inOut), transform: `scale(${mix(1.25, 1, ramp(t, Q.through + 0.28, Q.through + 1))})` }}>{over}</AbsoluteFill>
          {/* "So we built a" sits on the buried screen */}
          {t > Q.turn && <AbsoluteFill style={{ background: "rgba(5,7,12,0.82)", opacity: ramp(t, Q.turn - 0.05, Q.turn + 0.3) }} />}
        </> : <>{cards}{stream}</>}
        {t > Q.turn && <div style={{ position: "absolute", left: 150, top: 300, opacity: 1 - ramp(t, FILL - 0.1, FILL + 0.15) }}>
          <Type size={196} words={[{ w: "So", t: at("turn", "So") }, { w: "we", t: at("turn", "we") }, { w: "built", t: at("turn", "built"), br: true }, { w: "a", t: at("turn", "a") }, { w: "gate.", t: Q.gate - 0.02, serif: C.green }]} />
        </div>}
        {gated && pass > -0.55 && <div style={{ position: "absolute", left: px, top: 780, transform: `scale(${pass > 0 ? 1 + 0.12 * Math.exp(-pass * 5) : 0.9})`, transformOrigin: "0 50%", opacity: 1 - ramp(t, FILL - 0.05, FILL + 0.15) }}><Msg i={2} hot={pass > -0.02} /></div>}
        {/* the gate */}
        {t > Q.gate - 0.18 && <div style={{ position: "absolute", left: BARX, top: mix(-H - 120, -60, drop), width: 34, height: H + 120, background: C.green, boxShadow: `0 0 ${70 + shake * 8}px ${C.green}aa` }} />}
        {gated && g < 0.5 && <AbsoluteFill style={{ background: "#fff", opacity: 0.85 * Math.exp(-g * 14) }} />}
        {gated && g < 1 && <div style={{ position: "absolute", left: BARX + 17 - ramp(g, 0, 0.9) * 1500, top: H - 40 - ramp(g, 0, 0.9) * 90, width: ramp(g, 0, 0.9) * 3000, height: 40 + ramp(g, 0, 0.9) * 180, borderRadius: "50%", border: `3px solid ${C.green}`, opacity: 0.7 * (1 - ramp(g, 0, 0.9)) }} />}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------- 3b. Full-bleed green: the name
const Name: React.FC = () => {
  const t = useT(); if (t < FILL || t > Q.live + 0.7) return null;
  const o = ramp(t, FILL, FILL + 0.42, inOut);          // gate opens to the whole frame
  const c = ramp(t, Q.live - 0.28, Q.live + 0.3, inOut); // then folds back into the bar, at the right edge of frame
  const l = mix(mix(BARX, 0, o), 1890, c), r = mix(mix(W - BARX - 34, 0, o), 0, c);
  const letters = "Voxro".split("");
  const out = ramp(t, Q.live - 0.35, Q.live - 0.05, inn);
  const drift = 1 + Math.max(0, t - Q.voxro) * 0.018;
  return (
    <AbsoluteFill style={{ clipPath: `inset(0 ${r}px 0 ${l}px)`, background: C.green, overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(4,20,10,0.075) 2px, transparent 2px), linear-gradient(90deg, rgba(4,20,10,0.075) 2px, transparent 2px)", backgroundSize: "60px 60px", transform: `translateX(${-(t * 14) % 60}px)` }} />
      <AbsoluteFill style={{ transform: `scale(${drift * (1 + out * 0.15)})`, opacity: 1 - out }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 206, display: "flex", justifyContent: "center", opacity: 1 - ramp(t, Q.voxro + 0.05, Q.voxro + 0.3) }}>
          <div style={{ marginTop: 200 }}><Type size={150} color={C.greenInk} words={[{ w: "This", t: Q.thisIs, serif: C.greenInk }, { w: "is", t: at("turn", "is"), serif: C.greenInk }]} /></div>
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 250, display: "flex", justifyContent: "center", fontFamily: sans, fontWeight: 800, fontSize: 500, letterSpacing: "-0.065em", color: C.greenInk, lineHeight: 1 }}>
          {letters.map((ch, i) => { const p = pop(t, Q.voxro + 0.02 + i * 0.045, 15, 190); return <span key={i} style={{ display: "inline-block", overflow: "hidden", padding: "0 0.03em 0.1em", margin: "0 -0.03em" }}><span style={{ display: "inline-block", transform: `translateY(${(1 - p) * 115}%)` }}>{ch}</span></span>; })}
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 800, display: "flex", justifyContent: "center", alignItems: "center", gap: 28, opacity: ramp(t, Q.voxro + 0.5, Q.voxro + 0.8), transform: `translateY(${(1 - ramp(t, Q.voxro + 0.5, Q.voxro + 1)) * 40}px)` }}>
          <Shield size={92} /><span style={{ fontFamily: sans, fontWeight: 600, fontSize: 56, letterSpacing: "-0.035em", color: C.greenInk }}>from ShieldSuite</span>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------- 4. X Layer, then TapeOut
const Squares: React.FC<{ t0: number }> = ({ t0 }) => { // X Layer's square grid, echoed behind its mark
  const t = useT(); const S = 120;
  return <AbsoluteFill>{Array.from({ length: 16 * 9 }).map((_, i) => { const x = i % 16, y = Math.floor(i / 16); const d = Math.hypot(x - 4.2, y - 4.5); const p = ramp(t, t0 + d * 0.06, t0 + d * 0.06 + 0.3); const tw = 0.5 + 0.5 * Math.sin(t * 2.4 + rnd(i) * 9); const wave = Math.exp(-Math.pow((t - t0) * 9 - d, 2) / 2.2); return <div key={i} style={{ position: "absolute", left: x * S + 8, top: y * S + 8, width: S - 16, height: S - 16, borderRadius: 7, background: "#fff", opacity: (rnd(i, 4) > 0.55 ? 0.035 * tw : 0.01) * p + wave * 0.16, transform: `scale(${0.6 + 0.4 * p})` }} />; })}</AbsoluteFill>;
};
// Abstract chip traces (decorative, not a Voxro circuit)
const TR = Array.from({ length: 24 }).map((_, i) => {
  if (i % 2 === 0) { // in from the left edge
    const k = i / 2, y0 = 60 + k * 87, yc = 540 + (y0 - 540) * 0.3, bend = 30 + rnd(i) * 60, d = Math.abs(yc - y0) * 0.5;
    return `M-20 ${y0} L${bend} ${y0} L${Math.min(280, bend + d)} ${yc} L290 ${yc}`;
  }
  const k = (i - 1) / 2, top = k < 6, n = k % 6, xc = 335 + n * 58, xs = 180 + n * 130 + (n > 3 ? 120 : 0); // in from above and below
  const a = top ? -20 : H + 20, b = top ? 90 + n * 12 : H - 90 - n * 12, c = top ? 235 + (n % 3) * 20 : H - 235 - (n % 3) * 20, e = top ? 350 : 730;
  return `M${xs} ${a} L${xs} ${b} L${xc} ${c} L${xc} ${e}`;
});
const Traces: React.FC<{ t0: number }> = ({ t0 }) => {
  const t = useT();
  return <svg width={W} height={H} style={{ position: "absolute" }} fill="none">
    {TR.map((d, i) => <path key={i} d={d} pathLength={1} stroke="#ffffff" strokeOpacity={0.1} strokeWidth={2.5} strokeDasharray="1 1" strokeDashoffset={1 - ramp(t, t0 + rnd(i) * 0.3, t0 + 0.8 + rnd(i) * 0.3, inOut)} />)}
    {TR.map((d, i) => { const p = ((t - t0) * (0.55 + rnd(i, 2) * 0.4) + rnd(i, 3)) % 1.25; return <path key={`p${i}`} d={d} pathLength={1} stroke={C.green} strokeWidth={4} strokeLinecap="round" strokeDasharray="0.05 2" strokeDashoffset={-p} opacity={ramp(t, t0 + 0.5, t0 + 1) * (p > 1 ? 0 : 0.9)} style={{ filter: `drop-shadow(0 0 8px ${C.green})` }} />; })}
  </svg>;
};
const Live: React.FC = () => {
  const t = useT(); if (t < Q.live - 0.35 || t > Q.close + 0.6) return null;
  const sw = ramp(t, Q.built - 0.42, Q.built + 0.18, inOut); // bar sweeps right to left, revealing TapeOut behind it
  const sx = mix(W, -40, sw);
  const t0 = Q.xl - 0.25, t1 = Q.built + 0.02;
  return (
    <>
      <AbsoluteFill>
        <Dark><Squares t0={Q.live + 0.1} />
          <div style={{ position: "absolute", left: 480 - 197, top: 540 - 157, filter: `drop-shadow(0 0 60px rgba(255,255,255,0.22))`, transform: `scale(${1 + (t - t0) * 0.012})` }}>{t >= t0 && <XLayer h={314} t0={t0} />}</div>
          <div style={{ position: "absolute", left: 850, top: 296 }}>
            <Type size={186} words={[{ w: "Live", t: at("live", "Live"), serif: C.green }, { w: "on", t: at("live", "on") }, { w: "X", t: Q.xl, br: true }, { w: "Layer", t: at("live", "Layer") }, { w: "mainnet.", t: at("live", "mainnet"), br: true }]} />
          </div>
        </Dark>
      </AbsoluteFill>
      <AbsoluteFill style={{ clipPath: `inset(0 0 0 ${Math.max(0, sx)}px)` }}>
        <Dark><Traces t0={Q.built - 0.2} />
          <div style={{ position: "absolute", left: 480 - 190, top: 540 - 190, width: 380, height: 380, borderRadius: 26, background: "#05070c", boxShadow: "0 0 0 2px rgba(255,255,255,0.14), 0 40px 120px rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", transform: `scale(${0.9 + 0.1 * pop(t, t1)})` }}>
            <TapeOut h={262} t0={t1 + 0.1} />
          </div>
          <div style={{ position: "absolute", left: 850, top: 380 }}>
            <Type size={206} words={[{ w: "Built", t: Q.built + 0.04, serif: C.green }, { w: "for", t: at("live", "for") }, { w: "TapeOut.", t: Q.tape, br: true }]} />
          </div>
        </Dark>
      </AbsoluteFill>
      {sw > 0 && sw < 1 && <div style={{ position: "absolute", left: sx - 17, top: 0, width: 34, height: H, background: C.green, boxShadow: `0 0 120px ${C.green}` }} />}
    </>
  );
};

// ---------- 5. Close
const URL = "voxro.shieldsuite.xyz";
export const Lockup: React.FC<{ t0: number }> = ({ t0 }) => {
  const t = useT(); const p = pop(t, t0, 15, 150);
  return <div style={{ display: "flex", alignItems: "center", gap: 40, transform: `scale(${0.86 + 0.14 * p})`, opacity: ramp(t, t0, t0 + 0.25) }}>
    <Shield size={190} /><span style={{ fontFamily: sans, fontWeight: 800, fontSize: 230, letterSpacing: "-0.06em", lineHeight: 1, color: C.ink }}>Voxro</span>
  </div>;
};
export const Logos: React.FC<{ t0: number }> = ({ t0 }) => {
  const t = useT();
  const it = (k: number, el: React.ReactNode, label: string) => { const p = ramp(t, t0 + k * 0.14, t0 + k * 0.14 + 0.6); return <div style={{ display: "flex", alignItems: "center", gap: 20, opacity: p, transform: `translateY(${(1 - p) * 26}px)`, fontFamily: sans, fontWeight: 600, fontSize: 45, letterSpacing: "-0.03em", color: C.ink }}>{el}{label}</div>; };
  const sep = <div style={{ width: 2, height: 52, background: "rgba(255,255,255,0.18)", opacity: ramp(t, t0, t0 + 0.6) }} />;
  return <div style={{ display: "flex", alignItems: "center", gap: 46 }}>{it(0, <Shield size={72} />, "ShieldSuite")}{sep}{it(1, <XLayer h={50} />, "X Layer")}{sep}{it(2, <TapeOut h={66} />, "TapeOut")}{sep}{it(3, <Img src={staticFile("brand/okx.svg")} style={{ height: 104, margin: "-28px 0", filter: "invert(1)" }} />, "OKX Wallet")}</div>;
};
const Close: React.FC = () => {
  const t = useT(); const t0 = Q.close; if (t < t0 - 0.35) return null;
  const open = ramp(t, t0 - 0.3, t0 + 0.3, inOut);
  const list = at("close", "Get");
  const n = Math.floor(interpolate(t, [list - 0.05, list + 0.95], [0, URL.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const box = pop(t, list - 0.4, 16, 150);
  return (
    <AbsoluteFill style={{ clipPath: `inset(${(1 - open) * 50}% 0 ${(1 - open) * 50}% 0)` }}>
      <Dark>
        <AbsoluteFill style={{ background: `radial-gradient(ellipse 48% 40% at 50% 52%, ${C.green}1c, transparent)` }} />
        <div style={{ position: "absolute", left: 0, right: 0, top: 136, display: "flex", justifyContent: "center" }}><Lockup t0={t0 + 0.05} /></div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 404, display: "flex", justifyContent: "center" }}>
          <Type size={104} words={[{ w: "Private", t: at("close", "Private"), serif: C.green }, { w: "beta.", t: at("close", "beta"), serif: C.green }, { w: "Invite", t: at("close", "Invite") }, { w: "only.", t: at("close", "only") }]} />
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 590, display: "flex", justifyContent: "center", opacity: Math.min(1, box), transform: `translateY(${(1 - box) * 40}px)` }}>
          <div style={{ width: 1010, height: 128, border: `2.5px solid ${C.green}`, background: "#000", boxShadow: `0 0 70px ${C.green}33`, display: "flex", alignItems: "center", padding: "0 44px", fontFamily: mono, fontWeight: 700, fontSize: 60, color: C.ink, letterSpacing: "-0.02em", boxSizing: "border-box" }}>
            <span style={{ color: C.green, marginRight: 30 }}>$</span><span style={{ whiteSpace: "nowrap" }}>{URL.slice(0, n)}<Caret h={62} left={8} blink={n >= URL.length} /></span>
          </div>
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 752, textAlign: "center", fontFamily: mono, fontWeight: 500, fontSize: 38, color: "#b4bccb", opacity: ramp(t, list + 0.6, list + 1) }}>Join the waitlist. Opens 23 November.</div>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 92, display: "flex", justifyContent: "center" }}><Logos t0={list + 0.5} /></div>
      </Dark>
      {open < 1 && <><div style={{ position: "absolute", left: 0, right: 0, top: `${(1 - open) * 50}%`, height: 10, background: C.green }} /><div style={{ position: "absolute", left: 0, right: 0, bottom: `${(1 - open) * 50}%`, height: 10, background: C.green }} /></>}
    </AbsoluteFill>
  );
};

// ---------- sound
const LINES = TM.scenes.flatMap((s) => s.lines);
const duck = (t: number) => Math.max(0, ...LINES.map((l) => interpolate(t, [l.start - 0.15, l.start, l.end, l.end + 0.25], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })));
const f = (s: number) => Math.max(0, Math.round(s * FPS));
const Sfx: React.FC<{ n: string; s: number; v: number; d?: number }> = ({ n, s, v, d = 3 }) => <Sequence from={f(s)} durationInFrames={f(d)} layout="none"><Audio src={staticFile(`audio/sfx/${n}.mp3`)} volume={(k) => v * interpolate(k, [f(d) - 12, f(d)], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} /></Sequence>;
const Sound: React.FC = () => {
  const gEnd = Q.gate - 0.05; // the score cuts out as the gate falls, and returns as the groove on the name
  const loopAt = 15; // seconds of steady groove before its own ending
  return <>
    <Sequence durationInFrames={f(gEnd)} layout="none"><Audio src={staticFile("audio/tension.mp3")} volume={(k) => { const t = k / FPS; return (0.85 - 0.45 * duck(t)) * interpolate(t, [0, 0.4, gEnd - 0.06, gEnd], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }); }} /></Sequence>
    <Sequence from={f(Q.voxro)} durationInFrames={f(loopAt)} layout="none"><Audio src={staticFile("audio/groove.mp3")} volume={(k) => { const t = Q.voxro + k / FPS; return (0.46 - 0.22 * duck(t)) * interpolate(t, [Q.end - 1.3, Q.end], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }); }} /></Sequence>
    {LINES.map((l) => <Sequence key={l.file} from={f(l.start)} durationInFrames={f(l.end - l.start + 0.4)} layout="none"><Audio src={staticFile(l.file)} /></Sequence>)}
    {[0.3, 0.6, 1.11, 1.25, 1.47, 1.62].map((s) => <Sfx key={s} n="key" s={s} v={0.28} d={0.5} />)}
    {[1.55, 1.9, 2.25, 2.55, 2.9, 3.2, 3.5, 3.8, 4.1].map((s, i) => <Sfx key={s} n="ping" s={s} v={0.14 + i * 0.012} d={0.5} />)}
    <Sfx n="sub" s={Q.problem} v={0.5} d={1.2} /><Sfx n="whoosh" s={Q.noise - 0.2} v={0.45} d={0.9} />
    <Sfx n="swarm" s={Q.noise + 0.2} v={0.34} d={4} /><Sfx n="riser" s={Q.gate - 2.4} v={0.5} d={2.4} />
    <Sfx n="slam" s={Q.gate - 0.04} v={0.75} d={2.2} /><Sfx n="deflect" s={Q.gate + 0.3} v={0.3} d={1.2} /><Sfx n="deflect" s={Q.gate + 0.9} v={0.26} d={1.2} />
    <Sfx n="pass" s={PASS} v={0.6} d={1.6} /><Sfx n="whoosh" s={FILL - 0.1} v={0.5} d={0.9} /><Sfx n="boom" s={Q.voxro - 0.04} v={0.55} d={2.5} />
    <Sfx n="whoosh" s={Q.live - 0.3} v={0.45} d={0.9} />{[0, 0.09, 0.18, 0.27].map((d) => <Sfx key={d} n="lock" s={Q.xl - 0.25 + d} v={0.34} d={0.6} />)}
    <Sfx n="scan" s={Q.built - 0.45} v={0.42} d={1.4} /><Sfx n="draw" s={Q.built + 0.1} v={0.35} d={0.9} />
    <Sfx n="whoosh" s={Q.close - 0.3} v={0.45} d={0.9} /><Sfx n="sub" s={Q.close} v={0.45} d={1.2} />
    {Array.from({ length: 11 }).map((_, i) => <Sfx key={i} n="key" s={at("close", "Get") - 0.03 + i * 0.09} v={0.24} d={0.4} />)}
    <Sfx n="pass" s={at("close", "Get") + 1.0} v={0.4} d={1.6} />
  </>;
};

export const Film: React.FC = () => {
  const t = useT();
  return <AbsoluteFill style={{ background: C.navy }}>
    <Open /><Flood /><Live /><Name /><Close /><Grain />
    <AbsoluteFill style={{ background: "#000", opacity: Math.max(1 - ramp(t, 0, 0.2), ramp(t, Q.end - 0.3, Q.end)), pointerEvents: "none" }} />
    <Sound />
  </AbsoluteFill>;
};
void serif; void sc;
