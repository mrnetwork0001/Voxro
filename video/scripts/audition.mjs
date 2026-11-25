// Auditions narrators on the film's own copy -> out/voices/<name>.mp3, then transcribes each take back.
import { writeFileSync } from "node:fs"; import { join } from "node:path";
import { ROOT, post, retry, key, API } from "./env.mjs";
const V = { brian: "nPczCjzI2devNBz1zQrb", daniel: "onwK4e9ZLuTAKqWW03F9", george: "JBFqnCBsd6RMkjVDRZzb", eric: "cjVigY5qzO86Huf0OWal", lily: "pFZP5JQG7iQjIQuC4Bku", michael: "lessJP1z7bvQVbfEDaZ9" };
const text = "Your inbox is free to enter. That's the problem. Everyone gets in. So nothing gets through. So we built a gate. This is Voxroh. Live on X Layer mainnet. Built for Tape Out.";
for (const [n, id] of Object.entries(V)) {
  const r = await retry(() => post(`/text-to-speech/${id}?output_format=mp3_44100_128`, { text, model_id: "eleven_multilingual_v2", voice_settings: { stability: 0.42, similarity_boost: 0.85, style: 0.35, use_speaker_boost: true, speed: 0.96 } }));
  const buf = Buffer.from(await r.arrayBuffer()); writeFileSync(join(ROOT, "out/voices", `${n}.mp3`), buf);
  const fd = new FormData(); fd.set("model_id", "scribe_v1"); fd.set("file", new Blob([buf]), "a.mp3");
  const t = await (await fetch(API + "/speech-to-text", { method: "POST", headers: { "xi-api-key": key }, body: fd })).json();
  console.log(n, "|", t.text ?? JSON.stringify(t).slice(0, 120));
}
