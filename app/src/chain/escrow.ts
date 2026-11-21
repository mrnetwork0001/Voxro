/**
 * LAUNCHED-mode data layer: VoxroEscrow + VoxroLens + DeWebHub on X Layer, exposed in the same
 * shapes the views already consume (SimInbox / SimTicket / SimState) plus async write actions.
 * Nothing here scans logs: envelopes and replies are read from escrow storage.
 */
import {
  CURVE_PROFILES,
  NetlistBuilder,
  PRESET_NAMES,
  TicketStatus,
  XLAYER,
  XLAYER_CHAIN_ID,
  ZERO_REF,
  bytes32ToHandle,
  bytesToHex,
  circuitsAbi,
  controllerInputsFor,
  factoryAbi,
  decodeContent,
  deWebHubAbi,
  deriveKeyPair,
  digestOf,
  encodeContent,
  endpointHex,
  escrowEndpoint,
  handleToBytes32,
  hexToBytes,
  keyDerivationText,
  mintValue,
  openPayload,
  quotePrice,
  randomKeyPair,
  seal,
  splitBounty,
  transistorsAbi,
  voxroEscrowAbi,
  voxroLensAbi,
  type Address,
  type ControllerPreset,
  type CurveProfile,
  type DecodedContent,
  type Hex,
} from '@voxro/sdk';
import { randomBytes } from '@noble/hashes/utils.js';
import { useSyncExternalStore } from 'react';
import { BaseError, ContractFunctionRevertedError, decodeEventLog, erc20Abi, parseAbi, type WalletClient } from 'viem';
import { CONFIG, VOXR_CPU_INDEX } from '../config.ts';
import { PRESET_CIRCUIT_ID, stepController } from '../sim/catalog.ts';
import type { ClaimCheck, HubEntry, Lane, Quote, SimInbox, SimState, SimTicket, Token } from '../sim/escrow.ts';
import { TOKENS } from '../sim/escrow.ts';
import { explorerTx, publicClient } from './client.ts';

export const openerAbi = parseAbi(['function FEE() view returns (uint256)', 'function open(address circuits, uint256 tokenId) payable']);

const ESCROW = CONFIG.escrow as Address;
const LENS = CONFIG.lens as Address;
const VOXR = (CONFIG.voxrCpu ?? '0x0000000000000000000000000000000000000000') as Address;
/** Mailbox processor: DeWebHub pins the Circuits proxy codehash of processors ≤ index 386; newer ones (VOXR) cannot publish keys or send. */
export const MAILBOX_CPU = CONFIG.mailboxCpu as Address;
const HUB = XLAYER.deWebHub;
const STATUS: SimTicket['status'][] = ['Pending', 'Claimed', 'Refunded', 'Refunded'];

// ─── pure mapping helpers (unit-tested) ──────────────────────────────────────────────────────
export function tokenOf(addr: string): Token {
  const a = addr.toLowerCase();
  if (a === XLAYER.usdt0.toLowerCase()) return 'USDT0';
  if (a === XLAYER.usdt.toLowerCase()) return 'USDT';
  return 'OKB';
}

export function presetOf(policyCpu: string, policyCircuitId: bigint | number, voxr: string = VOXR): ControllerPreset {
  if (policyCpu.toLowerCase() === voxr.toLowerCase()) {
    const hit = (Object.entries(PRESET_CIRCUIT_ID) as Array<[ControllerPreset, number]>).find(([, id]) => id === Number(policyCircuitId));
    if (hit) return hit[0];
  }
  return 'configurable';
}

/** Tier back-computed from the charged amount; VIP halving is recognised too. */
export function tierOf(amount: bigint, basePrice: bigint): { tier: number; vip: boolean } {
  if (basePrice === 0n) return { tier: 0, vip: false };
  const bps = (amount * 10_000n) / basePrice;
  const table = [10_000n, 15_000n, 25_000n, 40_000n];
  const i = table.indexOf(bps);
  if (i >= 0) return { tier: i, vip: false };
  const j = table.indexOf(bps * 2n);
  return j >= 0 ? { tier: j, vip: true } : { tier: 0, vip: false };
}

export interface LensInbox {
  id: bigint;
  inbox: { policyCpu: Address; policyCircuitId: bigint; inboxCircuits: Address; inboxCircuitId: bigint; paymentToken: Address; basePrice: bigint; slaSeconds: number; curve: number; latchState: Hex; active: boolean; vipKind: number; vipSource: Address; handle: Hex; pending: number; answered: number; refunded: number; replySeconds: bigint };
  recipient: Address;
  members: readonly Address[];
  memberEndpoints: readonly Hex[];
  queueDepth: number;
  quote: { canSend: boolean; price: bigint; nextState: Hex; tier: number; vipDiscount: boolean; allowlisted: boolean; vip: boolean };
}

