/**
 * Voxro agent gateway: x402 payments and a hosted MCP endpoint.
 *
 *   POST /api/agent/send/:handle {subject, body}   → 402 with the live USD₮0 price (x402 "exact", X Layer)
 *        … retry with X-PAYMENT (EIP-3009 transferWithAuthorization) → message locked in VoxroEscrow
 *   GET  /api/agent/ticket/:id?token=…              → status, and the decrypted reply once answered
 *   GET  /api/agent/inboxes, /api/agent/inbox/:h   → live prices (free)
 *   POST /mcp                                       → MCP over HTTP (read tools + x402 instructions)
 *
 * The gateway wallet only fronts the escrow lock for x402 agents: it is the onchain sender, so refunds
 * land here first and a keeper loop forwards every refund to the agent that paid. Env (/etc/voxro-gateway.env):
 * GATEWAY_KEY, optional GATEWAY_PORT (4791), GATEWAY_DATA_DIR.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { XLAYER, type Address, type Hex } from '@voxro/sdk';
import { erc20Abi, parseAbi, verifyTypedData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { readReply, refund, sendPaid, wallet } from './agent.js';
import { ORIGIN, chainNow, client, directory, hours, inboxByHandle, ladder, money, normHandle, profileLink, ticket as readTicket } from './chain.js';
import { handleRpc } from './tools.js';

const KEY = process.env.GATEWAY_KEY as Hex | undefined;
if (!KEY || !/^0x[0-9a-fA-F]{64}$/.test(KEY)) throw new Error('GATEWAY_KEY missing');
const gw = privateKeyToAccount(KEY);
const PORT = Number(process.env.GATEWAY_PORT ?? 4791);
const DIR = process.env.GATEWAY_DATA_DIR ?? '/var/lib/voxro-gateway';
const USDT0 = XLAYER.usdt0;
const NETWORK = 'eip155:196';
const DOMAIN = { name: 'USD₮0', version: '1', chainId: 196, verifyingContract: USDT0 } as const;
const TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const;
const usdt0Abi = parseAbi([
  'function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, bytes signature)',
  'function authorizationState(address authorizer, bytes32 nonce) view returns (bool)',
]);

// ─── state: which agent paid for which ticket ───────────────────────────────────────────────
interface Paid {
  payer: Address;
  token: string;
  amount: string;
  access: string; // bearer token that lets the paying agent read status and reply
  forwarded?: string; // refund forwarded to payer (tx)
}
mkdirSync(DIR, { recursive: true, mode: 0o700 });
const FILE = `${DIR}/tickets.json`;
const paid: Record<string, Paid> = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : {};
const save = () => {
  writeFileSync(`${FILE}.tmp`, JSON.stringify(paid, null, 1), { mode: 0o600 });
  renameSync(`${FILE}.tmp`, FILE);
};

// ─── http helpers ───────────────────────────────────────────────────────────────────────────
const hits = new Map<string, number[]>();
function limited(req: IncomingMessage, max = 30): boolean {
  const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '').split(',')[0]!.trim();
  const now = Date.now();
  const r = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  hits.set(ip, [...r, now]);
  if (hits.size > 5000) hits.clear();
  return r.length >= max;
}
function body(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let b = '';
    req.on('data', (c) => {
      b += c;
      if (b.length > 64_000) req.destroy(new Error('too large'));
    });
    req.on('end', () => resolve(b));
    req.on('error', reject);
  });
}
function send(res: ServerResponse, code: number, data: unknown, headers: Record<string, string> = {}) {
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*', 'access-control-expose-headers': 'X-PAYMENT-RESPONSE', ...headers });
  res.end(JSON.stringify(data, null, 1));
}
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64');

// access token per ticket so only the paying agent can read the reply
const tokenFor = (id: number) => paid[String(id)]?.access;
const sameToken = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// ─── x402 ───────────────────────────────────────────────────────────────────────────────────
function requirements(resource: string, price: bigint, handle: string) {
  return {
    scheme: 'exact',
    network: NETWORK,
    maxAmountRequired: price.toString(),
    resource,
    description: `Paid priority message to @${handle} on Voxro. Held in escrow; 100% refunded to the payer if not answered in time.`,
    mimeType: 'application/json',
    payTo: gw.address,
    maxTimeoutSeconds: 300,
    asset: USDT0,
    extra: { name: DOMAIN.name, version: DOMAIN.version, chainId: 196 },
  };
}

interface XPayment {
  x402Version: number;
  scheme: string;
  network: string;
  payload: { signature: Hex; authorization: { from: Address; to: Address; value: string; validAfter: string; validBefore: string; nonce: Hex } };
}

async function settle(xp: XPayment, price: bigint): Promise<{ payer: Address; tx: Hex }> {
  if (xp.scheme !== 'exact' || (xp.network !== NETWORK && xp.network !== 'x-layer' && xp.network !== 'xlayer')) throw new Error('Unsupported scheme or network: use exact on eip155:196');
  const a = xp.payload.authorization;
  const now = Math.floor(Date.now() / 1000);
  if (a.to.toLowerCase() !== gw.address.toLowerCase()) throw new Error('Payment must be made to the gateway address in payTo');
  if (BigInt(a.value) < price) throw new Error(`Payment of ${a.value} is below the price ${price}`);
  if (Number(a.validAfter) > now || Number(a.validBefore) < now + 30) throw new Error('Authorization is not valid now');
  const valid = await verifyTypedData({ address: a.from, domain: DOMAIN, types: TYPES, primaryType: 'TransferWithAuthorization', message: { from: a.from, to: a.to, value: BigInt(a.value), validAfter: BigInt(a.validAfter), validBefore: BigInt(a.validBefore), nonce: a.nonce }, signature: xp.payload.signature });
  if (!valid) throw new Error('Invalid payment signature');
  if (await client.readContract({ address: USDT0, abi: usdt0Abi, functionName: 'authorizationState', args: [a.from, a.nonce] })) throw new Error('This authorization was already used');
  const w = wallet(gw);
  const args = [a.from, a.to, BigInt(a.value), BigInt(a.validAfter), BigInt(a.validBefore), a.nonce, xp.payload.signature] as const;
  await client.simulateContract({ account: gw, address: USDT0, abi: usdt0Abi, functionName: 'transferWithAuthorization', args });
  const tx = await w.writeContract({ address: USDT0, abi: usdt0Abi, functionName: 'transferWithAuthorization', args });
  const rc = await client.waitForTransactionReceipt({ hash: tx });
  if (rc.status !== 'success') throw new Error('Payment transfer failed');
  return { payer: a.from, tx };
}

async function sendRoute(req: IncomingMessage, res: ServerResponse, handle: string) {
  const ib = await inboxByHandle(handle, gw.address);
  if (!ib) return send(res, 404, { error: `No Voxro inbox called @${normHandle(handle)}` });
  if (ib.token.toLowerCase() !== USDT0.toLowerCase()) return send(res, 400, { error: `@${ib.handle} is priced in another token; x402 here supports USD₮0. Use the Voxro MCP server with your own wallet.` });
  if (!ib.active || !ib.quote.canSend) return send(res, 409, { error: `@${ib.handle} is not accepting new senders right now` });
  let msg: { subject?: string; body?: string };
  try {
    msg = JSON.parse((await body(req)) || '{}');
  } catch {
    return send(res, 400, { error: 'Body must be JSON: {"subject": "...", "body": "..."}' });
  }
  if (!msg.body || typeof msg.body !== 'string' || msg.body.length > 8000) return send(res, 400, { error: 'body is required (max 8000 characters)' });
  const price = ib.quote.price;
  const resource = `${ORIGIN}/api/agent/send/${ib.handle}`;
  const header = req.headers['x-payment'];
  if (!header || Array.isArray(header)) {
    return send(res, 402, { x402Version: 1, error: 'X-PAYMENT header is required', accepts: [requirements(resource, price, ib.handle)], voxro: { inbox: ib.handle, price: money(ib.token, price), replyWithin: hours(ib.slaSeconds), refund: '100% to the payer if there is no reply in time' } });
  }
  let xp: XPayment;
  try {
    xp = JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
  } catch {
    return send(res, 400, { error: 'X-PAYMENT must be base64-encoded JSON' });
  }
  let settled: { payer: Address; tx: Hex };
  try {
    settled = await settle(xp, price);
  } catch (e) {
    return send(res, 402, { x402Version: 1, error: (e as Error).message.split('\n')[0], accepts: [requirements(resource, price, ib.handle)] });
  }
  try {
    const r = await sendPaid(gw, { handle: ib.handle, subject: String(msg.subject ?? '').slice(0, 200), body: msg.body, maxPrice: BigInt(xp.payload.authorization.value) });
    const access = randomBytes(18).toString('base64url');
    paid[String(r.ticketId)] = { payer: settled.payer, token: USDT0, amount: r.priceRaw, access };
    save();
    // anything paid above the live price goes straight back
    const extra = BigInt(xp.payload.authorization.value) - BigInt(r.priceRaw);
    if (extra > 0n) await wallet(gw).writeContract({ address: USDT0, abi: erc20Abi, functionName: 'transfer', args: [settled.payer, extra] }).catch(() => {});
    return send(
      res,
      200,
      { ok: true, ticketId: r.ticketId, inbox: r.inbox, paid: r.price, replyWithin: hours(r.replyWithin), status: `${ORIGIN}/api/agent/ticket/${r.ticketId}?token=${access}`, lockTx: r.tx },
      { 'X-PAYMENT-RESPONSE': b64({ success: true, transaction: settled.tx, network: NETWORK, payer: settled.payer }) },
    );
  } catch (e) {
    // the lock failed after payment: return the money
    const back = await wallet(gw).writeContract({ address: USDT0, abi: erc20Abi, functionName: 'transfer', args: [settled.payer, BigInt(xp.payload.authorization.value)] }).catch(() => null);
    return send(res, 409, { error: `Could not lock the message: ${(e as Error).message.split('\n')[0]}`, refunded: Boolean(back), refundTx: back });
  }
}

async function ticketRoute(res: ServerResponse, id: number, token: string) {
  const expect = tokenFor(id);
  if (!expect || !token || !sameToken(token, expect)) return send(res, 404, { error: 'Unknown ticket or token' });
  const r = await readReply(gw, id);
  const p = paid[String(id)]!;
  return send(res, 200, { ticketId: id, status: r.status, amount: r.amount, deadline: new Date(r.deadline * 1000).toISOString(), ...(r.reply ? { reply: r.reply } : {}), ...(p.forwarded ? { refundForwardedTx: p.forwarded } : {}) });
}

// ─── keeper: refund expired x402 tickets and forward refunds to the paying agent ────────────
async function keeper() {
  if (!Object.values(paid).some((p) => !p.forwarded)) return;
  const now = await chainNow();
  for (const [id, p] of Object.entries(paid)) {
    if (p.forwarded) continue;
    const t = await readTicket(Number(id));
    let amount = 0n;
    if (t.status === 'Pending' && t.deadline < now) {
      await refund(gw, Number(id));
      amount = t.amount;
    } else if (t.status === 'Declined') amount = t.amount;
    else if (t.status === 'Refunded') amount = t.amount - (t.amount * 10n) / 10_000n; // a third-party keeper took its 0.1% tip
    else if (t.status === 'Claimed') {
      p.forwarded = 'answered';
      continue;
    }
    if (amount > 0n) {
      const tx = await wallet(gw).writeContract({ address: t.token, abi: erc20Abi, functionName: 'transfer', args: [p.payer, amount] });
      await client.waitForTransactionReceipt({ hash: tx });
      p.forwarded = tx;
      console.log(`forwarded refund for #${id} to ${p.payer}: ${tx}`);
    }
  }
  save();
}

// ─── server ─────────────────────────────────────────────────────────────────────────────────
const DOC = {
  name: 'Voxro agent gateway',
  about: 'Reach a human on Voxro, a paid priority inbox on X Layer. Pay with x402 (USD₮0, EIP-3009). The payment is held in escrow; the human earns it only by replying in time, otherwise 100% comes back to the payer.',
  endpoints: {
    'GET /api/agent/inboxes': 'who you can reach and the live price',
    'GET /api/agent/inbox/:handle': 'live price, price ladder and reply record',
    'POST /api/agent/send/:handle': 'body {"subject","body"}; responds 402 with x402 requirements, then retry with X-PAYMENT',
    'GET /api/agent/ticket/:id?token=': 'status and the decrypted reply',
    'POST /mcp': 'Model Context Protocol (JSON-RPC over HTTP)',
  },
  payTo: '',
  network: NETWORK,
  asset: USDT0,
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://x');
    const p = url.pathname.replace(/\/+$/, '');
    if (req.method === 'OPTIONS') return send(res, 204, {}, { 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type,x-payment,mcp-protocol-version,mcp-session-id' });
    if (limited(req)) return send(res, 429, { error: 'Too many requests' });
    if (p === '/mcp') {
      if (req.method !== 'POST') return send(res, 405, { error: 'POST JSON-RPC to /mcp' });
      const input = JSON.parse((await body(req)) || 'null');
      const batch = Array.isArray(input) ? input : [input];
      const out = (await Promise.all(batch.map((m) => handleRpc(m, { gateway: ORIGIN })))).filter(Boolean);
      if (!out.length) {
        res.writeHead(202).end();
        return;
      }
      return send(res, 200, Array.isArray(input) ? out : out[0]);
    }
    if (p === '/api/agent' && req.method === 'GET') return send(res, 200, { ...DOC, payTo: gw.address });
    if (p === '/api/agent/inboxes' && req.method === 'GET') {
      const all = (await directory(gw.address)).filter((i) => i.active);
      return send(res, 200, all.map((i) => ({ handle: i.handle, price: money(i.token, i.quote.price), priceRaw: i.quote.price.toString(), token: i.token, replyWithin: hours(i.slaSeconds), answered: i.answered, refunded: i.refunded, profile: profileLink(i.handle) })));
    }
    let m = p.match(/^\/api\/agent\/inbox\/@?([A-Za-z0-9_]{1,31})$/);
    if (m && req.method === 'GET') {
      const ib = await inboxByHandle(m[1]!, gw.address);
      if (!ib) return send(res, 404, { error: 'not found' });
      return send(res, 200, { handle: ib.handle, preset: ib.preset, active: ib.active, price: money(ib.token, ib.quote.price), priceRaw: ib.quote.price.toString(), token: ib.token, queue: ib.queue, ladder: ladder(ib).map((x) => money(ib.token, x)), replyWithin: hours(ib.slaSeconds), answered: ib.answered, refunded: ib.refunded, profile: profileLink(ib.handle) });
    }
    m = p.match(/^\/api\/agent\/send\/@?([A-Za-z0-9_]{1,31})$/);
    if (m && req.method === 'POST') return await sendRoute(req, res, m[1]!);
    m = p.match(/^\/api\/agent\/ticket\/(\d+)$/);
    if (m && req.method === 'GET') return await ticketRoute(res, Number(m[1]), url.searchParams.get('token') ?? '');
    return send(res, 404, { error: 'Not found. See GET /api/agent' });
  } catch (e) {
    console.error(req.method, req.url, (e as Error).message);
    if (!res.headersSent) send(res, 500, { error: 'Something went wrong; please retry' });
  }
}).listen(PORT, '127.0.0.1', () => console.log(`voxro gateway on 127.0.0.1:${PORT} · payTo ${gw.address}`));

setInterval(() => void keeper().catch((e) => console.error("keeper", e.message)), Number(process.env.KEEPER_MS ?? 60_000));
