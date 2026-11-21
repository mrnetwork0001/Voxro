import { PRESET_NAMES, SURGE_TABLES, deWebName, type Address } from '@voxro/sdk';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Addr, Badge, Button, Empty, Field, Gauge, Ladder, Note, Panel, Segmented, Stat, Toast, useToast } from '../components/ui.tsx';
import { DEMO_SENDER, LAUNCHED, VOXR_CPU_INDEX } from '../config.ts';
import { fmtAmount, fmtDuration, fmtMoney } from '../format.ts';
import { useI18n } from '../i18n.tsx';
import { href } from '../router.ts';
import { TIER_MULT, priceLadder } from '../sim/catalog.ts';
import { backend, findInbox, useInboxState } from '../backend.ts';
import { TOKENS, inboxEndpoint, type Lane, type SimInbox, type SimTicket } from '../sim/escrow.ts';
import { useWallet } from '../wallet/wallet.tsx';
import { runStress, type StressEvent } from '../sim/stress.ts';

const curveOf = (i: SimInbox) => (i.preset === 'configurable' ? i.curve : i.preset);

export function Directory({ arg }: { arg: string }) {
  const { t, lang } = useI18n();
  const sim = useInboxState();
  const w = useWallet();
  const quoteFor = backend.quoteFor;
  const [sending, setSending] = useState(false);
  const sender: Address = w.address ?? DEMO_SENDER;
  const [query, setQuery] = useState(arg);
  const [selectedId, setSelectedId] = useState<number | null>(() => findInbox(sim, arg)?.id ?? sim.inboxes[0]?.id ?? null);
  const [lane, setLane] = useState<Lane>('guest');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [holdsPartner, setHoldsPartner] = useState(false);
  const [last, setLast] = useState<SimTicket | null>(null);
  const [toast, setToast] = useToast();
  const [stressLog, setStressLog] = useState<string[]>([]);
  const [stressing, setStressing] = useState(false);
  const [stressPartner, setStressPartner] = useState(true);
  const stopRef = useRef<(() => void) | null>(null);
  useEffect(() => () => stopRef.current?.(), []);

  useEffect(() => {
    if (arg) {
      setQuery(arg);
      const hit = findInbox(sim, arg);
      if (hit) setSelectedId(hit.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arg]);
  useEffect(() => {
    // chain mode: data arrives after mount; pick the first inbox once it exists
    if (selectedId === null && sim.inboxes.length) setSelectedId(findInbox(sim, arg)?.id ?? sim.inboxes[0]!.id);
  }, [sim, selectedId, arg]);

  const list = useMemo(() => {
    const q = query.trim().replace(/^@/, '').toLowerCase();
    return sim.inboxes.filter((i) => i.active && (!q || i.handle.toLowerCase().includes(q) || i.name.toLowerCase().includes(q) || `#${i.containerTokenId}@2.${VOXR_CPU_INDEX}`.includes(q)));
  }, [sim.inboxes, query]);

  const inbox = sim.inboxes.find((i) => i.id === selectedId) ?? null;
  const quote = inbox ? quoteFor(inbox, sender, holdsPartner) : null;
  const ladder = inbox ? priceLadder(inbox.preset, inbox.basePrice, { allowlisted: quote?.allowlisted ?? false, holdsPartner }, inbox.curve) : [];
  const coldLadder = inbox ? priceLadder(inbox.preset, inbox.basePrice, { allowlisted: false, holdsPartner: false }, inbox.curve) : [];

  const fmtEv = (e: StressEvent, token: SimInbox['token']) => {
    const who = `${e.who.slice(0, 6)}…${e.partner ? ' ★' : ''}`;
    if (e.kind === 'sent') return t('stress.log.sent', { who, price: fmtMoney(token, e.price ?? 0n), from: e.from, to: e.to });
    if (e.kind === 'paused') return t('stress.log.paused', { who, q: e.from });
    if (e.kind === 'claim') return t('stress.log.claim', { paid: fmtMoney(token, e.paid ?? 0n), from: e.from, to: e.to });
    return t('stress.done');
  };
  const startStress = () => {
    if (!inbox) return;
    stopRef.current?.();
    setStressLog([]);
    setStressing(true);
    const token = inbox.token;
    stopRef.current = runStress(inbox.id, {
      partner: stressPartner && backend.mode === 'sim',
      onEvent: (e) => {
        setStressLog((l) => [fmtEv(e, token), ...l].slice(0, 14));
        if (e.kind === 'done') setStressing(false);
      },
    });
  };
  const stopStress = () => {
    stopRef.current?.();
    stopRef.current = null;
    setStressing(false);
  };

  const send = async () => {
    if (!inbox) return;
    if (backend.mode === 'chain' && !w.address) return setToast(t('c.connect'));
    setSending(true);
    try {
      const ticket = await backend.lock({ inboxId: inbox.id, sender, lane, subject, body, holdsPartner });
      setLast(ticket);
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
          <Addr value={sender} />
          {!w.address && <Badge>{backend.mode === 'chain' ? t('c.noWallet') : t('c.sim')}</Badge>}
        </div>
      </div>
      {!LAUNCHED ? <Note tone="warn">{t('c.simNote')}</Note> : <Note tone="ok">{t('chain.liveNote')}</Note>}
      <div className="grid side mt">
        <div className="stack">
          <input className="input" placeholder={t('dir.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
          <Panel className="flush">
            <div className="list" style={{ padding: '0 16px' }}>
              {list.length === 0 && <Empty>{t('dir.noResults')}</Empty>}
              {list.map((i) => {
                const q = quoteFor(i, sender, holdsPartner);
                const tiers = SURGE_TABLES[curveOf(i)] as number[];
                return (
                  <div key={i.id} className={`inbox-card${i.id === selectedId ? ' sel' : ''}`} onClick={() => setSelectedId(i.id)}>
                    <div>
                      <div className="row">
                        <span className="handle">@{i.handle}</span>
                        <Badge tone={i.preset === 'fortress' ? 'bad' : i.preset === 'gentle' ? 'ok' : 'neutral'}>{PRESET_NAMES[i.preset]}</Badge>
                        {!q.canSend && <Badge tone="bad">{t('c.paused')}</Badge>}
                      </div>
                      <div className="sub">{i.name}</div>
                      <div className="mono small muted">
                        {deWebName(i.containerTokenId, VOXR_CPU_INDEX)} · #{i.circuitId} · {t('c.sla')} {fmtDuration(i.slaSeconds, lang)}
                      </div>
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
              <Panel kicker={t('dir.compose')} title={`@${inbox.handle} · ${inbox.name}`} right={<Badge tone="signal">{PRESET_NAMES[inbox.preset]}</Badge>}>
                <p className="sub">{inbox.bio}</p>
                <div className="grid cols-3 mt-s">
                  <Stat label={t('dir.quote')} value={<span className={`tier-${quote.tier}`}>{fmtMoney(inbox.token, quote.price)}</span>} sub={`${TIER_MULT[quote.tier]}${quote.vip ? ` · ${t('c.discount')}` : ''}${quote.allowlisted ? ` · ${t('c.allowlisted')}` : ''}`} tone="signal" />
                  <Stat label={t('c.queue')} value={`${inbox.latch} → ${quote.nextQ}`} sub={quote.canSend ? 'canSend = 1' : 'canSend = 0'} />
                  <Stat label={t('c.sla')} value={fmtDuration(inbox.slaSeconds, lang)} sub={`${t('c.basePrice')} ${fmtMoney(inbox.token, inbox.basePrice)}`} />
                </div>
                <p className="small muted mt-s">{t('dir.quote.sub')}</p>
                {!quote.canSend && <Note tone="warn">{t('dir.pausedMsg')}</Note>}
                <div className="stack mt">
                  <Field label={t('c.lane')} hint={lane === 'guest' ? t('dir.lane.help.guest') : t('dir.lane.help.container')}>
                    <Segmented
                      value={lane}
                      options={[
                        { id: 'guest', label: t('c.lane.guest') },
                        { id: 'container', label: t('c.lane.container') },
                      ]}
                      onChange={setLane}
                    />
                  </Field>
                  <Field label={t('dir.subject')}>
                    <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} placeholder="Partnership: X Layer × …" />
                  </Field>
                  <Field label={t('dir.body')}>
                    <textarea className="input" value={body} onChange={(e) => setBody(e.target.value)} placeholder="…" />
                  </Field>
                  {backend.mode === 'sim' ? (
                    <label className="check">
                      <input type="checkbox" checked={holdsPartner} onChange={(e) => setHoldsPartner(e.target.checked)} />
                      {t('dir.simPartner')}
                    </label>
                  ) : (
                    <div className="small muted">{lane === 'container' ? t('chain.containerSoon') : t('chain.vipAuto')}</div>
                  )}
                  <div className="row">
                    <Button variant="signal" onClick={() => void send()} disabled={!quote.canSend || body.trim().length === 0 || sending || (backend.mode === 'chain' && lane === 'container')}>
                      {sending ? <span className="spin" /> : null} {t('dir.send')} · {fmtMoney(inbox.token, quote.price)}
                    </Button>
                    <span className="small muted">TAP-10 v2 · X25519 + XChaCha20-Poly1305</span>
                  </div>
                </div>
              </Panel>

              <Panel kicker={t('dir.ladder')} title={t('dir.ladder.sub')}>
                <Ladder rungs={ladder} current={inbox.latch} symbol={TOKENS[inbox.token].symbol} fmt={(v) => fmtAmount(inbox.token, v)} />
                {(holdsPartner || quote.allowlisted) && (
                  <div className="mt-s">
                    <div className="kicker">{t('dir.nextQuote')} (cold sender)</div>
                    <Ladder rungs={coldLadder} current={inbox.latch} symbol={TOKENS[inbox.token].symbol} fmt={(v) => fmtAmount(inbox.token, v)} />
                  </div>
                )}
              </Panel>

              <Panel kicker={t('stress.title')} title={t('stress.sub')} right={stressing ? <Button size="sm" variant="ghost" onClick={stopStress}>{t('stress.stop')}</Button> : <Button size="sm" variant="signal" onClick={startStress} disabled={backend.mode === 'chain' && !w.address}>{t('stress.button')}</Button>}>
                {backend.mode === 'sim' ? (
                  <label className="check">
                    <input type="checkbox" checked={stressPartner} onChange={(e) => setStressPartner(e.target.checked)} disabled={stressing} />
                    {t('stress.partner')}
                  </label>
                ) : (
                  <div className="small muted">{w.address ? t('chain.stressLive') : t('chain.stressNoWallet')}</div>
                )}
                <div style={{ maxWidth: 420, marginTop: 10 }}>
                  <Gauge q={inbox.latch} tiers={SURGE_TABLES[curveOf(inbox)] as number[]} pause={!quote.canSend} />
                </div>
                {stressLog.length > 0 && (
                  <div className="lp-log mt-s" style={{ minHeight: 0 }}>
                    {stressLog.map((l, i) => (
                      <div key={`${i}-${l}`}>{l}</div>
                    ))}
                  </div>
                )}
              </Panel>

              {last && last.inboxId === inbox.id && (
                <Panel signal kicker={t('dir.sent')} title={`Ticket #${last.id}`} right={<a className="btn sm" href={href('inbox')}>{t('nav.inbox')} →</a>}>
                  <dl className="kv">
                    <dt>{t('c.lane')}</dt>
                    <dd>{last.lane === 'guest' ? t('c.lane.guest') : t('c.lane.container')}</dd>
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
                      <Addr value={inboxEndpoint(inbox)} />
                    </dd>
                    <dt>{t('dir.nextQuote')}</dt>
                    <dd>{fmtMoney(inbox.token, quoteFor(inbox, sender, false).price)}</dd>
                  </dl>
                </Panel>
              )}
            </>
          )}
        </div>
      </div>
      <Toast msg={toast} />
    </>
  );
}