export interface LensTicket {
  id: bigint;
  ticket: { inboxId: bigint; sender: Address; replyTargetEndpoint: Hex; expectedReplyRef: Hex; token: Address; amount: bigint; createdAt: number; deadline: number; status: number; lane: number; guestReplyKey: Hex; replyInboxIndex: number; replyTimestamp: number; replyFrom: Address };
}

export function mapInbox(v: LensInbox, sender: Address, extra: { memberIds: Array<{ circuits: Address; tokenId: bigint }>; publicKey: Hex; earned: bigint; voxr?: Address }): SimInbox {
  const ib = v.inbox;
  const preset = presetOf(ib.policyCpu, ib.policyCircuitId, extra.voxr ?? VOXR);
  const curve: CurveProfile = CURVE_PROFILES[ib.curve as 0 | 1 | 2 | 3] ?? 'balanced';
  const q = v.quote;
  const inputs = controllerInputsFor({ enqueue: true, ...(preset === 'configurable' ? { profile: curve } : {}), allowlisted: q.allowlisted, holdsPartner: q.vip });
  const handle = bytes32ToHandle(ib.handle) || `inbox-${v.id}`;
  return {
    id: Number(v.id),
    handle,
    name: `@${handle} · ${PRESET_NAMES[preset]}`,
    bio: `${PRESET_NAMES[preset]} on VOXR #${ib.policyCircuitId} · reply window ${Math.round(ib.slaSeconds / 3600)} h`,
    owner: v.recipient,
    preset,
    curve,
    partnerCpu: ib.vipKind === 0 ? null : ib.vipSource,
    token: tokenOf(ib.paymentToken),
    basePrice: ib.basePrice,
    slaSeconds: ib.slaSeconds,
    latch: v.queueDepth,
    active: ib.active,
    allowlist: [],
    circuitId: Number(ib.policyCircuitId),
    containerTokenId: Number(ib.inboxCircuitId),
    key: { publicKey: extra.publicKey, secretKey: '0x' },
    createdAt: 0,
    replies: ib.answered,
    earned: extra.earned,
    container: v.members[0],
    memberIds: extra.memberIds,
    live: { sender, quote: { canSend: q.canSend, price: q.price, tier: q.tier, vip: q.vipDiscount, allowlisted: q.allowlisted, nextState: q.nextState, nextQ: Number(BigInt(q.nextState) & 7n), inputs } as Quote & { nextState: Hex } },
  };
}

export function mapTicket(v: LensTicket, inbox: SimInbox | undefined, extra: { envelope: Hex; replyPayload: Hex; guestSecret?: Hex; localReply?: LocalReply }): SimTicket {
  const t = v.ticket;
  const { tier, vip } = tierOf(t.amount, inbox?.basePrice ?? 0n);
  const status = STATUS[t.status] ?? 'Pending';
  const claimed = t.status === TicketStatus.Claimed;
  const reply = claimed
    ? { payload: extra.replyPayload, digest: digestOf(t.expectedReplyRef, hexToBytes(extra.replyPayload)), inboxIndex: t.replyInboxIndex, timestamp: t.replyTimestamp }
    : extra.localReply
      ? { payload: extra.localReply.payload, digest: digestOf(t.expectedReplyRef, hexToBytes(extra.localReply.payload)), inboxIndex: extra.localReply.inboxIndex, timestamp: extra.localReply.timestamp }
      : undefined;
  const split = splitBounty(t.amount);
  return {
    id: Number(v.id),
    inboxId: Number(t.inboxId),
    sender: t.sender,
    lane: t.lane === 1 ? 'guest' : 'container',
    replyTargetEndpoint: t.replyTargetEndpoint,
    expectedReplyRef: t.expectedReplyRef,
    token: tokenOf(t.token),
    amount: t.amount,
    tier,
    vip,
    createdAt: t.createdAt,
    deadline: t.deadline,
    status,
    envelope: extra.envelope,
    senderKey: { publicKey: t.guestReplyKey, secretKey: extra.guestSecret ?? '0x' },
    ...(reply ? { reply } : {}),
    ...(status !== 'Pending' ? { settledAt: claimed ? t.replyTimestamp : t.deadline } : {}),
    ...(claimed ? { payout: { recipient: split.recipient, protocol: split.protocol + split.keeper } } : {}),
  };
}

/** Human-readable revert reason: custom error name from the ABI, else viem's short message. */
export function describeError(e: unknown): string {
  if (e instanceof BaseError) {
    const r = e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    if (r?.data?.errorName) return `${r.data.errorName}${r.data.args?.length ? `(${r.data.args.join(', ')})` : ''}`;
    return e.shortMessage;
  }
  return e instanceof Error ? e.message : String(e);
}

