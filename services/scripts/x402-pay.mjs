#!/usr/bin/env node
// Minimal x402 client for the Voxro agent gateway: pays a paid priority message with USD₮0 over HTTP.
//   VOXRO_AGENT_KEY=0x… node services/scripts/x402-pay.mjs @handle "subject" "body"
//   node services/scripts/x402-pay.mjs --status <ticketId>        (reads the saved private status URL)
// The key is read from VOXRO_AGENT_KEY or ~/.config/voxro-agent/.env and never printed. The agent needs
// USD₮0 only: the gateway pays the gas. Saved status URLs (bearer tokens) go to ~/.config/voxro-agent/tickets.json.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { privateKeyToAccount } from "viem/accounts";

const GATEWAY = process.env.VOXRO_GATEWAY ?? "https://voxro.shieldsuite.xyz";
const DIR = join(homedir(), ".config/voxro-agent");
const TICKETS = join(DIR, "tickets.json");
const keyFile = join(DIR, ".env");
const key = process.env.VOXRO_AGENT_KEY ?? (existsSync(keyFile) ? readFileSync(keyFile, "utf8").match(/VOXRO_AGENT_KEY=(0x[0-9a-fA-F]{64})/)?.[1] : undefined);
const saved = existsSync(TICKETS) ? JSON.parse(readFileSync(TICKETS, "utf8")) : {};

if (process.argv[2] === "--status") {
  const url = saved[process.argv[3]];
  if (!url) throw new Error("no saved status URL for that ticket");
  console.log(JSON.stringify(await (await fetch(url)).json(), null, 1));
  process.exit(0);
}
if (!key) throw new Error("set VOXRO_AGENT_KEY or create ~/.config/voxro-agent/.env");
const agent = privateKeyToAccount(key);
const [handle, subject, body] = process.argv.slice(2);
if (!handle || !body) throw new Error('usage: x402-pay.mjs @handle "subject" "body"');
const url = `${GATEWAY}/api/agent/send/${handle.replace(/^@/, "")}`;
const post = (headers = {}) => fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ subject, body }) });

// 1. ask: the gateway answers 402 with the price and where to pay
const r1 = await post();
const q = await r1.json();
if (r1.status !== 402) throw new Error(`expected 402, got ${r1.status}: ${JSON.stringify(q)}`);
const req = q.accepts[0];
console.log(`402: ${q.voxro?.price ?? req.maxAmountRequired} to reach ${q.voxro?.inbox} · reply within ${q.voxro?.replyWithin} · payTo ${req.payTo}`);

// 2. sign an EIP-3009 transferWithAuthorization for exactly that amount (no gas for the agent)
const now = Math.floor(Date.now() / 1000);
const authorization = { from: agent.address, to: req.payTo, value: req.maxAmountRequired, validAfter: "0", validBefore: String(now + 600), nonce: `0x${randomBytes(32).toString("hex")}` };
const signature = await agent.signTypedData({
  domain: { name: req.extra.name, version: req.extra.version, chainId: req.extra.chainId, verifyingContract: req.asset },
  types: { TransferWithAuthorization: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" }] },
  primaryType: "TransferWithAuthorization",
  message: { ...authorization, value: BigInt(authorization.value), validAfter: 0n, validBefore: BigInt(authorization.validBefore) },
});
const xPayment = Buffer.from(JSON.stringify({ x402Version: 1, scheme: "exact", network: req.network, payload: { signature, authorization } })).toString("base64");

// 3. pay: the gateway settles the transfer, locks the message in escrow and returns the ticket
const r2 = await post({ "X-PAYMENT": xPayment });
const out = await r2.json();
if (r2.status !== 200) throw new Error(`payment failed (${r2.status}): ${JSON.stringify(out)}`);
saved[out.ticketId] = out.status;
writeFileSync(TICKETS, JSON.stringify(saved, null, 1), { mode: 0o600 });
console.log(`200: ticket #${out.ticketId} to ${out.inbox} · paid ${out.paid} · reply within ${out.replyWithin} · lock tx ${out.lockTx}`);
console.log(`settlement: ${r2.headers.get("x-payment-response") ? JSON.parse(Buffer.from(r2.headers.get("x-payment-response"), "base64").toString()).transaction : "?"}`);
console.log(`status saved privately; check with: node services/scripts/x402-pay.mjs --status ${out.ticketId}`);
