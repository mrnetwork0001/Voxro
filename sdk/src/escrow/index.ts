/** VoxroEscrow / VoxroLens ABIs and small helpers shared by the app and CLI. */
import { bytesToHex, hexToBytes } from '../tapeout/pack.js';
export * from './abi.js';

export const VipKind = { None: 0, Erc721Holder: 1, Adapter: 2 } as const;
export const Lane = { Container: 0, Guest: 1 } as const;
export const TicketStatus = { Pending: 0, Claimed: 1, Refunded: 2, Declined: 3 } as const;
export const TICKET_STATUS_NAMES = ['Pending', 'Claimed', 'Refunded', 'Declined'] as const;
export const PROTOCOL_BPS = 500n;
export const KEEPER_BPS = 10n;

/** `@handle` → bytes32 (lower-case ASCII, ≤ 32 bytes, right-padded with zeros). */
export function handleToBytes32(handle: string): `0x${string}` {
  const h = handle.replace(/^@/, '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{1,32}$/.test(h)) throw new RangeError('handle must be 1–32 chars of a-z 0-9 . _ -');
  const bytes = new Uint8Array(32);
  bytes.set(new TextEncoder().encode(h));
  return bytesToHex(bytes);
}

export function bytes32ToHandle(b: `0x${string}`): string {
  const bytes = hexToBytes(b);
  let n = 0;
  while (n < bytes.length && bytes[n] !== 0) n++;
  return new TextDecoder().decode(bytes.slice(0, n));
}

/** Payout split applied by `claimBounty`. */
export function splitBounty(amount: bigint): { recipient: bigint; protocol: bigint; keeper: bigint } {
  const protocolTotal = (amount * PROTOCOL_BPS) / 10_000n;
  const keeper = (amount * KEEPER_BPS) / 10_000n;
  return { recipient: amount - protocolTotal, protocol: protocolTotal - keeper, keeper };
}