/** Envelope context both sides must agree on: to = primary member container, from = escrow, ref = 0. */
export function guestContext(primaryMember: Address, escrow: Address = ESCROW, chainId: number = XLAYER_CHAIN_ID) {
  return { to: endpointHex(primaryMember, chainId), from: escrowEndpoint(escrow, chainId), hub: HUB, ref: ZERO_REF, chainId };
}
/** Reply context: to = escrow endpoint, from = the member container that replied, ref = expectedReplyRef. */
export function replyContext(memberContainer: Address, expectedReplyRef: Hex, escrow: Address = ESCROW, chainId: number = XLAYER_CHAIN_ID) {
  return { to: escrowEndpoint(escrow, chainId), from: endpointHex(memberContainer, chainId), hub: HUB, ref: expectedReplyRef, chainId };
}

// ─── local secrets (sender-side reply keys, recipient-side pending replies) ──────────────────
interface LocalReply {
  inboxIndex: number;
  payload: Hex;
  timestamp: number;
  from: Address;
}
const guestKeyStore = (id: number) => `voxro.guest.${ESCROW?.toLowerCase()}.${id}`;
const replyStore = (id: number) => `voxro.reply.${ESCROW?.toLowerCase()}.${id}`;
const lsGet = <T,>(k: string): T | undefined => {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : undefined;
  } catch {
    return undefined;
  }
};
const lsSet = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* ignore */
  }
};

// ─── store ───────────────────────────────────────────────────────────────────────────────────
const empty: SimState = { v: 1, inboxes: [], tickets: [], hub: {}, nextInboxId: 1, nextTicketId: 1, clockOffset: 0, blockNumber: 0 };
let state: SimState = empty;
let lastError: string | null = null;
let sender: Address = '0x0000000000000000000000000000000000000000';
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export const chainStore = {
  get: () => state,
  error: () => lastError,
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => void listeners.delete(cb);
  },
};
export const useChainState = (): SimState => useSyncExternalStore(chainStore.subscribe, chainStore.get, chainStore.get);

export function setSender(a: Address | undefined) {
  const next = a ?? ('0x0000000000000000000000000000000000000000' as Address);
  if (next.toLowerCase() !== sender.toLowerCase()) {
    sender = next;
    void refresh();
  }
}

const lens = { address: LENS, abi: voxroLensAbi } as const;
const escrow = { address: ESCROW, abi: voxroEscrowAbi } as const;
const hub = { address: HUB, abi: deWebHubAbi } as const;

let inflight: Promise<void> | null = null;
export function refresh(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const [dir, block] = await Promise.all([
        publicClient.readContract({ ...lens, functionName: 'directory', args: [0n, 200n, sender] }),
        publicClient.getBlockNumber(),
      ]);
      const views = (dir as unknown as LensInbox[]).filter((v) => v.inbox.inboxCircuits !== '0x0000000000000000000000000000000000000000');
      // member ids + primary key per inbox
      const memberIds = await publicClient.multicall({ allowFailure: false, contracts: views.map((v) => ({ ...escrow, functionName: 'memberIdsOf' as const, args: [v.id] as const })) });
      const keys = await publicClient.multicall({
        allowFailure: true,
        contracts: views.map((_, i) => {
          const m = (memberIds[i] as ReadonlyArray<{ circuits: Address; tokenId: bigint }>)[0];
          return { ...hub, functionName: 'keyFor' as const, args: [m?.circuits ?? VOXR, m?.tokenId ?? 0n] as const };
        }),
      });
      // tickets: every inbox's tickets + the sender's outbox
      const lists = await publicClient.multicall({
        allowFailure: false,
        contracts: [...views.map((v) => ({ ...lens, functionName: 'inboxTickets' as const, args: [v.id] as const })), { ...lens, functionName: 'outbox' as const, args: [sender] as const }],
      });
      const byId = new Map<string, LensTicket>();
      for (const l of lists as unknown as LensTicket[][]) for (const tv of l) byId.set(tv.id.toString(), tv);
      const tviews = [...byId.values()].sort((a, b) => Number(a.id - b.id)).slice(-200);
      const payloads = tviews.length
        ? await publicClient.multicall({
            allowFailure: false,
            contracts: tviews.flatMap((tv) => [
              { ...escrow, functionName: 'payloadOf' as const, args: [tv.id] as const },
              { ...escrow, functionName: 'replyPayloadOf' as const, args: [tv.id] as const },
            ]),
          })
        : [];
      // earned per inbox from claimed tickets
      const earned = new Map<number, bigint>();
      for (const tv of tviews) if (tv.ticket.status === TicketStatus.Claimed) earned.set(Number(tv.ticket.inboxId), (earned.get(Number(tv.ticket.inboxId)) ?? 0n) + splitBounty(tv.ticket.amount).recipient);
      const inboxes = views.map((v, i) => {
        const k = keys[i]!;
        const pk = k.status === 'success' && (k.result as { usable: boolean; key: Hex }).usable ? (k.result as { key: Hex }).key : ('0x' as Hex);
        return mapInbox(v, sender, { memberIds: [...(memberIds[i] as ReadonlyArray<{ circuits: Address; tokenId: bigint }>)], publicKey: pk, earned: earned.get(Number(v.id)) ?? 0n });
      });
      const hubMap: SimState['hub'] = {};
      const tickets = tviews.map((tv, i) => {
        const id = Number(tv.id);
        const localReply = tv.ticket.status === TicketStatus.Pending ? lsGet<LocalReply>(replyStore(id)) : undefined;
        const t = mapTicket(tv, inboxes.find((x) => x.id === Number(tv.ticket.inboxId)), {
          envelope: payloads[2 * i] as Hex,
          replyPayload: payloads[2 * i + 1] as Hex,
          guestSecret: lsGet<Hex>(guestKeyStore(id)),
          localReply,
        });
        if (t.reply) {
          const from = tv.ticket.status === TicketStatus.Claimed ? tv.ticket.replyFrom : localReply!.from;
          const entry: HubEntry = { from, blockNumber: 0, timestamp: t.reply.timestamp, digest: t.reply.digest };
          (hubMap[t.replyTargetEndpoint] ??= [])[t.reply.inboxIndex] = entry;
        }
        return t;
      });
      state = { ...empty, inboxes, tickets, hub: hubMap, nextInboxId: inboxes.length + 1, nextTicketId: tickets.length + 1, blockNumber: Number(block) };
      lastError = null;
    } catch (e) {
      lastError = describeError(e);
    } finally {
      inflight = null;
      notify();
    }
  })();
  return inflight;
}

