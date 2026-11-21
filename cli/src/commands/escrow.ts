import {
  XLAYER,
  ZERO_REF,
  bytes32ToHandle,
  bytesToHex,
  deWebHubAbi,
  encodeContent,
  endpointHex,
  escrowEndpoint,
  handleToBytes32,
  hexToBytes,
  randomKeyPair,
  seal,
  voxroEscrowAbi,
  voxroLensAbi,
  type Address,
} from '@voxro/sdk';
import { randomBytes } from '@noble/hashes/utils.js';
import { createWalletClient, formatUnits, http, parseAbi, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { xLayer } from 'viem/chains';
import { CliError, bold, client, cyan, dim, green, isAddress, num, rpcUrl, str, yellow, type Flags } from '../util.js';

const TIER = ['1.0×', '1.5×', '2.5×', '4.0×'];
const erc20Abi = parseAbi(['function approve(address,uint256) returns (bool)', 'function allowance(address,address) view returns (uint256)', 'function decimals() view returns (uint8)', 'function symbol() view returns (string)']);

function escrowAddr(f: Flags): Address {
  const a = str(f, 'escrow') ?? process.env.VOXRO_ESCROW;
  if (!a || !isAddress(a)) throw new CliError('escrow address required: --escrow 0x… or VOXRO_ESCROW');
  return a;
}
function lensAddr(f: Flags): Address | undefined {
  const a = str(f, 'lens') ?? process.env.VOXRO_LENS;
  return a && isAddress(a) ? a : undefined;
}

async function resolveInbox(f: Flags, target: string): Promise<bigint> {
  if (/^\d+$/.test(target)) return BigInt(target);
  const pc = client(f);
  const id = await pc.readContract({ address: escrowAddr(f), abi: voxroEscrowAbi, functionName: 'handleToInbox', args: [handleToBytes32(target)] });
  if (id === 0n) throw new CliError(`no inbox registered for @${target.replace(/^@/, '')}`);
  return id;
}

async function tokenInfo(f: Flags, token: Address): Promise<{ symbol: string; decimals: number }> {
  if (token === '0x0000000000000000000000000000000000000000') return { symbol: 'OKB', decimals: 18 };
  const pc = client(f);
  const [symbol, decimals] = await Promise.all([
    pc.readContract({ address: token, abi: erc20Abi, functionName: 'symbol' }),
    pc.readContract({ address: token, abi: erc20Abi, functionName: 'decimals' }),
  ]);
  return { symbol, decimals };
}

export async function quote(f: Flags): Promise<void> {
  const target = f._[1];
  if (!target) throw new CliError('usage: voxro quote <@handle|inboxId> [--sender 0x..] [--escrow 0x..]');
  const pc = client(f);
  const escrow = escrowAddr(f);
  const id = await resolveInbox(f, target);
  const sender = (str(f, 'sender') ?? '0x0000000000000000000000000000000000000001') as Address;
  const [ib, q, members] = await Promise.all([
    pc.readContract({ address: escrow, abi: voxroEscrowAbi, functionName: 'getInbox', args: [id] }),
    pc.readContract({ address: escrow, abi: voxroEscrowAbi, functionName: 'quoteSend', args: [id, sender] }),
    pc.readContract({ address: escrow, abi: voxroEscrowAbi, functionName: 'membersOf', args: [id] }),
  ]);
  const t = await tokenInfo(f, ib.paymentToken as Address);
  const q7 = Number(BigInt(ib.latchState) & 7n);
  console.log(bold(`inbox #${id} @${bytes32ToHandle(ib.handle)}`), dim(`policy #${ib.policyCircuitId} on ${ib.policyCpu}`));
  console.log(`  queue      Q = ${q7}  ${'█'.repeat(q7)}${'░'.repeat(7 - q7)}   pending ${ib.pending} · answered ${ib.answered} · refunded ${ib.refunded}`);
  console.log(`  quote      ${q.canSend ? green(`${formatUnits(q.price, t.decimals)} ${t.symbol}`) : yellow('PAUSED for this sender')}  tier ${q.tier} (${TIER[q.tier]})${q.vipDiscount ? ' · VIP 50% off' : ''}${q.allowlisted ? ' · allowlisted' : ''}`);
  console.log(`  base       ${formatUnits(ib.basePrice, t.decimals)} ${t.symbol} · window ${Number(ib.slaSeconds) / 3600} h · members ${members.length}`);
  if (f.json) console.log(JSON.stringify({ id: id.toString(), queue: q7, canSend: q.canSend, price: q.price.toString(), tier: q.tier, vipDiscount: q.vipDiscount }, null, 2));
}

function signer(f: Flags) {
  const pk = process.env.VOXRO_PRIVATE_KEY;
  if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) throw new CliError('VOXRO_PRIVATE_KEY env var (0x…64 hex) is required for writes; never pass keys as arguments');
  const account = privateKeyToAccount(pk as Hex);
  return createWalletClient({ account, chain: xLayer, transport: http(rpcUrl(f)) });
}

