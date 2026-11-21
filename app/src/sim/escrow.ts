/**
 * Local simulation of VoxroEscrow + the DeWebHub inbox it reads. Used until the contracts are on
 * mainnet. Every price comes from the real compiled InboxController (`beat`), every envelope is a
 * real TAP-10 v2 seal, and `claim` recomputes exactly the three checks `claimBounty` performs.
 */
import { keccak_256 } from '@noble/hashes/sha3.js';
import { randomBytes } from '@noble/hashes/utils.js';
import {
  XLAYER,
  XLAYER_CHAIN_ID,
  ZERO_REF,
  bytesToHex,
  controllerInputsFor,
  decodeContent,
  digestOf,
  encodeContent,
  endpointHex,
  escrowEndpoint,
  hexToBytes,
  messageId,
  openGuestEnvelope,
  openGuestReply,
  openPayload,
  quotePrice,
  randomKeyPair,
  seal,
  sealGuestEnvelope,
  sealGuestReply,
  ticketRef,
  type Address,
  type ControllerInputs,
  type ControllerPreset,
  type CurveProfile,
  type DecodedContent,
  type Hex,
} from '@voxro/sdk';
import { useSyncExternalStore } from 'react';
import { SIM_ESCROW } from '../config.ts';
import { PRESET_CIRCUIT_ID, stepController } from './catalog.ts';

export type Token = 'USDT0' | 'USDT' | 'OKB';
export const TOKENS: Record<Token, { symbol: string; decimals: number; address: Address | null }> = {
  USDT0: { symbol: 'USD₮0', decimals: 6, address: XLAYER.usdt0 },
  USDT: { symbol: 'USDT', decimals: 6, address: XLAYER.usdt },
  OKB: { symbol: 'OKB', decimals: 18, address: null },
};

export type Lane = 'container' | 'guest';
export type TicketStatus = 'Pending' | 'Claimed' | 'Refunded';

export interface KeyPairHex {
  publicKey: Hex;
  secretKey: Hex;
}

export interface SimInbox {
  id: number;
  handle: string;
  name: string;
  bio: string;
  owner: Address;
  preset: ControllerPreset;
  curve: CurveProfile;
  partnerCpu: Address | null;
  token: Token;
  basePrice: bigint;
  slaSeconds: number;
  latch: number;
  active: boolean;
  allowlist: Address[];
  circuitId: number;
  containerTokenId: number;
  /** Demo-only: the recipient's TAP-10 key lives in the browser so the inbox view can decrypt. */
  key: KeyPairHex;
  createdAt: number;
  replies: number;
  earned: bigint;
  /** Chain mode only: the primary member container and the live Lens quote for the current sender. */
  container?: Address;
  memberIds?: Array<{ circuits: Address; tokenId: bigint }>;
  live?: { sender: Address; quote: Quote };
}

export interface SimTicket {
  id: number;
  inboxId: number;
  sender: Address;
  lane: Lane;
  replyTargetEndpoint: Hex;
  expectedReplyRef: Hex;
  token: Token;
  amount: bigint;
  tier: number;
  vip: boolean;
  createdAt: number;
  deadline: number;
  status: TicketStatus;
  envelope: Hex;
  /** Guest lane: the reply key. Container lane: the sender container's TapeSend key (demo). */
  senderKey: KeyPairHex;
  reply?: { payload: Hex; digest: Hex; inboxIndex: number; timestamp: number };
  settledAt?: number;
  payout?: { recipient: bigint; protocol: bigint };
}

export interface HubEntry {
  from: Address;
  blockNumber: number;
  timestamp: number;
  digest: Hex;
}

export interface SimState {
  v: 1;
  inboxes: SimInbox[];
  tickets: SimTicket[];
  /** Simulated `DeWebHub.inbox[to][]`. */
  hub: Record<string, HubEntry[]>;
  nextInboxId: number;
  nextTicketId: number;
  clockOffset: number;
  blockNumber: number;
}

const KEY = 'voxro.sim.v1';
const listeners = new Set<() => void>();

