import { writeFileSync, mkdirSync, existsSync } from "node:fs"; import { join } from "node:path";
import { ROOT, post, retry } from "./env.mjs";
const SFX = {
  key: ["Single soft mechanical keyboard key press, close, dry, short", 0.5],
  ping: ["Short soft phone notification blip, single, clean, dry", 0.5],
  swarm: ["Dozens of phone notification blips piling up faster and faster into chaotic overload, no music, no voices", 4],
  riser: ["Tense airy cinematic riser building to a sharp peak then cut, no drums", 2.5],
  slam: ["Massive heavy steel gate slamming down, deep cinematic impact with warm sub tail, single hit", 2.2],
  deflect: ["Fast digital particles bouncing off a force field and dissolving, crisp, short", 1.2],
  pass: ["Single bright clean glass chime, confident, one note with airy tail", 1.6],
  whoosh: ["Fast smooth cinematic whoosh transition, airy, no music", 0.9],
  boom: ["Deep clean modern logo reveal impact with shimmering tail, single hit", 2.5],
  scan: ["Smooth futuristic scanner sweep passing left to right, electric hum, clean", 2],
  lock: ["Precise magnetic click as small pieces snap together, satisfying, short", 0.6],
  draw: ["Quick laser line drawing sound, thin, clean, precise", 0.9],
  sub: ["Soft deep sub bass drop, short, clean", 1.2],
};
const dir = join(ROOT, "public/audio/sfx"); mkdirSync(dir, { recursive: true });
const only = process.env.ONLY?.split(",");
await Promise.all(Object.entries(SFX).map(async ([n, [text, d]], i) => {
  const f = join(dir, `${n}.mp3`); if (only ? !only.includes(n) : existsSync(f)) return;
  await new Promise((r) => setTimeout(r, i * 700));
  const r = await retry(() => post("/sound-generation?output_format=mp3_44100_128", { text, duration_seconds: d, prompt_influence: 0.5 }));
  writeFileSync(f, Buffer.from(await r.arrayBuffer())); console.log(n);
}));
