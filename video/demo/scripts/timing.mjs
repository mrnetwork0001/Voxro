// script.json + word timings -> src/timing.json (absolute seconds)
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const ROOT = new URL("..", import.meta.url).pathname;
const s = JSON.parse(readFileSync(join(ROOT, "script.json"), "utf8"));
let t = 0; const scenes = [];
for (const sc of s.scenes) {
  let cur = t + (sc.lead ?? 0.3); const lines = [];
  for (const [i, l] of sc.lines.entries()) {
    if (i) cur += l.gap ?? 0.3;
    const id = `${sc.id}_${i}`;
    const w = JSON.parse(readFileSync(join(ROOT, ".cache/words", `${id}.json`), "utf8")).map((x) => ({ word: x.word, start: +(cur + x.start).toFixed(3), end: +(cur + x.end).toFixed(3) }));
    lines.push({ text: l.text, file: `audio/vo/${id}.mp3`, start: cur, end: w.at(-1).end, words: w }); cur = w.at(-1).end;
  }
  const dur = Math.max(sc.min, cur + sc.tail - t);
  scenes.push({ id: sc.id, from: t, dur, lines }); t += dur;
}
writeFileSync(join(ROOT, "src/timing.json"), JSON.stringify({ total: t, scenes }, null, 1));
for (const x of scenes) console.log(x.id.padEnd(7), x.from.toFixed(2), x.dur.toFixed(2), x.lines.map((l) => l.words.map((w) => `${w.word}@${w.start.toFixed(2)}`).join(" ")).join(" | "));
console.log("total", t.toFixed(2));
