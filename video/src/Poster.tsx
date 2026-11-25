import React from "react";
import { AbsoluteFill } from "remotion";
import { C, sans, serif } from "./theme";
import { Dark, Grain, Msg, Shield, TapeOut, XLayer } from "./ui";
import { rnd } from "./lib";
export const Poster: React.FC = () => (
  <Dark>
    {Array.from({ length: 34 }).map((_, i) => <div key={i} style={{ position: "absolute", left: 1330 + rnd(i) * 460, top: -80 + rnd(i, 2) * 1100, transform: `scale(${0.6 + rnd(i, 3) * 0.5}) rotate(${(rnd(i, 4) - 0.5) * 14}deg)`, opacity: 0.8 }}><Msg i={i} /></div>)}
    <div style={{ position: "absolute", left: 1270, top: -20, width: 44, height: 1120, background: C.green, boxShadow: `0 0 120px ${C.green}aa` }} />
    <div style={{ position: "absolute", left: 110, top: 150, display: "flex", alignItems: "center", gap: 36 }}><Shield size={170} /><span style={{ fontFamily: sans, fontWeight: 800, fontSize: 210, letterSpacing: "-0.06em", lineHeight: 1, color: C.ink }}>Voxro</span></div>
    <div style={{ position: "absolute", left: 110, top: 430, fontFamily: sans, fontWeight: 700, fontSize: 150, letterSpacing: "-0.05em", lineHeight: 1.04, color: C.ink }}>We built<br />a <span style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 400, fontSize: 190, color: C.green }}>gate.</span></div>
    <div style={{ position: "absolute", left: 110, bottom: 110, display: "flex", gap: 44, alignItems: "center", fontFamily: sans, fontWeight: 600, fontSize: 46, color: C.ink, letterSpacing: "-0.03em" }}><XLayer h={54} />X Layer<TapeOut h={70} />TapeOut</div>
    <AbsoluteFill><Grain /></AbsoluteFill>
  </Dark>
);
