/**
 * Read-only view of Voxro on X Layer, shared by the Telegram bot, the MCP server and the x402 gateway.
 * Everything here is public chain data read through VoxroLens; nothing needs a key.
 */
import { SURGE_BPS, SURGE_TABLES, XLAYER, bytes32ToHandle, handleToBytes32, voxroEscrowAbi, voxroLensAbi, type Address, type CurveProfile, type Hex } from '@voxro/sdk';
import { createPublicClient, defineChain, fallback, formatUnits, http } from 'viem';
import deployment from '../../contracts/deployments/xlayer.json' with { type: 'json' };

export const ORIGIN = process.env.VOXRO_ORIGIN ?? 'https://voxro.shieldsuite.xyz';
export const ESCROW = deployment.escrow as Address;
export const LENS = deployment.lens as Address;
export const VOXR = deployment.voxrCircuits as Address;
export const COMMUNITY_VIP = (deployment as { communityVip?: string }).communityVip as Address | undefined;
const ZERO = '0x0000000000000000000000000000000000000000' as Address;

export const xlayer = defineChain({
  id: 196,
  name: 'X Layer',
  nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 },
  rpcUrls: { default: { http: [...XLAYER.rpcUrls] } },
  blockExplorers: { default: { name: 'OKX Explorer', url: XLAYER.explorer } },
  contracts: { multicall3: { address: XLAYER.multicall3 } },
});

export const client = createPublicClient({
  chain: xlayer,
  transport: process.env.VOXRO_RPC_URL ? http(process.env.VOXRO_RPC_URL) : fallback(XLAYER.rpcUrls.map((u) => http(u, { timeout: 12_000, retryCount: 1 }))),
});

export const TOKENS: Record<string, { symbol: string; decimals: number }> = {
  [ZERO]: { symbol: 'OKB', decimals: 18 },
  [XLAYER.usdt0.toLowerCase()]: { symbol: 'USD₮0', decimals: 6 },
  [XLAYER.usdt.toLowerCase()]: { symbol: 'USDT', decimals: 6 },
  '0x72f349b1eee7833b26f8c81a8410775a4e231ed2': { symbol: 'FAB', decimals: 8 },
};
export const tokenInfo = (addr: string) => TOKENS[addr.toLowerCase()] ?? TOKENS[addr] ?? { symbol: 'tokens', decimals: 18 };

/** "12.5 USD₮0", trimmed to at most 4 decimals. */
export function money(token: string, amount: bigint): string {
  const t = tokenInfo(token);
  const n = Number(formatUnits(amount, t.decimals));
  const s = n >= 100 ? n.toFixed(0) : n >= 1 ? String(Number(n.toFixed(2))) : String(Number(n.toFixed(4)));
  return `${s} ${t.symbol}`;
}

export const PRESETS: Record<number, { name: string; curve: CurveProfile | null }> = {
  4: { name: 'FounderBalanced', curve: 'balanced' },
  5: { name: 'VcFortress', curve: 'fortress' },
  6: { name: 'AuditorDisclosure', curve: 'gentle' },
  7: { name: 'Steep', curve: 'steep' },
  8: { name: 'Configurable', curve: null },
};
const CURVES: CurveProfile[] = ['gentle', 'balanced', 'steep', 'fortress'];

export interface Inbox {
  id: number;
  handle: string;
  owner: Address;
  token: Address;
  basePrice: bigint;
  slaSeconds: number;
  queue: number;
  active: boolean;
  preset: string;
  curve: CurveProfile;
  communityVip: boolean;
  answered: number;
  refunded: number;
  pending: number;
  avgReplySeconds: number | null;
  quote: { canSend: boolean; price: bigint; tier: number; vip: boolean };
  members: Address[];
}

interface LensInbox {
  id: bigint;
  inbox: { policyCpu: Address; policyCircuitId: bigint; inboxCircuits: Address; paymentToken: Address; basePrice: bigint; slaSeconds: number; curve: number; active: boolean; vipKind: number; vipSource: Address; handle: Hex; pending: number; answered: number; refunded: number; replySeconds: bigint };
  recipient: Address;
  members: readonly Address[];
  queueDepth: number;
  quote: { canSend: boolean; price: bigint; tier: number; vipDiscount: boolean };
}

function mapInbox(v: LensInbox): Inbox {
  const ib = v.inbox;
  const onVoxr = ib.policyCpu.toLowerCase() === VOXR.toLowerCase();
  const p = onVoxr ? PRESETS[Number(ib.policyCircuitId)] : undefined;
  const curve = p?.curve ?? CURVES[ib.curve] ?? 'balanced';
  return {
    id: Number(v.id),
    handle: bytes32ToHandle(ib.handle) || `inbox-${v.id}`,
    owner: v.recipient,
    token: ib.paymentToken,
    basePrice: ib.basePrice,
    slaSeconds: ib.slaSeconds,
    queue: v.queueDepth,
    active: ib.active,
    preset: p ? `${p.name}Inbox` : `circuit #${ib.policyCircuitId}`,
    curve,
    communityVip: ib.vipKind === 2 && !!COMMUNITY_VIP && ib.vipSource.toLowerCase() === COMMUNITY_VIP.toLowerCase(),
    answered: ib.answered,
    refunded: ib.refunded,
    pending: ib.pending,
    avgReplySeconds: ib.answered > 0 ? Number(ib.replySeconds) / ib.answered : null,
    quote: { canSend: v.quote.canSend, price: v.quote.price, tier: v.quote.tier, vip: v.quote.vipDiscount },
    members: [...v.members],
  };
}

