import { writeFileSync, mkdirSync, existsSync } from "node:fs"; import { join } from "node:path";
import { ROOT, post, retry } from "./env.mjs";
const SFX = {
  gates: ["A fast cascade of tiny crisp digital clicks as hundreds of small tiles snap into a grid, clean, ends with three deeper clicks", 1.8],
  ping: ["Short soft phone notification blip, single, clean, dry", 0.5],
  swarm: ["Dozens of phone notification blips piling up faster and faster into overload, no music, no voices", 4],
  stamp: ["Heavy rubber stamp hitting paper, single hit, dry, punchy", 0.7],
  count: ["Quick rising digital counter ticking up, clean, ends on a soft ding", 1.3],
  riser: ["Tense airy cinematic riser building to a sharp peak then cut, no drums", 3],
  boom: ["Deep clean modern logo reveal impact with shimmering tail, single hit", 2.5],
  whoosh: ["Fast smooth cinematic whoosh transition, airy, no music", 0.8],
  typing: ["Soft quiet laptop keyboard typing, steady, close, no voices", 3],
  lock: ["Precise magnetic click as a vault latch locks, satisfying, short", 0.7],
  relay: ["Single crisp electromechanical relay click, small, clean", 0.5],
  chime: ["Single bright clean glass chime, confident, one note with airy tail", 1.5],
  scan: ["Smooth futuristic scanner sweep with fast data ticks, electric, clean", 2],
  pop: ["Soft UI card pop, gentle, short, clean", 0.5],
};
const dir = join(ROOT, "public/audio/sfx"); mkdirSync(dir, { recursive: true });
const only = process.env.ONLY?.split(",");
await Promise.all(Object.entries(SFX).map(async ([n, [text, d]], i) => {
  const f = join(dir, `${n}.mp3`); if (only ? !only.includes(n) : existsSync(f)) return;
  await new Promise((r) => setTimeout(r, i * 700));
  const r = await retry(() => post("/sound-generation?output_format=mp3_44100_128", { text, duration_seconds: d, prompt_influence: 0.5 }));
  writeFileSync(f, Buffer.from(await r.arrayBuffer())); console.log(n);
}));
