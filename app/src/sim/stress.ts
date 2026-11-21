/** Scripted spam burst against one simulated inbox. Non-blocking, cancellable. */
import type { Address } from '@voxro/sdk';
import { backend, stateNow } from '../backend.ts';
import { claim, lock, quoteFor, reply, simStore, type SimTicket } from './escrow.ts';

export interface StressEvent {
  kind: 'sent' | 'paused' | 'claim' | 'done';
  who: Address;
  price?: bigint;
  paid?: bigint;
  from: number;
  to: number;
  partner?: boolean;
}

const FAKE_SENDERS: Address[] = Array.from({ length: 8 }, (_, i) => `0x${(i + 1).toString(16).padStart(2, '0').repeat(20)}` as Address);

export function runStress(inboxId: number, opts: { partner: boolean; onEvent: (e: StressEvent) => void; stepMs?: number }): () => void {
  if (backend.mode === 'chain') return runStressChain(inboxId, opts.onEvent);
  let cancelled = false;
  const timers: number[] = [];
  const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(() => !cancelled && fn(), ms));
  const step = opts.stepMs ?? 1100;
  const sent: SimTicket[] = [];
  let t = 0;
  const sends = opts.partner ? 8 : 7;
  for (let i = 0; i < sends; i++) {
    const who = FAKE_SENDERS[i % FAKE_SENDERS.length]!;
    const partner = opts.partner && i === sends - 1;
    at((t += step), () => {
      const s = simStore.get();
      const inbox = s.inboxes.find((x) => x.id === inboxId);
      if (!inbox) return;
      const q = quoteFor(inbox, who, partner);
      if (!q.canSend) {
        opts.onEvent({ kind: 'paused', who, from: inbox.latch, to: inbox.latch, partner });
        return;
      }
      const tk = lock({ inboxId, sender: who, lane: 'guest', subject: partner ? 'Partner holder' : 'Cold outreach', body: `Stress message ${i + 1}`, holdsPartner: partner });
      sent.push(tk);
      opts.onEvent({ kind: 'sent', who, price: tk.amount, from: inbox.latch, to: q.nextQ, partner });
    });
  }
  for (let k = 0; k < 3; k++) {
    at((t += step), () => {
      const tk = sent.shift();
      if (!tk) return;
      const before = simStore.get().inboxes.find((x) => x.id === inboxId)?.latch ?? 0;
      reply(tk.id, 'Thanks, replying.');
      const done = claim(tk.id);
      const after = simStore.get().inboxes.find((x) => x.id === inboxId)?.latch ?? 0;
      opts.onEvent({ kind: 'claim', who: tk.sender, paid: done.payout?.recipient ?? 0n, from: before, to: after });
    });
  }
  at((t += step), () => opts.onEvent({ kind: 'done', who: FAKE_SENDERS[0]!, from: 0, to: 0 }));
  return () => {
    cancelled = true;
    for (const id of timers) window.clearTimeout(id);
  };
}

/** LAUNCHED mode: sequential real sendGuestPriority transactions from the connected wallet (each confirmed in the wallet). */
function runStressChain(inboxId: number, onEvent: (e: StressEvent) => void): () => void {
  let cancelled = false;
  (async () => {
    for (let i = 0; i < 7 && !cancelled; i++) {
      const inbox = stateNow().inboxes.find((x) => x.id === inboxId);
      if (!inbox) break;
      const who = (inbox.live?.sender ?? FAKE_SENDERS[0]!) as Address;
      const q = backend.quoteFor(inbox, who, false);
      if (!q.canSend) {
        onEvent({ kind: 'paused', who, from: inbox.latch, to: inbox.latch });
        break;
      }
      try {
        const tk = await backend.lock({ inboxId, sender: who, lane: 'guest', subject: 'Stress test', body: `Stress message ${i + 1}`, holdsPartner: false });
        onEvent({ kind: 'sent', who, price: tk.amount, from: inbox.latch, to: q.nextQ });
      } catch {
        break;
      }
    }
    if (!cancelled) onEvent({ kind: 'done', who: FAKE_SENDERS[0]!, from: 0, to: 0 });
  })();
  return () => {
    cancelled = true;
  };
}