/** All registered inboxes, with quotes computed by each inbox's circuit for `sender` (default: a new sender). */
export async function directory(sender: Address = ZERO): Promise<Inbox[]> {
  const dir = (await client.readContract({ address: LENS, abi: voxroLensAbi, functionName: 'directory', args: [0n, 200n, sender] })) as unknown as LensInbox[];
  return dir.filter((v) => v.inbox.inboxCircuits !== ZERO).map(mapInbox);
}

export const normHandle = (h: string) => h.trim().replace(/^@/, '').replace(/^.*\/#\/@/, '').toLowerCase();

export async function inboxByHandle(handle: string, sender: Address = ZERO): Promise<Inbox | null> {
  const h = normHandle(handle);
  if (!/^[a-z0-9_]{1,31}$/.test(h)) return null;
  try {
    const v = (await client.readContract({ address: LENS, abi: voxroLensAbi, functionName: 'byHandle', args: [handleToBytes32(h), sender] })) as unknown as LensInbox;
    return v.inbox.inboxCircuits === ZERO ? null : mapInbox(v);
  } catch {
    return null;
  }
}

/** Price at each queue depth 0..7 for a new sender (the quote is taken on the post-enqueue depth). */
export function ladder(ib: Inbox): bigint[] {
  const table = SURGE_TABLES[ib.curve];
  return Array.from({ length: 8 }, (_, d) => (ib.basePrice * SURGE_BPS[table[Math.min(d + 1, 7)]! as 0 | 1 | 2 | 3]) / 10_000n);
}

export type Status = 'Pending' | 'Claimed' | 'Refunded' | 'Declined';
const STATUS: Status[] = ['Pending', 'Claimed', 'Refunded', 'Declined'];
export interface Ticket {
  id: number;
  inboxId: number;
  sender: Address;
  token: Address;
  amount: bigint;
  createdAt: number;
  deadline: number;
  status: Status;
  lane: 'container' | 'guest';
  replyTimestamp: number;
}
interface LensTicket {
  id: bigint;
  ticket: { inboxId: bigint; sender: Address; token: Address; amount: bigint; createdAt: number; deadline: number; status: number; lane: number; replyTimestamp: number };
}
const mapTicket = (v: LensTicket): Ticket => ({
  id: Number(v.id),
  inboxId: Number(v.ticket.inboxId),
  sender: v.ticket.sender,
  token: v.ticket.token,
  amount: v.ticket.amount,
  createdAt: Number(v.ticket.createdAt),
  deadline: Number(v.ticket.deadline),
  status: STATUS[v.ticket.status] ?? 'Pending',
  lane: v.ticket.lane === 1 ? 'guest' : 'container',
  replyTimestamp: Number(v.ticket.replyTimestamp),
});

/** Tickets for several inboxes in one multicall. */
export async function ticketsFor(inboxIds: number[]): Promise<Map<number, Ticket[]>> {
  const out = new Map<number, Ticket[]>();
  if (!inboxIds.length) return out;
  const res = await client.multicall({ allowFailure: false, contracts: inboxIds.map((id) => ({ address: LENS, abi: voxroLensAbi, functionName: 'inboxTickets' as const, args: [BigInt(id)] as const })) });
  inboxIds.forEach((id, i) => out.set(id, (res[i] as unknown as LensTicket[]).map(mapTicket)));
  return out;
}

export async function ticket(id: number): Promise<Ticket> {
  return mapTicket((await client.readContract({ address: LENS, abi: voxroLensAbi, functionName: 'getTicket', args: [BigInt(id)] })) as unknown as LensTicket);
}

export async function outbox(sender: Address): Promise<Ticket[]> {
  return ((await client.readContract({ address: LENS, abi: voxroLensAbi, functionName: 'outbox', args: [sender] })) as unknown as LensTicket[]).map(mapTicket);
}

export async function quote(inboxId: number, sender: Address = ZERO) {
  const q = (await client.readContract({ address: ESCROW, abi: voxroEscrowAbi, functionName: 'quoteSend', args: [BigInt(inboxId), sender] })) as { canSend: boolean; price: bigint; tier: number; vipDiscount: boolean };
  return { canSend: q.canSend, price: q.price, tier: Number(q.tier), vip: q.vipDiscount };
}

export const TIER_X = ['1×', '1.5×', '2.5×', '4×'];
export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const profileLink = (h: string) => `${ORIGIN}/#/@${h}`;
export function hours(s: number): string {
  if (s <= 0) return '0m';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h >= 48 ? `${Math.round(h / 24)}d` : h > 0 ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`;
}