function replacer(_k: string, v: unknown) {
  return typeof v === 'bigint' ? { $big: v.toString() } : v;
}
function reviver(_k: string, v: unknown) {
  return v && typeof v === 'object' && '$big' in (v as object) ? BigInt((v as { $big: string }).$big) : v;
}

function load(): SimState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw, reviver) as SimState;
      if (s.v === 1) return s;
    }
  } catch {
    /* fall through */
  }
  return seed();
}

function persist(next: SimState) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next, replacer));
  } catch {
    /* ignore quota */
  }
  for (const l of listeners) l();
}

function mutate(fn: (s: SimState) => void) {
  const next: SimState = JSON.parse(JSON.stringify(state, replacer), reviver) as SimState;
  fn(next);
  next.blockNumber += 1;
  persist(next);
}

const addrOf = (seedText: string): Address => `0x${bytesToHex(keccak_256(new TextEncoder().encode(seedText))).slice(-40)}` as Address;
const keyHex = (): KeyPairHex => {
  const k = randomKeyPair(randomBytes);
  return { publicKey: bytesToHex(k.publicKey), secretKey: bytesToHex(k.secretKey) };
};

function seed(): SimState {
  const now = Math.floor(Date.now() / 1000);
  const mk = (id: number, p: Partial<SimInbox> & Pick<SimInbox, 'handle' | 'name' | 'bio' | 'preset' | 'token' | 'basePrice' | 'slaSeconds'>): SimInbox => ({
    id,
    owner: addrOf(`voxro-sim-owner:${p.handle}`),
    curve: 'balanced',
    partnerCpu: null,
    latch: 0,
    active: true,
    allowlist: [],
    circuitId: PRESET_CIRCUIT_ID[p.preset],
    containerTokenId: 8 + id,
    key: keyHex(),
    createdAt: now - 86_400 * id,
    replies: 0,
    earned: 0n,
    ...p,
  });
  return {
    v: 1,
    inboxes: [
      mk(1, { handle: 'mrnetwork', name: 'mrnetwork · builder', bio: 'Building Voxro on X Layer. Partnerships, integrations and audits welcome. Bots not.', preset: 'balanced', token: 'USDT0', basePrice: 10_000_000n, slaSeconds: 48 * 3600 }),
      mk(2, { handle: 'fortress.vc', name: 'Fortress Ventures', bio: 'Seed to Series A. Send a deck, get a decision inside 72 hours or your stake back.', preset: 'fortress', token: 'USDT0', basePrice: 50_000_000n, slaSeconds: 72 * 3600, partnerCpu: XLAYER.factory }),
      mk(3, { handle: 'whitehat.audit', name: 'Whitehat Disclosure Desk', bio: 'Security disclosures for X Layer protocols. Gentle curve so researchers are never priced out.', preset: 'gentle', token: 'USDT', basePrice: 25_000_000n, slaSeconds: 7 * 86_400 }),
    ],
    tickets: [],
    hub: {},
    nextInboxId: 4,
    nextTicketId: 1,
    clockOffset: 0,
    blockNumber: 0,
  };
}

// Initialised after every helper above exists (seed() needs addrOf/keyHex).
let state: SimState = load();

export const simStore = {
  get: () => state,
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  },
};

export const useSim = (): SimState => useSyncExternalStore(simStore.subscribe, simStore.get, simStore.get);

export const simNow = (s: SimState = state) => Math.floor(Date.now() / 1000) + s.clockOffset;
export const containerOf = (inbox: Pick<SimInbox, 'handle' | 'container'>): Address => inbox.container ?? addrOf(`voxro-sim-container:${inbox.handle}`);
export const senderContainerOf = (sender: Address): Address => addrOf(`voxro-sim-sender:${sender.toLowerCase()}`);
export const inboxEndpoint = (inbox: Pick<SimInbox, 'handle'>): Hex => endpointHex(containerOf(inbox));
export const findInbox = (s: SimState, q: string): SimInbox | undefined => {
  const needle = q.trim().replace(/^@/, '').toLowerCase();
  return s.inboxes.find((i) => i.handle.toLowerCase() === needle || String(i.id) === needle);
};

