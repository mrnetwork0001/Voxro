import { PRESET_NAMES, SURGE_TABLES, deWebName, endpointHex } from '@voxro/sdk';
import { useEffect, useMemo, useState } from 'react';
import { Addr, Badge, Button, Empty, Field, Gauge, Ladder, Note, Panel, Stat, Toast, useToast } from '../components/ui.tsx';
import { DEPLOYED } from '../config.ts';
import { fmtAmount, fmtDuration, fmtMoney } from '../format.ts';
import { useI18n } from '../i18n.tsx';
import { href } from '../router.ts';
import { TIER_MULT, priceLadder } from '../circuits/catalog.ts';
import { backend, findInbox, useInboxState } from '../backend.ts';
import { TOKENS, type InboxView, type TicketView } from '../model.ts';
import { useWallet } from '../wallet/wallet.tsx';
import { DeploymentNote } from './DeploymentNote.tsx';
import { notifyRecipient } from '../chain/relay.ts';

const curveOf = (i: InboxView) => (i.preset === 'configurable' ? i.curve : i.preset);
const recordOf = (i: InboxView, t: ReturnType<typeof useI18n>['t'], lang: 'en' | 'zh') =>
  i.replies + i.refunded === 0 ? t('dir.record.none') : t('dir.record', { answered: i.replies, expired: i.refunded, avg: i.avgReplySeconds === null ? '—' : fmtDuration(Math.round(i.avgReplySeconds), lang) });
const tapeNameOf = (i: InboxView) => (i.containerCpuIndex === null ? `#${i.containerTokenId}` : deWebName(i.containerTokenId, i.containerCpuIndex));

