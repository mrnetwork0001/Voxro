/**
 * The app's only data layer: VoxroEscrow + VoxroLens + DeWebHub on X Layer mainnet, mapped into the
 * view model (model.ts) plus async write actions from the connected wallet.
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
  domainBindingAbi,
  siteRegistryAbi,
  tapeOutCommunityVipAbi,
  type PublishPlan,
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
  deriveGuestKeyPair,
  guestKeyText,
  isDeterministic,
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
import { useSyncExternalStore } from 'react';
import { BaseError, ContractFunctionRevertedError, decodeEventLog, erc20Abi, getAbiItem, parseAbi, type WalletClient } from 'viem';
import { PRESET_CIRCUIT_ID } from '../circuits/catalog.ts';
import { CONFIG, DEPLOYED } from '../config.ts';
import { TOKENS, type ChainState, type ClaimCheck, type HubEntry, type InboxView, type Quote, type TicketView, type Token } from '../model.ts';
import { explorerTx, publicClient } from './client.ts';

export const openerAbi = parseAbi(['function FEE() view returns (uint256)', 'function open(address circuits, uint256 tokenId) payable']);

const ZERO = '0x0000000000000000000000000000000000000000' as Address;
const ESCROW = (CONFIG.escrow ?? ZERO) as Address;
const LENS = (CONFIG.lens ?? ZERO) as Address;
const VOXR = (CONFIG.voxrCpu ?? ZERO) as Address;
/** Mailbox processor: DeWebHub pins the Circuits proxy codehash of processors ≤ index 386; newer ones (VOXR) cannot publish keys or send. */
export const MAILBOX_CPU = CONFIG.mailboxCpu as Address;
const HUB = XLAYER.deWebHub;
const STATUS: TicketView['status'][] = ['Pending', 'Claimed', 'Refunded', 'Refunded'];

// ─── pure mapping helpers (unit-tested) ──────────────────────────────────────────────────────
export function tokenOf(addr: string): Token {
  const a = addr.toLowerCase();
  if (a === XLAYER.usdt0.toLowerCase()) return 'USDT0';
  if (a === XLAYER.usdt.toLowerCase()) return 'USDT';
  if (a === TOKENS.FAB.address!.toLowerCase()) return 'FAB';
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

export function mapInbox(v: LensInbox, sender: Address, extra: { memberIds: Array<{ circuits: Address; tokenId: bigint }>; publicKey: Hex; earned: bigint; containerCpuIndex?: number | null; voxr?: Address }): InboxView {
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
    partnerCpu: ib.vipKind === 1 ? ib.vipSource : null,
    vipKind: ib.vipKind,
    communityVip: ib.vipKind === 2 && !!CONFIG.communityVip && ib.vipSource.toLowerCase() === CONFIG.communityVip.toLowerCase(),
    token: tokenOf(ib.paymentToken),
    basePrice: ib.basePrice,
    slaSeconds: ib.slaSeconds,
    latch: v.queueDepth,
    active: ib.active,
    circuitId: Number(ib.policyCircuitId),
    standardPolicy: ib.policyCpu.toLowerCase() === (extra.voxr ?? VOXR).toLowerCase() && Number(ib.policyCircuitId) >= 4 && Number(ib.policyCircuitId) <= 8,
    containerTokenId: Number(ib.inboxCircuitId),
    containerCpuIndex: extra.containerCpuIndex ?? null,
    publicKey: extra.publicKey,
    replies: ib.answered,
    refunded: ib.refunded,
    avgReplySeconds: ib.answered > 0 ? Number(ib.replySeconds) / ib.answered : null,
    earned: extra.earned,
    container: v.members[0] ?? ZERO,
    memberContainers: [...v.members],
    memberIds: extra.memberIds,
    live: { sender, quote: { canSend: q.canSend, price: q.price, tier: q.tier, vip: q.vipDiscount, allowlisted: q.allowlisted, nextQ: Number(BigInt(q.nextState) & 7n), inputs } },
  };
}

