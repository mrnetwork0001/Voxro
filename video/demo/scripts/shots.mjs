// README screenshots of the live app (read-only, no wallet): 1600x900 CSS at 2x -> docs/screenshots/*.png
import { join } from "node:path";
import { launch, sleep } from "./cdp.mjs";
const OUT = new URL("../../../docs/screenshots/", import.meta.url).pathname;
const BASE = "https://voxro.shieldsuite.xyz/";
const b = await launch({ width: 1600, height: 900, extraArgs: ["--force-device-scale-factor=2"] });
await b.send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 900, deviceScaleFactor: 2, mobile: false });
await b.goto(BASE, 4000);
await b.js(`localStorage.setItem("voxro.tour","done"); for (const k of ["pulse","directory","inbox","start","studio","card","gallery","prover","receipt","outbox"]) localStorage.setItem("voxro.intro."+k,"1");`);
const shots = [
  ["landing", "", 0],
  ["directory", "#/@voxro", 0],
  ["receipt", "#/receipt/1", 0],
  ["prover", "#/prover/%234%402.438", 0],
];
for (const [name, route] of shots) {
  await b.goto(BASE + route, 10000);
  if (name === "prover") {
    // run the prover on VOXR #4 and wait for the 512 ✓ result
    await b.js(`[...document.querySelectorAll('button')].find((x) => x.textContent.trim().startsWith('Load'))?.click()`);
    for (let i = 0; i < 40 && !(await b.js(`/512 ✓|Every transition matches/.test(document.body.innerText)`)); i++) await sleep(750);
    await sleep(1500);
  }
  await b.js("window.scrollTo(0,0)");
  await sleep(800);
  await b.shot(join(OUT, `${name}.png`));
  console.log(name, (await b.js("document.body.innerText.slice(0,120)")).replace(/\s+/g, " "));
}
b.close();
