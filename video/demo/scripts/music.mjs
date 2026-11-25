// Two cues in the same key and tempo: tension (cold open to the reveal) and the product groove (from "Voxro" to the end).
import { writeFileSync, existsSync, readFileSync } from "node:fs"; import { join } from "node:path";
import { ROOT, post, retry } from "./env.mjs";
const T = JSON.parse(readFileSync(join(ROOT, "src/timing.json"), "utf8"));
const v = T.scenes.find((s) => s.id === "turn").lines[0].words.at(-1).start;
const uniq = T.scenes.find((s) => s.id === "unique").from, close = T.scenes.find((s) => s.id === "close").from;
const g = Math.ceil(T.total - v + 1);
const CUES = {
  tension: [Math.ceil(v + 1.5) * 1000, `Dark minimal electronic tension bed for a tech product film, D minor, 108 BPM, instrumental, no vocals. Low sub pulse and a dry ticking hi-hat from the first second, small glassy blips stacking up, unease grows slowly and stays understated under narration, a riser swells over the last six seconds and cuts dead at the end.`],
  groove: [g * 1000, `Confident sleek electronic groove for a premium crypto product demo, D minor, 108 BPM, instrumental, no vocals, mixed to sit under a narrator. Opens instantly with one big clean hit on the first beat, then a steady punchy kick, warm analog bass and a precise arpeggio, focused and modern, never busy. Around ${Math.round(uniq - v)} seconds in, lift the energy with brighter pads and claps. Around ${Math.round(close - v)} seconds in, resolve to a warm final chord that rings out to the end.`],
};
for (const [n, [ms, prompt]] of Object.entries(CUES)) {
  const f = join(ROOT, `public/audio/${n}.mp3`); if (existsSync(f) && !process.env.ONLY?.includes(n)) continue;
  const buf = await retry(async () => Buffer.from(await (await post("/music?output_format=mp3_44100_192", { prompt, music_length_ms: ms, force_instrumental: true })).arrayBuffer()), 2);
  writeFileSync(f, buf); console.log(n, ms / 1000, "s");
}