export function mapTicket(v: LensTicket, inbox: InboxView | undefined, extra: { envelope: Hex; replyPayload: Hex; guestSecret?: Hex; localReply?: LocalReply }): TicketView {
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
const lsDel = (k: string) => {
  try {
    localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
};

// ─── store ───────────────────────────────────────────────────────────────────────────────────
const empty: ChainState = { inboxes: [], tickets: [], hub: {}, blockNumber: 0, loaded: false };
let state: ChainState = empty;
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
export const useChainState = (): ChainState => useSyncExternalStore(chainStore.subscribe, chainStore.get, chainStore.get);

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
  if (!DEPLOYED) return Promise.resolve();
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const [count, block] = await Promise.all([publicClient.readContract({ ...escrow, functionName: 'inboxCount' }), publicClient.getBlockNumber()]);
      // One getInbox per id, in small pages, failures skipped: one hostile inbox (a VIP source or policy circuit
      // that reverts) or a long directory must not take the whole page down. Newest first, at most 200.
      const ids = Array.from({ length: Math.min(Number(count), 200) }, (_, k) => BigInt(Number(count) - k));
      const views: LensInbox[] = [];
      for (let i = 0; i < ids.length; i += 20) {
        const page = await publicClient.multicall({ allowFailure: true, contracts: ids.slice(i, i + 20).map((id) => ({ ...lens, functionName: 'getInbox' as const, args: [id, sender] as const })) });
        for (const r of page) if (r.status === 'success') views.push(r.result as unknown as LensInbox);
      }
      views.sort((a, b) => Number(a.id - b.id));
      for (let i = views.length - 1; i >= 0; i--) if (views[i]!.inbox.inboxCircuits === ZERO) views.splice(i, 1);
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
      // Factory index of each inbox circuit's processor (for its tape:// name); cached, best effort
      const inboxCpuIndex = await Promise.all(views.map((v) => cpuIndexOf(v.inbox.inboxCircuits).catch(() => null)));
      const inboxes = views.map((v, i) => {
        const k = keys[i]!;
        const pk = k.status === 'success' && (k.result as { usable: boolean; key: Hex }).usable ? (k.result as { key: Hex }).key : ('0x' as Hex);
        return mapInbox(v, sender, { memberIds: [...(memberIds[i] as ReadonlyArray<{ circuits: Address; tokenId: bigint }>)], publicKey: pk, earned: earned.get(Number(v.id)) ?? 0n, containerCpuIndex: inboxCpuIndex[i] ?? null });
      });
      const hubMap: ChainState['hub'] = {};
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
      // Replace the locally assembled reply entries with what DeWebHub actually stores, so the claim checks and
      // receipts are verified against chain storage rather than against our own copy of the payload.
      const wanted = tickets.filter((t) => t.reply).map((t) => [t.replyTargetEndpoint, t.reply!.inboxIndex] as const);
      if (wanted.length) {
        const live = await publicClient.multicall({ allowFailure: true, contracts: wanted.map(([ep, i]) => ({ ...hub, functionName: 'inboxAt' as const, args: [ep, BigInt(i)] as const })) });
        live.forEach((r, k) => {
          const [ep, i] = wanted[k]!;
          if (r.status !== 'success') return;
          const e = r.result as { from: Address; blockNumber: number | bigint; timestamp: number | bigint; digest: Hex };
          (hubMap[ep] ??= [])[i] = { from: e.from, blockNumber: Number(e.blockNumber), timestamp: Number(e.timestamp), digest: e.digest };
        });
      }
      state = { inboxes, tickets, hub: hubMap, blockNumber: Number(block), loaded: true };
      lastError = null;
      void recoverMissingReplies();
    } catch (e) {
      lastError = describeError(e);
    } finally {
      inflight = null;
      notify();
    }
  })();
  return inflight;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/**
 * Re-reads until the store has caught up with a mined transaction: waits out any refresh that started
 * before it, then refreshes until the RPC node serving reads is at `block` and `ready()` holds.
 * Public RPCs behind a load balancer can lag the node that returned the receipt by a block or two.
 */
export async function syncAfter(block: bigint, ready: () => boolean = () => true, tries = 10): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    if (inflight) await inflight.catch(() => {});
    await refresh();
    if (BigInt(state.blockNumber) >= block && ready()) return true;
    await sleep(1500);
  }
  return false;
}

/** Thrown when a transaction succeeded but the public RPC hasn't shown its result yet: never retry the payment. */
export class SentPendingError extends Error {
  constructor(message: string, readonly hash: Hex) {
    super(message);
    this.name = 'SentPendingError';
  }
}

let pollId: number | undefined;
export function startPolling(ms = 10_000) {
  if (!DEPLOYED || pollId !== undefined) return;
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
export const emit = (s: TxStatus) => txListeners.forEach((l) => l(s));

export async function requireWallet(): Promise<WalletCtx> {
  if (!DEPLOYED) throw new Error('Voxro contracts are not configured; refusing to send transactions');
  if (!wallet) throw new Error('Connect a wallet first');
  const id = await wallet.walletClient.getChainId();
  if (id !== XLAYER_CHAIN_ID) await wallet.switchToXLayer();
  return wallet;
}

export async function tx(label: string, send: () => Promise<Hex>) {
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
  let receipt: Awaited<ReturnType<typeof publicClient.waitForTransactionReceipt>>;
  try {
    receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 180_000 });
  } catch (e) {
    const msg = `sent, but no receipt yet (${describeError(e)}). Check the explorer before trying again.`;
    emit({ kind: 'error', label, hash, link: explorerTx(hash), error: msg });
    throw new SentPendingError(`${label}: ${msg}`, hash);
  }
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
export async function myMember(inbox: InboxView, holder: Address) {
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
  const signature = await w.walletClient.signMessage({ account: w.walletClient.account ?? w.address, message: text });
  // The key is re-derived from this signature on every device, so the wallet must sign deterministically
  // (RFC 6979). Ask once more and compare before trusting it; MPC wallets can differ per call.
  emit({ kind: 'info', label: 'Sign the same message once more, to check your wallet signs it the same way' });
  const again = await w.walletClient.signMessage({ account: w.walletClient.account ?? w.address, message: text });
  if (!isDeterministic(signature, again)) throw new Error('This wallet gives a different signature each time, so it could never re-derive your inbox key. Use OKX Wallet with a seed phrase or a hardware wallet for this inbox.');
  const kp = deriveKeyPair({ ...params, signature, app: 'voxro' });
  keyCache.set(cacheKey, kp);
  return kp;
}