let pollId: number | undefined;
export function startPolling(ms = 10_000) {
  if (pollId !== undefined) return;
  void refresh();
  pollId = window.setInterval(() => void refresh(), ms);
}

// ─── wallet context + tx status ──────────────────────────────────────────────────────────────
export interface WalletCtx {
  walletClient: WalletClient;
  address: Address;
  chainId?: number;
  switchToXLayer: () => Promise<void>;
}
let wallet: WalletCtx | null = null;
export const setWalletContext = (w: WalletCtx | null) => {
  wallet = w;
};

export interface TxStatus {
  kind: 'pending' | 'mined' | 'error' | 'info';
  label: string;
  hash?: Hex;
  link?: string;
  error?: string;
}
const txListeners = new Set<(s: TxStatus) => void>();
export const onTxStatus = (cb: (s: TxStatus) => void) => {
  txListeners.add(cb);
  return () => void txListeners.delete(cb);
};
const emit = (s: TxStatus) => txListeners.forEach((l) => l(s));

async function requireWallet(): Promise<WalletCtx> {
  if (!wallet) throw new Error('Connect a wallet first');
  const id = await wallet.walletClient.getChainId();
  if (id !== XLAYER_CHAIN_ID) await wallet.switchToXLayer();
  return wallet;
}

async function tx(label: string, send: () => Promise<Hex>) {
  emit({ kind: 'info', label: `${label}: confirm in wallet…` });
  let hash: Hex;
  try {
    hash = await send();
  } catch (e) {
    const msg = describeError(e);
    emit({ kind: 'error', label, error: msg });
    throw new Error(`${label}: ${msg}`);
  }
  emit({ kind: 'pending', label, hash, link: explorerTx(hash) });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') {
    emit({ kind: 'error', label, hash, link: explorerTx(hash), error: 'reverted' });
    throw new Error(`${label}: transaction reverted`);
  }
  emit({ kind: 'mined', label, hash, link: explorerTx(hash) });
  return receipt;
}

// ─── keys ────────────────────────────────────────────────────────────────────────────────────
const cpuIndexCache = new Map<string, number>();
/** Factory index of a Circuits address (binds the key text to `#id@2.<cpu>`). */
export async function cpuIndexOf(circuits: Address): Promise<number> {
  const k = circuits.toLowerCase();
  const hit = cpuIndexCache.get(k);
  if (hit !== undefined) return hit;
  if (k === VOXR.toLowerCase()) return VOXR_CPU_INDEX;
  const count = Number(await publicClient.readContract({ address: XLAYER.factory, abi: factoryAbi, functionName: 'cpuCount' }));
  for (let start = 0; start < count; start += 200) {
    const n = Math.min(200, count - start);
    const res = await publicClient.multicall({ allowFailure: false, contracts: Array.from({ length: n }, (_, i) => ({ address: XLAYER.factory, abi: factoryAbi, functionName: 'cpuAt' as const, args: [BigInt(start + i)] as const })) });
    const idx = (res as string[]).findIndex((a) => a.toLowerCase() === k);
    if (idx >= 0) {
      cpuIndexCache.set(k, start + idx);
      return start + idx;
    }
  }
  throw new Error('processor not found in Factory');
}

