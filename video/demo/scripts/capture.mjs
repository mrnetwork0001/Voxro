// Records the real, live Voxro app (https://voxro.shieldsuite.xyz) for the demo film. READ-ONLY:
// no wallet is connected and nothing is sent, so every clip can be re-recorded at will.
//   BETA_CODE=... node scripts/capture.mjs          all clips
//   BETA_CODE=... ONLY=directory node scripts/capture.mjs
// Output: .cache/frames/<clip>/, .cache/marks.json, .cache/meta.json, public/stills/. Then scripts/encode.mjs.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { launch, sleep } from "./cdp.mjs";


const BASE = process.env.BASE || "https://voxro.shieldsuite.xyz";
const ROOT = resolve(new URL("..", import.meta.url).pathname);
const FRAMES = join(ROOT, ".cache/frames");
const STILLS = join(ROOT, "public/stills");
const SCALE = 2;
const VIEW = { w: 1600, h: 900 };
const ONLY = process.env.ONLY?.split(",");
const want = (clip) => !ONLY || ONLY.includes(clip);
mkdirSync(FRAMES, { recursive: true });
mkdirSync(STILLS, { recursive: true });

const t0 = Date.now();
const log = (...a) => console.log(`+${((Date.now() - t0) / 1000).toFixed(0)}s`, ...a);
const readJson = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : {});
const marks = readJson(join(ROOT, ".cache/marks.json"));
const meta = readJson(join(ROOT, ".cache/meta.json"));
const mark = (k) => { marks[k] = Date.now() / 1000; log("mark", k); };
const save = () => {
  writeFileSync(join(ROOT, ".cache/marks.json"), JSON.stringify(marks, null, 1));
  writeFileSync(join(ROOT, ".cache/meta.json"), JSON.stringify(meta, null, 1));
};

// A visible pointer (headless Chrome draws none), a click ring and an eased scroll helper.
const OVERLAY = `(() => {
  window.__ease = (el, prop, to, ms) => new Promise((done) => {
    const from = el[prop]; const start = performance.now();
    const f = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const step = (now) => { const p = Math.min(1, (now - start) / ms); el[prop] = from + (to - from) * f(p); if (p < 1) requestAnimationFrame(step); else done(el[prop]); };
    requestAnimationFrame(step);
  });
  if (document.getElementById('__cur')) return;
  const s = document.createElement('style');
  s.textContent = 'html{scroll-behavior:auto!important}#__cur{position:fixed;left:-40px;top:-40px;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;background:rgba(255,255,255,.96);box-shadow:0 0 0 2px rgba(51,255,0,.8),0 4px 16px rgba(0,0,0,.5);z-index:2147483647;pointer-events:none;opacity:0;transition:opacity .3s ease,transform .12s ease-out,left .8s cubic-bezier(.22,1,.36,1),top .8s cubic-bezier(.22,1,.36,1)}#__cur.down{transform:scale(.7)}.__ring{position:fixed;width:48px;height:48px;margin:-24px 0 0 -24px;border-radius:50%;border:2px solid rgba(51,255,0,.9);z-index:2147483646;pointer-events:none;animation:__r .6s ease-out forwards}@keyframes __r{from{transform:scale(.3);opacity:1}to{transform:scale(1.6);opacity:0}}';
  document.head.appendChild(s);
  const c = document.createElement('div'); c.id = '__cur'; document.body.appendChild(c);
})()`;