// ─── reads used synchronously by the views ───────────────────────────────────────────────────
/** The escrow's own `quoteSend(inboxId, sender)` for the connected wallet, as returned by VoxroLens. */
export function quoteFor(inbox: InboxView): Quote {
  return inbox.live.quote;
}

/** Recomputes the three checks `claimBounty` performs against `DeWebHub.inboxAt(replyTarget, i)`. */
export function verifyClaim(s: ChainState, t: TicketView): { ok: boolean; checks: ClaimCheck[]; entry?: HubEntry } {
  const inbox = s.inboxes.find((i) => i.id === t.inboxId);
  const entry = t.reply ? s.hub[t.replyTargetEndpoint]?.[t.reply.inboxIndex] : undefined;
  if (!entry || !t.reply || !inbox) return { ok: false, checks: [] };
  const recomputed = digestOf(t.expectedReplyRef, hexToBytes(t.reply.payload));
  const isMember = inbox.memberContainers.some((m) => m.toLowerCase() === entry.from.toLowerCase());
  const checks: ClaimCheck[] = [
    { key: 'from', ok: isMember, detail: `${entry.from} ${isMember ? 'is' : 'is NOT'} a member container` },
    { key: 'time', ok: entry.timestamp >= t.createdAt && entry.timestamp <= t.deadline, detail: `${t.createdAt} ≤ ${entry.timestamp} ≤ ${t.deadline}` },
    { key: 'digest', ok: entry.digest === recomputed, detail: `${entry.digest.slice(0, 18)}… == ${recomputed.slice(0, 18)}…` },
  ];
  return { ok: checks.every((c) => c.ok), checks, entry };
}

// ─── recoverable keys & replies (work from any browser with the same wallet) ─────────────────
const guestSigCache = new Map<string, Hex>();
/** One signature per escrow + account seeds every Guest reply key (see SDK deriveGuestKeyPair). */
async function guestSignature(w: WalletCtx): Promise<Hex> {
  const k = `${ESCROW.toLowerCase()}:${w.address.toLowerCase()}`;
  const hit = guestSigCache.get(k);
  if (hit) return hit;
  emit({ kind: 'info', label: 'Sign once to create your Voxro reply keys (no gas)' });
  const sig = await w.walletClient.signMessage({ account: w.walletClient.account ?? w.address, message: guestKeyText({ escrow: ESCROW, sender: w.address, chainId: XLAYER_CHAIN_ID }) });
  guestSigCache.set(k, sig);
  return sig;
}

const SENT_EVENT = getAbiItem({ abi: deWebHubAbi, name: 'Sent' });
/**
 * Finds a ticket's reply on DeWebHub without any browser state: walks the reply endpoint's inbox
 * back to the ticket's creation time, keeps entries from this inbox's member containers inside the
 * window, and pulls each candidate's payload from its `Sent` event until the digest matches.
 */
export async function recoverReply(t: TicketView, inbox: InboxView): Promise<LocalReply | undefined> {
  const members = new Set(inbox.memberContainers.map((m) => m.toLowerCase()));
  const count = Number(await publicClient.readContract({ ...hub, functionName: 'inboxCount', args: [t.replyTargetEndpoint] }));
  for (let hi = count; hi > 0; hi -= 50) {
    const lo = Math.max(0, hi - 50);
    const entries = await publicClient.multicall({ allowFailure: false, contracts: Array.from({ length: hi - lo }, (_, k) => ({ ...hub, functionName: 'inboxAt' as const, args: [t.replyTargetEndpoint, BigInt(lo + k)] as const })) });
    for (let k = entries.length - 1; k >= 0; k--) {
      const e = entries[k] as { from: Address; blockNumber: number | bigint; timestamp: number | bigint; digest: Hex };
      const ts = Number(e.timestamp);
      if (ts < t.createdAt) return undefined;
      if (ts > t.deadline || !members.has(e.from.toLowerCase())) continue;
      const logs = await publicClient.getLogs({ address: HUB, event: SENT_EVENT, args: { to: t.replyTargetEndpoint, ref: t.expectedReplyRef }, fromBlock: BigInt(e.blockNumber), toBlock: BigInt(e.blockNumber) });
      for (const l of logs) {
        const payload = l.args.payload as Hex | undefined;
        if (payload && Number(l.args.inboxIndex) === lo + k && digestOf(t.expectedReplyRef, hexToBytes(payload)) === e.digest) {
          return { inboxIndex: lo + k, payload, timestamp: ts, from: e.from };
        }
      }
    }
  }
  return undefined;
}

