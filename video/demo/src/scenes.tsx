import React from "react";
import { AbsoluteFill, Img, staticFile, getStaticFiles, Freeze as RFreeze, OffthreadVideo as RVideo } from "remotion";
import { C, mono, sans, serif } from "./theme";
import { at, end, lineAt, lineEnd, mix, pop, ramp, rnd, sc, useT, win, inOut } from "./lib";
import { Dark, Msg, Shield, TapeOut, XLayer } from "./ui";
import { Browser, Card, Count, Kicker, Ladder, LADDER, mark, tierColor } from "./kit";
import onchain from "../data/onchain.json";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const A = onchain.addresses;
const REG = onchain.txs.find((x) => x.what === "registerInbox")!;
const FIRST = onchain.txs[0], LAST = onchain.txs[onchain.txs.length - 1];
const LAUNCH_SECONDS = (Date.parse(LAST.utc) - Date.parse(FIRST.utc)) / 1000;

/** Kinetic line: each word rises from a mask on its spoken moment. `accent` words get the italic serif. */
const Line: React.FC<{ id: string; line: number; size: number; color?: string; accent?: Record<string, string>; width?: number; style?: React.CSSProperties; shift?: number }> = ({ id, line, size, color = C.ink, accent = {}, width, style, shift = 0 }) => {
  const t = useT();
  const L = sc(id).lines[line];
  const n = (w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, "");
  const shown = (L.text).split(" ");
  // pair each written word with the spoken word at the same position, or spread evenly when respelled
  const sp = L.words;
  const tOf = (i: number) => (shown.length === sp.length ? sp[i].start : mix(L.start, L.end, i / shown.length)) + shift;
  return (
    <div style={{ fontFamily: sans, fontWeight: 700, fontSize: size, letterSpacing: "-0.045em", lineHeight: 1.06, color, width, ...style }}>
      {shown.map((w, i) => {
        const p = ramp(t, tOf(i) - 0.06, tOf(i) + 0.45);
        const a = accent[n(w)];
        return (
          <span key={i} style={{ display: "inline-block", overflow: "hidden", verticalAlign: "bottom", padding: "0 0.06em 0.16em", margin: "0 0.17em -0.16em -0.06em" }}>
            <span style={{ display: "inline-block", transform: `translateY(${(1 - p) * 110}%) rotate(${(1 - p) * 4}deg)`, transformOrigin: "0 100%", filter: p < 1 ? `blur(${(1 - p) * 8}px)` : undefined, ...(a ? { fontFamily: serif, fontStyle: "italic", fontWeight: 400, color: a, fontSize: "1.14em", letterSpacing: "-0.015em", lineHeight: 0.9 } : {}) }}>{w}</span>
          </span>
        );
      })}
    </div>
  );
};

const Mono: React.FC<{ children: React.ReactNode; size?: number; color?: string; style?: React.CSSProperties }> = ({ children, size = 22, color = C.dim, style }) => (
  <div style={{ fontFamily: mono, fontSize: size, color, ...style }}>{children}</div>
);

const Fade: React.FC<{ t0: number; t1?: number; children: React.ReactNode; style?: React.CSSProperties; rise?: number }> = ({ t0, t1, children, style, rise = 24 }) => {
  const t = useT();
  const p = ramp(t, t0, t0 + 0.55);
  const o = t1 != null ? 1 - ramp(t, t1, t1 + 0.4) : 1;
  return <div style={{ position: "absolute", opacity: p * o, transform: `translateY(${(1 - p) * rise}px)`, ...style }}>{children}</div>;
};

// ─── 1. open: the price tag is made of gates ───────────────────────────────────────────────
export const Open: React.FC = () => {
  const t = useT();
  const g0 = at("open", "logic"), n0 = at("open", ["hundred", "157"]), x0 = at("open", "X"), r0 = at("open", "reach");
  const cols = 16;
  return (
    <Dark>
      <Fade t0={sc("open").from + 0.2} style={{ left: 140, top: 150 }}>
        <Kicker>@voxro · live quote · X Layer</Kicker>
      </Fade>
      <Card t0={sc("open").from + 0.35} x={140} y={210} w={640} hot={t >= r0}>
        <Mono size={20} color={C.dim} style={{ letterSpacing: "0.12em" }}>NEXT COLD SENDER PAYS</Mono>
        <div style={{ display: "flex", alignItems: "baseline", gap: 18, marginTop: 8 }}>
          <span style={{ fontFamily: sans, fontWeight: 800, fontSize: 210, letterSpacing: "-0.06em", lineHeight: 1, color: C.green, textShadow: t >= r0 ? `0 0 60px ${C.green}88` : undefined }}>10</span>
          <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 46, color: C.ink }}>USD₮0</span>
        </div>
        <Mono size={20} style={{ marginTop: 10 }}>quoteSend() · VOXR #4 · {short(A.voxrCircuits)}</Mono>
      </Card>
      {/* 157 NAND + 3 LATCH: the catalog Voxro taped out */}
      <div style={{ position: "absolute", left: 1010, top: 210, display: "grid", gridTemplateColumns: `repeat(${cols}, 40px)`, gap: 8 }}>
        {Array.from({ length: 160 }).map((_, i) => {
          const latch = i >= 157;
          const p = pop(t, g0 + (latch ? 1.35 : rnd(i) * 1.1), 14, 220);
          const glow = latch ? 0.6 + 0.4 * Math.sin(t * 5 + i) : 0;
          return <div key={i} style={{ width: 40, height: 40, borderRadius: 7, background: latch ? C.green : "rgba(120,150,210,0.16)", border: latch ? "none" : "1.5px solid rgba(160,185,235,0.3)", boxShadow: latch ? `0 0 ${24 * glow}px ${C.green}` : undefined, transform: `scale(${p})`, opacity: Math.min(1, p) }} />;
        })}
      </div>
      <Fade t0={n0} style={{ left: 1010, top: 718 }}>
        <div style={{ fontFamily: sans, fontWeight: 800, fontSize: 64, letterSpacing: "-0.04em", color: C.ink }}>
          <Count to={157} t0={n0} dur={1.1} /> <span style={{ color: C.dim, fontWeight: 600, fontSize: 40 }}>NAND</span> · <span style={{ color: C.green }}>3</span> <span style={{ color: C.dim, fontWeight: 600, fontSize: 40 }}>LATCH</span>
        </div>
      </Fade>
      <Fade t0={x0} style={{ left: 1012, top: 812, display: "flex", alignItems: "center", gap: 18 }}>
        <XLayer h={40} t0={x0} /><span style={{ fontFamily: sans, fontWeight: 600, fontSize: 34, color: C.ink, letterSpacing: "-0.02em" }}>taped out on X Layer</span>
      </Fade>
      <div style={{ position: "absolute", left: 140, top: 640, width: 800 }}>
        <Line id="open" line={0} size={72} accent={{ gates: C.green }} />
      </div>
      <div style={{ position: "absolute", left: 140, top: 820, width: 800, opacity: ramp(t, r0 - 0.6, r0) }}>
        <Line id="open" line={1} size={34} color={C.dim} style={{ fontWeight: 600, letterSpacing: "-0.02em" }} />
      </div>
    </Dark>
  );
};

