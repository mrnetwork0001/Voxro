/** `DeWebHub` (TapeSend hub) ABI and viem read/write helpers. */
import { decodeEventLog, parseAbi, type Log, type PublicClient, type WalletClient } from 'viem';
import { XLAYER, XLAYER_CHAIN_ID } from '../tapeout/addresses.js';
import type { Address } from '../tapeout/netlist.js';
import { bytesToHex } from '../tapeout/pack.js';
import { endpointHex, type Hex } from './payload.js';

export const deWebHubAbi = parseAbi([
  'struct Entry { address from; uint56 blockNumber; uint40 timestamp; bytes32 digest; }',
  'struct OutEntry { bytes32 to; uint32 inboxIndex; uint56 blockNumber; uint40 timestamp; bytes32 digest; }',
  'struct KeyView { address container; bytes32 endpoint; bool opened; address current; uint8 suite; uint16 keyIndex; bytes32 key; bool usable; uint32 version; uint64 chains; }',
  'function send(address circuits, uint256 tokenId, bytes32 to, bytes32 ref, bytes payload) returns (uint256 inboxIndex)',
  'function publishKey(address circuits, uint256 tokenId, uint8 suite, uint16 keyIndex, bytes32 key, uint64 chains)',
  'function revokeKey(address circuits, uint256 tokenId)',
  'function inboxCount(bytes32 to) view returns (uint256)',
  'function inboxAt(bytes32 to, uint256 i) view returns (Entry)',
  'function inboxPage(bytes32 to, uint256 start, uint256 n) view returns (Entry[])',
  'function outboxCount(address from) view returns (uint256)',
  'function outboxPage(address from, uint256 start, uint256 n) view returns (OutEntry[])',
  'function digestOf(bytes32 ref, bytes payload) pure returns (bytes32)',
  'function endpointOf(address container) view returns (bytes32)',
  'function accountOf(address circuits, uint256 tokenId) view returns (address)',
  'function keyFor(address circuits, uint256 tokenId) view returns (KeyView)',
  'event Sent(bytes32 indexed to, address indexed from, bytes32 indexed ref, uint256 inboxIndex, uint256 outboxIndex, bytes payload)',
  'event KeyPublished(address indexed container, address indexed holder, uint8 suite, uint16 keyIndex, bytes32 key, uint32 version, uint64 chains)',
  'event KeyRevoked(address indexed container, address indexed holder, uint32 version)',
]);

export const SUITE_X25519 = 1;
/** `chains` bitmap: bit 0 = BNB (56), bit 1 = Base (8453), bit 2 = X Layer (196). */
export const CHAIN_BIT_BNB = 1n << 0n;
export const CHAIN_BIT_BASE = 1n << 1n;
export const CHAIN_BIT_XLAYER = 1n << 2n;
export const MAX_PAGE = 200;

export interface InboxEntry {
  from: Address;
  blockNumber: bigint;
  timestamp: number;
  digest: Hex;
}

export interface OutboxEntry {
  to: Hex;
  inboxIndex: number;
  blockNumber: bigint;
  timestamp: number;
  digest: Hex;
}

export interface KeyView {
  container: Address;
  endpoint: Hex;
  opened: boolean;
  current: Address;
  suite: number;
  keyIndex: number;
  key: Hex;
  usable: boolean;
  version: number;
  chains: bigint;
}

export interface HubOptions {
  hub?: Address;
}

/** Endpoint of a container on X Layer, computed locally (equals `hub.endpointOf(container)`). */
export const endpointOf = (container: Address, chainId: number | bigint = XLAYER_CHAIN_ID): Hex => endpointHex(container, chainId);

export async function keyFor(client: PublicClient, circuits: Address, tokenId: bigint, o: HubOptions = {}): Promise<KeyView> {
  const v = await client.readContract({ address: o.hub ?? XLAYER.deWebHub, abi: deWebHubAbi, functionName: 'keyFor', args: [circuits, tokenId] });
  return { ...v, container: v.container as Address, current: v.current as Address } as KeyView;
}

