// Read-only live-site audit: console errors, failed requests, suspicious text, per route, desktop + mobile + zh.
import { join } from "node:path";
import { createHash } from "node:crypto";
import { launch, sleep } from "./cdp.mjs";
const ROOT = new URL("..", import.meta.url).pathname;
const BASE = "https://voxro.shieldsuite.xyz/";
const routes = ["", "#/pulse", "#/directory", "#/@voxro", "#/@nobodyhere", "#/start", "#/inbox", "#/card", "#/studio", "#/gallery", "#/prover", "#/receipt/1", "#/receipt/abc", "#/nonsense"];
async function run(label, { w, h, mobile, lang }) {
  const b = await launch({ width: w, height: h });
  await b.send("Network.enable");
  await b.send("Network.setCookie", { name: "voxro_beta", value: createHash("sha256").update("voxro-beta:" + process.env.BETA_CODE).digest("hex"), domain: "voxro.shieldsuite.xyz", path: "/", secure: true });
  await b.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile });
  const fails = [];
  b.on("Network.loadingFailed", (p) => fails.push(`FAILED ${p.errorText} ${p.requestId}`));
  const urls = {};
  b.on("Network.requestWillBeSent", (p) => (urls[p.requestId] = p.request.url));
  b.on("Network.responseReceived", (p) => { if (p.response.status >= 400) fails.push(`HTTP ${p.response.status} ${p.response.url.slice(0, 120)}`); });
  await b.goto(BASE, 3000);
  await b.js(`localStorage.setItem("voxro.tour","done"); ${lang ? `localStorage.setItem("voxro.lang","${lang}");` : ""}`);
  for (const r of routes) {
    b.consoleLines.length = 0; fails.length = 0;
    await b.goto(BASE + r, 9000);
    const text = await b.js("document.body.innerText");
    const bad = [...new Set((text.match(/[^\n]{0,40}(NaN|undefined|null|\[object Object\]|Error|error|failed|Failed|Infinity)[^\n]{0,60}/g) || []))].slice(0, 6);
    const overflow = await b.js("document.documentElement.scrollWidth > innerWidth + 2 ? document.documentElement.scrollWidth : 0");
    const keys = lang === "zh" ? [...new Set((text.match(/\b[a-z]+\.[a-z][a-zA-Z0-9.]+\b/g) || []).filter((k) => !/shieldsuite|xyz|tape|okx|t\.me|\.sol|\.ts|e\.g/.test(k)))].slice(0, 10) : [];
    const name = `${label}_${(r.replace(/[^a-z@0-9]/gi, "") || "landing")}`;
    await b.shot(join(ROOT, ".cache/audit", name + ".png"));
    const failUrls = fails.map((f) => f.replace(/FAILED (\S+) (\S+)/, (_, e, id) => `FAILED ${e} ${(urls[id] || id).slice(0, 110)}`));
    console.log(`\n[${label}] ${r || "/"}  overflow=${overflow}`);
    if (b.consoleLines.length) console.log("  console:", [...new Set(b.consoleLines)].slice(0, 5).join(" | ").slice(0, 600));
    if (failUrls.length) console.log("  net:", [...new Set(failUrls)].slice(0, 6).join(" | "));
    if (bad.length) console.log("  text:", bad.join(" | ").slice(0, 500));
    if (keys.length) console.log("  raw keys?:", keys.join(", "));
  }
  b.close();
}
const which = process.env.MODE || "desktop";
if (which === "desktop") await run("desk", { w: 1440, h: 900, mobile: false });
if (which === "mobile") await run("mob", { w: 390, h: 844, mobile: true });
if (which === "zh") await run("zh", { w: 1440, h: 900, mobile: false, lang: "zh" });
