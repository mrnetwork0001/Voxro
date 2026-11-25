// Read-only tour of the live app: one screenshot (full page) per route, to plan the capture.
import { join } from "node:path";
import { createHash } from "node:crypto";
import { launch, sleep } from "./cdp.mjs";
const ROOT = new URL("..", import.meta.url).pathname;
const BASE = "https://voxro.shieldsuite.xyz";
const code = process.env.BETA_CODE;
const b = await launch({ width: 1600, height: 900 });
await b.send("Network.enable");
const h = createHash("sha256").update("voxro-beta:" + code).digest("hex");
await b.send("Network.setCookie", { name: "voxro_beta", value: h, domain: "voxro.shieldsuite.xyz", path: "/", secure: true });
await b.goto(BASE + "/", 4000);
await b.js(`localStorage.setItem("voxro.tour","done"); for (const k of ["pulse","directory","inbox","start","studio","card","gallery","prover","receipt","outbox"]) localStorage.setItem("voxro.intro."+k,"1");`);
const routes = (process.env.ROUTES || "/,#/pulse,#/directory,#/@voxro,#/start,#/inbox,#/card,#/studio,#/gallery,#/prover").split(",");
for (const r of routes) {
  await b.goto(BASE + "/" + (r === "/" ? "" : r), 7000);
  const name = r.replace(/[^a-z@]/gi, "") || "landing";
  const H = await b.js("document.documentElement.scrollHeight");
  await b.send("Emulation.setDeviceMetricsOverride", { width: 1600, height: Math.min(H, 6000), deviceScaleFactor: 1, mobile: false });
  await sleep(800);
  await b.shot(join(ROOT, ".cache/tour", name + ".png"));
  await b.send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
  console.log(name, H, (await b.js("document.body.innerText.slice(0,300)")).replace(/\s+/g, " "));
}
console.log(b.consoleLines.slice(0, 10));
b.close();
