/**
 * Paid messages for AI agents, with the agent's own key: seal to the inbox's published DeWebHub keys,
 * lock the quoted price in VoxroEscrow (Guest Express lane), and read the reply later.
 * The reply key is derived from the sender's signature and the stored envelope, so whoever holds the
 * sending key can always recover replies: no local storage, nothing custodial.
 */
import {
  XLAYER,
  XLAYER_CHAIN_ID,
  ZERO_REF,
  bytesToHex,
  decodeContent,
  deWebHubAbi,
  deriveGuestKeyPair,
  encodeContent,
  endpointHex,
  escrowEndpoint,
  guestKeyText,
  hexToBytes,
  openPayload,
  seal,
  voxroEscrowAbi,
  voxroLensAbi,
  type Address,
  type Hex,
} from '@voxro/sdk';
import { createWalletClient, decodeEventLog, erc20Abi, http, type LocalAccount } from 'viem';
import { ESCROW, LENS, client, inboxByHandle, money, ticket as readTicket, xlayer, type Inbox } from './chain.js';

const HUB = XLAYER.deWebHub;
const ZERO = '0x0000000000000000000000000000000000000000';

export function wallet(account: LocalAccount) {
  return createWalletClient({ account, chain: xlayer, transport: http(process.env.VOXRO_RPC_URL ?? XLAYER.rpcUrls[0]) });
}

async function memberKeys(ib: Inbox): Promise<Uint8Array[]> {
  const ids = (await client.readContract({ address: ESCROW, abi: voxroEscrowAbi, functionName: 'memberIdsOf', args: [BigInt(ib.id)] })) as ReadonlyArray<{ circuits: Address; tokenId: bigint }>;
  const views = await client.multicall({ allowFailure: false, contracts: ids.map((m) => ({ address: HUB, abi: deWebHubAbi, functionName: 'keyFor' as const, args: [m.circuits, m.tokenId] as const })) });
  const keys = (views as Array<{ usable: boolean; key: Hex }>).filter((k) => k.usable).map((k) => hexToBytes(k.key));
  if (!keys.length) throw new Error(`@${ib.handle} has not published a messaging key yet`);
  return keys;
}

/** Envelope sealed exactly like the web app's Guest Express lane. */
export async function sealFor(ib: Inbox, subject: string, body: string): Promise<Uint8Array> {
  const content = encodeContent({ subject, body, ts: Math.floor(Date.now() / 1000) });
  const ctx = { to: endpointHex(ib.members[0]!, XLAYER_CHAIN_ID), from: escrowEndpoint(ESCROW, XLAYER_CHAIN_ID), hub: HUB, ref: ZERO_REF, chainId: XLAYER_CHAIN_ID };
  return seal({ ...ctx, content, recipients: await memberKeys(ib) });
}

const signatureCache = new Map<string, Hex>();
async function guestSignature(account: LocalAccount): Promise<Hex> {
  const hit = signatureCache.get(account.address);
  if (hit) return hit;
  const sig = await account.signMessage({ message: guestKeyText({ escrow: ESCROW, sender: account.address, chainId: XLAYER_CHAIN_ID }) });
  signatureCache.set(account.address, sig);
  return sig;
}

export interface SendResult {
  ticketId: number;
  inbox: string;
  price: string;
  priceRaw: string;
  token: Address;
  tx: Hex;
  replyWithin: number;
}

