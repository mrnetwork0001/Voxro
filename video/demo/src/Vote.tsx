import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { C, mono, sans, serif } from "./theme";
import { Dark, Grain, Shield, TapeOut, XLayer } from "./ui";

/** "Vote for Voxro" flier for the TapeOut Accelerate community vote (web3.okx.com/xlayer/hackathon-voting). */
const RATES: Array<[string, string]> = [["5 BEM", "1 vote"], ["300 FAB", "1 vote"], ["1 TapeCode-Test", "1 vote"]];
const steps = (brk: boolean): Array<[string, React.ReactNode]> => [
  ["01", <>Open{brk ? <br /> : " "}<b style={{ color: C.ink, whiteSpace: "nowrap", fontSize: brk ? "0.86em" : undefined }}>web3.okx.com/xlayer/hackathon-voting</b></>],
  ["02", <>Connect a wallet holding <b style={{ color: C.ink }}>BEM</b>, <b style={{ color: C.ink }}>FAB</b> or <b style={{ color: C.ink }}>TapeCode-Test</b></>],
  ["03", <>Find <b style={{ color: C.green }}>Voxro</b>, tap <b style={{ color: C.ink }}>+</b> and cast your votes</>],
];

const Phone: React.FC<{ h: number }> = ({ h }) => {
  const w = Math.round((h * 576) / 1228), b = Math.round(h * 0.016);
  return (
    <div style={{ padding: b, borderRadius: b * 3.2, background: "linear-gradient(160deg,#2a3142,#0b0f18)", boxShadow: "0 40px 120px rgba(0,0,0,0.65), 0 0 90px rgba(51,255,0,0.14), inset 0 0 0 2px rgba(255,255,255,0.08)" }}>
      <div style={{ width: w, height: h, borderRadius: b * 2.2, overflow: "hidden", background: "#000" }}>
        <Img src={staticFile("stills/tt_app.png")} style={{ width: w, height: h, display: "block" }} />
      </div>
    </div>
  );
};

const Kicker: React.FC<{ s: number }> = ({ s }) => (
  <div style={{ display: "inline-flex", alignItems: "center", gap: 12 * s, fontFamily: mono, fontWeight: 700, fontSize: 22 * s, letterSpacing: "0.12em", color: C.green, border: `2px solid ${C.green}55`, background: "rgba(51,255,0,0.07)", borderRadius: 999, padding: `${10 * s}px ${22 * s}px` }}>
    <span style={{ width: 12 * s, height: 12 * s, borderRadius: 99, background: C.green, boxShadow: `0 0 14px ${C.green}` }} />
    TAPEOUT ACCELERATE · COMMUNITY VOTE
  </div>
);

const Brand: React.FC<{ s: number }> = ({ s }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 18 * s }}>
    <Shield size={64 * s} />
    <div>
      <div style={{ fontFamily: sans, fontWeight: 800, fontSize: 54 * s, letterSpacing: "-0.05em", color: C.ink, lineHeight: 1 }}>Voxro</div>
      <div style={{ fontFamily: mono, fontSize: 19 * s, color: C.dim, marginTop: 4 * s }}>by ShieldSuite</div>
    </div>
  </div>
);

const Steps: React.FC<{ s: number; w: number; brk?: boolean }> = ({ s, w, brk = false }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 22 * s, width: w }}>
    {steps(brk).map(([n, txt]) => (
      <div key={n} style={{ display: "flex", gap: 20 * s, alignItems: "flex-start" }}>
        <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 24 * s, color: C.greenInk, background: C.green, borderRadius: 10 * s, padding: `${6 * s}px ${12 * s}px`, lineHeight: 1.2 }}>{n}</div>
        <div style={{ fontFamily: sans, fontWeight: 500, fontSize: 31 * s, lineHeight: 1.3, color: "#c3cad6", letterSpacing: "-0.01em" }}>{txt}</div>
      </div>
    ))}
  </div>
);

const Rates: React.FC<{ s: number }> = ({ s }) => (
  <div style={{ display: "flex", gap: 14 * s, flexWrap: "wrap" }}>
    {RATES.map(([a, b]) => (
      <div key={a} style={{ fontFamily: mono, fontSize: 23 * s, color: C.ink, border: "2px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.04)", borderRadius: 12 * s, padding: `${10 * s}px ${16 * s}px`, whiteSpace: "nowrap" }}>
        {a} <span style={{ color: C.dim }}>=</span> <span style={{ color: C.green }}>{b}</span>
      </div>
    ))}
  </div>
);