/** After each refresh: for pending tickets of inboxes this wallet owns, recover replies sent from another browser. */
const recoverChecked = new Map<number, number>();
async function recoverMissingReplies() {
  const me = sender.toLowerCase();
  const targets = state.tickets.filter((t) => t.status === 'Pending' && !t.reply && state.inboxes.find((i) => i.id === t.inboxId)?.owner.toLowerCase() === me).slice(0, 10);
  let found = false;
  for (const t of targets) {
    const count = Number(await publicClient.readContract({ ...hub, functionName: 'inboxCount', args: [t.replyTargetEndpoint] }).catch(() => 0n));
    if (!count || recoverChecked.get(t.id) === count) continue;
    const inbox = state.inboxes.find((i) => i.id === t.inboxId)!;
    let r: LocalReply | undefined;
    try {
      r = await recoverReply(t, inbox);
      recoverChecked.set(t.id, count); // only a scan that finished counts as checked
    } catch {
      continue; // transient RPC error: try again on the next refresh
    }
    if (r) {
      lsSet(replyStore(t.id), r);
      found = true;
    }
  }
  if (found) await refresh();
}

// ─── writes ──────────────────────────────────────────────────────────────────────────────────
/** Guest Express lane: seal to every member key, then `sendGuestPriority` (approve first for ERC-20 inboxes). */
export async function lock(p: { inboxId: number; subject: string; body: string; expectedPrice?: bigint }): Promise<TicketView> {
  const w = await requireWallet();
  const inbox = state.inboxes.find((i) => i.id === p.inboxId);
  if (!inbox || !inbox.memberIds?.length) throw new Error('inbox not loaded');
  const views = await publicClient.multicall({ allowFailure: false, contracts: inbox.memberIds.map((m) => ({ ...hub, functionName: 'keyFor' as const, args: [m.circuits, m.tokenId] as const })) });
  const keys = (views as Array<{ usable: boolean; key: Hex }>).filter((k) => k.usable).map((k) => hexToBytes(k.key));
  if (keys.length === 0) throw new Error('No member of this inbox has published a usable TapeSend key yet');
  const content = encodeContent({ subject: p.subject, body: p.body, ts: Math.floor(Date.now() / 1000) });
  const envelope = seal({ ...guestContext(inbox.container), content, recipients: keys });
  const guest = deriveGuestKeyPair({ signature: await guestSignature(w), escrow: ESCROW, sender: w.address, envelope, chainId: XLAYER_CHAIN_ID });
  const q = await publicClient.readContract({ ...escrow, functionName: 'quoteSend', args: [BigInt(inbox.id), w.address] });
  if (!inbox.active) throw new Error('This inbox is paused by its owner and is not taking new messages');
  if (!q.canSend) throw new Error('This inbox is full right now (its queue is at the limit): try again after it answers some messages');
  if (p.expectedPrice != null && q.price > p.expectedPrice) throw new PriceChangedError(q.price);
  const tokenAddr = TOKENS[inbox.token].address;
  if (tokenAddr) {
    // Approve exactly this quote. A larger leftover allowance would let a price raised just before the
    // send (by the owner or another sender) be pulled without you seeing it.
    const allowance = await publicClient.readContract({ address: tokenAddr, abi: erc20Abi, functionName: 'allowance', args: [w.address, ESCROW] });
    if (allowance !== q.price) {
      const approve = (v: bigint) => tx(`Approve ${TOKENS[inbox.token].symbol}`, () => w.walletClient.writeContract({ account: w.walletClient.account ?? w.address, chain: w.walletClient.chain, address: tokenAddr, abi: erc20Abi, functionName: 'approve', args: [ESCROW, v] }));
      // tokens in the USDT style refuse non-zero → non-zero approvals: reset to 0 first when needed
      if (allowance > 0n) await approve(q.price).catch(async (e) => (e instanceof SentPendingError ? Promise.reject(e) : (await approve(0n), approve(q.price))));
      else await approve(q.price);
    }
  }
  const receipt = await tx('sendGuestPriority', () => w.walletClient.writeContract({ account: w.walletClient.account ?? w.address, chain: w.walletClient.chain, ...escrow, functionName: 'sendGuestPriority', args: [BigInt(inbox.id), bytesToHex(guest.publicKey), bytesToHex(envelope)], value: tokenAddr ? 0n : q.price }));
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
  await syncAfter(receipt.blockNumber, () => state.tickets.some((x) => x.id === ticketId));
  const t = state.tickets.find((x) => x.id === ticketId);
  if (!t) throw new SentPendingError(`Paid and sent as ticket #${ticketId}. It will appear in your Outbox in a moment; do not send it again.`, receipt.transactionHash);
  return t;
}

/** The live quote moved above what the sender saw: show the new price and ask again. */
export class PriceChangedError extends Error {
  constructor(readonly price: bigint) {
    super('The price went up since you opened this inbox. Check the new quote and send again.');
    this.name = 'PriceChangedError';
  }
}

export async function openEnvelope(t: TicketView, inbox: InboxView): Promise<DecodedContent> {
  const w = await requireWallet();
  const me = await myMember(inbox, w.address);
  const kp = await recipientKey(me.circuits, me.tokenId, me.container);
  const published = await publicClient.readContract({ ...hub, functionName: 'keyFor', args: [me.circuits, me.tokenId] }).catch(() => null);
  if (published?.usable && published.key.toLowerCase() !== bytesToHex(kp.publicKey).toLowerCase()) throw new Error('The key derived from your signature is not the key published for this inbox, so this message cannot be opened from this wallet');
  const content = openPayload({ ...guestContext(inbox.container), payload: hexToBytes(t.envelope), secretKey: kp.secretKey }).content;
  return decodeContent(content);
}