let b;
const js = (e) => b.js(e);
async function overlay() { await js(OVERLAY); }
async function glide(x, y, settle = 900) {
  await js(`(() => { const k = document.getElementById('__cur'); if (k) { k.style.opacity = '1'; k.style.left = '${x}px'; k.style.top = '${y}px'; } })()`);
  await sleep(820);
  await b.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await sleep(Math.max(0, settle - 820));
}
async function cursorAt(x, y) {
  await js(`(() => { const k = document.getElementById('__cur'); if (!k) return; const t = k.style.transition; k.style.transition = 'opacity .3s ease'; k.style.left = '${x}px'; k.style.top = '${y}px'; k.offsetWidth; k.style.transition = t; k.style.opacity = '1'; })()`);
}
async function cursorHide() { await js(`(() => { const k = document.getElementById('__cur'); if (k) k.style.opacity = '0'; })()`); }
async function clickAt(x, y) {
  await js(`(() => { const k = document.getElementById('__cur'); k?.classList.add('down'); const r = document.createElement('div'); r.className = '__ring'; r.style.left = '${x}px'; r.style.top = '${y}px'; document.body.appendChild(r); setTimeout(() => { k?.classList.remove('down'); r.remove(); }, 650); })()`);
  await b.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
  await sleep(90);
  await b.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
}
const centerOf = (finder) => js(`(() => { const e = ${finder}; if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
const rectOf = async (finder) => { const r = await b.rectOf(finder); return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null; };
/** Absolute document y of an element's top. */
const docY = (finder) => js(`(() => { const e = ${finder}; return e ? Math.round(e.getBoundingClientRect().top + scrollY) : null; })()`);
const scrollTo = (y, ms) => js(`window.__ease(document.scrollingElement, 'scrollTop', ${y}, ${ms})`);
const parkMouse = () => b.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: VIEW.w - 4, y: VIEW.h - 4 });
/** Glide to an element and click it (real mouse events). */
async function press(finder, settle = 700) {
  const p = await centerOf(finder);
  if (!p) throw new Error("press: not found " + finder.slice(0, 90));
  await glide(p.x, p.y, 1000);
  await clickAt(p.x, p.y);
  await sleep(settle);
  return p;
}
/** Types text into the focused field, a key at a time, like a person. */
async function typeText(text, cps = 16) {
  for (const ch of text) {
    await b.send("Input.insertText", { text: ch });
    await sleep(1000 / cps + Math.random() * 30);
  }
}
const byText = (sel, text) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.textContent.trim().replace(/\\s+/g, ' ').startsWith(${JSON.stringify(text)}))`;
const byAria = (sel, label) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => (e.getAttribute('aria-label') || '').startsWith(${JSON.stringify(label)}))`;
const heading = (text) => byText("h1,h2,h3", text);
async function waitFor(cond, ms = 30000, what = cond) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await js(`!!(${cond})`).catch(() => false)) return true; await sleep(400); }
  throw new Error("timed out waiting for " + String(what).slice(0, 120));
}

let stopRec = null;
async function rec(name) {
  const dir = join(FRAMES, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  stopRec = await b.screencast(dir);
  if (meta[name]) meta[name].rects = {};
  mark(`${name}:start`);
}
async function endRec(name) {
  if (!stopRec) return;
  mark(`${name}:end`);
  const frames = await stopRec();
  stopRec = null;
  const span = frames.length > 1 ? frames[frames.length - 1].t - frames[0].t : 0;
  log(`${name}: ${frames.length} frames over ${span.toFixed(1)}s (${(frames.length / Math.max(span, 0.001)).toFixed(1)} fps)`);
}
function setMeta(clip, data) {
  const prev = meta[clip] || {};
  meta[clip] = { deviceScale: SCALE, viewport: VIEW, ...prev, ...data, rects: { ...(prev.rects || {}), ...(data.rects || {}) } };
}
async function still(name, finder) { await b.shot(join(STILLS, `${name}.png`), finder); log("still", name); }

/** Opens a route with the guide already marked seen, waits for it to settle, adds the pointer. */
async function open(route, { settle = 6000 } = {}) {
  await b.goto(BASE + "/" + route, settle);
  await overlay();
  await parkMouse();
}

// ---------------------------------------------------------------- clips
const CLIPS = {};

const panel = (kicker) => `[...document.querySelectorAll('.kicker, [class*=kicker]')].find((e) => e.textContent.trim().toLowerCase().startsWith(${JSON.stringify(kicker.toLowerCase())}))?.closest('section, .panel, [class*=panel]')`;
const ROUTE_KEYS = ["pulse","directory","inbox","start","studio","card","gallery","prover","receipt","outbox"];

/** Landing hero, then a slow scroll to the problem section. */
CLIPS.landing = async () => {
  await open("", { settle: 6000 });
  await rec("landing");
  await sleep(3500);
  const y = await docY(heading("Everyone worth reaching"));
  mark("landing_scroll");
  if (y != null) await scrollTo(y - 120, 3200);
  await sleep(4000);
  await endRec("landing");
};

/** Pulse: the live network stats. */
CLIPS.pulse = async () => {
  await open("#/pulse", { settle: 8000 });
  setMeta("pulse", { rects: { stats: await rectOf(`document.querySelector('main') && ${byText("*", "Block")}?.closest('[class*=grid]')`) } });
  await rec("pulse");
  await sleep(3000);
  await glide(1150, 420, 1200);
  await sleep(2500);
  await scrollTo(560, 2600);
  await sleep(3500);
  await endRec("pulse");
};

/** Directory: search, open @voxro, the live quote and ladder, then write a message (nothing is sent). */
CLIPS.directory = async () => {
  await open("#/directory", { settle: 8000 });
  await rec("directory");
  await sleep(1500);
  await press(`document.querySelector('input.input')`, 400);
  mark("dir_type");
  await typeText("voxro", 8);
  await sleep(1400);
  await press(`document.querySelector('.inbox-card')`, 1200);
  mark("dir_open");
  await scrollTo(0, 1200);
  await sleep(1200);
  setMeta("directory", { rects: {
    quote: await rectOf(byText("*", "Live quote for you") + "?.parentElement"),
    compose: await rectOf(`document.querySelector('textarea')?.closest('section, .panel, [class*=panel]')`),
    card: await rectOf(`document.querySelector('.inbox-card')`),
  } });
  const q = await centerOf(byText("*", "Live quote for you") + "?.parentElement");
  if (q) await glide(q.x, q.y, 1500);
  mark("dir_quote");
  await sleep(2500);
  await press(`[...document.querySelectorAll('input.input')].find((e) => e.placeholder.startsWith('Partnership'))`, 300);
  mark("dir_subject");
  await typeText("Partnership: X Layer builders", 18);
  await sleep(500);
  await press(`document.querySelector('textarea')`, 300);
  mark("dir_body");
  await typeText("Hi! We run a TapeOut team and want to plug Voxro into our launch. 15 min this week?", 22);
  await sleep(1200);
  const btn = await centerOf(byText("button", "Connect wallet"));
  if (btn) await glide(btn.x, btn.y, 1600);
  mark("dir_seal");
  await sleep(2500);
  await cursorHide();
  const ly = await docY(heading("Each rung"));
  mark("dir_ladder");
  await scrollTo(ly != null ? ly - 300 : 700, 2400);
  await sleep(1200);
  setMeta("directory", { rects: { ladder: await rectOf(heading("Each rung") + "?.parentElement") } });
  await sleep(4500);
  await endRec("directory");
};

/** Studio: switch presets so the curve and ladder change, then the waveform and the transition table. */
CLIPS.studio = async () => {
  await open("#/studio", { settle: 8000 });
  setMeta("studio", { rects: {
    compiled: await rectOf(byText("*", "Compiled circuit") + "?.closest('section, .panel, [class*=panel]')"),
    ladder: await rectOf(byText("*", "Price ladder for this sender") + "?.closest('section, .panel, [class*=panel]')"),
  } });
  await rec("studio");
  await sleep(2500);
  for (const [i, p] of [["5", "fortress"], ["7", "steep"], ["4", "balanced"]]) {
    const sel = `document.querySelector('select.input')`;
    const c = await centerOf(sel);
    await glide(c.x, c.y, 900);
    await clickAt(c.x, c.y);
    await js(`(() => { const s = ${sel}; const o = [...s.options].find((o) => o.textContent.startsWith('#${i}')); if (!o) return; const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, o.value); s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    mark("studio_" + p);
    await sleep(2800);
  }
  await cursorHide();
  const wy = await docY(byText("*", "Transition table"));
  mark("studio_table");
  await scrollTo(wy != null ? wy - 520 : 900, 3500);
  setMeta("studio", { rects: { wave: await rectOf(byText("*", "Waveform") + "?.closest('section, .panel, [class*=panel]')") } });
  await sleep(5000);
  await endRec("studio");
};