const Note: React.FC<{ s: number }> = ({ s }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 12 * s, fontFamily: sans, fontWeight: 600, fontSize: 25 * s, color: C.ink, letterSpacing: "-0.01em" }}>
    <span style={{ color: C.green, fontSize: 28 * s }}>✓</span> Tokens never leave your wallet
    <span style={{ color: C.dim, fontWeight: 500 }}>· free · up to 10 votes per wallet</span>
  </div>
);

const Partners: React.FC<{ s: number }> = ({ s }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 26 * s, fontFamily: sans, fontWeight: 600, fontSize: 30 * s, color: C.ink, letterSpacing: "-0.03em" }}>
    <span style={{ display: "flex", alignItems: "center", gap: 12 * s }}><XLayer h={30 * s} />X Layer</span>
    <span style={{ width: 2, height: 32 * s, background: "rgba(255,255,255,0.2)" }} />
    <span style={{ display: "flex", alignItems: "center", gap: 10 * s }}><TapeOut h={42 * s} />TapeOut</span>
    <span style={{ width: 2, height: 32 * s, background: "rgba(255,255,255,0.2)" }} />
    <span style={{ fontFamily: mono, fontSize: 24 * s, color: C.green }}>DeWEB 5.2.212</span>
  </div>
);

const Headline: React.FC<{ size: number }> = ({ size }) => (
  <div style={{ fontFamily: sans, fontWeight: 800, fontSize: size, letterSpacing: "-0.055em", lineHeight: 0.98, color: C.ink }}>
    Vote for <span style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 400, color: C.green, fontSize: size * 1.14 }}>Voxro.</span>
  </div>
);

const Sub: React.FC<{ s: number; w: number }> = ({ s, w }) => (
  <div style={{ fontFamily: sans, fontWeight: 500, fontSize: 32 * s, lineHeight: 1.32, color: "#aab3c3", width: w, letterSpacing: "-0.01em" }}>
    The paid priority inbox on X Layer. Pay to reach anyone, get a reply or a <span style={{ color: C.green }}>full refund</span>. Live on DeWEB inside TapeTape.
  </div>
);

/** 4:5 feed flier (1080x1350). */
export const VoteFlier: React.FC = () => (
  <Dark>
    <div style={{ position: "absolute", left: 72, top: 70, right: 72, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <Brand s={1} />
      <div style={{ fontFamily: mono, fontSize: 20, color: C.dim, textAlign: "right", lineHeight: 1.4 }}>40 projects<br /><span style={{ color: C.ink }}>100,000 USDT</span> pool</div>
    </div>
    <div style={{ position: "absolute", left: 72, top: 200 }}><Kicker s={0.92} /></div>
    <div style={{ position: "absolute", left: 68, top: 270 }}><Headline size={128} /></div>
    <div style={{ position: "absolute", left: 72, top: 440 }}><Sub s={0.96} w={590} /></div>
    <div style={{ position: "absolute", left: 72, top: 650 }}><Steps s={0.9} w={580} brk /></div>
    <div style={{ position: "absolute", right: 70, top: 425 }}><Phone h={610} /></div>
    <div style={{ position: "absolute", left: 72, bottom: 220 }}><Rates s={1} /></div>
    <div style={{ position: "absolute", left: 72, bottom: 160 }}><Note s={1} /></div>
    <div style={{ position: "absolute", left: 72, bottom: 72 }}><Partners s={1} /></div>
    <AbsoluteFill><Grain o={0.05} /></AbsoluteFill>
  </Dark>
);

/** 16:9 version (1920x1080). */
export const VoteWide: React.FC = () => (
  <Dark>
    <div style={{ position: "absolute", left: 110, top: 80 }}><Brand s={1.05} /></div>
    <div style={{ position: "absolute", left: 110, top: 210 }}><Kicker s={1} /></div>
    <div style={{ position: "absolute", left: 104, top: 285 }}><Headline size={150} /></div>
    <div style={{ position: "absolute", left: 110, top: 470 }}><Sub s={1.05} w={980} /></div>
    <div style={{ position: "absolute", left: 110, top: 610 }}><Steps s={0.98} w={1000} /></div>
    <div style={{ position: "absolute", left: 110, bottom: 70 }}><Partners s={1.05} /></div>
    <div style={{ position: "absolute", right: 150, top: 60 }}><Phone h={790} /></div>
    <div style={{ position: "absolute", right: 110, bottom: 70 }}><Rates s={0.95} /></div>
    <div style={{ position: "absolute", left: 110, top: 840 }}><Note s={1.05} /></div>
    <AbsoluteFill><Grain o={0.05} /></AbsoluteFill>
  </Dark>
);