// ─── 2. problem: everyone closed their DMs ────────────────────────────────────────────────
export const Problem: React.FC = () => {
  const t = useT();
  const l1 = lineAt("problem", 1), stop = at("problem", "stop"), lost = at("problem", "lost");
  const real = [["deal", "Partnership deal"], ["bug", "Bug report"], ["partnership,", "Intro from a VC"]] as const;
  return (
    <AbsoluteFill style={{ background: C.paper, overflow: "hidden" }}>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 70% 60% at 80% 40%, rgba(255,59,48,0.07), transparent 70%)" }} />
      <div style={{ position: "absolute", left: 130, top: 140, width: 900 }}>
        <Line id="problem" line={0} size={96} color={C.navy} accent={{ dms: "#d92d20" }} />
      </div>
      <div style={{ position: "absolute", left: 134, top: 520, display: "flex", gap: 14 }}>
        {[["founders,", "Founders"], ["investors", "Investors"], ["auditors", "Auditors"]].map(([w, label]) => {
          const p = pop(t, at("problem", w));
          return <div key={w} style={{ fontFamily: mono, fontSize: 26, color: C.navy, padding: "10px 20px", borderRadius: 999, border: "1.5px solid rgba(10,14,23,0.18)", background: "#fff", opacity: Math.min(1, p), transform: `scale(${0.8 + 0.2 * p})` }}>{label}</div>;
        })}
      </div>
      {/* the pile */}
      {Array.from({ length: 22 }).map((_, i) => {
        const a = l1 + 0.15 + i * 0.17;
        const p = pop(t, a, 12, 200);
        const dim = ramp(t, stop, stop + 0.6);
        return (
          <div key={i} style={{ position: "absolute", left: 1010 + rnd(i, 1) * 460, top: 120 + rnd(i, 2) * 760, transform: `scale(${(0.62 + rnd(i, 3) * 0.3) * (0.6 + 0.4 * p)}) rotate(${(rnd(i, 4) - 0.5) * 16}deg)`, opacity: Math.min(1, p) * (1 - 0.55 * dim), filter: `grayscale(${dim})` }}>
            <Msg i={i} light />
          </div>
        );
      })}
      <div style={{ position: "absolute", left: 1180, top: 470, opacity: Math.min(1, pop(t, stop)), transform: `scale(${0.6 + 0.4 * pop(t, stop)}) rotate(-6deg)` }}>
        <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 44, letterSpacing: "0.08em", color: "#fff", background: "#d92d20", padding: "16px 34px", borderRadius: 14, boxShadow: "0 20px 50px rgba(217,45,32,0.4)" }}>DMs CLOSED</div>
      </div>
      {real.map(([w, label], i) => {
        const a = at("problem", w);
        const p = pop(t, a);
        const sink = ramp(t, lost + 0.2 + i * 0.12, lost + 1.4 + i * 0.12, inOut);
        return (
          <div key={w} style={{ position: "absolute", left: 140 + i * 300, top: 690 + sink * 260, opacity: Math.min(1, p) * (1 - sink), transform: `scale(${0.85 + 0.15 * p}) rotate(${sink * (i - 1) * 8}deg)`, filter: `grayscale(${sink})` }}>
            <div style={{ width: 270, padding: "20px 22px", borderRadius: 18, background: "#fff", border: `2px solid ${C.green}`, boxShadow: `0 18px 40px rgba(10,14,23,0.14)` }}>
              <Mono size={16} color="#2a8a00" style={{ letterSpacing: "0.1em" }}>REAL MESSAGE</Mono>
              <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 30, color: C.navy, marginTop: 6, letterSpacing: "-0.02em" }}>{label}</div>
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// ─── 3. evidence: the market exists, the middleman ate it ──────────────────────────────────
export const Evidence: React.FC = () => {
  const t = useT();
  const cb = at("evidence", "coinbase"), l1 = lineAt("evidence", 2), read = at("evidence", "read"), half = at("evidence", "half.");
  const flow = (t - l1) * 0.7;
  return (
    <Dark>
      <div style={{ position: "absolute", left: 130, top: 150, width: 760 }}>
        <Line id="evidence" line={0} size={78} accent={{ works: C.green }} style={{}} shift={0} />
      </div>
      <Fade t0={cb} style={{ left: 130, top: 470 }}>
        <div style={{ fontFamily: sans, fontWeight: 800, fontSize: 200, letterSpacing: "-0.06em", lineHeight: 1, color: C.ink }}>$<Count to={100} t0={cb} dur={1.2} />M</div>
        <Mono size={24} style={{ marginTop: 14, letterSpacing: "0.06em" }}>COINBASE ACQUIRES EARN.COM · 2018</Mono>
      </Fade>
      {/* sender → server → you */}
      <div style={{ position: "absolute", left: 980, top: 380, width: 820, height: 360, opacity: ramp(t, l1 - 0.3, l1 + 0.3) }}>
        {[["Sender", 0], ["You", 700]].map(([label, x]) => (
          <div key={label as string} style={{ position: "absolute", left: x as number, top: 120, width: 120, textAlign: "center" }}>
            <div style={{ width: 120, height: 120, borderRadius: 60, background: "#1d2742", border: "1.5px solid rgba(255,255,255,0.15)" }} />
            <Mono size={22} color={C.ink} style={{ marginTop: 14 }}>{label}</Mono>
          </div>
        ))}
        <div style={{ position: "absolute", left: 270, top: 70, width: 280, height: 220, borderRadius: 20, background: "#141b2e", border: `2px solid ${t >= read ? "#ff453a" : "rgba(255,255,255,0.18)"}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, boxShadow: t >= read ? "0 0 60px rgba(255,69,58,0.3)" : undefined }}>
          {[0, 1, 2].map((i) => <div key={i} style={{ width: 180, height: 22, borderRadius: 6, background: "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", gap: 8, padding: "0 10px" }}><span style={{ width: 8, height: 8, borderRadius: 4, background: i === 1 ? C.green : "#5a6478" }} /></div>)}
          <Mono size={20} color={C.ink}>Middleman server</Mono>
        </div>
        {/* messages passing through, opened in the middle */}
        {Array.from({ length: 6 }).map((_, i) => {
          const u = (flow + i / 6) % 1;
          const x = mix(120, 700, u);
          return <div key={i} style={{ position: "absolute", left: x, top: 170, width: 30, height: 20, borderRadius: 4, background: u > 0.35 && u < 0.62 ? "#ff453a" : C.ink, opacity: t >= l1 ? 0.9 : 0 }} />;
        })}
        <Fade t0={read} style={{ left: 250, top: 310 }}><Mono size={24} color="#ff6b61">reads every message in plaintext</Mono></Fade>
        <Fade t0={half} style={{ left: 250, top: -10 }}>
          <div style={{ fontFamily: sans, fontWeight: 800, fontSize: 54, color: "#ff453a", letterSpacing: "-0.03em" }}>20–50% fee</div>
        </Fade>
      </div>
    </Dark>
  );
};

// ─── 4. turn: full-bleed brand ─────────────────────────────────────────────────────────────
export const Turn: React.FC = () => {
  const t = useT();
  const v = at("turn", "voxro"), l1 = lineAt("turn", 1);
  const p = pop(t, v - 0.08, 12, 160);
  return (
    <AbsoluteFill style={{ background: C.green, overflow: "hidden" }}>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 40%, rgba(255,255,255,0.35), transparent 60%)" }} />
      <Fade t0={sc("turn").from + 0.3} t1={v - 0.2} style={{ left: 0, right: 0, top: 470, textAlign: "center" }}>
        <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 70, color: C.greenInk, letterSpacing: "-0.04em" }}>So we built</div>
      </Fade>
      <div style={{ position: "absolute", left: 0, right: 0, top: 300, display: "flex", justifyContent: "center", alignItems: "center", gap: 40, opacity: Math.min(1, p), transform: `scale(${0.7 + 0.3 * p})` }}>
        <div style={{ borderRadius: 999, boxShadow: "0 0 0 8px rgba(4,20,10,0.9)" }}><Shield size={190} /></div>
        <span style={{ fontFamily: sans, fontWeight: 800, fontSize: 250, letterSpacing: "-0.07em", color: C.greenInk, lineHeight: 1 }}>Voxro</span>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 640, display: "flex", justifyContent: "center", opacity: ramp(t, l1 - 0.2, l1 + 0.2) }}>
        <Line id="turn" line={1} size={76} color={C.greenInk} accent={{ server: "#000" }} />
      </div>
    </AbsoluteFill>
  );
};

// ─── 5. stack: X Layer, OKX Wallet, and TapeOut's own parts ────────────────────────────────
export const Stack: React.FC = () => {
  const t = useT();
  const x0 = at("stack", "x"), okx = at("stack", "okx"), to = at("stack", "tapeout"), ci = at("stack", "circuits");
  const ts = at("stack", ["tapesend", "tape"], 0), dw = at("stack", ["deweb", "dee"]);
  const parts: [number, string, string, string][] = [
    [ci, "Circuits", "set the price", "NAND · LATCH · REF on the VOXR processor"],
    [ts, "TapeSend", "carries the message", `TAP-10 v2 · DeWebHub ${short(A.deWebHub)}`],
    [dw, "DeWEB", "hosts your contact card", "SiteRegistry · tape:// pages"],
  ];
  return (
    <Dark>
      <div style={{ position: "absolute", left: 0, right: 0, top: 120, display: "flex", justifyContent: "center", gap: 120, alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 26, opacity: ramp(t, x0 - 0.1, x0 + 0.3) }}>
          <XLayer h={84} t0={x0} />
          <div><div style={{ fontFamily: sans, fontWeight: 700, fontSize: 64, color: C.ink, letterSpacing: "-0.04em" }}>X Layer</div><Mono size={20}>mainnet · chain 196</Mono></div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 18, opacity: Math.min(1, pop(t, okx)), transform: `scale(${0.85 + 0.15 * pop(t, okx)})` }}>
          <Img src={staticFile("brand/okx.svg")} style={{ height: 150, margin: "-40px 0", filter: "invert(1)" }} />
          <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 64, color: C.ink, letterSpacing: "-0.04em" }}>Wallet</div>
        </div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 360, display: "flex", justifyContent: "center", alignItems: "center", gap: 26, opacity: ramp(t, to - 0.2, to + 0.3) }}>
        <TapeOut h={96} t0={to} />
        <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 60, color: C.ink, letterSpacing: "-0.04em" }}>TapeOut <span style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 400, color: C.green }}>ecosystem</span></div>
      </div>
      {parts.map(([a, name, does, how], i) => (
        <Card key={name} t0={a} x={150 + i * 560} y={560} w={500} hot>
          <Kicker style={{ fontSize: 20 }}>{name}</Kicker>
          <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 46, color: C.ink, letterSpacing: "-0.03em", marginTop: 10, lineHeight: 1.05 }}>{does}</div>
          <Mono size={19} style={{ marginTop: 16 }}>{how}</Mono>
        </Card>
      ))}
      {/* the wiring between the TapeOut mark and its parts */}
      <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0 }}>
        {parts.map(([a], i) => {
          const p = ramp(t, a - 0.3, a + 0.2);
          const x = 400 + i * 560;
          return <path key={i} d={`M960 470 C960 515 ${x} 510 ${x} 555`} stroke={C.green} strokeWidth={3} fill="none" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - p} opacity={0.7} />;
        })}
      </svg>
    </Dark>
  );
};

// ─── 6. send: Directory → @voxro → live quote → sealed message (real footage) ───────────────
export const Send: React.FC = () => {
  const s = sc("send");
  const l1 = lineAt("send", 1), l2 = lineAt("send", 2);
  const seal = at("send", "sealed"), esc = at("send", "escrow.");
  const D = "directory";
  return (
    <Dark glow={0.7}>
      <Browser name={D} url="voxro.shieldsuite.xyz/#/directory" x={150} y={66} w={1620} enter={s.from}
        cuts={[{ t: s.from, from: mark(D, "dir_type") - 0.4 }, { t: l1 - 0.2, from: mark(D, "dir_quote") - 0.3 }, { t: l2 - 0.2, from: mark(D, "dir_body") - 0.2, speed: 1.35 }]}
        cams={[
          { t: s.from, z: 1 }, { t: s.from + 1.2, z: 1 },
          { t: at("send", "voxro") - 0.3, r: { x: 300, y: 150, w: 560, h: 320 }, z: 1.9 },
          { t: l1 - 0.2, r: { x: 300, y: 150, w: 560, h: 320 }, z: 1.9 },
          { t: l1 + 0.7, r: { x: 860, y: 230, w: 700, h: 260 }, z: 2.0 },
          { t: l2 - 0.3, r: { x: 860, y: 230, w: 700, h: 260 }, z: 2.0 },
          { t: l2 + 0.6, r: { x: 860, y: 520, w: 720, h: 380 }, z: 1.75 },
          { t: esc + 1.5, r: { x: 860, y: 520, w: 720, h: 380 }, z: 1.55 },
        ]} />
      <Card t0={seal} x={1180} y={130} w={600} hot>
        <Kicker style={{ fontSize: 18 }}>Sealed in your browser</Kicker>
        <Mono size={22} color={C.ink} style={{ marginTop: 10 }}>TAP-10 v2 · X25519 + XChaCha20-Poly1305</Mono>
      </Card>
      <Card t0={esc} x={1180} y={290} w={600}>
        <Kicker style={{ fontSize: 18 }} color={C.ink}>Locked in escrow</Kicker>
        <Mono size={22} style={{ marginTop: 10 }}>VoxroEscrow · {short(A.escrow)}</Mono>
      </Card>
    </Dark>
  );
};

// ─── 7. surge: the LATCH queue raises the price (the motif, full size) ──────────────────────
export const Surge: React.FC = () => {
  const t = useT();
  const s = sc("surge");
  const steps: [number, number][] = [
    [s.from, 0], [at("surge", "ten."), 0], [at("surge", "fifteen."), 1], [at("surge", ["twenty-five.", "twentyfive."]), 3],
    [at("surge", "forty."), 5], [at("surge", "reply,"), 5], [at("surge", "cools"), 2], [at("surge", "down."), 0],
  ];
  let d = 0;
  for (let i = 0; i < steps.length; i++) {
    const [a, v] = steps[i];
    if (t >= a) { const prev = i ? steps[i - 1][1] : 0; d = mix(prev, v, ramp(t, a, a + 0.45)); }
  }
  const q = Math.round(d);
  const price = LADDER[Math.min(7, Math.max(0, q))];
  const col = tierColor(price);
  return (
    <Dark>
      <Fade t0={s.from + 0.2} style={{ left: 300, top: 110 }}>
        <Kicker>LATCH queue · @voxro · FounderBalancedInbox</Kicker>
      </Fade>
      <div style={{ position: "absolute", left: 300, top: 170, display: "flex", alignItems: "baseline", gap: 22 }}>
        <span style={{ fontFamily: sans, fontWeight: 800, fontSize: 150, letterSpacing: "-0.06em", color: col, lineHeight: 1, textShadow: `0 0 50px ${col}55` }}>{price}</span>
        <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 40, color: C.ink }}>USD₮0</span>
        <span style={{ fontFamily: mono, fontSize: 26, color: C.dim, marginLeft: 20 }}>next cold sender · queue {q} of 7</span>
      </div>
      {/* the three LATCH bits that hold the queue */}
      <div style={{ position: "absolute", right: 300, top: 180, display: "flex", gap: 14 }}>
        {[2, 1, 0].map((b) => {
          const on = (q >> b) & 1;
          return (
            <div key={b} style={{ textAlign: "center" }}>
              <div style={{ width: 70, height: 70, borderRadius: 12, background: on ? C.green : "transparent", border: `2px solid ${on ? C.green : "rgba(255,255,255,0.2)"}`, boxShadow: on ? `0 0 30px ${C.green}88` : undefined, fontFamily: mono, fontWeight: 700, fontSize: 34, color: on ? C.greenInk : C.dim, display: "flex", alignItems: "center", justifyContent: "center" }}>{on}</div>
              <Mono size={18} style={{ marginTop: 8 }}>s{b}</Mono>
            </div>
          );
        })}
      </div>
      <Ladder depth={d} x={304} y={380} cell={150} t0={s.from + 0.3} />
      <Fade t0={at("surge", "reply,")} style={{ left: 304, top: 860 }}>
        <Mono size={24} color={C.ink}>reply → claimBounty() steps the queue down (dir = 0)</Mono>
      </Fade>
    </Dark>
  );
};

// ─── 8. settle: reply verified on chain, 95% paid; or a full refund ────────────────────────
export const Settle: React.FC = () => {
  const t = useT();
  const s = sc("settle");
  const ans = at("settle", "answer"), chk = at("settle", "checks"), ora = at("settle", "oracle,"), pay = at("settle", "ninety-five");
  const l1 = lineAt("settle", 1), full = at("settle", "full");
  const claimOut = ramp(t, l1 - 0.3, l1 + 0.2);
  const env = ramp(t, ans, ans + 1.2, inOut);
  const node = (label: string, sub: string, x: number, glow?: boolean) => (
    <div style={{ position: "absolute", left: x, top: 260, width: 300, textAlign: "center" }}>
      <div style={{ margin: "0 auto", width: 150, height: 150, borderRadius: 75, background: glow ? "#06120a" : "#1d2742", border: `2px solid ${glow ? C.green : "rgba(255,255,255,0.16)"}`, boxShadow: glow ? `0 0 60px ${C.green}44` : undefined }} />
      <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 38, color: C.ink, marginTop: 18, letterSpacing: "-0.03em" }}>{label}</div>
      <Mono size={19} style={{ marginTop: 4 }}>{sub}</Mono>
    </div>
  );
  const checks = ["entry.from is an inbox member container", "createdAt ≤ entry.timestamp ≤ deadline", "entry.digest == keccak256(ref ‖ keccak256(payload))"];
  return (
    <Dark>
      <Fade t0={s.from + 0.2} style={{ left: 140, top: 90 }}><Kicker>How a ticket settles · VoxroEscrow.sol</Kicker></Fade>
      <div style={{ opacity: 1 - claimOut }}>
        {node("Sender", "10 USD₮0 locked", 140)}
        {node("Escrow", short(A.escrow), 810, t >= chk)}
        {node("Recipient", "@voxro", 1480)}
        {/* reply envelope via TapeSend */}
        <div style={{ position: "absolute", left: mix(1580, 910, env), top: 310, opacity: t >= ans ? 1 - ramp(t, ans + 1.2, ans + 1.5) : 0, fontFamily: mono, fontSize: 20, color: C.greenInk, background: C.green, padding: "10px 16px", borderRadius: 10, whiteSpace: "nowrap" }}>TapeSend reply</div>
        <div style={{ position: "absolute", left: 760, top: 540, width: 700 }}>
          {checks.map((c, i) => {
            const p = pop(t, chk + 0.25 + i * 0.3);
            return <div key={i} style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 12, opacity: Math.min(1, p), transform: `translateX(${(1 - p) * 30}px)` }}><span style={{ fontFamily: mono, fontWeight: 700, fontSize: 24, color: C.green }}>✓</span><Mono size={22} color={C.ink}>{c}</Mono></div>;
          })}
        </div>
        <Fade t0={ora} style={{ left: 140, top: 560 }}>
          <div style={{ fontFamily: sans, fontWeight: 800, fontSize: 64, color: C.ink, letterSpacing: "-0.04em" }}>No <span style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 400, color: C.green }}>oracle.</span></div>
          <Mono size={20} style={{ marginTop: 6 }}>reads DeWebHub.inboxAt() directly</Mono>
        </Fade>
        <Card t0={pay} x={1290} y={720} w={480} hot>
          <Mono size={18} color={C.green} style={{ letterSpacing: "0.12em" }}>CLAIMED · 95%</Mono>
          <div style={{ fontFamily: sans, fontWeight: 800, fontSize: 76, color: C.green, letterSpacing: "-0.04em", lineHeight: 1.1 }}><Count to={9.5} t0={pay} decimals={2} /> <span style={{ fontSize: 32, color: C.ink }}>USD₮0</span></div>
          <Mono size={19}>0.50 protocol fee (5%)</Mono>
        </Card>
      </div>
      {/* refund path */}
      <div style={{ opacity: ramp(t, l1, l1 + 0.4) }}>
        <div style={{ position: "absolute", left: 140, top: 230 }}>
          <div style={{ fontFamily: sans, fontWeight: 800, fontSize: 96, color: C.ink, letterSpacing: "-0.05em" }}>No reply <span style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 400, color: C.green }}>in time?</span></div>
          <Mono size={24} style={{ marginTop: 14 }}>refundExpired() · callable by anyone after the deadline</Mono>
        </div>
        {/* SLA ring running out */}
        <svg width={300} height={300} style={{ position: "absolute", left: 1450, top: 160 }}>
          <circle cx={150} cy={150} r={120} stroke="rgba(255,255,255,0.12)" strokeWidth={14} fill="none" />
          <circle cx={150} cy={150} r={120} stroke={C.green} strokeWidth={14} fill="none" pathLength={1} strokeDasharray="1 1" strokeDashoffset={ramp(t, l1, full - 0.2, inOut)} transform="rotate(-90 150 150)" strokeLinecap="round" />
          <text x={150} y={165} textAnchor="middle" fontFamily={mono} fontSize={40} fill={C.ink}>{Math.max(0, Math.round(48 * (1 - ramp(t, l1, full - 0.2, inOut))))}h</text>
        </svg>
        <Card t0={full} x={140} y={520} w={760} hot>
          <Mono size={18} color={C.green} style={{ letterSpacing: "0.12em" }}>REFUNDED · 100% · 0% FEE</Mono>
          <div style={{ fontFamily: sans, fontWeight: 800, fontSize: 90, color: C.green, letterSpacing: "-0.04em", lineHeight: 1.1 }}>10.00 <span style={{ fontSize: 36, color: C.ink }}>USD₮0 back to the sender</span></div>
        </Card>
      </div>
      <Fade t0={s.from + 0.6} style={{ left: 140, bottom: 140 }}><Mono size={18} color="#6b7488">Shown with @voxro’s live 10 USD₮0 quote · logic from VoxroEscrow.sol</Mono></Fade>
    </Dark>
  );
};

// ─── 9. proof: gallery bench, then the prover replays all 512 moves against the chain ──────
export const Proof: React.FC = () => {
  const t = useT();
  const s = sc("proof");
  const l1 = lineAt("proof", 1), l2 = lineAt("proof", 2);
  const big = ramp(t, l2 - 0.2, l2 + 0.3);
  return (
    <Dark glow={0.7}>
      <div style={{ opacity: 1 - ramp(t, l1 - 0.35, l1) }}>
        <Browser name="gallery" url="voxro.shieldsuite.xyz/#/gallery" x={150} y={66} w={1620} enter={s.from}
          cuts={[{ t: s.from, from: mark("gallery", "gal_controller") - 0.2 }]}
          cams={[{ t: s.from, z: 1.15, r: { x: 560, y: 120, w: 1040, h: 600 } }, { t: l1, z: 1.45, r: { x: 760, y: 280, w: 840, h: 400 } }]} />
      </div>
      <div style={{ opacity: ramp(t, l1 - 0.35, l1) * (1 - 0.75 * big), filter: big > 0 ? `blur(${big * 6}px)` : undefined }}>
        <Browser name="prover" url="voxro.shieldsuite.xyz/#/prover" x={150} y={66} w={1620}
          cuts={[{ t: l1 - 0.35, from: mark("prover", "prove_go") - 0.6 }, { t: at("proof", "replays") - 0.3, from: mark("prover", "prove_done") - 0.4 }]}
          cams={[{ t: l1, z: 1.1 }, { t: at("proof", "replays") - 0.2, z: 1.1 }, { t: at("proof", "replays") + 1.2, r: { x: 300, y: 300, w: 950, h: 420 }, z: 1.55 }]} />
      </div>
      <Fade t0={at("proof", ["five", "512"])} t1={l2 - 0.3} style={{ right: 170, top: 150 }}>
        <Card t0={at("proof", ["five", "512"])} x={0} y={0} w={420} hot style={{ position: "relative" }}>
          <Mono size={18} color={C.green} style={{ letterSpacing: "0.12em" }}>VOXR #4 · EXHAUSTIVE</Mono>
          <div style={{ fontFamily: sans, fontWeight: 800, fontSize: 96, color: C.green, letterSpacing: "-0.05em", lineHeight: 1 }}><Count to={512} t0={at("proof", ["five", "512"])} /> ✓</div>
          <Mono size={19}>every transition matches on chain</Mono>
        </Card>
      </Fade>
      <div style={{ position: "absolute", left: 0, right: 0, top: 300, textAlign: "center", opacity: big }}>
        <div style={{ fontFamily: sans, fontWeight: 800, fontSize: 210, letterSpacing: "-0.06em", color: C.ink, lineHeight: 1 }}><Count to={2656} t0={l2} dur={1.6} /></div>
        <Mono size={34} color={C.dim} style={{ marginTop: 10, letterSpacing: "0.1em" }}>TRANSITIONS PROVEN ACROSS THE CATALOG</Mono>
        <div style={{ fontFamily: sans, fontWeight: 800, fontSize: 110, letterSpacing: "-0.05em", marginTop: 40, opacity: ramp(t, at("proof", "zero") - 0.1, at("proof", "zero") + 0.3) }}>
          <span style={{ color: C.green }}>0</span> <span style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 400, color: C.green }}>mismatches.</span>
        </div>
      </div>
    </Dark>
  );
};

// ─── 10. live: on X Layer mainnet, read back from the chain ─────────────────────────────────
export const Live: React.FC = () => {
  const s = sc("live");
  const t = useT();
  const items: [number, string, string][] = [
    [at("live", "voxr"), "VOXR processor", `${short(A.voxrCircuits)} · factory index ${onchain.voxrFactoryIndex}`],
    [at("live", "eight"), `${onchain.tapeouts} circuits taped out`, "3 standard cells · 5 inbox controllers"],
    [at("live", "escrow,"), "VoxroEscrow + VoxroLens", `${short(A.escrow)} · ${short(A.lens)}`],
    [at("live", "inbox."), "@voxro · inbox #1", `registerInbox · block ${REG.block.toLocaleString("en-US")}`],
  ];
  const beta = lineAt("live", 1);
  return (
    <Dark glow={0.8}>
      <Fade t0={s.from + 0.2} style={{ left: 110, top: 70 }}>
        <Kicker>X Layer mainnet · {FIRST.utc.slice(0, 10)} · {onchain.txs.length} transactions in {LAUNCH_SECONDS} seconds</Kicker>
      </Fade>
      <Browser name="scan_register" url={`oklink.com/x-layer/tx/${REG.hash.slice(0, 14)}…`} x={110} y={140} w={1000} enter={s.from + 0.1}
        cuts={[{ t: s.from, from: 0.5 }]} cams={[{ t: s.from, r: { x: 140, y: 160, w: 1100, h: 520 }, z: 1.3 }, { t: end("live"), r: { x: 140, y: 230, w: 1000, h: 420 }, z: 1.45 }]} />
      {items.map(([a, title, sub], i) => (
        <Card key={title} t0={a} x={1170} y={150 + i * 175} w={640} hot={i === 3}>
          <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 40, color: C.ink, letterSpacing: "-0.03em" }}>{title}</div>
          <Mono size={20} style={{ marginTop: 8 }}>{sub}</Mono>
        </Card>
      ))}
      <div style={{ position: "absolute", left: 110, top: 880, display: "flex", alignItems: "center", gap: 14, opacity: ramp(t, beta - 0.1, beta + 0.4) }}>
        <span style={{ width: 14, height: 14, borderRadius: 7, background: C.green, boxShadow: `0 0 14px ${C.green}` }} />
        <Mono size={26} color={C.ink}>Private beta · testers inside since Monday 23 Nov</Mono>
      </div>
    </Dark>
  );
};

// ─── 11. unique: four promises, each backed by the design ───────────────────────────────────
export const Unique: React.FC = () => {
  const t = useT();
  const rows: [string, string, string][] = [
    ["server", "No server to trust.", "DeWEB pages · DeWebHub messages · ownerless escrow"],
    ["plaintext.", "No plaintext.", "sealed to the recipient’s key, in the browser"],
    ["fee", "No fee unless someone replies.", "5% only on claimed bounties · 0% on refunds"],
    ["change", "No changing the rules after you pay.", "taped-out circuit · proven before you sign"],
  ];
  return (
    <Dark>
      {rows.map(([w, big, small], i) => {
        const a = at("unique", w) - 0.25;
        const p = ramp(t, a, a + 0.5);
        return (
          <div key={w} style={{ position: "absolute", left: 150, top: 150 + i * 200, opacity: p, transform: `translateY(${(1 - p) * 30}px)` }}>
            <div style={{ fontFamily: sans, fontWeight: 800, fontSize: 82, letterSpacing: "-0.05em", color: C.ink, lineHeight: 1 }}>
              <span style={{ display: "inline-block", width: 70, color: C.green }}>✓</span>{big}
            </div>
            <Mono size={24} style={{ marginLeft: 70, marginTop: 12 }}>{small}</Mono>
          </div>
        );
      })}
    </Dark>
  );
};

// ─── 12. close ──────────────────────────────────────────────────────────────────────────────
export const Close: React.FC = () => {
  const t = useT();
  const s = sc("close");
  const v = at("close", "voxro"), tag = at("close", "your"), l1 = lineAt("close", 1);
  const p = pop(t, v - 0.1, 13, 150);
  return (
    <Dark>
      <div style={{ position: "absolute", left: 0, right: 0, top: 230, display: "flex", justifyContent: "center", alignItems: "center", gap: 34, opacity: Math.min(1, p), transform: `scale(${0.8 + 0.2 * p})` }}>
        <Shield size={150} />
        <span style={{ fontFamily: sans, fontWeight: 800, fontSize: 190, letterSpacing: "-0.07em", color: C.ink, lineHeight: 1 }}>Voxro</span>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 470, textAlign: "center", fontFamily: sans, fontWeight: 700, fontSize: 84, letterSpacing: "-0.045em", color: C.ink, opacity: ramp(t, tag - 0.1, tag + 0.4) }}>
        Your inbox, priced by a <span style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 400, color: C.green, fontSize: "1.14em" }}>circuit.</span>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 640, display: "flex", justifyContent: "center", opacity: ramp(t, tag + 0.8, tag + 1.3) }}>
        <div style={{ padding: "18px 40px", border: `2.5px solid ${C.green}`, background: "#000", fontFamily: mono, fontWeight: 700, fontSize: 44, color: C.ink, boxShadow: `0 0 60px ${C.green}26` }}><span style={{ color: C.green, marginRight: 22 }}>▌</span>voxro.shieldsuite.xyz</div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 90, display: "flex", justifyContent: "center", alignItems: "center", gap: 34, fontFamily: sans, fontWeight: 600, fontSize: 34, letterSpacing: "-0.03em", color: C.ink, opacity: ramp(t, l1 - 0.2, l1 + 0.4) }}>
        <span style={{ display: "flex", alignItems: "center", gap: 14 }}><Shield size={52} />ShieldSuite</span>
        <span style={{ width: 2, height: 38, background: "rgba(255,255,255,0.18)" }} />
        <span style={{ display: "flex", alignItems: "center", gap: 14 }}><XLayer h={36} />X Layer</span>
        <span style={{ width: 2, height: 38, background: "rgba(255,255,255,0.18)" }} />
        <span style={{ display: "flex", alignItems: "center", gap: 12 }}><TapeOut h={50} />TapeOut</span>
        <span style={{ width: 2, height: 38, background: "rgba(255,255,255,0.18)" }} />
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}><Img src={staticFile("brand/okx.svg")} style={{ height: 80, margin: "-22px 0", filter: "invert(1)" }} />OKX Wallet</span>
      </div>
      <AbsoluteFill style={{ background: "#000", opacity: ramp(t, s.from + s.dur - 1.0, s.from + s.dur) }} />
    </Dark>
  );
};

// ─── 10b. reach: Telegram for people, MCP and x402 for agents ───────────────────────────────
const TG = "footage/telegram.mp4";
const hasTg = () => getStaticFiles().some((f) => f.name === TG);
export const Reach: React.FC = () => {
  const t = useT();
  const s = sc("reach");
  const tgAt = at("reach", "telegram,"), ag = at("reach", ["agents", "a"]), mcp = at("reach", ["mcp", "m"]), x4 = at("reach", ["x402.", "x"]);
  const tools = ["voxro_list_inboxes", "voxro_get_inbox", "voxro_send_message", "voxro_check_reply", "voxro_refund"];
  const phoneIn = pop(t, s.from + 0.2, 14, 150);
  const frame = Math.max(0, Math.round((t - s.from - 0.3) * 30));
  return (
    <Dark>
      {/* the phone: the owner's own recording of @VoxrolayerBOT */}
      <div style={{ position: "absolute", left: 170, top: 90, width: 430, height: 900, borderRadius: 56, background: "#000", border: "10px solid #1d2433", boxShadow: `0 60px 120px rgba(0,0,0,0.6), 0 0 80px ${C.green}18`, overflow: "hidden", opacity: Math.min(1, phoneIn), transform: `translateY(${(1 - phoneIn) * 60}px) rotate(${(1 - phoneIn) * -3}deg)` }}>
        {hasTg() ? (
          <RFreeze frame={frame}><RVideo src={staticFile(TG)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} /></RFreeze>
        ) : (
          <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 18, background: "#17212b" }}>
            <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 34, color: C.ink }}>@VoxrolayerBOT</div>
            <Mono size={20}>screen recording pending</Mono>
          </AbsoluteFill>
        )}
      </div>
      <Fade t0={tgAt} style={{ left: 640, top: 120 }}>
        <Kicker>Telegram · @VoxrolayerBOT</Kicker>
        <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 52, color: C.ink, letterSpacing: "-0.035em", marginTop: 12, lineHeight: 1.08 }}>Alerts the moment a<br />paid message <span style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 400, color: C.green }}>lands.</span></div>
        <Mono size={21} style={{ marginTop: 14 }}>/price · /watch · /me · Mini App with OKX Connect</Mono>
      </Fade>
      <Card t0={ag} x={640} y={420} w={560}>
        <Kicker style={{ fontSize: 18 }}>MCP server · for AI agents</Kicker>
        <div style={{ marginTop: 12 }}>
          {tools.map((n, i) => <div key={n} style={{ fontFamily: mono, fontSize: 22, color: C.ink, opacity: ramp(t, mcp + i * 0.12, mcp + i * 0.12 + 0.3), marginTop: 6 }}><span style={{ color: C.green }}>›</span> {n}</div>)}
        </div>
      </Card>
      <Card t0={x4 - 0.2} x={1240} y={420} w={560} hot>
        <Kicker style={{ fontSize: 18 }}>x402 · pay over HTTP</Kicker>
        <div style={{ fontFamily: mono, fontSize: 21, color: C.ink, marginTop: 12, lineHeight: 1.6 }}>
          <div style={{ opacity: ramp(t, x4, x4 + 0.3) }}>POST /api/agent/send/@voxro</div>
          <div style={{ opacity: ramp(t, x4 + 0.35, x4 + 0.65), color: "#ffb347" }}>← 402 · 10 USD₮0 · eip155:196</div>
          <div style={{ opacity: ramp(t, x4 + 0.7, x4 + 1.0) }}>X-PAYMENT: EIP-3009 signature</div>
          <div style={{ opacity: ramp(t, x4 + 1.05, x4 + 1.35), color: C.green }}>← 200 · ticketId · held in escrow</div>
        </div>
      </Card>
      <Fade t0={x4 + 1.4} style={{ left: 640, top: 760 }}><Mono size={21}>No reply in time: the agent gets 100% back.</Mono></Fade>
    </Dark>
  );
};
