// Finds a ticket's real lock, reply and claim transactions on X Layer -> data/ticket.json (read-only).
//   node scripts/ticket.mjs [ticketId=1]
import { writeFileSync } from "node:fs";
import { join } from "node:path";
const ROOT = new URL("..", import.meta.url).pathname;
const RPC = "https://rpc.xlayer.tech";
let n = 0;
const call = async (method, params) => { const r = await (await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++n, method, params }) })).json(); if (r.error) throw new Error(JSON.stringify(r.error)); return r.result; };
const ESC = "0xd463a83b572AC72C8bE328069d61d2B19Cdf73D5".toLowerCase(), HUB = "0xe61A9C7213a6Aa616C246a2B569e555B417b25ee".toLowerCase();
const TOPIC = { TicketLocked: "0x", Claimed: "0x" };
const id = BigInt(process.argv[2] ?? 1);
const idTopic = "0x" + id.toString(16).padStart(64, "0");
const head = parseInt(await call("eth_blockNumber", []), 16);
const tsOf = async (b) => parseInt((await call("eth_getBlockByNumber", ["0x" + b.toString(16), false])).timestamp, 16);
async function blockAt(ts) { let lo = head - 20000, hi = head; while (hi - lo > 1) { const m = Math.floor((lo + hi) / 2); (await tsOf(m)) < ts ? (lo = m) : (hi = m); } return hi; }
// the ticket's createdAt / reply time come from the Lens (via the app); here we scan the escrow's logs for it
const created = Number(process.env.CREATED ?? 1795630780), replied = Number(process.env.REPLIED ?? 1795631047);
const out = { ticketId: Number(id), txs: [] };
for (const [label, ts, span] of [["lock", created, 40], ["reply+claim", replied, 400]]) {
  const b0 = await blockAt(ts) - 5;
  for (let b = b0; b < Math.min(b0 + span, head); b += 100) {
    const logs = await call("eth_getLogs", [{ fromBlock: "0x" + b.toString(16), toBlock: "0x" + Math.min(b + 99, head).toString(16), address: [ESC, HUB] }]);
    for (const l of logs) {
      const isTicket = l.address.toLowerCase() === ESC && l.topics[1] === idTopic;
      const isHub = l.address.toLowerCase() === HUB;
      if (!isTicket && !isHub) continue;
      if (out.txs.some((x) => x.hash === l.transactionHash)) continue;
      const rc = await call("eth_getTransactionReceipt", [l.transactionHash]);
      const bt = await tsOf(parseInt(l.blockNumber, 16));
      out.txs.push({ hash: l.transactionHash, block: parseInt(l.blockNumber, 16), utc: new Date(bt * 1000).toISOString(), from: rc.from, to: rc.to, status: rc.status === "0x1" ? "success" : "failed", contract: l.address.toLowerCase() === ESC ? "VoxroEscrow" : "DeWebHub", topic0: l.topics[0] });
    }
  }
}
out.txs.sort((a, b) => a.block - b.block);
writeFileSync(join(ROOT, "data/ticket.json"), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
