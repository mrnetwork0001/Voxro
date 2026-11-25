// Half-scale stills of every scene (at 80% of each, or FRAC) -> out/stills/<n>_<id>.png, plus a contact sheet.
import { readFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
const ROOT = new URL("..", import.meta.url).pathname;
const T = JSON.parse(readFileSync(join(ROOT, "src/timing.json"), "utf8"));
const only = process.env.ONLY?.split(",");
const fracs = (process.env.FRAC || "0.8").split(",").map(Number);
mkdirSync(join(ROOT, "out/stills"), { recursive: true });
const files = [];
T.scenes.forEach((s, i) => {
  if (only && !only.includes(s.id)) return;
  for (const fr of fracs) {
    const frame = Math.round((s.from + s.dur * fr) * 30);
    const f = join(ROOT, "out/stills", `${String(i).padStart(2, "0")}_${s.id}_${Math.round(fr * 100)}.png`);
    execFileSync("npx", ["remotion", "still", "src/index.ts", "Demo", f, `--frame=${frame}`, "--scale=0.5", "--log=error"], { cwd: ROOT, stdio: "inherit" });
    files.push(f);
  }
});
if (files.length > 1) {
  const cols = 3, rows = Math.ceil(files.length / cols);
  const layout = files.map((_, k) => `${(k % cols) ? Array.from({ length: k % cols }, () => "w0").join("+") : "0"}_${Math.floor(k / cols) ? Array.from({ length: Math.floor(k / cols) }, () => "h0").join("+") : "0"}`).join("|");
  const args = files.flatMap((f) => ["-i", f]);
  const pad = cols * rows - files.length;
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args, "-filter_complex", `xstack=inputs=${files.length}:layout=${layout}:fill=black,scale=2400:-1`, join(ROOT, "out/sheet.png")]);
  console.log("sheet: out/sheet.png", pad ? `(${pad} empty)` : "");
}
