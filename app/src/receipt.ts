/** Pure receipt builder. Today it reads the simulation store; on mainnet the same shape is filled from VoxroEscrow + DeWebHub. */
import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex, hexToBytes, type Hex } from '@voxro/sdk';
import { containerOf, verifyClaim, type ClaimCheck, type HubEntry, type SimInbox, type SimState, type SimTicket } from './escrow.ts';

export interface Receipt {
  ticket: SimTicket;
  inbox: SimInbox;
  recipientContainer: string;
  envelopeDigest: Hex;
  envelopeBytes: number;
  entry?: HubEntry;
  checks: ClaimCheck[];
  verified: boolean;
  settlement: { kind: 'claimed' | 'refunded' | 'pending'; at?: number; paid?: bigint; fee?: bigint };
}

export function buildReceipt(s: SimState, ticketId: number, verify: (s: SimState, t: SimTicket) => { ok: boolean; checks: ClaimCheck[]; entry?: HubEntry } = verifyClaim): Receipt | null {
  const ticket = s.tickets.find((t) => t.id === ticketId);
  if (!ticket) return null;
  const inbox = s.inboxes.find((i) => i.id === ticket.inboxId);
  if (!inbox) return null;
  const env = hexToBytes(ticket.envelope);
  const v = ticket.reply ? verify(s, ticket) : { ok: false, checks: [] as ClaimCheck[], entry: undefined };
  const settlement: Receipt['settlement'] =
    ticket.status === 'Claimed' ? { kind: 'claimed', at: ticket.settledAt, paid: ticket.payout?.recipient, fee: ticket.payout?.protocol } : ticket.status === 'Refunded' ? { kind: 'refunded', at: ticket.settledAt } : { kind: 'pending' };
  return { ticket, inbox, recipientContainer: containerOf(inbox), envelopeDigest: bytesToHex(keccak_256(env)), envelopeBytes: env.length, entry: v.entry, checks: v.checks, verified: v.ok, settlement };
}
