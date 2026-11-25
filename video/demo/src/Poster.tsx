import React from "react";
import { AbsoluteFill } from "remotion";
import { C, mono, sans, serif } from "./theme";
import { Dark, Grain, Shield, TapeOut, XLayer } from "./ui";
import { LADDER, tierColor } from "./kit";

/** YouTube thumbnail: the claim in big type, the surge ladder as the hero, logo and partners. */
export const Poster: React.FC = () => (
  <Dark>
    <div style={{ position: "absolute", left: 100, top: 90, display: "flex", alignItems: "center", gap: 24 }}>
      <Shield size={96} />
      <span style={{ fontFamily: sans, fontWeight: 800, fontSize: 100, letterSpacing: "-0.06em", color: C.ink, lineHeight: 1 }}>Voxro</span>
    </div>
    <div style={{ position: "absolute", left: 100, top: 250, fontFamily: sans, fontWeight: 800, fontSize: 134, letterSpacing: "-0.055em", lineHeight: 1, color: C.ink, width: 1180, whiteSpace: "nowrap" }}>
      Your inbox,<br />priced by a <span style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 400, color: C.green, fontSize: 156 }}>circuit.</span>
    </div>
    <div style={{ position: "absolute", left: 104, top: 600, fontFamily: mono, fontWeight: 700, fontSize: 40, color: "#c3cad6" }}>
      Pay to reach. <span style={{ color: C.green }}>No reply = full refund.</span>
    </div>
    {/* the ladder, rising */}
    <div style={{ position: "absolute", right: 100, bottom: 170, display: "flex", gap: 12, alignItems: "flex-end" }}>
      {[0, 1, 3, 5].map((q, i) => {
        const p = LADDER[q], col = tierColor(p);
        return (
          <div key={q} style={{ width: 128, height: 200 + i * 120, borderRadius: 16, border: `3px solid ${col}`, background: `linear-gradient(180deg, ${col}44, transparent)`, boxShadow: i === 3 ? `0 0 70px ${col}66` : undefined, display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: 18, boxSizing: "border-box" }}>
            <div style={{ fontFamily: sans, fontWeight: 800, fontSize: 62, letterSpacing: "-0.04em", color: col, lineHeight: 1 }}>{p}</div>
            <div style={{ fontFamily: mono, fontSize: 20, color: C.ink, marginTop: 6 }}>USD₮0</div>
          </div>
        );
      })}
    </div>
    <div style={{ position: "absolute", left: 100, bottom: 70, display: "flex", alignItems: "center", gap: 30, fontFamily: sans, fontWeight: 600, fontSize: 38, color: C.ink, letterSpacing: "-0.03em" }}>
      <span style={{ display: "flex", alignItems: "center", gap: 14 }}><XLayer h={40} />X Layer</span>
      <span style={{ width: 2, height: 40, background: "rgba(255,255,255,0.2)" }} />
      <span style={{ display: "flex", alignItems: "center", gap: 12 }}><TapeOut h={54} />TapeOut</span>
    </div>
    <AbsoluteFill><Grain o={0.06} /></AbsoluteFill>
  </Dark>
);
