/**
 * End-to-end run of the simulated VoxroEscrow: quote → lock (both lanes) → decrypt → reply →
 * claimBounty checks → payout and LATCH step-down; refund after the deadline. Prices must equal the
 * compiled circuit's outputs and every envelope must be a real TAP-10 v2 seal.
 */
import { SURGE_TABLES, parsePayload, hexToBytes } from '@voxro/sdk';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEMO_SENDER } from '../src/config.ts';
import { proveAll } from '../src/sim/catalog.ts';
import { claim, fastForward, findInbox, lock, openEnvelope, openReply, quoteFor, refundExpired, reply, resetSim, simStore, verifyClaim } from '../src/sim/escrow.ts';

const inboxOf = (handle: string) => findInbox(simStore.get(), handle)!;
const ticketOf = (id: number) => simStore.get().tickets.find((t) => t.id === id)!;

describe('simulated VoxroEscrow', () => {
  beforeEach(() => resetSim());

  it('the whole catalog proves in the app runtime', () => {
    const p = proveAll();
    expect(p.ok).toBe(true);
    expect(p.total).toBe(2656);
  });

  it('Balanced inbox quotes 10 → 15 → 15 → 25 → 25 USD₮0 for successive cold senders', () => {
    const seen: bigint[] = [];
    for (let i = 0; i < 5; i++) {
      const ib = inboxOf('mrnetwork');
      const q = quoteFor(ib, DEMO_SENDER, false);
      seen.push(q.price);
      expect(q.canSend).toBe(true);
      lock({ inboxId: ib.id, sender: DEMO_SENDER, lane: 'guest', subject: `s${i}`, body: `b${i}`, holdsPartner: false });
    }
    expect(seen).toEqual([10_000_000n, 15_000_000n, 15_000_000n, 25_000_000n, 25_000_000n]);
    expect(inboxOf('mrnetwork').latch).toBe(5);
  });

  it('Guest lane: seal → decrypt → reply → verify → claim pays 95% and steps the queue down', () => {
    const ib = inboxOf('mrnetwork');
    const t = lock({ inboxId: ib.id, sender: DEMO_SENDER, lane: 'guest', subject: 'Partnership', body: 'Hello 你好', holdsPartner: false });
    const parsed = parsePayload(hexToBytes(t.envelope));
    expect(parsed.kind).toBe('sealed');
    const opened = openEnvelope(t, inboxOf('mrnetwork'));
    expect(opened).toMatchObject({ kind: 'message', subject: 'Partnership', body: 'Hello 你好' });
    expect(inboxOf('mrnetwork').latch).toBe(1);

    reply(t.id, 'Deal. Call Tuesday.');
    const v = verifyClaim(simStore.get(), ticketOf(t.id));
    expect(v.checks.map((c) => c.ok)).toEqual([true, true, true]);
    const r = openReply(ticketOf(t.id), inboxOf('mrnetwork'));
    expect(r).toMatchObject({ body: 'Deal. Call Tuesday.' });

    const done = claim(t.id);
    expect(done.status).toBe('Claimed');
    expect(done.payout).toEqual({ recipient: 9_500_000n, protocol: 500_000n });
    expect(inboxOf('mrnetwork').latch).toBe(0);
    expect(inboxOf('mrnetwork').earned).toBe(9_500_000n);
  });

  it('Container lane: expectedReplyRef is the TAP-10 messageId of the inbox entry and the reply verifies', () => {
    const ib = inboxOf('whitehat.audit');
    const t = lock({ inboxId: ib.id, sender: DEMO_SENDER, lane: 'container', subject: 'Disclosure', body: 'Critical: …', holdsPartner: false });
    expect(t.expectedReplyRef).toMatch(/^0x[0-9a-f]{64}$/);
    expect(openEnvelope(t, inboxOf('whitehat.audit'))).toMatchObject({ body: 'Critical: …' });
    reply(t.id, 'Confirmed, bounty approved.');
    expect(verifyClaim(simStore.get(), ticketOf(t.id)).ok).toBe(true);
    expect(claim(t.id).payout?.recipient).toBe(23_750_000n);
  });

  it('Fortress inbox pauses the cold sender who would fill it (Q′ = 7) but lets a partner holder through at half price', () => {
    const ib = inboxOf('fortress.vc');
    for (let i = 0; i < 6; i++) lock({ inboxId: ib.id, sender: DEMO_SENDER, lane: 'guest', subject: '', body: 'x', holdsPartner: false });
    const full = inboxOf('fortress.vc');
    expect(full.latch).toBe(6);
    expect(quoteFor(full, DEMO_SENDER, false).canSend).toBe(false);
    expect(() => lock({ inboxId: ib.id, sender: DEMO_SENDER, lane: 'guest', subject: '', body: 'x', holdsPartner: false })).toThrow();
    const vip = quoteFor(full, DEMO_SENDER, true);
    expect(vip.canSend).toBe(true);
    expect(vip.tier).toBe(2);
    expect(vip.price).toBe(62_500_000n); // 50 × 2.5 / 2
    expect(SURGE_TABLES.fortress[7]).toBe(3);
  });

  it('refundExpired only after the deadline, returns 100% and steps the queue down', () => {
    const ib = inboxOf('mrnetwork');
    const t = lock({ inboxId: ib.id, sender: DEMO_SENDER, lane: 'guest', subject: '', body: 'ping', holdsPartner: false });
    expect(() => refundExpired(t.id)).toThrow();
    fastForward(ib.slaSeconds + 1);
    const r = refundExpired(t.id);
    expect(r.status).toBe('Refunded');
    expect(r.payout).toBeUndefined();
    expect(inboxOf('mrnetwork').latch).toBe(0);
    // a late reply can no longer be claimed
    const t2 = lock({ inboxId: ib.id, sender: DEMO_SENDER, lane: 'guest', subject: '', body: 'late', holdsPartner: false });
    fastForward(ib.slaSeconds + 1);
    reply(t2.id, 'too late');
    expect(verifyClaim(simStore.get(), ticketOf(t2.id)).checks.find((c) => c.key === 'time')?.ok).toBe(false);
    expect(() => claim(t2.id)).toThrow();
  });
});
