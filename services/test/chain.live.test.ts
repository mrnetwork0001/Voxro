// Live read of X Layer mainnet (skipped unless VOXRO_LIVE=1).
import { describe, expect, it } from 'vitest';
import { directory, inboxByHandle, ladder, money, quote, ticketsFor } from '../src/chain.js';

describe.skipIf(process.env.VOXRO_LIVE !== '1')('live chain reads', () => {
  it('reads @voxro, its quote, ladder and tickets', async () => {
    const all = await directory();
    expect(all.length).toBeGreaterThan(0);
    const ib = await inboxByHandle('@voxro');
    expect(ib?.handle).toBe('voxro');
    const q = await quote(ib!.id);
    expect(q.price).toBe(ib!.quote.price);
    const lad = ladder(ib!);
    expect(lad[0]).toBe(ib!.quote.price); // empty queue → first rung
    const t = await ticketsFor([ib!.id]);
    console.log(all.map((i) => `@${i.handle} ${money(i.token, i.quote.price)} q${i.queue} ${i.preset} vip=${i.communityVip}`).join('\n'), '\nladder', lad.map((p) => money(ib!.token, p)).join(' '), '\ntickets', t.get(ib!.id)?.length);
    expect(await inboxByHandle('no_such_inbox_zz')).toBeNull();
  }, 60_000);
});
