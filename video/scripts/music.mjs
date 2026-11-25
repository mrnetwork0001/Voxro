// Two cues, same key and tempo: tension (under the problem) and groove (from the word "Voxro").
import { writeFileSync, existsSync } from "node:fs"; import { join } from "node:path";
import { ROOT, post, retry } from "./env.mjs";
const CUES = {
  tension: [12000, "Dark cinematic electronic tension cue for a premium tech product teaser, D minor, 112 BPM, instrumental, no vocals. Starts immediately with a low sub pulse and a dry ticking hi-hat, glassy notification-like blips multiply and stack up, anxiety rises steadily, distorted synth swell grows, no drop, no drums, ends on a sharp riser."],
  groove: [22000, "Confident modern electronic groove for a premium tech product reveal, D minor, 112 BPM, instrumental, no vocals. Starts instantly at full energy on the very first beat with a huge clean hit, punchy kick, wide warm analog bass, bright precise arpeggio, crisp claps. Keeps driving at full energy all the way, sleek and triumphant, no intro, no breakdown."],
};
for (const [n, [ms, prompt]] of Object.entries(CUES)) {
  const f = join(ROOT, `public/audio/${n}.mp3`); if (existsSync(f) && !process.env.ONLY?.includes(n)) continue;
  const buf = await retry(async () => Buffer.from(await (await post("/music?output_format=mp3_44100_192", { prompt, music_length_ms: ms, force_instrumental: true })).arrayBuffer()), 2);
  writeFileSync(f, buf); console.log(n);
}