export interface Quote {
  canSend: boolean;
  price: bigint;
  tier: number;
  vip: boolean;
  allowlisted: boolean;
  nextQ: number;
  inputs: ControllerInputs;
}

function inputsFor(inbox: SimInbox, enqueue: boolean, allowlisted: boolean, holdsPartner: boolean): ControllerInputs {
  return controllerInputsFor({ enqueue, ...(inbox.preset === 'configurable' ? { profile: inbox.curve } : {}), allowlisted, holdsPartner });
}

/** `quoteSend(inboxId, sender)`: run the policy circuit with dir = 1 on the live LATCH state (not persisted). */
export function quoteFor(inbox: SimInbox, sender: Address, holdsPartner: boolean): Quote {
  const allowlisted = inbox.allowlist.some((a) => a.toLowerCase() === sender.toLowerCase());
  const inputs = inputsFor(inbox, true, allowlisted, holdsPartner);
  const { out, newQ } = stepController(inbox.preset, inbox.latch, inputs);
  return { canSend: Boolean(out.canSend), price: quotePrice(inbox.basePrice, out), tier: out.effTier, vip: Boolean(out.vipDiscount50), allowlisted, nextQ: newQ, inputs };
}

function pushHub(s: SimState, to: Hex, entry: Omit<HubEntry, 'blockNumber'>): number {
  const list = (s.hub[to] ??= []);
  list.push({ ...entry, blockNumber: s.blockNumber + 1 });
  return list.length - 1;
}

export function lock(p: { inboxId: number; sender: Address; lane: Lane; subject: string; body: string; holdsPartner: boolean }): SimTicket {
  let created!: SimTicket;
  mutate((s) => {
    const inbox = s.inboxes.find((i) => i.id === p.inboxId);
    if (!inbox || !inbox.active) throw new Error('inbox not found');
    const q = quoteFor(inbox, p.sender, p.holdsPartner);
    if (!q.canSend) throw new Error('inbox paused for cold senders');
    const now = simNow(s);
    const content = encodeContent({ subject: p.subject, body: p.body, ts: now });
    const recipientEndpoint = inboxEndpoint(inbox);
    const recipientKey = hexToBytes(inbox.key.publicKey);
    const senderKey = randomKeyPair(randomBytes);
    const ticketId = s.nextTicketId;
    let envelope: Uint8Array;
    let replyTargetEndpoint: Hex;
    let expectedReplyRef: Hex;
    if (p.lane === 'guest') {
      envelope = sealGuestEnvelope({ content, recipientKey, recipientEndpoint, escrow: SIM_ESCROW });
      replyTargetEndpoint = escrowEndpoint(SIM_ESCROW);
      expectedReplyRef = ticketRef(SIM_ESCROW, ticketId);
    } else {
      const senderContainer = senderContainerOf(p.sender);
      const senderEndpoint = endpointHex(senderContainer);
      envelope = seal({ content, recipients: [recipientKey], to: recipientEndpoint, from: senderEndpoint, hub: XLAYER.deWebHub, ref: ZERO_REF });
      const idx = pushHub(s, recipientEndpoint, { from: senderContainer, timestamp: now, digest: digestOf(ZERO_REF, envelope) });
      replyTargetEndpoint = senderEndpoint;
      expectedReplyRef = messageId(XLAYER_CHAIN_ID, XLAYER.deWebHub, recipientEndpoint, idx);
    }
    inbox.latch = q.nextQ;
    created = {
      id: ticketId,
      inboxId: inbox.id,
      sender: p.sender,
      lane: p.lane,
      replyTargetEndpoint,
      expectedReplyRef,
      token: inbox.token,
      amount: q.price,
      tier: q.tier,
      vip: q.vip,
      createdAt: now,
      deadline: now + inbox.slaSeconds,
      status: 'Pending',
      envelope: bytesToHex(envelope),
      senderKey: { publicKey: bytesToHex(senderKey.publicKey), secretKey: bytesToHex(senderKey.secretKey) },
    };
    s.tickets.push(created);
    s.nextTicketId++;
  });
  return created;
}