export async function accountOf(client: PublicClient, circuits: Address, tokenId: bigint, o: HubOptions = {}): Promise<Address> {
  return (await client.readContract({ address: o.hub ?? XLAYER.deWebHub, abi: deWebHubAbi, functionName: 'accountOf', args: [circuits, tokenId] })) as Address;
}

export async function inboxCount(client: PublicClient, to: Hex, o: HubOptions = {}): Promise<bigint> {
  return client.readContract({ address: o.hub ?? XLAYER.deWebHub, abi: deWebHubAbi, functionName: 'inboxCount', args: [to] });
}

export async function inboxAt(client: PublicClient, to: Hex, i: bigint, o: HubOptions = {}): Promise<InboxEntry> {
  const e = await client.readContract({ address: o.hub ?? XLAYER.deWebHub, abi: deWebHubAbi, functionName: 'inboxAt', args: [to, i] });
  return { from: e.from as Address, blockNumber: e.blockNumber, timestamp: e.timestamp, digest: e.digest };
}

export async function inboxPage(client: PublicClient, to: Hex, start: bigint, n: number, o: HubOptions = {}): Promise<InboxEntry[]> {
  const page = await client.readContract({ address: o.hub ?? XLAYER.deWebHub, abi: deWebHubAbi, functionName: 'inboxPage', args: [to, start, BigInt(Math.min(n, MAX_PAGE))] });
  return page.map((e) => ({ from: e.from as Address, blockNumber: e.blockNumber, timestamp: e.timestamp, digest: e.digest }));
}

export async function outboxCount(client: PublicClient, from: Address, o: HubOptions = {}): Promise<bigint> {
  return client.readContract({ address: o.hub ?? XLAYER.deWebHub, abi: deWebHubAbi, functionName: 'outboxCount', args: [from] });
}

export async function outboxPage(client: PublicClient, from: Address, start: bigint, n: number, o: HubOptions = {}): Promise<OutboxEntry[]> {
  const page = await client.readContract({ address: o.hub ?? XLAYER.deWebHub, abi: deWebHubAbi, functionName: 'outboxPage', args: [from, start, BigInt(Math.min(n, MAX_PAGE))] });
  return page.map((e) => ({ to: e.to, inboxIndex: e.inboxIndex, blockNumber: e.blockNumber, timestamp: e.timestamp, digest: e.digest }));
}

export interface SendParams {
  circuits: Address;
  tokenId: bigint;
  to: Hex;
  ref?: Hex;
  payload: Uint8Array;
}

/** `DeWebHub.send` from the holder's wallet. The payload is only in the `Sent` log; the chain keeps the digest. */
export async function sendMessage(wallet: WalletClient, p: SendParams, o: HubOptions = {}): Promise<Hex> {
  const account = wallet.account;
  if (!account) throw new Error('wallet client has no account');
  return wallet.writeContract({
    account,
    chain: wallet.chain,
    address: o.hub ?? XLAYER.deWebHub,
    abi: deWebHubAbi,
    functionName: 'send',
    args: [p.circuits, p.tokenId, p.to, p.ref ?? (`0x${'00'.repeat(32)}` as Hex), bytesToHex(p.payload)],
  });
}

export interface SentEvent {
  to: Hex;
  from: Address;
  ref: Hex;
  inboxIndex: bigint;
  outboxIndex: bigint;
  payload: Hex;
}

/** Decode the `Sent` events of a receipt (the only place the ciphertext lives). */
export function decodeSentLogs(logs: readonly Log[], hub: Address = XLAYER.deWebHub): SentEvent[] {
  const out: SentEvent[] = [];
  for (const log of logs) {
    if (log.address.toLowerCase() !== hub.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: deWebHubAbi, data: log.data, topics: log.topics, eventName: 'Sent' });
      const a = ev.args;
      out.push({ to: a.to, from: a.from as Address, ref: a.ref, inboxIndex: a.inboxIndex, outboxIndex: a.outboxIndex, payload: a.payload });
    } catch {
      /* not a Sent log */
    }
  }
  return out;
}