/** Circuit Gallery: pick the controller, flip bench bits. */
CLIPS.gallery = async () => {
  await open("#/gallery", { settle: 8000 });
  await rec("gallery");
  await sleep(1500);
  await press(byText("tr", "4"), 1500);
  mark("gal_controller");
  setMeta("gallery", { rects: { bench: await rectOf(byText("*", "Live bench") + "?.closest('section, .panel, [class*=panel]')") } });
  for (let k = 0; k < 4; k++) {
    const c = await centerOf(`[...document.querySelectorAll('button.btn.sm')].filter((x) => /^(s|in|a|d|v|p|c)/.test(x.textContent.trim()))[${[0, 3, 4, 1][k]}]`);
    if (!c) break;
    await glide(c.x, c.y, 700);
    await clickAt(c.x, c.y);
    await sleep(900);
  }
  mark("gal_bits");
  await sleep(2500);
  await endRec("gallery");
};

/** Prover: load a VOXR controller from chain and prove every transition. */
CLIPS.prover = async () => {
  await open("#/prover", { settle: 6000 });
  await rec("prover");
  await sleep(1200);
  await press(`document.querySelector('input.input')`, 300);
  await js(`(() => { const i = document.querySelector('input.input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ''); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await typeText(process.env.PROVE || "#4@2.438", 10);
  await sleep(500);
  await press(byText("button", "Load"), 300);
  mark("prove_go");
  await waitFor(`/mismatch|transitions/i.test(document.querySelector('main')?.innerText.slice(400) || '')`, 60000).catch(() => log("prover: no result text"));
  mark("prove_done");
  await cursorHide();
  await sleep(3000);
  console.log("PROVER:", (await js(`document.querySelector('main')?.innerText.slice(0, 900)`)).replace(/\s+/g, " "));
  await scrollTo(380, 2500);
  await sleep(3500);
  await endRec("prover");
};

/** Explorer pages for the deploy (VOXR processor, escrow, inbox registration). */
CLIPS.explorer = async () => {
  for (const [clip, url] of [
    ["scan_cpu", "https://www.oklink.com/x-layer/tx/0x65b253cf685cb85c862a5128d84859241005a1d77d3691dfe74738b0059009e5"],
    ["scan_register", "https://www.oklink.com/x-layer/tx/0x4faa8becb72420f8a8270902608f8b66a6b16dc92a6adde904dd13658c8f60c1"],
  ]) {
    await b.goto(url, 9000);
    await overlay();
    await rec(clip);
    await sleep(6000);
    await endRec(clip);
    await still(clip);
    console.log(clip, (await js("document.title")), (await js("document.body.innerText.slice(0,400)")).replace(/\s+/g, " "));
  }
};

// ---------------------------------------------------------------- run
const order = Object.keys(CLIPS).filter(want);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
b = await launch({ width: VIEW.w, height: VIEW.h, extraArgs: [`--force-device-scale-factor=${SCALE}`, "--disable-blink-features=AutomationControlled", `--user-agent=${UA}`] });
await b.send("Network.enable");
await b.send("Network.setUserAgentOverride", { userAgent: UA, platform: "MacIntel" });
await b.send("Page.addScriptToEvaluateOnNewDocument", { source: "Object.defineProperty(navigator, 'webdriver', { get: () => undefined })" });
await b.send("Emulation.setDeviceMetricsOverride", { width: VIEW.w, height: VIEW.h, deviceScaleFactor: SCALE, mobile: false });
if (process.env.BETA_CODE) {
  const h = createHash("sha256").update("voxro-beta:" + process.env.BETA_CODE).digest("hex");
  await b.send("Network.setCookie", { name: "voxro_beta", value: h, domain: "voxro.shieldsuite.xyz", path: "/", secure: true });
}
const hardStop = setTimeout(() => { log("HARD TIMEOUT"); b.close(); process.exit(2); }, 1_800_000);
try {
  await b.goto(BASE + "/", 4000);
  await js(`localStorage.setItem("voxro.tour", "done"); for (const k of ${JSON.stringify(["pulse","directory","inbox","start","studio","card","gallery","prover","receipt","outbox"])}) localStorage.setItem("voxro.intro." + k, "1");`);
  for (const name of order) {
    log("clip", name);
    try { await CLIPS[name](); } catch (e) { log(`CLIP ${name} FAILED`, e.message); if (stopRec) await endRec(name); }
    save();
  }
} finally {
  save();
  if (b.consoleLines.length) log("console:", b.consoleLines.slice(0, 12).join("\n"));
  clearTimeout(hardStop);
  b.close();
}
