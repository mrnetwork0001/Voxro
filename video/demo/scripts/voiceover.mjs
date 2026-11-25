// Narration for script.json via ElevenLabs with-timestamps -> public/audio/vo, .cache/words
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { ROOT, post, retry } from "./env.mjs";
import { renderVo } from "./vofx.mjs";
const s = JSON.parse(readFileSync(join(ROOT, "script.json"), "utf8"));
for (const d of ["public/audio/vo", ".cache/raw", ".cache/words"]) mkdirSync(join(ROOT, d), { recursive: true });
const CF = join(ROOT, ".cache/vo.json");
const cache = existsSync(CF) ? JSON.parse(readFileSync(CF, "utf8")) : {};
const only = process.env.ONLY?.split(",");
for (const sc of s.scenes) for (const [i, l] of sc.lines.entries()) {
  const id = `${sc.id}_${i}`, text = l.say ?? l.text;
  const settings = { ...s.voice.settings, ...(l.settings ?? {}) };
  const h = createHash("sha1").update(JSON.stringify([text, s.voice.id, settings])).digest("hex");
  if (cache[id] === h && !only?.includes(id)) { console.log(id, "cached"); continue; }
  const b = await retry(async () => (await post(`/text-to-speech/${s.voice.id}/with-timestamps?output_format=mp3_44100_128`, { text, model_id: s.model, voice_settings: settings })).json());
  const words = []; let cur = null;
  b.alignment.characters.forEach((ch, k) => {
    if (/\s/.test(ch)) { if (cur) words.push(cur); cur = null; return; }
    cur ??= { word: "", start: b.alignment.character_start_times_seconds[k], end: 0 };
    cur.word += ch; cur.end = b.alignment.character_end_times_seconds[k];
  });
  if (cur) words.push(cur);
  writeFileSync(join(ROOT, ".cache/raw", `${id}.mp3`), Buffer.from(b.audio_base64, "base64"));
  renderVo(id, 1);
  writeFileSync(join(ROOT, ".cache/words", `${id}.json`), JSON.stringify(words));
  cache[id] = h; console.log(id, words.at(-1).end.toFixed(2), words.map((w) => w.word).join(" "));
}
writeFileSync(CF, JSON.stringify(cache));
