import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { C, mono, sans, serif } from "./theme";
import { Dark, Grain, Msg, Shield, TapeOut, XLayer } from "./ui";
import { rnd } from "./lib";

/** Day-2 countdown flier: 24 hours to public launch. Minimal text. */
export const Countdown: React.FC = () => (
  <Dark>
    {/* the gate motif: a crowd waiting on the right of the green bar */}
    {Array.from({ length: 30 }).map((_, i) => (
      <div key={i} style={{ position: "absolute", left: 1430 + rnd(i, 7) * 400, top: -90 + rnd(i, 8) * 1120, transform: `scale(${0.55 + rnd(i, 3) * 0.45}) rotate(${(rnd(i, 4) - 0.5) * 14}deg)`, opacity: 0.7 }}><Msg i={i} /></div>
    ))}
    <div style={{ position: "absolute", left: 1360, top: -20, width: 40, height: 1120, background: C.green, boxShadow: `0 0 120px ${C.green}aa` }} />

    <div style={{ position: "absolute", left: 110, top: 96, display: "flex", alignItems: "center", gap: 26 }}>
      <Shield size={88} />
      <span style={{ fontFamily: sans, fontWeight: 800, fontSize: 92, letterSpacing: "-0.06em", lineHeight: 1, color: C.ink }}>Voxro</span>
      <span style={{ marginLeft: 14, padding: "9px 18px", border: `2px solid ${C.green}`, fontFamily: mono, fontWeight: 700, fontSize: 24, color: C.green, letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ width: 13, height: 13, borderRadius: 7, background: C.green, boxShadow: `0 0 14px ${C.green}` }} />BETA · DAY 2
      </span>
    </div>

    <div style={{ position: "absolute", left: 96, top: 230, display: "flex", alignItems: "baseline", fontFamily: sans, fontWeight: 800, letterSpacing: "-0.07em", lineHeight: 0.9, color: C.ink }}>
      <span style={{ fontSize: 400 }}>24</span>
      <span style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 400, fontSize: 300, letterSpacing: "-0.02em", color: C.green, marginLeft: 10 }}>hours.</span>
    </div>

    <div style={{ position: "absolute", left: 112, top: 640, fontFamily: sans, fontWeight: 600, fontSize: 60, letterSpacing: "-0.03em", color: C.ink }}>
      The gate opens for everyone · <span style={{ color: C.green }}>25 Nov</span>
    </div>

    <div style={{ position: "absolute", left: 112, top: 770, fontFamily: mono, fontWeight: 700, fontSize: 38, color: "#c3cad6" }}>
      <span style={{ color: C.green, marginRight: 20 }}>▌</span>voxro.shieldsuite.xyz
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