/** Recipient decrypts the sealed envelope with the inbox key (client-side). */
export function openEnvelope(ticket: SimTicket, inbox: SimInbox): DecodedContent {
  const recipientEndpoint = inboxEndpoint(inbox);
  const secret = hexToBytes(inbox.key.secretKey);
  const payload = hexToBytes(ticket.envelope);
  const content =
    ticket.lane === 'guest'
      ? openGuestEnvelope({ envelope: payload, recipientSecretKey: secret, recipientEndpoint, escrow: SIM_ESCROW })
      : openPayload({ payload, secretKey: secret, to: recipientEndpoint, from: ticket.replyTargetEndpoint, hub: XLAYER.deWebHub, ref: ZERO_REF }).content;
  return decodeContent(content);
}

/** Tap 1: the recipient's `DeWebHub.send(to = replyTarget, ref = expectedReplyRef, payload)`. */
export function reply(ticketId: number, body: string): SimTicket {
  let updated!: SimTicket;
  mutate((s) => {
    const t = s.tickets.find((x) => x.id === ticketId);
    if (!t || t.status !== 'Pending' || t.reply) throw new Error('ticket not open');
    const inbox = s.inboxes.find((i) => i.id === t.inboxId)!;
    const now = simNow(s);
    const content = encodeContent({ body, ts: now });
    const recipientEndpoint = inboxEndpoint(inbox);
    const guestPublicKey = hexToBytes(t.senderKey.publicKey);
    const payload =
      t.lane === 'guest'
        ? sealGuestReply({ content, guestPublicKey, ticketRef: t.expectedReplyRef, recipientEndpoint, escrow: SIM_ESCROW })
        : seal({ content, recipients: [guestPublicKey], to: t.replyTargetEndpoint, from: recipientEndpoint, hub: XLAYER.deWebHub, ref: t.expectedReplyRef });
    const digest = digestOf(t.expectedReplyRef, payload);
    const inboxIndex = pushHub(s, t.replyTargetEndpoint, { from: containerOf(inbox), timestamp: now, digest });
    t.reply = { payload: bytesToHex(payload), digest, inboxIndex, timestamp: now };
    updated = t;
  });
  return updated;
}

export interface ClaimCheck {
  key: 'from' | 'time' | 'digest';
  ok: boolean;
  detail: string;
}

/** The three checks `claimBounty` performs against `DeWebHub.inboxAt(replyTarget, i)`. */
export function verifyClaim(s: SimState, t: SimTicket): { ok: boolean; checks: ClaimCheck[]; entry?: HubEntry } {
  const inbox = s.inboxes.find((i) => i.id === t.inboxId)!;
  const entry = t.reply ? s.hub[t.replyTargetEndpoint]?.[t.reply.inboxIndex] : undefined;
  if (!entry || !t.reply) return { ok: false, checks: [] };
  const recipientContainer = containerOf(inbox);
  const recomputed = digestOf(t.expectedReplyRef, hexToBytes(t.reply.payload));
  const checks: ClaimCheck[] = [
    { key: 'from', ok: entry.from.toLowerCase() === recipientContainer.toLowerCase(), detail: `${entry.from} == ${recipientContainer}` },
    { key: 'time', ok: entry.timestamp >= t.createdAt && entry.timestamp <= t.deadline, detail: `${t.createdAt} ≤ ${entry.timestamp} ≤ ${t.deadline}` },
    { key: 'digest', ok: entry.digest === recomputed, detail: `${entry.digest.slice(0, 18)}… == ${recomputed.slice(0, 18)}…` },
  ];
  return { ok: checks.every((c) => c.ok), checks, entry };
}

