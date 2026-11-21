import { PRESET_NAMES, type Address } from '@voxro/sdk';
import { useMemo, useState } from 'react';
import { useNow } from '../chain/hooks.ts';
import { Addr, Badge, Button, Empty, Note, Panel, Segmented, Stat, Toast, useToast } from '../components/ui.tsx';
import { DEMO_SENDER, LAUNCHED } from '../config.ts';
import { fmtCountdown, fmtMoney, fmtTime } from '../format.ts';
import { useI18n } from '../i18n.tsx';
import { TIER_MULT } from '../sim/catalog.ts';
import { backend, useInboxState } from '../backend.ts';
import type { SimInbox, SimTicket } from '../sim/escrow.ts';
import { useWallet } from '../wallet/wallet.tsx';
import { href } from '../router.ts';

type Tab = 'inbox' | 'outbox';

function StatusBadge({ s }: { s: SimTicket['status'] }) {
  const { t } = useI18n();
  return <Badge tone={s === 'Pending' ? 'warn' : s === 'Claimed' ? 'ok' : 'neutral'}>{s === 'Pending' ? t('c.pending') : s === 'Claimed' ? t('c.claimed') : t('c.refunded')}</Badge>;
}

function InboxTicket({ ticket, inbox, now }: { ticket: SimTicket; inbox: SimInbox; now: number }) {
  const { t, lang } = useI18n();
  const sim = useInboxState();
  const [open, setOpen] = useState<{ subject: string; body: string } | null>(null);
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const verify = ticket.reply ? backend.verifyClaim(sim, ticket) : null;
  const remaining = ticket.deadline - now;
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message.slice(0, 200) : String(e));
    } finally {
      setBusy(false);
    }
  };
  const decrypt = () =>
    run(async () => {
      const d = await backend.openEnvelope(ticket, inbox);
      setOpen(d.kind === 'message' ? { subject: d.subject, body: d.body } : { subject: '', body: JSON.stringify(d.value) });
    });
  return (
    <div className="stack" style={{ padding: '14px 0' }}>
      <div className="row between">
        <div className="row">
          <strong>#{ticket.id}</strong>
          <Addr value={ticket.sender} />
          <Badge>{ticket.lane === 'guest' ? t('c.lane.guest') : t('c.lane.container')}</Badge>
          <StatusBadge s={ticket.status} />
          <a className="btn ghost sm" href={href('receipt', String(ticket.id))}>{t('receipt.button')}</a>
        </div>
        <div className="row">
          <span className={`display sm tier-${ticket.tier}`}>{fmtMoney(ticket.token, ticket.amount)}</span>
          <span className="small muted">{TIER_MULT[ticket.tier]}</span>
        </div>
      </div>
      <div className="row small muted">
        <span>
          {t('c.deadline')}: {fmtTime(ticket.deadline)}
        </span>
        <span className={remaining <= 0 ? 'bad' : remaining < 3600 ? 'warn' : ''}>
          {ticket.status === 'Pending' ? fmtCountdown(remaining, lang) : ''}
        </span>
      </div>
      {!open ? (
        <div className="row">
          <Button size="sm" onClick={() => void decrypt()} disabled={busy}>
            {busy ? <span className="spin" /> : null} {t('inbox.decrypt')}
          </Button>
          <span className="mono small muted">
            {(ticket.envelope.length - 2) / 2} B sealed
          </span>
          {err && <span className="bad small">{err}</span>}
        </div>
      ) : (
        <div className="note ok">
          <div className="kicker">{t('inbox.decrypted')}</div>
          {open.subject && <div style={{ fontWeight: 600, marginTop: 4 }}>{open.subject}</div>}
          <div style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{open.body}</div>
        </div>
      )}
      {ticket.status === 'Pending' && !ticket.reply && (
        <div className="stack">
          <textarea className="input" style={{ minHeight: 70 }} placeholder={t('inbox.reply')} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="row">
            <Button
              variant="signal"
              size="sm"
              disabled={text.trim().length === 0 || remaining <= 0 || busy}
              onClick={() =>
                void run(async () => {
                  await backend.reply(ticket.id, text);
                  setText('');
                })
              }
            >
              {busy ? <span className="spin" /> : null} {t('inbox.tap1')}
            </Button>
            <span className="small muted">DeWebHub.send(to = replyTarget, ref = expectedReplyRef, payload)</span>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => backend.decline(ticket.id))}>
              {t('inbox.decline')}
            </Button>
          </div>
          {err && <span className="bad small">{err}</span>}
        </div>
      )}
      {ticket.reply && verify && (
        <div className="stack">
          <div className="note">
            <div className="kicker">{t('inbox.replySent')}</div>
            <dl className="kv mt-s">
              <dt>{t('inbox.hubEntry')}</dt>
              <dd className="mono">
                i = {ticket.reply.inboxIndex} · {fmtTime(ticket.reply.timestamp)}
              </dd>
              <dt>digest</dt>
              <dd>
                <Addr value={ticket.reply.digest} />
              </dd>
              <dt>payload</dt>
              <dd className="mono">{(ticket.reply.payload.length - 2) / 2} B sealed to the sender key</dd>
            </dl>
          </div>
          <div>
            <div className="kicker">{t('inbox.verify')}</div>
            {verify.checks.map((c) => (
              <div key={c.key} className="check-row">
                <span className={`mark ${c.ok ? 'ok' : 'bad'}`}>{c.ok ? '✓' : '✗'}</span>
                <span>{t(`inbox.check.${c.key}`)}</span>
                <span className="mono muted small">{c.detail}</span>
              </div>
            ))}
          </div>
          {ticket.status === 'Pending' ? (
            <div className="row">
              <Button
                variant="signal"
                size="sm"
                disabled={!verify.ok || busy}
                onClick={() => void run(() => backend.claim(ticket.id))}
              >
                {busy ? <span className="spin" /> : null} {t('inbox.tap2')}
              </Button>
              <span className="small muted">permissionless · steps LATCH dir = 0</span>
            </div>
          ) : (
            ticket.payout && (
              <div className="row">
                <Badge tone="ok">
                  {t('inbox.paid')} {fmtMoney(ticket.token, ticket.payout.recipient)}
                </Badge>
                <Badge>
                  {t('inbox.fee')} {fmtMoney(ticket.token, ticket.payout.protocol)}
                </Badge>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

function OutboxTicket({ ticket, inbox, now }: { ticket: SimTicket; inbox: SimInbox; now: number }) {
  const { t, lang } = useI18n();
  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const remaining = ticket.deadline - now;
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message.slice(0, 200) : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="stack" style={{ padding: '14px 0' }}>
      <div className="row between">
        <div className="row">
          <strong>#{ticket.id}</strong>
          <span>→ @{inbox.handle}</span>
          <Badge>{ticket.lane === 'guest' ? t('c.lane.guest') : t('c.lane.container')}</Badge>
          <StatusBadge s={ticket.status} />
          <a className="btn ghost sm" href={href('receipt', String(ticket.id))}>{t('receipt.button')}</a>
        </div>
        <span className={`display sm tier-${ticket.tier}`}>{fmtMoney(ticket.token, ticket.amount)}</span>
      </div>
      <div className="row small muted">
        <span>
          {t('c.deadline')}: {fmtTime(ticket.deadline)}
        </span>
        {ticket.status === 'Pending' && <span className={remaining <= 0 ? 'bad' : ''}>{fmtCountdown(remaining, lang)}</span>}
      </div>
      <div className="row">
        {ticket.reply && (
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const d = await backend.openReply(ticket, inbox);
                setText(d && d.kind === 'message' ? d.body : '—');
              })
            }
          >
            {t('inbox.readReply')}
          </Button>
        )}
        {ticket.status === 'Pending' && !ticket.reply && (
          <Button size="sm" disabled={remaining > 0 || busy} title={t('inbox.refundHint')} onClick={() => void run(() => backend.refundExpired(ticket.id))}>
            {busy ? <span className="spin" /> : null} {t('inbox.refund')}
          </Button>
        )}
        {err && <span className="bad small">{err}</span>}
      </div>
      {text !== null && (
        <div className="note ok">
          <div className="kicker">{t('inbox.readReply')}</div>
          <div style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{text}</div>
        </div>
      )}
    </div>
  );
}

export function Inbox(_: { arg: string }) {
  const { t } = useI18n();
  const sim = useInboxState();
  const w = useWallet();
  const [tab, setTab] = useState<Tab>('inbox');
  const [inboxId, setInboxId] = useState<number>(sim.inboxes[0]?.id ?? 1);
  const [toast, setToast] = useToast();
  const now = useNow() + sim.clockOffset;
  const sender: Address = w.address ?? DEMO_SENDER;
  const owned = backend.mode === 'chain' && w.address ? sim.inboxes.filter((i) => i.owner.toLowerCase() === w.address!.toLowerCase()) : sim.inboxes;
  const inbox = owned.find((i) => i.id === inboxId) ?? owned[0];
  const inboxTickets = useMemo(() => sim.tickets.filter((x) => x.inboxId === inbox?.id).sort((a, b) => (a.status === 'Pending' ? -1 : 1) - (b.status === 'Pending' ? -1 : 1) || b.id - a.id), [sim.tickets, inbox?.id]);
  const mine = useMemo(() => sim.tickets.filter((x) => x.sender.toLowerCase() === sender.toLowerCase()).sort((a, b) => b.id - a.id), [sim.tickets, sender]);
  const outbox = mine.length ? mine : sim.tickets.slice().sort((a, b) => b.id - a.id);

  return (
    <>
      <div className="row between mb">
        <div>
          <div className="kicker">{t('nav.inbox')}</div>
          <h2>{tab === 'inbox' ? t('inbox.title') : t('inbox.outbox')}</h2>
        </div>
        <div className="row">
          <Segmented
            value={tab}
            options={[
              { id: 'inbox', label: t('inbox.title') },
              { id: 'outbox', label: t('inbox.outbox') },
            ]}
            onChange={setTab}
          />
          {backend.fastForward && (
            <Button size="sm" variant="ghost" onClick={() => { backend.fastForward!(48 * 3600); setToast(t('c.ff')); }}>
              {t('c.ff')}
            </Button>
          )}
          {backend.reset && (
            <Button size="sm" variant="ghost" onClick={() => { backend.reset!(); setToast(t('c.resetSim')); }}>
              {t('c.resetSim')}
            </Button>
          )}
        </div>
      </div>
      {!LAUNCHED ? <Note tone="warn">{t('c.simNote')}</Note> : <Note tone="ok">{t('chain.liveNote')}</Note>}
      {backend.mode === 'chain' && !w.address && <Note tone="warn">{t('chain.connectToRead')}</Note>}
      {backend.mode === 'chain' && w.address && owned.length === 0 && <Note>{t('chain.noOwnedInbox')}</Note>}
      {sim.clockOffset > 0 && (
        <div className="small muted mt-s">
          {t('c.simClock')}: +{Math.round(sim.clockOffset / 3600)} h
        </div>
      )}

      {tab === 'inbox' && inbox && (
        <div className="grid side mt">
          <div className="stack">
            <Panel kicker={t('inbox.pickInbox')} title={`@${inbox.handle}`} right={<Badge tone="signal">{PRESET_NAMES[inbox.preset]}</Badge>}>
              <select className="input" value={inbox.id} onChange={(e) => setInboxId(Number(e.target.value))}>
                {owned.map((i) => (
                  <option key={i.id} value={i.id}>
                    @{i.handle} · {i.name}
                  </option>
                ))}
              </select>
              <div className="grid cols-2 mt-s">
                <Stat label={t('inbox.queueNow')} value={`Q = ${inbox.latch}`} sub={`latchState 0x0${inbox.latch}`} />
                <Stat label={t('inbox.earned')} value={fmtMoney(inbox.token, inbox.earned)} sub={`${inbox.replies} replies`} tone="ok" />
              </div>
              <dl className="kv mt-s">
                <dt>container</dt>
                <dd>
                  <Addr value={backend.containerOf(inbox)} />
                </dd>
                <dt>X25519 key</dt>
                <dd>
                  <Addr value={inbox.key.publicKey} />
                </dd>
              </dl>
            </Panel>
          </div>
          <Panel className="flush">
            <div className="list" style={{ padding: '0 16px' }}>
              {inboxTickets.length === 0 && <Empty>{t('inbox.empty')}</Empty>}
              {inboxTickets.map((x) => (
                <InboxTicket key={x.id} ticket={x} inbox={inbox} now={now} />
              ))}
            </div>
          </Panel>
        </div>
      )}

      {tab === 'outbox' && (
        <Panel className="flush mt">
          <div className="list" style={{ padding: '0 16px' }}>
            {outbox.length === 0 && <Empty>{t('inbox.empty')}</Empty>}
            {outbox.map((x) => {
              const ib = sim.inboxes.find((i) => i.id === x.inboxId);
              return ib ? <OutboxTicket key={x.id} ticket={x} inbox={ib} now={now} /> : null;
            })}
          </div>
        </Panel>
      )}
      <Toast msg={toast} />
    </>
  );
}
