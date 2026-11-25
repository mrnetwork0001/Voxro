/**
 * View model of VoxroEscrow + VoxroLens + DeWebHub state as the views consume it.
 * Filled only from X Layer reads (see chain/escrow.ts); nothing here is simulated.
 */
import { XLAYER, type Address, type ControllerInputs, type ControllerPreset, type CurveProfile, type Hex } from '@voxro/sdk';

export type Token = 'USDT0' | 'USDT' | 'OKB' | 'FAB';
export const TOKENS: Record<Token, { symbol: string; decimals: number; address: Address | null }> = {
  USDT0: { symbol: 'USD₮0', decimals: 6, address: XLAYER.usdt0 },
  USDT: { symbol: 'USDT', decimals: 6, address: XLAYER.usdt },
  OKB: { symbol: 'OKB', decimals: 18, address: null },
  /** FabX mining token on X Layer (paired with BEM). */
  FAB: { symbol: 'FAB', decimals: 8, address: '0x72F349B1Eee7833B26f8C81a8410775A4e231ed2' },
};

export type Lane = 'container' | 'guest';
export type TicketStatus = 'Pending' | 'Claimed' | 'Refunded';

export interface Quote {
  canSend: boolean;
  price: bigint;
  tier: number;
  vip: boolean;
  allowlisted: boolean;
  nextQ: number;
  inputs: ControllerInputs;
}

export interface InboxView {
  id: number;
  handle: string;
  name: string;
  bio: string;
  owner: Address;
  preset: ControllerPreset;
  curve: CurveProfile;
  partnerCpu: Address | null;
  /** 0 none · 1 ERC-721 holder (partnerCpu) · 2 adapter */
  vipKind: number;
  /** VIP source is the TapeOut Community VIP adapter. */
  communityVip: boolean;
  token: Token;
  basePrice: bigint;
  slaSeconds: number;
  /** LATCH queue depth Q (0..7) read from the escrow. */
  latch: number;
  active: boolean;
  /** Policy circuit id on VOXR. */
  circuitId: number;
  /** True when the pricing circuit is one of Voxro's own taped-out controllers (VOXR #4–#8). Anything else
   *  is a custom circuit the owner chose: it can be swapped while tickets are pending, so senders are warned. */
  standardPolicy: boolean;
  /** Token id of the inbox (mailbox) circuit. */
  containerTokenId: number;
  /** Factory index of the processor that holds the inbox circuit (the <cpu> in its tape:// name); null until resolved. */
  containerCpuIndex: number | null;
  /** Recipient's published TapeSend X25519 key ('0x' when none is usable). */
  publicKey: Hex;
  /** Public onchain reply record kept by the escrow: answered, expired/declined, average reply time. */
  replies: number;
  refunded: number;
  avgReplySeconds: number | null;
  earned: bigint;
  /** Primary member container (ERC-6551 account) — where Guest envelopes are addressed. */
  container: Address;
  /** Every member container; a claim is valid only when the reply came from one of these. */
  memberContainers: Address[];
  memberIds: Array<{ circuits: Address; tokenId: bigint }>;
  /** Lens quote computed onchain for the connected sender. */
  live: { sender: Address; quote: Quote };
}

export interface TicketView {
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
  /** Guest lane reply key: public part from the escrow, secret only in the sender's browser ('0x' otherwise). */
  senderKey: { publicKey: Hex; secretKey: Hex };
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

export interface ChainState {
  inboxes: InboxView[];
  tickets: TicketView[];
  /** `DeWebHub.inbox[to][i]` entries for the replies this browser knows about. */
  hub: Record<string, HubEntry[]>;
  blockNumber: number;
  /** False until the first successful read. */
  loaded: boolean;
}

export interface ClaimCheck {
  key: 'from' | 'time' | 'digest';
  ok: boolean;
  detail: string;
}

export const findInbox = (s: ChainState, q: string): InboxView | undefined => {
  const needle = q.trim().replace(/^@/, '').toLowerCase();
  return s.inboxes.find((i) => i.handle.toLowerCase() === needle || String(i.id) === needle);
};

export function settledByToken(s: ChainState): Record<Token, { recipient: bigint; protocol: bigint }> {
  const out: Record<Token, { recipient: bigint; protocol: bigint }> = { USDT0: { recipient: 0n, protocol: 0n }, USDT: { recipient: 0n, protocol: 0n }, OKB: { recipient: 0n, protocol: 0n }, FAB: { recipient: 0n, protocol: 0n } };
  for (const t of s.tickets) {
    if (t.status === 'Claimed' && t.payout) {
      out[t.token].recipient += t.payout.recipient;
      out[t.token].protocol += t.payout.protocol;
    }
  }
  return out;
}
