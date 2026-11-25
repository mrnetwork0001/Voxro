// Transcribes a file back, to check every line stays intelligible in the mix.
import { readFileSync } from "node:fs"; import { key, API } from "./env.mjs";
const fd = new FormData(); fd.set("model_id", "scribe_v1"); fd.set("file", new Blob([readFileSync(process.argv[2])]), "a.mp3");
console.log((await (await fetch(API + "/speech-to-text", { method: "POST", headers: { "xi-api-key": key }, body: fd })).json()).text);
