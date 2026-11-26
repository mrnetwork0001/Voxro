// TapeTape promo narration: promo/script.json -> public/audio/vo/tt_<scene>_<i>.mp3 (+ .cache/words) -> src/promo/timing.json
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { ROOT, post, retry } from "./env.mjs";
import { renderVo } from "./vofx.mjs";
const s = JSON.parse(readFileSync(join(ROOT, "promo/script.json"), "utf8"));
for (const d of ["public/audio/vo", ".cache/raw", ".cache/words"]) mkdirSync(join(ROOT, d), { recursive: true });
const CF = join(ROOT, ".cache/promo-vo.json");
const cache = existsSync(CF) ? JSON.parse(readFileSync(CF, "utf8")) : {};
const dur = (f) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString().trim());
const out = { scenes: [] };
for (const sc of s.scenes) {
  const lines = [];
  for (const [i, l] of sc.lines.entries()) {
    const id = `tt_${sc.id}_${i}`, text = l.say ?? l.text;
    const settings = { ...s.voice.settings, ...(l.settings ?? {}) };
    const h = createHash("sha1").update(JSON.stringify([text, s.voice.id, settings])).digest("hex");
    if (cache[id] !== h) {
      const b = await retry(async () => (await post(`/text-to-speech/${s.voice.id}/with-timestamps?output_format=mp3_44100_128`, { text, model_id: s.model, voice_settings: settings })).json());
      writeFileSync(join(ROOT, ".cache/raw", `${id}.mp3`), Buffer.from(b.audio_base64, "base64"));
      renderVo(id, 1);
      cache[id] = h; writeFileSync(CF, JSON.stringify(cache));
      console.log(id, "generated");
    }
    lines.push({ id, text: l.text, gap: l.gap ?? 0, dur: dur(join(ROOT, "public/audio/vo", `${id}.mp3`)) });
  }
  out.scenes.push({ id: sc.id, lead: sc.lead ?? 0.3, tail: sc.tail ?? 0.5, lines });
}
writeFileSync(join(ROOT, "src/promo/vo.json"), JSON.stringify(out, null, 1));
console.log(out.scenes.map((x) => `${x.id}: ${x.lines.map((l) => l.dur.toFixed(2)).join(" + ")}`).join("\n"));