const keyCache = new Map<string, { secretKey: Uint8Array; publicKey: Uint8Array }>();

/** Which member of `inbox` the connected wallet holds (its container + token). */
async function myMember(inbox: SimInbox, holder: Address) {
  const ids = inbox.memberIds ?? [];
  const owners = await publicClient.multicall({ allowFailure: true, contracts: ids.map((m) => ({ address: m.circuits, abi: circuitsAbi, functionName: 'ownerOf' as const, args: [m.tokenId] as const })) });
  const i = owners.findIndex((o) => o.status === 'success' && (o.result as string).toLowerCase() === holder.toLowerCase());
  if (i < 0) throw new Error('Connected wallet does not hold a member circuit of this inbox');
  const m = ids[i]!;
  const container = (await publicClient.readContract({ ...hub, functionName: 'accountOf', args: [m.circuits, m.tokenId] })) as Address;
  return { ...m, container };
}

/** Derive (and cache for the session) the X25519 key of a container from the holder's signature. Secret never persisted. */
export async function recipientKey(circuits: Address, tokenId: bigint, container: Address) {
  const cpuIndex = await cpuIndexOf(circuits);
  const w = await requireWallet();
  const cacheKey = `${container.toLowerCase()}:${w.address.toLowerCase()}`;
  const hit = keyCache.get(cacheKey);
  if (hit) return hit;
  const params = { tokenId, cpuIndex, container, holder: w.address, hub: HUB, chainId: XLAYER_CHAIN_ID, keyIndex: 0 };
  const text = keyDerivationText(params, 'voxro');
  emit({ kind: 'info', label: 'Sign the Voxro key derivation message' });
  const signature = await w.walletClient.signMessage({ account: w.address, message: text });
  const kp = deriveKeyPair({ ...params, signature, app: 'voxro' });
  keyCache.set(cacheKey, kp);
  return kp;
}

// ─── reads used synchronously by the views ───────────────────────────────────────────────────
export function quoteFor(inbox: SimInbox, who: Address, holdsPartner: boolean): Quote {
  if (inbox.live && inbox.live.sender.toLowerCase() === who.toLowerCase() && !holdsPartner) return inbox.live.quote;
  const inputs = controllerInputsFor({ enqueue: true, ...(inbox.preset === 'configurable' ? { profile: inbox.curve } : {}), allowlisted: inbox.live?.quote.allowlisted ?? false, holdsPartner: holdsPartner || (inbox.live?.quote.vip ?? false) });
  const { out, newQ } = stepController(inbox.preset, inbox.latch, inputs);
  return { canSend: Boolean(out.canSend), price: quotePrice(inbox.basePrice, out), tier: out.effTier, vip: Boolean(out.vipDiscount50), allowlisted: inbox.live?.quote.allowlisted ?? false, nextQ: newQ, inputs };
}

export function verifyClaim(s: SimState, t: SimTicket): { ok: boolean; checks: ClaimCheck[]; entry?: HubEntry } {
  const inbox = s.inboxes.find((i) => i.id === t.inboxId);
  const entry = t.reply ? s.hub[t.replyTargetEndpoint]?.[t.reply.inboxIndex] : undefined;
  if (!entry || !t.reply || !inbox) return { ok: false, checks: [] };
  const recomputed = digestOf(t.expectedReplyRef, hexToBytes(t.reply.payload));
  const checks: ClaimCheck[] = [
    { key: 'from', ok: (inbox.memberIds?.length ?? 0) === 0 || entry.from.toLowerCase() === (inbox.container ?? '').toLowerCase() || Boolean(inbox.memberIds), detail: `${entry.from} is a member container` },
    { key: 'time', ok: entry.timestamp >= t.createdAt && entry.timestamp <= t.deadline, detail: `${t.createdAt} ≤ ${entry.timestamp} ≤ ${t.deadline}` },
    { key: 'digest', ok: entry.digest === recomputed, detail: `${entry.digest.slice(0, 18)}… == ${recomputed.slice(0, 18)}…` },
  ];
  return { ok: checks.every((c) => c.ok), checks, entry };
}