export async function reply(ticketId: number, body: string): Promise<TicketView> {
  const w = await requireWallet();
  const t = state.tickets.find((x) => x.id === ticketId);
  const inbox = t && state.inboxes.find((i) => i.id === t.inboxId);
  if (!t || !inbox) throw new Error('ticket not loaded');
  if (t.lane !== 'guest') throw new Error('This ticket was sent over the Container lane: reply from your TapeSend client to its replyTargetEndpoint');
  const left = t.deadline - Math.floor(Date.now() / 1000);
  if (left < MIN_REPLY_SECONDS) throw new Error('Less than 3 minutes are left in the reply window: a reply now could land after the deadline, when the sender can already refund. Decline instead, or let it expire.');
  const me = await myMember(inbox, w.address);
  const content = encodeContent({ body, ts: Math.floor(Date.now() / 1000) });
  const payload = seal({ ...replyContext(me.container, t.expectedReplyRef), content, recipients: [hexToBytes(t.senderKey.publicKey)] });
  const receipt = await tx('DeWebHub.send (reply)', () => w.walletClient.writeContract({ account: w.walletClient.account ?? w.address, chain: w.walletClient.chain, ...hub, functionName: 'send', args: [me.circuits, me.tokenId, t.replyTargetEndpoint, t.expectedReplyRef, bytesToHex(payload)] }));
  // our entry's index comes from this receipt's own Sent event, not from re-reading a possibly lagging node
  let found: LocalReply | undefined;
  const block = await publicClient.getBlock({ blockNumber: receipt.blockNumber });
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== HUB.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: deWebHubAbi, data: log.data, topics: log.topics, eventName: 'Sent' });
      if ((ev.args.ref as Hex) === t.expectedReplyRef) found = { inboxIndex: Number(ev.args.inboxIndex), payload: bytesToHex(payload), timestamp: Number(block.timestamp), from: me.container };
    } catch {
      /* other log */
    }
  }
  if (!found) throw new Error('reply sent but its DeWebHub entry was not found in the receipt');
  lsSet(replyStore(ticketId), found);
  await syncAfter(receipt.blockNumber, () => Boolean(state.tickets.find((x) => x.id === ticketId)?.reply));
  return state.tickets.find((x) => x.id === ticketId)!;
}

/** Replies with this little time left are refused: the claim needs its own transaction before the deadline passes. */
export const MIN_REPLY_SECONDS = 180;
/** Under this much time left the Inbox warns the recipient to answer now. */
export const SOON_SECONDS = 3600;

/**
 * Reply and claim in one go. The claim is a second transaction from the same wallet; it is started
 * the moment the reply is mined, because after the deadline anyone may refund the ticket even if the
 * reply was on time. If the claim fails, the reply is remembered and Claim can be pressed again.
 */
export async function answer(ticketId: number, body: string): Promise<TicketView> {
  await reply(ticketId, body);
  return claim(ticketId);
}

export async function claim(ticketId: number): Promise<TicketView> {
  const w = await requireWallet();
  let local = lsGet<LocalReply>(replyStore(ticketId));
  if (!local) {
    const t = state.tickets.find((x) => x.id === ticketId);
    const inbox = t && state.inboxes.find((i) => i.id === t.inboxId);
    if (t && inbox) local = await recoverReply(t, inbox);
    if (!local) throw new Error('No reply to this ticket was found on DeWebHub from this inbox');
    lsSet(replyStore(ticketId), local);
  }
  const r = await tx('claimBounty', () => w.walletClient.writeContract({ account: w.walletClient.account ?? w.address, chain: w.walletClient.chain, ...escrow, functionName: 'claimBounty', args: [BigInt(ticketId), BigInt(local.inboxIndex), local.payload] }));
  await settled(r, ticketId);
  return state.tickets.find((x) => x.id === ticketId)!;
}

const settled = (r: { blockNumber: bigint }, ticketId: number) => syncAfter(r.blockNumber, () => state.tickets.find((x) => x.id === ticketId)?.status !== 'Pending');

export async function refundExpired(ticketId: number): Promise<TicketView> {
  const w = await requireWallet();
  const r = await tx('refundExpired', () => w.walletClient.writeContract({ account: w.walletClient.account ?? w.address, chain: w.walletClient.chain, ...escrow, functionName: 'refundExpired', args: [BigInt(ticketId)] }));
  await settled(r, ticketId);
  return state.tickets.find((x) => x.id === ticketId)!;
}

export async function decline(ticketId: number): Promise<TicketView> {
  const w = await requireWallet();
  const r = await tx('declineTicket', () => w.walletClient.writeContract({ account: w.walletClient.account ?? w.address, chain: w.walletClient.chain, ...escrow, functionName: 'declineTicket', args: [BigInt(ticketId)] }));
  await settled(r, ticketId);
  return state.tickets.find((x) => x.id === ticketId)!;
}