/** Tap 2 (permissionless): verify, step the queue down, pay 95% / 5%. */
export function claim(ticketId: number): SimTicket {
  let updated!: SimTicket;
  mutate((s) => {
    const t = s.tickets.find((x) => x.id === ticketId);
    if (!t || t.status !== 'Pending') throw new Error('ticket not pending');
    const v = verifyClaim(s, t);
    if (!v.ok) throw new Error('reply verification failed');
    const inbox = s.inboxes.find((i) => i.id === t.inboxId)!;
    inbox.latch = stepController(inbox.preset, inbox.latch, inputsFor(inbox, false, false, false)).newQ;
    const protocol = (t.amount * 500n) / 10_000n;
    const recipient = t.amount - protocol;
    t.status = 'Claimed';
    t.settledAt = simNow(s);
    t.payout = { recipient, protocol };
    inbox.replies += 1;
    inbox.earned += recipient;
    updated = t;
  });
  return updated;
}

export function refundExpired(ticketId: number): SimTicket {
  let updated!: SimTicket;
  mutate((s) => {
    const t = s.tickets.find((x) => x.id === ticketId);
    if (!t || t.status !== 'Pending') throw new Error('ticket not pending');
    if (simNow(s) <= t.deadline) throw new Error('deadline not reached');
    const inbox = s.inboxes.find((i) => i.id === t.inboxId)!;
    inbox.latch = stepController(inbox.preset, inbox.latch, inputsFor(inbox, false, false, false)).newQ;
    t.status = 'Refunded';
    t.settledAt = simNow(s);
    updated = t;
  });
  return updated;
}

/** Sender decrypts the recipient's reply with the guest/sender key. */
export function openReply(t: SimTicket, inbox: SimInbox): DecodedContent | null {
  if (!t.reply) return null;
  const payload = hexToBytes(t.reply.payload);
  const secret = hexToBytes(t.senderKey.secretKey);
  const recipientEndpoint = inboxEndpoint(inbox);
  const content =
    t.lane === 'guest'
      ? openGuestReply({ payload, guestSecretKey: secret, ticketRef: t.expectedReplyRef, recipientEndpoint, escrow: SIM_ESCROW })
      : openPayload({ payload, secretKey: secret, to: t.replyTargetEndpoint, from: recipientEndpoint, hub: XLAYER.deWebHub, ref: t.expectedReplyRef }).content;
  return decodeContent(content);
}

export function fastForward(seconds: number) {
  mutate((s) => {
    s.clockOffset += seconds;
  });
}

export function registerInbox(p: { handle: string; name: string; bio: string; owner: Address; preset: ControllerPreset; curve: CurveProfile; partnerCpu: Address | null; token: Token; basePrice: bigint; slaSeconds: number }): SimInbox {
  let created!: SimInbox;
  mutate((s) => {
    const handle = p.handle.replace(/^@/, '').trim();
    if (!/^[a-z0-9._-]{2,32}$/i.test(handle)) throw new Error('handle must be 2–32 chars: letters, digits, . _ -');
    if (findInbox(s, handle)) throw new Error('handle taken');
    created = {
      ...p,
      handle,
      id: s.nextInboxId,
      latch: 0,
      active: true,
      allowlist: [],
      circuitId: PRESET_CIRCUIT_ID[p.preset],
      containerTokenId: 8 + s.nextInboxId,
      key: keyHex(),
      createdAt: simNow(s),
      replies: 0,
      earned: 0n,
    };
    s.inboxes.push(created);
    s.nextInboxId++;
  });
  return created;
}

export function resetSim() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  persist(seed());
}

export function settledByToken(s: SimState): Record<Token, { recipient: bigint; protocol: bigint }> {
  const out: Record<Token, { recipient: bigint; protocol: bigint }> = { USDT0: { recipient: 0n, protocol: 0n }, USDT: { recipient: 0n, protocol: 0n }, OKB: { recipient: 0n, protocol: 0n } };
  for (const t of s.tickets) {
    if (t.status === 'Claimed' && t.payout) {
      out[t.token].recipient += t.payout.recipient;
      out[t.token].protocol += t.payout.protocol;
    }
  }
  return out;
}