// ─── writes ──────────────────────────────────────────────────────────────────────────────────
export async function lock(p: { inboxId: number; lane: Lane; subject: string; body: string }): Promise<SimTicket> {
  if (p.lane !== 'guest') throw new Error('Container lane: use the official TapeSend client to send, then lockForTapeSend (coming soon in this UI)');
  const w = await requireWallet();
  const inbox = state.inboxes.find((i) => i.id === p.inboxId);
  if (!inbox || !inbox.memberIds?.length) throw new Error('inbox not loaded');
  const views = await publicClient.multicall({ allowFailure: false, contracts: inbox.memberIds.map((m) => ({ ...hub, functionName: 'keyFor' as const, args: [m.circuits, m.tokenId] as const })) });
  const keys = (views as Array<{ usable: boolean; key: Hex }>).filter((k) => k.usable).map((k) => hexToBytes(k.key));
  if (keys.length === 0) throw new Error('No member of this inbox has published a usable TapeSend key yet');
  const content = encodeContent({ subject: p.subject, body: p.body, ts: Math.floor(Date.now() / 1000) });
  const envelope = seal({ ...guestContext(inbox.container!), content, recipients: keys });
  const guest = randomKeyPair(randomBytes);
  const q = await publicClient.readContract({ ...escrow, functionName: 'quoteSend', args: [BigInt(inbox.id), w.address] });
  if (!q.canSend) throw new Error('Paused for cold senders (Q would reach 7)');
  const tokenAddr = TOKENS[inbox.token].address;
  if (tokenAddr) {
    const allowance = await publicClient.readContract({ address: tokenAddr, abi: erc20Abi, functionName: 'allowance', args: [w.address, ESCROW] });
    if (allowance < q.price) await tx(`Approve ${TOKENS[inbox.token].symbol}`, () => w.walletClient.writeContract({ account: w.address, chain: w.walletClient.chain, address: tokenAddr, abi: erc20Abi, functionName: 'approve', args: [ESCROW, q.price] }));
  }
  const receipt = await tx('sendGuestPriority', () => w.walletClient.writeContract({ account: w.address, chain: w.walletClient.chain, ...escrow, functionName: 'sendGuestPriority', args: [BigInt(inbox.id), bytesToHex(guest.publicKey), bytesToHex(envelope)], value: tokenAddr ? 0n : q.price }));
  let ticketId = 0;
  for (const log of receipt.logs) {
    try {
      const ev = decodeEventLog({ abi: voxroEscrowAbi, data: log.data, topics: log.topics, eventName: 'TicketLocked' });
      ticketId = Number(ev.args.ticketId);
    } catch {
      /* other log */
    }
  }
  if (ticketId) lsSet(guestKeyStore(ticketId), bytesToHex(guest.secretKey));
  await refresh();
  const t = state.tickets.find((x) => x.id === ticketId);
  if (!t) throw new Error('ticket not found after lock');
  return t;
}

export async function openEnvelope(t: SimTicket, inbox: SimInbox): Promise<DecodedContent> {
  const w = await requireWallet();
  const me = await myMember(inbox, w.address);
  const kp = await recipientKey(me.circuits, me.tokenId, me.container);
  const content = openPayload({ ...guestContext(inbox.container!), payload: hexToBytes(t.envelope), secretKey: kp.secretKey }).content;
  return decodeContent(content);
}

export async function reply(ticketId: number, body: string): Promise<SimTicket> {
  const w = await requireWallet();
  const t = state.tickets.find((x) => x.id === ticketId);
  const inbox = t && state.inboxes.find((i) => i.id === t.inboxId);
  if (!t || !inbox) throw new Error('ticket not loaded');
  if (t.lane !== 'guest') throw new Error('Container-lane replies: coming soon');
  const me = await myMember(inbox, w.address);
  const content = encodeContent({ body, ts: Math.floor(Date.now() / 1000) });
  const payload = seal({ ...replyContext(me.container, t.expectedReplyRef), content, recipients: [hexToBytes(t.senderKey.publicKey)] });
  await tx('DeWebHub.send (reply)', () => w.walletClient.writeContract({ account: w.address, chain: w.walletClient.chain, ...hub, functionName: 'send', args: [me.circuits, me.tokenId, t.replyTargetEndpoint, t.expectedReplyRef, bytesToHex(payload)] }));
  const count = await publicClient.readContract({ ...hub, functionName: 'inboxCount', args: [t.replyTargetEndpoint] });
  // find our entry (last few) and verify the digest before remembering it
  let found: LocalReply | undefined;
  for (let i = Number(count) - 1; i >= Math.max(0, Number(count) - 5); i--) {
    const e = await publicClient.readContract({ ...hub, functionName: 'inboxAt', args: [t.replyTargetEndpoint, BigInt(i)] });
    if (e.digest === digestOf(t.expectedReplyRef, payload)) {
      found = { inboxIndex: i, payload: bytesToHex(payload), timestamp: Number(e.timestamp), from: e.from as Address };
      break;
    }
  }
  if (!found) throw new Error('reply sent but its DeWebHub entry was not found');
  lsSet(replyStore(ticketId), found);
  await refresh();
  return state.tickets.find((x) => x.id === ticketId)!;
}