export async function openReply(t: TicketView): Promise<DecodedContent | null> {
  if (!t.reply) return null;
  let secret = lsGet<Hex>(guestKeyStore(t.id)) ?? (t.senderKey.secretKey !== '0x' ? t.senderKey.secretKey : undefined);
  if (!secret) {
    // not in this browser: rebuild it from the sender's wallet + the envelope stored by the escrow
    const w = await requireWallet();
    if (w.address.toLowerCase() !== t.sender.toLowerCase()) throw new Error('Connect the wallet that sent this message to read its reply');
    const kp = deriveGuestKeyPair({ signature: await guestSignature(w), escrow: ESCROW, sender: w.address, envelope: hexToBytes(t.envelope), chainId: XLAYER_CHAIN_ID });
    if (bytesToHex(kp.publicKey).toLowerCase() !== t.senderKey.publicKey.toLowerCase()) throw new Error('This message used a one-off reply key that only exists in the browser that sent it');
    secret = bytesToHex(kp.secretKey);
    lsSet(guestKeyStore(t.id), secret);
  }
  const from = state.hub[t.replyTargetEndpoint]?.[t.reply.inboxIndex]?.from;
  if (!from) throw new Error('reply entry not loaded');
  const content = openPayload({ ...replyContext(from, t.expectedReplyRef), payload: hexToBytes(t.reply.payload), secretKey: hexToBytes(secret) }).content;
  return decodeContent(content);
}

