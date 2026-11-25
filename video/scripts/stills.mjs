import { bundle } from "@remotion/bundler"; import { renderStill, selectComposition } from "@remotion/renderer"; import { mkdirSync, rmSync } from "node:fs"; import { join } from "node:path";
const ROOT = new URL("..", import.meta.url).pathname; const out = join(ROOT, "out/stills"); rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
const serveUrl = await bundle({ entryPoint: join(ROOT, "src/index.ts"), publicDir: join(ROOT, "public") });
const composition = await selectComposition({ serveUrl, id: "Teaser" });
for (const s of process.argv.slice(2).map(Number)) await renderStill({ composition, serveUrl, frame: Math.round(s * 60), output: join(out, `s${s.toFixed(2).padStart(5, "0")}.png`), scale: 0.4 });