export function Directory({ arg }: { arg: string }) {
  const { t, lang } = useI18n();
  const state = useInboxState();
  const w = useWallet();
  const [sending, setSending] = useState(false);
  const [query, setQuery] = useState(arg);
  const [selectedId, setSelectedId] = useState<number | null>(() => findInbox(state, arg)?.id ?? state.inboxes[0]?.id ?? null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [last, setLast] = useState<TicketView | null>(null);
  const [notified, setNotified] = useState<'pending' | 'yes' | 'no' | null>(null);
  const [toast, setToast] = useToast();

  useEffect(() => {
    if (arg) {
      setQuery(arg);
      const hit = findInbox(state, arg);
      if (hit) setSelectedId(hit.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arg]);
  useEffect(() => {
    // data arrives after mount; pick the first inbox once it exists
    if (selectedId === null && state.inboxes.length) setSelectedId(findInbox(state, arg)?.id ?? state.inboxes[0]!.id);
  }, [state, selectedId, arg]);

  const list = useMemo(() => {
    const q = query.trim().replace(/^@/, '').toLowerCase();
    return state.inboxes.filter((i) => i.active && (!q || i.handle.toLowerCase().includes(q) || i.name.toLowerCase().includes(q) || tapeNameOf(i).includes(q)));
  }, [state.inboxes, query]);

  const inbox = state.inboxes.find((i) => i.id === selectedId) ?? null;
  const quote = inbox ? backend.quoteFor(inbox) : null;
  const ladder = inbox ? priceLadder(inbox.preset, inbox.basePrice, { allowlisted: quote?.allowlisted ?? false, holdsPartner: quote?.vip ?? false }, inbox.curve) : [];
  const coldLadder = inbox ? priceLadder(inbox.preset, inbox.basePrice, { allowlisted: false, holdsPartner: false }, inbox.curve) : [];
  const noKey = inbox ? inbox.publicKey === '0x' : false;

  const send = async () => {
    if (!inbox) return;
    if (!w.address) return setToast(t('c.connect'));
    setSending(true);
    try {
      const ticket = await backend.lock({ inboxId: inbox.id, subject, body });
      setLast(ticket);
      setNotified('pending');
      // best effort: settlement never depends on the relay
      notifyRecipient(inbox, ticket)
        .then((r) => setNotified(r.delivered > 0 ? 'yes' : 'no'))
        .catch(() => setNotified('no'));
      setSubject('');
      setBody('');
      setToast(`${t('dir.sent')} · #${ticket.id} · ${fmtMoney(ticket.token, ticket.amount)}`);
    } catch (e) {
      setToast(e instanceof Error ? e.message.slice(0, 200) : String(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <div className="row between mb">
        <div>
          <div className="kicker">{t('nav.directory')}</div>
          <h2>{t('dir.title')}</h2>
        </div>
        <div className="row">
          <span className="small muted">{t('dir.viewAs')}</span>
          {w.address ? <Addr value={w.address} /> : <Badge>{t('dir.coldSender')}</Badge>}
        </div>
      </div>
      <DeploymentNote />
      {DEPLOYED && (
        <div className="grid side mt">
          <div className="stack">
            <input className="input" placeholder={t('dir.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
            <Panel className="flush">
              <div className="list" style={{ padding: '0 16px' }}>
                {!state.loaded && <Empty>{t('c.loading')}</Empty>}
                {state.loaded && list.length === 0 && <Empty>{state.inboxes.length ? t('dir.noResults') : t('chain.noInboxes')}</Empty>}
                {list.map((i) => {
                  const q = backend.quoteFor(i);
                  const tiers = SURGE_TABLES[curveOf(i)] as number[];
                  return (
                    <div key={i.id} className={`inbox-card${i.id === selectedId ? ' sel' : ''}`} onClick={() => setSelectedId(i.id)}>
                      <div>
                        <div className="row">
                          <span className="handle">@{i.handle}</span>
                          <Badge tone={i.preset === 'fortress' ? 'bad' : i.preset === 'gentle' ? 'ok' : 'neutral'}>{PRESET_NAMES[i.preset]}</Badge>
                          {!q.canSend && <Badge tone="bad">{t('c.paused')}</Badge>}
                        </div>
                        <div className="mono small muted">
                          {tapeNameOf(i)} · #{i.circuitId} · {t('c.sla')} {fmtDuration(i.slaSeconds, lang)}
                        </div>
                        <div className="small" style={{ color: 'var(--ink-2)' }}>{recordOf(i, t, lang)}</div>
                        <div style={{ maxWidth: 260, marginTop: 8 }}>
                          <Gauge q={i.latch} tiers={tiers} pause={!q.canSend} />
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div className="kicker">{t('c.price')}</div>
                        <div className={`display sm tier-${q.tier}`}>{fmtAmount(i.token, q.price)}</div>
                        <div className="sub">{TOKENS[i.token].symbol}</div>
                        <div className="small muted">
                          {TIER_MULT[q.tier]} · base {fmtAmount(i.token, i.basePrice)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>
          </div>

          <div className="stack">
            {!inbox || !quote ? (
              <Panel>
                <Empty>{t('dir.pick')}</Empty>
              </Panel>
            ) : (
              <>
                <Panel kicker={t('dir.compose')} title={`@${inbox.handle}`} right={<Badge tone="signal">{PRESET_NAMES[inbox.preset]}</Badge>}>
                  <p className="sub">{inbox.bio}</p>
                  <div className="small mt-s" style={{ color: 'var(--ink-2)' }}>
                    <span className="kicker">Onchain reply record</span> · {recordOf(inbox, t, lang)}
                  </div>
                  <div className="grid cols-3 mt-s">
                    <Stat label={t('dir.quote')} value={<span className={`tier-${quote.tier}`}>{fmtMoney(inbox.token, quote.price)}</span>} sub={`${TIER_MULT[quote.tier]}${quote.vip ? ` · ${t('c.discount')}` : ''}${quote.allowlisted ? ` · ${t('c.allowlisted')}` : ''}`} tone="signal" />
                    <Stat label={t('c.queue')} value={`${inbox.latch} → ${quote.nextQ}`} sub={quote.canSend ? 'canSend = 1' : 'canSend = 0'} />
                    <Stat label={t('c.sla')} value={fmtDuration(inbox.slaSeconds, lang)} sub={`${t('c.basePrice')} ${fmtMoney(inbox.token, inbox.basePrice)}`} />
                  </div>
                  <p className="small muted mt-s">{t('dir.quote.sub')}</p>
                  {!quote.canSend && <Note tone="warn">{t('dir.pausedMsg')}</Note>}
                  {noKey && <Note tone="warn">{t('dir.noKey')}</Note>}
                  <div className="stack mt">
                    <div className="small muted">
                      {t('c.lane.guest')} · {t('dir.lane.help.guest')}
                    </div>
                    <Field label={t('dir.subject')}>
                      <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} placeholder="Partnership: X Layer × …" />
                    </Field>
                    <Field label={t('dir.body')}>
                      <textarea className="input" value={body} onChange={(e) => setBody(e.target.value)} placeholder="…" />
                    </Field>
                    <div className="small muted">{t('chain.vipAuto')}</div>
                    <div className="row">
                      <Button variant="signal" onClick={() => void send()} disabled={!w.address || !quote.canSend || noKey || body.trim().length === 0 || sending}>
                        {sending ? <span className="spin" /> : null} {w.address ? `${t('dir.send')} · ${fmtMoney(inbox.token, quote.price)}` : t('c.connect')}
                      </Button>
                      <span className="small muted">TAP-10 v2 · X25519 + XChaCha20-Poly1305</span>
                    </div>
                  </div>
                </Panel>

                <Panel kicker={t('dir.ladder')} title={t('dir.ladder.sub')}>
                  <Ladder rungs={ladder} current={inbox.latch} symbol={TOKENS[inbox.token].symbol} fmt={(v) => fmtAmount(inbox.token, v)} />
                  {(quote.vip || quote.allowlisted) && (
                    <div className="mt-s">
                      <div className="kicker">{t('dir.nextQuote')} (cold sender)</div>
                      <Ladder rungs={coldLadder} current={inbox.latch} symbol={TOKENS[inbox.token].symbol} fmt={(v) => fmtAmount(inbox.token, v)} />
                    </div>
                  )}
                </Panel>

                {last && last.inboxId === inbox.id && (
                  <Panel signal kicker={t('dir.sent')} title={`Ticket #${last.id}`} right={<a className="btn sm" href={href('inbox')}>{t('nav.inbox')}</a>}>
                    <dl className="kv">
                      <dt>{t('c.lane')}</dt>
                      <dd>{t('c.lane.guest')}</dd>
                      <dt>{t('c.amount')}</dt>
                      <dd>
                        {fmtMoney(last.token, last.amount)} · {TIER_MULT[last.tier]}
                      </dd>
                      <dt>{t('c.deadline')}</dt>
                      <dd className="mono">{new Date(last.deadline * 1000).toISOString()}</dd>
                      <dt>replyTargetEndpoint</dt>
                      <dd>
                        <Addr value={last.replyTargetEndpoint} />
                      </dd>
                      <dt>expectedReplyRef</dt>
                      <dd>
                        <Addr value={last.expectedReplyRef} />
                      </dd>
                      <dt>{t('dir.envelope')}</dt>
                      <dd className="mono">
                        {(last.envelope.length - 2) / 2} B · {last.envelope.slice(0, 12)}… (magic 54 53 · v2 · sealed)
                      </dd>
                      <dt>to</dt>
                      <dd>
                        <Addr value={endpointHex(inbox.container)} />
                      </dd>
                    </dl>
                    {notified === 'yes' && <Note tone="ok">{t('dir.notified')}</Note>}
                    {notified === 'no' && <Note>{t('dir.notNotified')}</Note>}
                  </Panel>
                )}
              </>
            )}
          </div>
        </div>
      )}
      <Toast msg={toast} />
    </>
  );
}