/** Seal a Guest Express envelope to every usable member key and lock the quoted stake. */
async function guestSend(f: Flags, id: bigint, subject: string, body: string): Promise<{ hash: Hex; price: bigint; symbol: string; decimals: number }> {
  const pc = client(f);
  const escrow = escrowAddr(f);
  const wc = signer(f);
  const sender = wc.account.address;
  const [ib, q, memberIds] = await Promise.all([
    pc.readContract({ address: escrow, abi: voxroEscrowAbi, functionName: 'getInbox', args: [id] }),
    pc.readContract({ address: escrow, abi: voxroEscrowAbi, functionName: 'quoteSend', args: [id, sender] }),
    pc.readContract({ address: escrow, abi: voxroEscrowAbi, functionName: 'memberIdsOf', args: [id] }),
  ]);
  if (!q.canSend) throw new CliError('inbox is paused for this sender (Q = 7)');
  const keys = await Promise.all(memberIds.map((m) => pc.readContract({ address: XLAYER.deWebHub, abi: deWebHubAbi, functionName: 'keyFor', args: [m.circuits as Address, BigInt(m.tokenId)] })));
  const usable = keys.filter((k) => k.usable);
  if (usable.length === 0) throw new CliError('no member of this inbox has a usable TapeSend key yet');
  const replyKey = randomKeyPair(randomBytes);
  const envelope = seal({
    content: encodeContent({ subject, body, ts: Math.floor(Date.now() / 1000) }),
    recipients: usable.map((k) => hexToBytes(k.key)),
    to: endpointHex(usable[0]!.container as Address),
    from: escrowEndpoint(escrow),
    hub: XLAYER.deWebHub,
    ref: ZERO_REF,
    chainId: 196,
  });
  const t = await tokenInfo(f, ib.paymentToken as Address);
  const token = ib.paymentToken as Address;
  if (token !== '0x0000000000000000000000000000000000000000') {
    const allowance = await pc.readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [sender, escrow] });
    if (allowance < q.price) {
      const h = await wc.writeContract({ address: token, abi: erc20Abi, functionName: 'approve', args: [escrow, q.price * 10n] });
      await pc.waitForTransactionReceipt({ hash: h });
    }
  }
  const hash = await wc.writeContract({
    address: escrow,
    abi: voxroEscrowAbi,
    functionName: 'sendGuestPriority',
    args: [id, bytesToHex(replyKey.publicKey), bytesToHex(envelope)],
    value: token === '0x0000000000000000000000000000000000000000' ? q.price : 0n,
  });
  const rcpt = await pc.waitForTransactionReceipt({ hash });
  if (rcpt.status !== 'success') throw new CliError(`transaction reverted: ${hash}`);
  console.log(dim(`  guest reply secret (keep to decrypt the reply): ${bytesToHex(replyKey.secretKey)}`));
  return { hash, price: q.price, symbol: t.symbol, decimals: t.decimals };
}

export async function send(f: Flags): Promise<void> {
  const target = f._[1];
  const body = str(f, 'body');
  if (!target || !body) throw new CliError('usage: voxro send <@handle|inboxId> --body "…" [--subject "…"] [--escrow 0x..]   (signer: VOXRO_PRIVATE_KEY)');
  const id = await resolveInbox(f, target);
  const r = await guestSend(f, id, str(f, 'subject') ?? '', body);
  console.log(green('locked'), `${formatUnits(r.price, r.decimals)} ${r.symbol}`, dim(`tx ${r.hash}`));
}

/** Demo-day spam burst: n Guest Express messages in a row, printing the live ladder. */
export async function stress(f: Flags): Promise<void> {
  const target = f._[1];
  if (!target) throw new CliError('usage: voxro stress <@handle|inboxId> [--n 7] [--interval 1500] [--escrow 0x..]   (signer: VOXRO_PRIVATE_KEY)');
  const n = num(f, 'n', 7);
  const interval = num(f, 'interval', 1500);
  const id = await resolveInbox(f, target);
  const pc = client(f);
  const escrow = escrowAddr(f);
  for (let i = 0; i < n; i++) {
    const ib = await pc.readContract({ address: escrow, abi: voxroEscrowAbi, functionName: 'getInbox', args: [id] });
    const before = Number(BigInt(ib.latchState) & 7n);
    try {
      const r = await guestSend(f, id, `stress ${i + 1}`, `burst message ${i + 1} of ${n}`);
      const after = await pc.readContract({ address: escrow, abi: voxroEscrowAbi, functionName: 'queueDepth', args: [id] });
      console.log(cyan(`#${i + 1}`), `Q ${before}→${after}`, bold(`${formatUnits(r.price, r.decimals)} ${r.symbol}`), dim(r.hash));
    } catch (e) {
      console.log(yellow(`#${i + 1}`), `Q ${before}`, (e as Error).message);
      if ((e as Error).message.includes('paused')) break;
    }
    if (i < n - 1) await new Promise((r) => setTimeout(r, interval));
  }
  const lens = lensAddr(f);
  if (lens) {
    const d = await pc.readContract({ address: lens, abi: voxroLensAbi, functionName: 'dashboard' });
    console.log(dim(`network: ${d.pending} pending · ${d.answered} answered · ${d.refunded} refunded · avg queue ${(Number(d.avgQueueBps) / 100).toFixed(1)}% of 7`));
  }
}

export async function escrow(cmd: 'quote' | 'send' | 'stress', f: Flags): Promise<void> {
  if (cmd === 'quote') return quote(f);
  if (cmd === 'send') return send(f);
  return stress(f);
}