/** Lock a paid message from `account`. Refuses if the live price is above `maxPrice` (raw units). */
export async function sendPaid(account: LocalAccount, p: { handle: string; subject: string; body: string; maxPrice?: bigint }): Promise<SendResult> {
  const ib = await inboxByHandle(p.handle, account.address);
  if (!ib) throw new Error(`No Voxro inbox called @${p.handle}`);
  if (!ib.active) throw new Error(`@${ib.handle} is paused`);
  if (!p.body.trim()) throw new Error('The message body is empty');
  const q = (await client.readContract({ address: ESCROW, abi: voxroEscrowAbi, functionName: 'quoteSend', args: [BigInt(ib.id), account.address] })) as { canSend: boolean; price: bigint };
  if (!q.canSend) throw new Error(`@${ib.handle}'s queue is full; new senders are paused until they reply`);
  if (p.maxPrice !== undefined && q.price > p.maxPrice) throw new Error(`Price is ${money(ib.token, q.price)}, above your limit of ${money(ib.token, p.maxPrice)}`);
  const envelope = await sealFor(ib, p.subject, p.body);
  const guest = deriveGuestKeyPair({ signature: await guestSignature(account), escrow: ESCROW, sender: account.address, envelope, chainId: XLAYER_CHAIN_ID });
  const w = wallet(account);
  const native = ib.token === ZERO;
  if (!native) {
    const allowance = await client.readContract({ address: ib.token, abi: erc20Abi, functionName: 'allowance', args: [account.address, ESCROW] });
    if (allowance < q.price) {
      const bal = await client.readContract({ address: ib.token, abi: erc20Abi, functionName: 'balanceOf', args: [account.address] });
      if (bal < q.price) throw new Error(`Not enough balance: need ${money(ib.token, q.price)}, have ${money(ib.token, bal)}`);
      const h = await w.writeContract({ address: ib.token, abi: erc20Abi, functionName: 'approve', args: [ESCROW, q.price] });
      await client.waitForTransactionReceipt({ hash: h });
    }
  }
  const hash = await w.writeContract({ address: ESCROW, abi: voxroEscrowAbi, functionName: 'sendGuestPriority', args: [BigInt(ib.id), bytesToHex(guest.publicKey), bytesToHex(envelope)], value: native ? q.price : 0n });
  const rc = await client.waitForTransactionReceipt({ hash });
  if (rc.status !== 'success') throw new Error(`Transaction reverted: ${hash}`);
  let ticketId = 0;
  for (const log of rc.logs) {
    try {
      const ev = decodeEventLog({ abi: voxroEscrowAbi, data: log.data, topics: log.topics, eventName: 'TicketLocked' });
      ticketId = Number((ev.args as { ticketId: bigint }).ticketId);
    } catch {
      /* other log */
    }
  }
  return { ticketId, inbox: ib.handle, price: money(ib.token, q.price), priceRaw: q.price.toString(), token: ib.token, tx: hash, replyWithin: ib.slaSeconds };
}

export interface ReplyResult {
  ticketId: number;
  status: string;
  reply?: { subject?: string; body: string; at: number };
  deadline: number;
  amount: string;
}

/** Status of a message sent by `account`, with the decrypted reply once it has been answered. */
export async function readReply(account: LocalAccount, ticketId: number): Promise<ReplyResult> {
  const t = await readTicket(ticketId);
  const base: ReplyResult = { ticketId, status: t.status, deadline: t.deadline, amount: money(t.token, t.amount) };
  if (t.sender.toLowerCase() !== account.address.toLowerCase()) throw new Error('This message was not sent by this agent wallet');
  if (t.status !== 'Claimed') return base;
  const [envelope, replyPayload, view] = await Promise.all([
    client.readContract({ address: ESCROW, abi: voxroEscrowAbi, functionName: 'payloadOf', args: [BigInt(ticketId)] }) as Promise<Hex>,
    client.readContract({ address: ESCROW, abi: voxroEscrowAbi, functionName: 'replyPayloadOf', args: [BigInt(ticketId)] }) as Promise<Hex>,
    client.readContract({ address: LENS, abi: voxroLensAbi, functionName: 'getTicket', args: [BigInt(ticketId)] }) as Promise<unknown>,
  ]);
  const { expectedReplyRef, replyFrom } = (view as { ticket: { expectedReplyRef: Hex; replyFrom: Address } }).ticket;
  const c = openAgentReply({ signature: await guestSignature(account), sender: account.address, envelope, replyPayload, expectedReplyRef, replyFrom });
  return { ...base, reply: { subject: c.subject, body: c.body ?? c.text ?? '', at: t.replyTimestamp } };
}

/** Decrypt a reply with the reply key derived from the sender's signature (same derivation as the web app). */
export function openAgentReply(p: { signature: Hex; sender: Address; envelope: Hex; replyPayload: Hex; expectedReplyRef: Hex; replyFrom: Address }) {
  const kp = deriveGuestKeyPair({ signature: p.signature, escrow: ESCROW, sender: p.sender, envelope: hexToBytes(p.envelope), chainId: XLAYER_CHAIN_ID });
  const ctx = { to: escrowEndpoint(ESCROW, XLAYER_CHAIN_ID), from: endpointHex(p.replyFrom, XLAYER_CHAIN_ID), hub: HUB, ref: p.expectedReplyRef, chainId: XLAYER_CHAIN_ID };
  return decodeContent(openPayload({ ...ctx, payload: hexToBytes(p.replyPayload), secretKey: kp.secretKey }).content) as { subject?: string; body?: string; text?: string };
}

/** Take a full refund once the reply window has passed (anyone may call; the sender gets 100%). */
export async function refund(account: LocalAccount, ticketId: number): Promise<Hex> {
  const hash = await wallet(account).writeContract({ address: ESCROW, abi: voxroEscrowAbi, functionName: 'refundExpired', args: [BigInt(ticketId)] });
  await client.waitForTransactionReceipt({ hash });
  return hash;
}
