import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { C, mono, sans, serif } from "./theme";
import { Dark, Grain, Msg, Shield, TapeOut, XLayer } from "./ui";
import { rnd } from "./lib";

/** Beta-is-live flier: codes sent, testers in, public launch 25 Nov. Same look as the teaser. */
export const Flier: React.FC = () => (
  <Dark>
    {/* the gate motif: messages held on the right of the green bar, one let through */}
    {Array.from({ length: 30 }).map((_, i) => (
      <div key={i} style={{ position: "absolute", left: 1390 + rnd(i) * 420, top: -90 + rnd(i, 2) * 1120, transform: `scale(${0.55 + rnd(i, 3) * 0.45}) rotate(${(rnd(i, 4) - 0.5) * 14}deg)`, opacity: 0.75 }}><Msg i={i} /></div>
    ))}
    <div style={{ position: "absolute", left: 1320, top: -20, width: 40, height: 1120, background: C.green, boxShadow: `0 0 120px ${C.green}aa` }} />
    <div style={{ position: "absolute", left: 1040, top: 742, transform: "scale(0.82)", transformOrigin: "0 50%" }}><Msg i={2} hot /></div>

    <div style={{ position: "absolute", left: 110, top: 96, display: "flex", alignItems: "center", gap: 26 }}>
      <Shield size={104} />
      <span style={{ fontFamily: sans, fontWeight: 800, fontSize: 112, letterSpacing: "-0.06em", lineHeight: 1, color: C.ink }}>Voxro</span>
      <span style={{ marginLeft: 18, padding: "10px 20px", border: `2px solid ${C.green}`, fontFamily: mono, fontWeight: 700, fontSize: 26, color: C.green, letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ width: 14, height: 14, borderRadius: 7, background: C.green, boxShadow: `0 0 14px ${C.green}` }} />BETA LIVE
      </span>
    </div>

    <div style={{ position: "absolute", left: 110, top: 270, fontFamily: sans, fontWeight: 700, fontSize: 132, letterSpacing: "-0.05em", lineHeight: 1.02, color: C.ink }}>
      The gate is <span style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 400, fontSize: 160, color: C.green }}>open.</span>
    </div>
    <div style={{ position: "absolute", left: 114, top: 450, fontFamily: sans, fontWeight: 500, fontSize: 44, letterSpacing: "-0.02em", lineHeight: 1.35, color: "#c3cad6", width: 1100 }}>
      Access codes are out. Our first testers are inside.
    </div>

    <div style={{ position: "absolute", left: 110, top: 580, width: 880, height: 112, border: `2.5px solid ${C.green}`, background: "#000", boxShadow: `0 0 60px ${C.green}26`, display: "flex", alignItems: "center", padding: "0 38px", boxSizing: "border-box", fontFamily: mono, fontWeight: 700, fontSize: 46, color: C.ink }}>
      <span style={{ color: C.green, marginRight: 26 }}>$</span>voxro.shieldsuite.xyz/?join
    </div>
    <div style={{ position: "absolute", left: 114, top: 712, fontFamily: mono, fontWeight: 500, fontSize: 28, color: "#b4bccb" }}>Need a code? Join the waitlist.</div>

    <div style={{ position: "absolute", left: 110, top: 800, display: "flex", alignItems: "baseline", gap: 22 }}>
      <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 30, color: C.dim, letterSpacing: "0.08em" }}>PUBLIC LAUNCH</span>
      <span style={{ fontFamily: sans, fontWeight: 800, fontSize: 72, letterSpacing: "-0.04em", color: C.green }}>25 Nov</span>
    </div>

    <div style={{ position: "absolute", left: 110, bottom: 70, display: "flex", alignItems: "center", gap: 34, fontFamily: sans, fontWeight: 600, fontSize: 36, letterSpacing: "-0.03em", color: C.ink }}>
      <span style={{ display: "flex", alignItems: "center", gap: 16 }}><Shield size={56} />ShieldSuite</span>
      <span style={{ width: 2, height: 40, background: "rgba(255,255,255,0.18)" }} />
      <span style={{ display: "flex", alignItems: "center", gap: 16 }}><XLayer h={38} />X Layer</span>
      <span style={{ width: 2, height: 40, background: "rgba(255,255,255,0.18)" }} />
      <span style={{ display: "flex", alignItems: "center", gap: 14 }}><TapeOut h={52} />TapeOut</span>
      <span style={{ width: 2, height: 40, background: "rgba(255,255,255,0.18)" }} />
      <span style={{ display: "flex", alignItems: "center", gap: 12 }}><Img src={staticFile("brand/okx.svg")} style={{ height: 84, margin: "-22px 0", filter: "invert(1)" }} />OKX Wallet</span>
    </div>
    <AbsoluteFill><Grain /></AbsoluteFill>
  </Dark>
);