export async function claim(ticketId: number): Promise<SimTicket> {
  const w = await requireWallet();
  const local = lsGet<LocalReply>(replyStore(ticketId));
  if (!local) throw new Error('no reply recorded for this ticket in this browser');
  await tx('claimBounty', () => w.walletClient.writeContract({ account: w.address, chain: w.walletClient.chain, ...escrow, functionName: 'claimBounty', args: [BigInt(ticketId), BigInt(local.inboxIndex), local.payload] }));
  await refresh();
  return state.tickets.find((x) => x.id === ticketId)!;
}

export async function refundExpired(ticketId: number): Promise<SimTicket> {
  const w = await requireWallet();
  await tx('refundExpired', () => w.walletClient.writeContract({ account: w.address, chain: w.walletClient.chain, ...escrow, functionName: 'refundExpired', args: [BigInt(ticketId)] }));
  await refresh();
  return state.tickets.find((x) => x.id === ticketId)!;
}

export async function decline(ticketId: number): Promise<SimTicket> {
  const w = await requireWallet();
  await tx('declineTicket', () => w.walletClient.writeContract({ account: w.address, chain: w.walletClient.chain, ...escrow, functionName: 'declineTicket', args: [BigInt(ticketId)] }));
  await refresh();
  return state.tickets.find((x) => x.id === ticketId)!;
}

export async function openReply(t: SimTicket, _inbox: SimInbox): Promise<DecodedContent | null> {
  if (!t.reply) return null;
  const secret = lsGet<Hex>(guestKeyStore(t.id)) ?? (t.senderKey.secretKey !== '0x' ? t.senderKey.secretKey : undefined);
  if (!secret) throw new Error('reply key for this ticket is not in this browser');
  const from = state.hub[t.replyTargetEndpoint]?.[t.reply.inboxIndex]?.from;
  if (!from) throw new Error('reply entry not loaded');
  const content = openPayload({ ...replyContext(from, t.expectedReplyRef), payload: hexToBytes(t.reply.payload), secretKey: hexToBytes(secret) }).content;
  return decodeContent(content);
}

// ─── onboarding: mint/tape out → open container → publish key → registerInbox ───────────────
export interface OnboardStep {
  key: 'tapeout' | 'open' | 'key' | 'register';
  status: 'idle' | 'running' | 'done' | 'skipped' | 'error';
  detail?: string;
  hash?: Hex;
}

export interface MailboxPick {
  circuits: Address;
  tokenId: bigint;
}

/** 2-NAND buffer (nIn = 1, nOut = 1): the cheapest valid circuit to own a TapeSend-capable container. */
export function mailboxNetlist(): { hex: Hex; nIn: number; nOut: number; nand: number } {
  const b = new NetlistBuilder(1);
  const n = b.nandFresh(b.in(0), b.in(0));
  const out = b.nandFresh(n, n);
  const built = b.build([out]);
  return { hex: built.hex, nIn: built.nIn, nOut: built.nOut, nand: built.burn.nand };
}

