// Dev aid only: a rough src/timing.json from word counts so scenes can be laid out before the narration
// exists. scripts/timing.mjs overwrites it with the real word timings.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const ROOT = new URL("..", import.meta.url).pathname;
const s = JSON.parse(readFileSync(join(ROOT, "script.json"), "utf8"));
let t = 0; const scenes = [];
for (const sc of s.scenes) {
  let cur = t + (sc.lead ?? 0.3); const lines = [];
  for (const [i, l] of sc.lines.entries()) {
    if (i) cur += l.gap ?? 0.3;
    const start = cur; const words = [];
    for (const w of l.text.split(" ")) { const d = 0.12 + w.length * 0.055; words.push({ word: w, start: +cur.toFixed(3), end: +(cur + d).toFixed(3) }); cur += d + (/[.,?]$/.test(w) ? 0.28 : 0.05); }
    lines.push({ text: l.text, file: `audio/vo/${sc.id}_${i}.mp3`, start, end: words.at(-1).end, words });
  }
  const dur = Math.max(sc.min, cur + sc.tail - t);
  scenes.push({ id: sc.id, from: t, dur, lines }); t += dur;
}
writeFileSync(join(ROOT, "src/timing.json"), JSON.stringify({ total: t, estimated: true, scenes }, null, 1));
console.log("estimated total", t.toFixed(1));