// ─── onboarding: mint/tape out → open container → publish key → registerInbox ───────────────
export interface OnboardStep {
  key: 'tapeout' | 'open' | 'key' | 'register' | 'notify';
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
  p: { handle: string; preset: ControllerPreset; curve: CurveProfile; partnerCpu: Address | null; community?: boolean; token: Token; basePrice: bigint; slaSeconds: number; mailbox?: MailboxPick; policyCircuitId?: bigint },
  onStep: (s: OnboardStep) => void,
): Promise<InboxView> {
  const w = await requireWallet();
  let current: OnboardStep['key'] = 'tapeout';
  const step = (key: OnboardStep['key'], status: OnboardStep['status'], detail?: string, hash?: Hex) => {
    current = key;
    onStep({ key, status, ...(detail ? { detail } : {}), ...(hash ? { hash } : {}) });
  };
  try {
    return await registerSteps(p, w, step);
  } catch (e) {
    // stop the spinner of whichever step failed, with the reason
    onStep({ key: current, status: 'error', detail: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}

const mailboxStore = (who: Address) => `voxro.mailbox.${ESCROW.toLowerCase()}.${who.toLowerCase()}`;
const MAILBOX_TRANSFER = getAbiItem({ abi: parseAbi(['event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)']), name: 'Transfer' });

async function registerSteps(
  p: Parameters<typeof registerInbox>[0],
  w: WalletCtx,
  step: (key: OnboardStep['key'], status: OnboardStep['status'], detail?: string, hash?: Hex) => void,
): Promise<InboxView> {
  // 0. the handle must be free before anything is paid for
  const taken = await publicClient.readContract({ ...escrow, functionName: 'handleToInbox', args: [handleToBytes32(p.handle)] });
  if (taken !== 0n) throw new Error(`@${p.handle} is already taken (inbox #${taken}). Pick another handle; nothing was charged.`);
  // 1. a mailbox circuit on a hub-compatible processor (its ERC-6551 container receives TapeSend replies).
  //    A mailbox minted by an earlier, failed attempt is reused, so a retry never pays for a second one.
  let mailbox = p.mailbox;
  if (!mailbox) {
    const saved = lsGet<{ circuits: Address; tokenId: string }>(mailboxStore(w.address));
    if (saved) {
      const owner = await publicClient.readContract({ address: saved.circuits, abi: circuitsAbi, functionName: 'ownerOf', args: [BigInt(saved.tokenId)] }).catch(() => ZERO);
      const used = state.inboxes.some((i) => i.container && i.memberIds?.some((m) => m.circuits.toLowerCase() === saved.circuits.toLowerCase() && m.tokenId === BigInt(saved.tokenId)));
      if (owner.toLowerCase() === w.address.toLowerCase() && !used) mailbox = { circuits: saved.circuits, tokenId: BigInt(saved.tokenId) };
    }
  }
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
    if (have < need) await tx(`Mint ${need - have} NAND`, () => w.walletClient.writeContract({ account: w.walletClient.account ?? w.address, chain: w.walletClient.chain, address: transistors, abi: transistorsAbi, functionName: 'mint', args: [0n, need - have], value: mintValue(need - have, mintPrice, pf) }));
    const r = await tx('tapeout (mailbox)', () => w.walletClient.writeContract({ account: w.walletClient.account ?? w.address, chain: w.walletClient.chain, address: MAILBOX_CPU, abi: circuitsAbi, functionName: 'tapeout', args: [nl.hex, nl.nIn, nl.nOut], value: fee }));
    // the id comes from this receipt's mint (Transfer from 0x0 to us), never from nextId(), which another
    // person taping out on the same shared processor at the same moment could have moved
    let id: bigint | null = null;
    for (const log of r.logs) {
      if (log.address.toLowerCase() !== MAILBOX_CPU.toLowerCase()) continue;
      try {
        const ev = decodeEventLog({ abi: [MAILBOX_TRANSFER], data: log.data, topics: log.topics });
        if (ev.args.from === ZERO && ev.args.to.toLowerCase() === w.address.toLowerCase()) id = ev.args.tokenId;
      } catch {
        /* other log */
      }
    }
    if (id == null) throw new Error('taped out, but the new circuit id was not in the receipt');
    mailbox = { circuits: MAILBOX_CPU, tokenId: id };
    lsSet(mailboxStore(w.address), { circuits: MAILBOX_CPU, tokenId: id.toString() });
    step('tapeout', 'done', `mailbox circuit #${id}`, r.transactionHash);
  } else {
    const owner = await publicClient.readContract({ address: mailbox.circuits, abi: circuitsAbi, functionName: 'ownerOf', args: [mailbox.tokenId] });
    if (owner.toLowerCase() !== w.address.toLowerCase()) throw new Error(`you do not own #${mailbox.tokenId} on ${mailbox.circuits}`);
    step('tapeout', 'skipped', `using #${mailbox.tokenId} on ${mailbox.circuits.slice(0, 10)}…`);
  }
  // 2. container opened?
  const kv = await publicClient.readContract({ ...hub, functionName: 'keyFor', args: [mailbox.circuits, mailbox.tokenId] }).catch(() => ({ container: ZERO, opened: false, usable: false, key: '0x' as Hex }));
  if (kv.container === ZERO) throw new Error('DeWebHub does not recognise this processor (pinned codehash); pick a circuit on a processor with Factory index ≤ 386');
  if (!kv.opened) {
    step('open', 'running');
    const feeOpen = await publicClient.readContract({ address: XLAYER.opener, abi: openerAbi, functionName: 'FEE' });
    const r = await tx('Opener.open', () => w.walletClient.writeContract({ account: w.walletClient.account ?? w.address, chain: w.walletClient.chain, address: XLAYER.opener, abi: openerAbi, functionName: 'open', args: [mailbox!.circuits, mailbox!.tokenId], value: feeOpen }));
    step('open', 'done', undefined, r.transactionHash);
  } else step('open', 'skipped', 'already opened');
  // 3. TapeSend key
  const container = kv.container as Address;
  if (!kv.usable) {
    step('key', 'running');
    const kp = await recipientKey(mailbox.circuits, mailbox.tokenId, container);
    const r = await tx('DeWebHub.publishKey', () => w.walletClient.writeContract({ account: w.walletClient.account ?? w.address, chain: w.walletClient.chain, ...hub, functionName: 'publishKey', args: [mailbox!.circuits, mailbox!.tokenId, 1, 0, bytesToHex(kp.publicKey), 4n] }));
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
    vipKind: p.community && CONFIG.communityVip ? 2 : p.partnerCpu ? 1 : 0,
    vipSource: p.community && CONFIG.communityVip ? CONFIG.communityVip : (p.partnerCpu ?? ('0x0000000000000000000000000000000000000000' as Address)),
    paymentToken: TOKENS[p.token].address ?? ('0x0000000000000000000000000000000000000000' as Address),
    basePrice: p.basePrice,
    slaSeconds: p.slaSeconds,
    curve: CURVE_PROFILES.indexOf(p.curve),
  };
  const r = await tx('registerInbox', () => w.walletClient.writeContract({ account: w.walletClient.account ?? w.address, chain: w.walletClient.chain, ...escrow, functionName: 'registerInbox', args: [params] }));
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
  lsDel(mailboxStore(w.address));
  await syncAfter(r.blockNumber, () => state.inboxes.some((i) => i.id === inboxId));
  const ib = state.inboxes.find((i) => i.id === inboxId);
  if (!ib) throw new SentPendingError(`@${p.handle} is registered as inbox #${inboxId}. It will appear in a moment; do not register it again.`, r.transactionHash);
  return ib;
}

// ─── inbox management (recipient only: VoxroEscrow onlyRecipient) ──────────────────────────────
async function manage(label: string, fn: (w: WalletCtx) => Promise<Hex>) {
  const w = await requireWallet();
  await tx(label, () => fn(w));
  await refresh();
}
const acct = (w: WalletCtx) => w.walletClient.account ?? w.address;

export const setPricing = (inboxId: number, p: { token: Token; basePrice: bigint; slaSeconds: number; curve: CurveProfile }) =>
  manage('setPricing', (w) => w.walletClient.writeContract({ account: acct(w), chain: w.walletClient.chain, ...escrow, functionName: 'setPricing', args: [BigInt(inboxId), TOKENS[p.token].address ?? ('0x0000000000000000000000000000000000000000' as Address), p.basePrice, p.slaSeconds, CURVE_PROFILES.indexOf(p.curve)] }));

export const setActive = (inboxId: number, active: boolean) =>
  manage(active ? 'Resume inbox' : 'Pause inbox', (w) => w.walletClient.writeContract({ account: acct(w), chain: w.walletClient.chain, ...escrow, functionName: 'setActive', args: [BigInt(inboxId), active] }));

export const setAllowlist = (inboxId: number, senders: Address[], allowed: boolean) =>
  manage(allowed ? 'Add to allowlist' : 'Remove from allowlist', (w) => w.walletClient.writeContract({ account: acct(w), chain: w.walletClient.chain, ...escrow, functionName: 'setAllowlist', args: [BigInt(inboxId), senders, allowed] }));

/** Replaces the inbox's extra members (team inbox, ≤ 16). Each member circuit must be on a hub-compatible processor with an opened container. */
export const setMembers = (inboxId: number, members: MailboxPick[]) =>
  manage('setMembers', (w) => w.walletClient.writeContract({ account: acct(w), chain: w.walletClient.chain, ...escrow, functionName: 'setMembers', args: [BigInt(inboxId), members.map((m) => ({ circuits: m.circuits, tokenId: m.tokenId }))] }));

/** Whether `sender` is on the inbox's allowlist (escrow public mapping). */
export const isAllowlisted = (inboxId: number, who: Address) => publicClient.readContract({ ...escrow, functionName: 'allowlisted', args: [BigInt(inboxId), who] });

/** VIP rule for an inbox: none, the TapeOut Community VIP adapter, or holders of a partner ERC-721 (processor). */
export const setVipRule = (inboxId: number, rule: 'none' | 'community' | Address) =>
  manage('setVipSource', (w) => {
    const [kind, source] = rule === 'none' ? [0, ZERO] : rule === 'community' ? [2, CONFIG.communityVip ?? ZERO] : [1, rule];
    if (rule === 'community' && !CONFIG.communityVip) throw new Error('TapeOut Community VIP is not deployed yet');
    return w.walletClient.writeContract({ account: acct(w), chain: w.walletClient.chain, ...escrow, functionName: 'setVipSource', args: [BigInt(inboxId), kind, source as Address] });
  });

/** Which TapeOut memberships `who` holds (bit flags: 1 FabX rig · 2 TapeCode-Test1 · 4 BEM · 8 FAB). */
export async function communityEligibility(who: Address): Promise<{ rig: boolean; tapecode: boolean; bem: boolean; fab: boolean } | null> {
  if (!CONFIG.communityVip) return null;
  const f = Number(await publicClient.readContract({ address: CONFIG.communityVip, abi: tapeOutCommunityVipAbi, functionName: 'eligibility', args: [who] }));
  return { rig: (f & 1) !== 0, tapecode: (f & 2) !== 0, bem: (f & 4) !== 0, fab: (f & 8) !== 0 };
}

// ─── publish the TapeSend key for an inbox registered without one (e.g. the deploy script's flagship) ──
export async function publishInboxKey(inbox: InboxView): Promise<void> {
  const w = await requireWallet();
  const me = await myMember(inbox, w.address);
  const kv = await publicClient.readContract({ ...hub, functionName: 'keyFor', args: [me.circuits, me.tokenId] });
  if (!kv.opened) throw new Error('This mailbox container is not opened yet');
  if (kv.usable) return;
  const kp = await recipientKey(me.circuits, me.tokenId, me.container);
  await tx('DeWebHub.publishKey', () => w.walletClient.writeContract({ account: w.walletClient.account ?? w.address, chain: w.walletClient.chain, ...hub, functionName: 'publishKey', args: [me.circuits, me.tokenId, 1, 0, bytesToHex(kp.publicKey), 4n] }));
  await refresh();
}

// ─── DeWEB contact card: SiteRegistry files under the inbox container + DomainBinding name ─────
/** Publishes a contact-card plan from the wallet that holds the inbox circuit, then binds its tape:// name. */
export async function publishCard(plan: PublishPlan, name: string, inbox: InboxView, onProgress?: (done: number, total: number) => void): Promise<void> {
  const w = await requireWallet();
  await myMember(inbox, w.address); // fails early with a clear message if this wallet cannot write the container
  const total = plan.calls.length + 1;
  for (let i = 0; i < plan.calls.length; i++) {
    const call = plan.calls[i]!;
    await tx(`SiteRegistry.${call.functionName} (${i + 1}/${plan.calls.length})`, () => w.walletClient.writeContract({ account: w.walletClient.account ?? w.address, chain: w.walletClient.chain, address: plan.registry, abi: siteRegistryAbi, functionName: call.functionName, args: call.args as never }));
    onProgress?.(i + 1, total);
  }
  const months = 120n;
  const fee = await publicClient.readContract({ address: XLAYER.domainBinding, abi: domainBindingAbi, functionName: 'monthlyFee' });
  await tx(`DomainBinding.bind ${name}`, () => w.walletClient.writeContract({ account: w.walletClient.account ?? w.address, chain: w.walletClient.chain, address: XLAYER.domainBinding, abi: domainBindingAbi, functionName: 'bind', args: [name, plan.container, months], value: fee * months }));
  onProgress?.(total, total);
}

export const chainBackendInfo = { escrow: ESCROW, lens: LENS, voxr: VOXR };