export async function registerInbox(
  p: { handle: string; preset: ControllerPreset; curve: CurveProfile; partnerCpu: Address | null; token: Token; basePrice: bigint; slaSeconds: number; mailbox?: MailboxPick; policyCircuitId?: bigint },
  onStep: (s: OnboardStep) => void,
): Promise<SimInbox> {
  const w = await requireWallet();
  const step = (key: OnboardStep['key'], status: OnboardStep['status'], detail?: string, hash?: Hex) => onStep({ key, status, ...(detail ? { detail } : {}), ...(hash ? { hash } : {}) });
  // 1. a mailbox circuit on a hub-compatible processor (its ERC-6551 container receives TapeSend replies)
  let mailbox = p.mailbox;
  if (!mailbox) {
    step('tapeout', 'running', 'minting 2 NAND + taping out a buffer on the mailbox processor');
    const nl = mailboxNetlist();
    const transistors = (await publicClient.readContract({ address: MAILBOX_CPU, abi: circuitsAbi, functionName: 'transistors' })) as Address;
    const [mintPrice, pf, fee, have] = await Promise.all([
      publicClient.readContract({ address: transistors, abi: transistorsAbi, functionName: 'mintPrice' }),
      publicClient.readContract({ address: transistors, abi: transistorsAbi, functionName: 'protocolFee' }),
      publicClient.readContract({ address: MAILBOX_CPU, abi: circuitsAbi, functionName: 'TAPEOUT_FEE' }),
      publicClient.readContract({ address: transistors, abi: transistorsAbi, functionName: 'balanceOf', args: [w.address, 0n] }),
    ]);
    const need = BigInt(nl.nand);
    if (have < need) await tx(`Mint ${need - have} NAND`, () => w.walletClient.writeContract({ account: w.address, chain: w.walletClient.chain, address: transistors, abi: transistorsAbi, functionName: 'mint', args: [0n, need - have], value: mintValue(need - have, mintPrice, pf) }));
    const r = await tx('tapeout (mailbox)', () => w.walletClient.writeContract({ account: w.address, chain: w.walletClient.chain, address: MAILBOX_CPU, abi: circuitsAbi, functionName: 'tapeout', args: [nl.hex, nl.nIn, nl.nOut], value: fee }));
    const id = await publicClient.readContract({ address: MAILBOX_CPU, abi: circuitsAbi, functionName: 'nextId' });
    mailbox = { circuits: MAILBOX_CPU, tokenId: id };
    step('tapeout', 'done', `mailbox circuit #${id}`, r.transactionHash);
  } else {
    const owner = await publicClient.readContract({ address: mailbox.circuits, abi: circuitsAbi, functionName: 'ownerOf', args: [mailbox.tokenId] });
    if (owner.toLowerCase() !== w.address.toLowerCase()) throw new Error(`you do not own #${mailbox.tokenId} on ${mailbox.circuits}`);
    step('tapeout', 'skipped', `using #${mailbox.tokenId} on ${mailbox.circuits.slice(0, 10)}…`);
  }
  // 2. container opened?
  const kv = await publicClient.readContract({ ...hub, functionName: 'keyFor', args: [mailbox.circuits, mailbox.tokenId] });
  if (kv.container === '0x0000000000000000000000000000000000000000') throw new Error('DeWebHub does not recognise this processor (pinned codehash); pick a circuit on a processor with Factory index ≤ 386');
  if (!kv.opened) {
    step('open', 'running');
    const feeOpen = await publicClient.readContract({ address: XLAYER.opener, abi: openerAbi, functionName: 'FEE' });
    const r = await tx('Opener.open', () => w.walletClient.writeContract({ account: w.address, chain: w.walletClient.chain, address: XLAYER.opener, abi: openerAbi, functionName: 'open', args: [mailbox!.circuits, mailbox!.tokenId], value: feeOpen }));
    step('open', 'done', undefined, r.transactionHash);
  } else step('open', 'skipped', 'already opened');
  // 3. TapeSend key
  const container = kv.container as Address;
  if (!kv.usable) {
    step('key', 'running');
    const kp = await recipientKey(mailbox.circuits, mailbox.tokenId, container);
    const r = await tx('DeWebHub.publishKey', () => w.walletClient.writeContract({ account: w.address, chain: w.walletClient.chain, ...hub, functionName: 'publishKey', args: [mailbox!.circuits, mailbox!.tokenId, 1, 0, bytesToHex(kp.publicKey), 4n] }));
    step('key', 'done', bytesToHex(kp.publicKey).slice(0, 14) + '…', r.transactionHash);
  } else step('key', 'skipped', 'key already published');
  // 4. register: policy on VOXR, mailbox as the inbox NFT + sole member
  step('register', 'running');
  const policyId = p.policyCircuitId ?? BigInt(PRESET_CIRCUIT_ID[p.preset]);
  const params = {
    handle: handleToBytes32(p.handle),
    policyCpu: VOXR,
    policyCircuitId: policyId,
    inboxCircuits: mailbox.circuits,
    inboxCircuitId: mailbox.tokenId,
    members: [] as Array<{ circuits: Address; tokenId: bigint }>,
    vipKind: p.partnerCpu ? 1 : 0,
    vipSource: p.partnerCpu ?? ('0x0000000000000000000000000000000000000000' as Address),
    paymentToken: TOKENS[p.token].address ?? ('0x0000000000000000000000000000000000000000' as Address),
    basePrice: p.basePrice,
    slaSeconds: p.slaSeconds,
    curve: CURVE_PROFILES.indexOf(p.curve),
  };
  const r = await tx('registerInbox', () => w.walletClient.writeContract({ account: w.address, chain: w.walletClient.chain, ...escrow, functionName: 'registerInbox', args: [params] }));
  let inboxId = 0;
  for (const log of r.logs) {
    try {
      const ev = decodeEventLog({ abi: voxroEscrowAbi, data: log.data, topics: log.topics, eventName: 'InboxRegistered' });
      inboxId = Number(ev.args.inboxId);
    } catch {
      /* other log */
    }
  }
  step('register', 'done', `inbox #${inboxId}`, r.transactionHash);
  await refresh();
  const ib = state.inboxes.find((i) => i.id === inboxId);
  if (!ib) throw new Error('inbox not found after registration');
  return ib;
}

export const chainBackendInfo = { escrow: ESCROW, lens: LENS, voxr: VOXR };
