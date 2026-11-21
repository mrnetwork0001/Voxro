/**
 * Instant notifications over TapeOut relays (TAP-14 §6.1 sealed inbox wires, type 0x03).
 *
 * Settlement never depends on this: a paid message is locked, answered and claimed onchain exactly
 * as before. In addition, the sender seals a small `voxro.notice/v1` object to the recipient's
 * channel key and posts it to the recipient's inbox room on the relays their channel key record
 * lists, so the recipient hears about it at once. A notice is only a hint: the listener re-reads the
 * ticket from the escrow before showing it.
 */
import { channel, circuitsAbi, siteRegistryAbi, XLAYER, XLAYER_CHAIN_ID, type Address, type Hex } from '@voxro/sdk';
import { ed25519, x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { randomBytes } from '@noble/hashes/utils.js';
import { bytesToHex, hexToBytes } from 'viem';
import { chainBackendInfo, emit, myMember, requireWallet, refresh, tx, type WalletCtx } from './escrow.ts';
import { publicClient } from './client.ts';
import type { InboxView, TicketView } from '../model.ts';

/** Reference relay published by the TAP-14 authors (relaySend / relayRecv are free, CORS-open). */
export const DEFAULT_RELAY: channel.RelayRef = {
  url: import.meta.env.VITE_TAPE_RELAY_URL ?? 'https://relay.tapeapi.fun/tapeapi/v1',
  container: import.meta.env.VITE_TAPE_RELAY_CONTAINER ?? '0x9cD838625251576c199B2DeF7A17e50266843185',
};
export const NOTICE_KIND = 'voxro.notice/v1';
const PATH = channel.CHANNEL_RECORD_PATH;
const RECORD_DAYS = 90;

export interface Notice {
  v: 1;
  kind: typeof NOTICE_KIND;
  chainId: number;
  escrow: Address;
  inboxId: number;
  ticketId: number;
  token: string;
  amount: string;
  deadline: number;
}

// ─── channel static keys: derived from one holder signature, so any browser can rebuild them ───
const channelText = (container: Address) =>
  ['Voxro instant notifications', '', 'Sign to create the channel key that lets your Voxro inbox receive encrypted TapeRelay notifications.', 'This signature never leaves your browser and costs no gas.', '', `Container: ${container.toLowerCase()}`, `Chain ID: ${XLAYER_CHAIN_ID}`].join('\n');

const keyCache = new Map<string, { x: Uint8Array; X: Uint8Array; ed: Uint8Array }>();
async function channelKeys(w: WalletCtx, container: Address) {
  const k = `${container.toLowerCase()}:${w.address.toLowerCase()}`;
  const hit = keyCache.get(k);
  if (hit) return hit;
  emit({ kind: 'info', label: 'Sign once to unlock instant notifications (no gas)' });
  const sig = await w.walletClient.signMessage({ account: w.walletClient.account ?? w.address, message: channelText(container) });
  const ikm = hexToBytes(sig).slice(0, 64); // r ‖ s
  const x = hkdf(sha256, ikm, new TextEncoder().encode('voxro/channel/v1'), new TextEncoder().encode(`x25519:${container.toLowerCase()}`), 32);
  const edSeed = hkdf(sha256, ikm, new TextEncoder().encode('voxro/channel/v1'), new TextEncoder().encode(`ed25519:${container.toLowerCase()}`), 32);
  const keys = { x, X: x25519.getPublicKey(x), ed: ed25519.getPublicKey(edSeed) };
  keyCache.set(k, keys);
  return keys;
}

// ─── record: read + verify, publish ────────────────────────────────────────────────────────────
/** Reads and verifies a container's channel key record (null when absent or invalid). */
export async function readChannelRecord(container: Address, member: { circuits: Address; tokenId: bigint }): Promise<channel.ChannelRecord | null> {
  const info = await publicClient.readContract({ address: XLAYER.siteRegistry, abi: siteRegistryAbi, functionName: 'fileInfo', args: [container, PATH] });
  const [size, , sha, , chunkCount] = info as readonly [number, string, Hex, number, bigint];
  if (chunkCount === 0n || size < 1 || size > 4096 || /^0x0+$/.test(sha)) return null;
  const bytes = hexToBytes((await publicClient.readContract({ address: XLAYER.siteRegistry, abi: siteRegistryAbi, functionName: 'read', args: [container, PATH] })) as Hex);
  if (bytes.length !== size || bytesToHex(sha256(bytes)) !== sha.toLowerCase()) return null;
  const holder = (await publicClient.readContract({ address: member.circuits, abi: circuitsAbi, functionName: 'ownerOf', args: [member.tokenId] })) as Address;
  try {
    return await channel.verifyChannelRecord(new TextDecoder().decode(bytes), { container, chainId: XLAYER_CHAIN_ID, holder });
  } catch {
    return null;
  }
}

/** Publishes `.well-known/tape-channel.json` into the inbox container's DeWEB site (1 signature + EIP-712 + 1 tx). */
export async function enableNotifications(inbox: InboxView): Promise<channel.ChannelRecord> {
  const w = await requireWallet();
  const me = await myMember(inbox, w.address);
  const keys = await channelKeys(w, me.container);
  const issued = Math.floor(Date.now() / 1000);
  const unsigned = { container: me.container, chainId: XLAYER_CHAIN_ID, x25519: bytesToHex(keys.X), ed25519: bytesToHex(keys.ed), issued, expires: issued + RECORD_DAYS * 86_400, inbox: { relays: [DEFAULT_RELAY] } };
  emit({ kind: 'info', label: 'Sign your channel key record (EIP-712, no gas)' });
  const sig = await w.walletClient.signTypedData({ account: w.walletClient.account ?? w.address, ...channel.channelKeysTypedData(unsigned) });
  const record: channel.ChannelRecord = { tapechannel: '1', ...unsigned, sig };
  const bytes = new TextEncoder().encode(channel.canonicalJSON(record));
  await tx('Publish channel key (DeWEB)', () =>
    w.walletClient.writeContract({ account: w.walletClient.account ?? w.address, chain: w.walletClient.chain, address: XLAYER.siteRegistry, abi: siteRegistryAbi, functionName: 'putFile', args: [me.container, PATH, 'application/json', bytesToHex(sha256(bytes)), bytesToHex(bytes)] }),
  );
  return record;
}

// ─── sender side: best-effort notice after a paid send ─────────────────────────────────────────
/** Seals a notice to every member container that has a valid record and posts it to its relays. */
export async function notifyRecipient(inbox: InboxView, t: TicketView): Promise<{ delivered: number; skipped: number }> {
  const notice: Notice = { v: 1, kind: NOTICE_KIND, chainId: XLAYER_CHAIN_ID, escrow: chainBackendInfo.escrow, inboxId: inbox.id, ticketId: t.id, token: t.token, amount: t.amount.toString(), deadline: t.deadline };
  let delivered = 0;
  let skipped = 0;
  for (let i = 0; i < inbox.memberIds.length; i++) {
    const m = inbox.memberIds[i]!;
    const container = inbox.memberContainers[i];
    if (!container) continue;
    const rec = await readChannelRecord(container, m).catch(() => null);
    const relays = rec?.inbox?.relays ?? [];
    if (!rec || relays.length === 0) {
      skipped++;
      continue;
    }
    const room = channel.inboxRoom(container, XLAYER_CHAIN_ID);
    const wire = channel.sealInboxWire({ recipientKey: hexToBytes(rec.x25519), room, message: notice, random: randomBytes });
    for (const r of relays) {
      try {
        await channel.relaySend(r.url, room, wire);
        delivered++;
        break; // one relay is enough; receivers dedupe across transports
      } catch {
        /* try the next relay */
      }
    }
  }
  return { delivered, skipped };
}

// ─── recipient side: listen on the inbox room ──────────────────────────────────────────────────
const cursorKey = (room: Uint8Array) => `voxro.relay.cursor.${bytesToHex(room)}`;

/**
 * Long-polls the inbox room on the record's relays and calls `onNotice` for each verified notice
 * (escrow + chain match, ticket exists onchain for this inbox). Returns a stop function.
 */
export async function listenNotifications(inbox: InboxView, onNotice: (n: Notice) => void, onState?: (s: 'listening' | 'error' | 'stopped', detail?: string) => void): Promise<() => void> {
  const w = await requireWallet();
  const me = await myMember(inbox, w.address);
  const rec = await readChannelRecord(me.container, { circuits: me.circuits, tokenId: me.tokenId });
  if (!rec) throw new Error('This inbox has no channel key record yet: enable notifications first');
  const keys = await channelKeys(w, me.container);
  if (bytesToHex(keys.X).toLowerCase() !== rec.x25519.toLowerCase()) throw new Error('This wallet derives a different channel key than the published record: republish it');
  const room = channel.inboxRoom(me.container, XLAYER_CHAIN_ID);
  const relay = (rec.inbox?.relays ?? [])[0];
  if (!relay) throw new Error('The channel key record lists no relay');
  const ctl = new AbortController();
  let stopped = false;
  const saved = (() => {
    try {
      return JSON.parse(localStorage.getItem(cursorKey(room)) ?? 'null') as { after: number; epoch: string | null } | null;
    } catch {
      return null;
    }
  })();
  let after = saved?.after ?? -1;
  let epoch: string | null = saved?.epoch ?? null;
  const seen = new Set<number>();
  void (async () => {
    onState?.('listening', new URL(relay.url).host);
    while (!stopped) {
      try {
        const r = await channel.relayRecv(relay.url, room, after, epoch, 20_000, ctl.signal);
        if (r.epoch !== epoch) {
          epoch = r.epoch;
          if (after !== -1 && r.frames.length === 0) after = -1;
        }
        for (const f of r.frames) {
          after = Math.max(after, f.i);
          if (f.wire[0] !== 0x03) continue;
          let m: Record<string, unknown>;
          try {
            m = channel.openInboxWire({ secretKey: keys.x, room, wire: f.wire });
          } catch {
            continue; // not for us / tampered
          }
          if (m.kind !== NOTICE_KIND || m.chainId !== XLAYER_CHAIN_ID || String(m.escrow).toLowerCase() !== chainBackendInfo.escrow.toLowerCase() || m.inboxId !== inbox.id) continue;
          const ticketId = Number(m.ticketId);
          if (!Number.isSafeInteger(ticketId) || seen.has(ticketId)) continue;
          seen.add(ticketId);
          await refresh();
          onNotice(m as unknown as Notice);
        }
        if (r.next >= after) after = r.next;
        localStorage.setItem(cursorKey(room), JSON.stringify({ after, epoch }));
      } catch (e) {
        if (stopped) break;
        onState?.('error', e instanceof Error ? e.message : String(e));
        await new Promise((res) => setTimeout(res, 5000));
        if (!stopped) onState?.('listening', new URL(relay.url).host);
      }
    }
    onState?.('stopped');
  })();
  return () => {
    stopped = true;
    ctl.abort();
  };
}
