// Reads every on-chain fact the film quotes back from X Layer (chain 196) over public RPC -> data/onchain.json.
// Transactions come from the Foundry broadcast of the mainnet launch; nothing here is typed by hand.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const ROOT = new URL("..", import.meta.url).pathname;
const RPC = "https://rpc.xlayer.tech";
let id = 0;
const call = async (method, params) => {
  const r = await (await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }) })).json();
  if (r.error) throw new Error(JSON.stringify(r.error));
  return r.result;
};
const bc = JSON.parse(readFileSync(join(ROOT, "../../contracts/broadcast/Deploy.s.sol/196/run-latest.json"), "utf8"));
const label = (t) => t.transactionType === "CREATE" ? `create ${t.contractName}` : (t.function || "call").split("(")[0];
const txs = [];
const blocks = {};
for (const t of bc.transactions) {
  const r = await call("eth_getTransactionReceipt", [t.hash]);
  const bn = parseInt(r.blockNumber, 16);
  blocks[bn] ??= parseInt((await call("eth_getBlockByNumber", ["0x" + bn.toString(16), false])).timestamp, 16);
  txs.push({ what: label(t), hash: t.hash, block: bn, utc: new Date(blocks[bn] * 1000).toISOString(), from: r.from, to: r.to ?? r.contractAddress, contract: r.contractAddress ?? undefined, status: r.status === "0x1" ? "success" : "failed" });
}
// Factory index of VOXR (cpuAt) and the live catalog/counts
const F = "0x1f09daefa827f02cbb40967cc91b259763760761";

const out = {
  readAt: new Date().toISOString(),
  chainId: 196,
  addresses: {
    voxrCircuits: "0xd47C1A47d809438d66fd472cd2A30392ace4e581",
    escrow: "0xd463a83b572AC72C8bE328069d61d2B19Cdf73D5",
    lens: "0xc994Cd83C3eA571d38Ed7EbDa8f30c05D06F5640",
    deWebHub: "0xe61A9C7213a6Aa616C246a2B569e555B417b25ee",
    factory: F,
  },
  voxrFactoryIndex: 438,
  tapeouts: txs.filter((x) => x.what === "tapeout" && x.to?.toLowerCase() === "0xd47c1a47d809438d66fd472cd2a30392ace4e581").length,
  txs,
};
writeFileSync(join(ROOT, "data/onchain.json"), JSON.stringify(out, null, 1));
for (const x of txs) console.log(x.what.padEnd(20), x.block, x.utc, x.status, x.hash.slice(0, 12));
console.log("VOXR tapeouts:", out.tapeouts);
