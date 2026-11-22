import { SURGE_TABLES, XLAYER, catalogBurn, controllerInputsFor, quotePrice } from '@voxro/sdk';
import { useEffect, useMemo, useState } from 'react';
import { explorerAddress } from '../chain/client.ts';
import { useTelemetry } from '../chain/telemetry.ts';
import { Addr, Badge, Gauge, Ladder, Segmented, SurgeChart } from '../components/ui.tsx';
import type { Address } from '@voxro/sdk';
import { CONFIG, DEPLOYED } from '../config.ts';
import { DEFAULT_RELAY } from '../chain/relay.ts';
import { fmtAmount, fmtMoney } from '../format.ts';
import { useI18n } from '../i18n.tsx';
import { LANDING } from '../landing/copy.ts';
import { href } from '../router.ts';
import { getCatalog, priceLadder, proveAll, stepController } from '../circuits/catalog.ts';
import { Wordmark } from '../components/Wordmark.tsx';
import { Burger, Drawer, SectionLink, useDrawer } from '../components/MobileNav.tsx';
import { useLandingReveal } from '../landing/reveal.ts';
import xlayerIcon from '../assets/xlayer-icon.svg';
import tapeoutMark from '../assets/tapeout-mark.svg';
import { backend, useInboxState } from '../backend.ts';
import { TOKENS, type InboxView, type TicketView } from '../model.ts';

const BASE = 10_000_000n; // 10 USD₮0
const SCRIPT = ['send', 'send', 'send', 'reply', 'send', 'send', 'send', 'reply', 'reply', 'send', 'send', 'refund', 'reply', 'reply', 'reply', 'reply'] as const;

/** Section label as a terminal path, e.g. `~/voxro/who-its-for▌` (numbering dropped). */
function SectionTag({ path, label }: { path: string; label: string }) {
  const { lang } = useI18n();
  const name = label.replace(/^\s*\d+\s*·\s*/, '');
  return (
    <div className="lp-num lp-tag" aria-label={name}>
      <span className="lp-tag-prompt" aria-hidden="true">~/voxro/</span>
      <span className="lp-tag-path">{path}</span>
      <span className="lp-tag-cursor" aria-hidden="true" />
      {lang === 'zh' && <span className="lp-tag-name">{name}</span>}
    </div>
  );
}

function fill(tpl: string, vars: Record<string, string | number>) {
  let s = tpl;
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/**
 * Hero widget. After launch: a real inbox (the flagship @voxro, else the busiest) with its escrow
 * quote, LATCH queue and latest onchain events. Before launch: the real FounderBalancedInbox
 * circuit stepped on example traffic, labelled as an example.
 */
function LiveGate() {
  const state = useInboxState();
  const live = DEPLOYED && state.loaded ? (state.inboxes.find((i) => i.handle === 'voxro' && i.active) ?? [...state.inboxes].filter((i) => i.active).sort((a, b) => b.replies + b.refunded - (a.replies + a.refunded))[0]) : undefined;
  return live ? <RealGate inbox={live} tickets={state.tickets.filter((t) => t.inboxId === live.id)} /> : <ExampleGate />;
}

function RealGate({ inbox, tickets }: { inbox: InboxView; tickets: TicketView[] }) {
  const { lang } = useI18n();
  const c = LANDING[lang].hero.widget;
  const q = backend.quoteFor(inbox);
  const curve = inbox.preset === 'configurable' ? inbox.curve : inbox.preset;
  const ladder = useMemo(() => priceLadder(inbox.preset, inbox.basePrice, { allowlisted: false, holdsPartner: false }, inbox.curve), [inbox.preset, inbox.basePrice, inbox.curve]);
  const events = tickets
    .flatMap((t) => {
      const out: Array<{ at: number; line: string }> = [{ at: t.createdAt, line: fill(c.liveLocked, { price: fmtMoney(t.token, t.amount) }) }];
      if (t.status === 'Claimed' && t.settledAt) out.push({ at: t.settledAt, line: fill(c.liveClaimed, { paid: fmtMoney(t.token, t.payout?.recipient ?? 0n) }) });
      if (t.status === 'Refunded' && t.settledAt) out.push({ at: t.settledAt, line: fill(c.liveRefunded, { price: fmtMoney(t.token, t.amount) }) });
      return out;
    })
    .sort((a, b) => b.at - a.at)
    .slice(0, 4);
  return (
    <div className="lp-widget">
      <div>
        <div className="kicker signal">
          <span className="dot live" style={{ marginRight: 8 }} />
          {fill(c.liveTitle, { handle: inbox.handle })}
        </div>
        <div className="small muted">{c.liveSub}</div>
      </div>
      <div className="grid cols-2">
        <div>
          <div className="kicker">{c.quote}</div>
          <div className={`quote tier-${q.tier}`}>{fmtAmount(inbox.token, q.price)}</div>
          <div className="small muted">
            {TOKENS[inbox.token].symbol} · {['1.0×', '1.5×', '2.5×', '4.0×'][q.tier]}
          </div>
        </div>
        <div>
          <div className="kicker">{c.queue}</div>
          <div style={{ marginTop: 8 }}>
            <Gauge q={inbox.latch} tiers={SURGE_TABLES[curve] as number[]} pause={!q.canSend} />
          </div>
        </div>
      </div>
      <Ladder rungs={ladder} current={inbox.latch} symbol={TOKENS[inbox.token].symbol} fmt={(v) => fmtAmount(inbox.token, v)} />
      <div className="lp-log">
        {events.length === 0 && <div className="muted">{c.liveEmpty}</div>}
        {events.map((e, i) => (
          <div key={`${e.at}-${i}`}>
            <span className="t">{new Date(e.at * 1000).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' })}</span>
            {e.line}
          </div>
        ))}
      </div>
    </div>
  );
}

function ExampleGate() {
  const { lang } = useI18n();
  const c = LANDING[lang].hero.widget;
  const [st, setSt] = useState<{ q: number; i: number; log: Array<{ t: string; line: string }> }>({ q: 0, i: 0, log: [] });
  useEffect(() => {
    const id = window.setInterval(() => {
      setSt((s) => {
        const ev = SCRIPT[s.i % SCRIPT.length]!;
        const { out, newQ } = stepController('balanced', s.q, controllerInputsFor({ enqueue: ev === 'send' }));
        const t = new Date().toLocaleTimeString([], { hour12: false });
        let line: string;
        let q = newQ;
        if (ev === 'send') {
          if (!out.canSend) {
            line = c.blocked;
            q = s.q;
          } else line = fill(c.send, { price: fmtMoney('USDT0', quotePrice(BASE, out)), from: s.q, to: newQ });
        } else if (ev === 'reply') {
          const amount = quotePrice(BASE, { effTier: SURGE_TABLES.balanced[s.q] ?? 0, vipDiscount50: 0 });
          const fee = (amount * 500n) / 10_000n;
          line = fill(c.reply, { paid: fmtMoney('USDT0', amount - fee), fee: fmtMoney('USDT0', fee), from: s.q, to: newQ });
        } else line = fill(c.refund, { from: s.q, to: newQ });
        return { q, i: s.i + 1, log: [{ t, line }, ...s.log].slice(0, 4) };
      });
    }, 1700);
    return () => window.clearInterval(id);
  }, [c]);
  const next = stepController('balanced', st.q, controllerInputsFor({ enqueue: true }));
  const ladder = useMemo(() => priceLadder('balanced', BASE, { allowlisted: false, holdsPartner: false }), []);
  return (
    <div className="lp-widget">
      <div>
        <div className="kicker signal">{c.title}</div>
        <div className="small muted">{c.sub}</div>
      </div>
      <div className="grid cols-2">
        <div>
          <div className="kicker">{c.quote}</div>
          <div className={`quote tier-${next.out.effTier}`}>{fmtAmount('USDT0', quotePrice(BASE, next.out))}</div>
          <div className="small muted">USD₮0 · {['1.0×', '1.5×', '2.5×', '4.0×'][next.out.effTier]}</div>
        </div>
        <div>
          <div className="kicker">{c.queue}</div>
          <div style={{ marginTop: 8 }}>
            <Gauge q={st.q} tiers={SURGE_TABLES.balanced as number[]} />
          </div>
        </div>
      </div>
      <Ladder rungs={ladder} current={st.q} symbol="USD₮0" fmt={(v) => fmtAmount('USDT0', v)} />
      <div className="lp-log">
        {st.log.length === 0 && <div className="muted">…</div>}
        {st.log.map((l, i) => (
          <div key={`${l.t}-${i}`}>
            <span className="t">{l.t}</span>
            {l.line}
          </div>
        ))}
      </div>
    </div>
  );
}

// order matches LANDING[lang].stack.items
const STACK_ADDRS = [XLAYER.factory, XLAYER.deWebHub, XLAYER.siteRegistry, XLAYER.domainBinding, XLAYER.circuitMarket, DEFAULT_RELAY.container as Address, XLAYER.usdt0, (CONFIG.escrow ?? XLAYER.factory) as Address];

/** One answer open at a time: opening a question closes the previous one, clicking it again closes it. */
function Faq({ items }: { items: Array<{ q: string; a: string }> }) {
  const [open, setOpen] = useState<number | null>(null);
  return items.map((f, i) => {
    const on = open === i;
    return (
      // state lives in data-open, not className: the scroll reveal adds its own classes to this element
      <div className="lp-faq-item" data-open={on} key={i}>
        <h3>
          <button type="button" id={`faq-q-${i}`} aria-expanded={on} aria-controls={`faq-a-${i}`} onClick={() => setOpen(on ? null : i)}>
            {f.q}
          </button>
        </h3>
        <div className="lp-faq-body" id={`faq-a-${i}`} role="region" aria-labelledby={`faq-q-${i}`}>
          <div>
            <p>{f.a}</p>
          </div>
        </div>
      </div>
    );
  });
}

export function Landing() {
  const { lang, setLang } = useI18n();
  const tele = useTelemetry();
  const L = LANDING[lang];
  const catalog = getCatalog();
  const chainState = useInboxState();
  const burn = useMemo(() => catalogBurn(catalog), [catalog]);
  const proof = useMemo(() => proveAll(), []);
  const launch = href('pulse');
  const drawer = useDrawer();
  useLandingReveal();
  const sections: Array<[string, string]> = [['why', L.nav.product], ['how', L.nav.how], ['trust', L.nav.trust], ['faq', L.nav.faq]];

  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="lp-nav-inner">
          <Wordmark />
          <nav className="links" aria-label="Sections">
            {sections.map(([id, label]) => (
              <SectionLink key={id} to={id}>
                {label}
              </SectionLink>
            ))}
          </nav>
          <div className="controls">
            <Segmented
              className="lang-desktop"
              value={lang}
              options={[
                { id: 'en', label: 'EN' },
                { id: 'zh', label: '中文' },
              ]}
              onChange={setLang}
            />
          </div>
          <Burger open={drawer.open} onToggle={drawer.toggle} />
        </div>
      </header>
      <Drawer
        open={drawer.open}
        onClose={drawer.close}
        footer={
          <>
            <Segmented
              value={lang}
              options={[
                { id: 'en', label: 'EN' },
                { id: 'zh', label: '中文' },
              ]}
              onChange={setLang}
            />
            <a className="btn signal lg" href={launch} onClick={drawer.close}>
              {L.nav.launch}
            </a>
          </>
        }
      >
        {sections.map(([id, label]) => (
          <SectionLink key={id} to={id} onNavigate={drawer.close}>
            {label}
          </SectionLink>
        ))}
      </Drawer>

      <main className="lp-wrap">
        <section className="lp-hero" id="top">
          <div>
            <div className="kicker signal">{L.hero.kicker}</div>
            <h1 className="mt-s">
              <span>{L.hero.h1[0]}</span>
              <span className="accent">{L.hero.h1[1]}</span>
            </h1>
            <p className="lede">{L.hero.lede}</p>
            <div className="actions">
              <a className="btn signal lg" href={launch}>
                {L.hero.launch}
              </a>
              <a className="btn lg" href={href('gallery')}>
                {L.hero.secondary}
              </a>
            </div>
            <div className="lp-status" role="group" aria-label="Network status">
              <div className="lp-status-cell">
                <span className="lp-status-k">{lang === 'zh' ? '网络' : 'Network'}</span>
                <span className="lp-status-v">
                  <img className="lp-logo xl" src={xlayerIcon} alt="X Layer" width={20} height={16} />
                  X Layer <b>{tele.data ? `#${tele.data.block.toString()}` : '…'}</b>
                </span>
              </div>
              <div className="lp-status-cell">
                <span className="lp-status-k">{lang === 'zh' ? '状态' : 'Status'}</span>
                <span className="lp-status-v">
                  <span className={`lp-led ${DEPLOYED ? 'on' : 'amber'}`} />
                  {DEPLOYED ? (lang === 'zh' ? '主网运行中' : 'Mainnet live') : lang === 'zh' ? '主网即将上线' : 'Mainnet launch soon'}
                </span>
              </div>
              <div className="lp-status-cell">
                <span className="lp-status-k lp-status-k-brand">
                  {lang === 'zh' ? '协议栈' : 'Stack'} ·
                  <img className="lp-logo sm" src={tapeoutMark} alt="" width={14} height={14} />
                  <span>TapeOut</span>
                </span>
                <span className="lp-status-v lp-stack-tags">
                  <i>TAP-02</i>
                  <i>TAP-10 v2</i>
                  <i>DeWEB</i>
                </span>
              </div>
            </div>
          </div>
          <LiveGate />
        </section>

        <div className="lp-strip">
          <div>
            <div className="kicker">{DEPLOYED ? L.hero.stats.inboxes : L.hero.stats.circuits}</div>
            <div className="v">{DEPLOYED ? (chainState.loaded ? chainState.inboxes.filter((i) => i.active).length : '…') : catalog.length}</div>
          </div>
          <div>
            <div className="kicker">{L.hero.stats.processors}</div>
            <div className="v">{tele.data ? tele.data.cpuCount.toString() : '…'}</div>
          </div>
          <div>
            <div className="kicker">{L.hero.stats.proven}</div>
            <div className="v">{proof.total.toLocaleString()}</div>
          </div>
          <div>
            <div className="kicker">{L.hero.stats.burn}</div>
            <div className="v">
              {burn.nand} <span className="muted" style={{ fontSize: 16 }}>NAND</span> · {burn.latch} <span className="muted" style={{ fontSize: 16 }}>LATCH</span>
            </div>
          </div>
        </div>

        <section className="lp-section" id="why">
          <div className="lp-section-head">
            <SectionTag path="why" label={L.problem.kicker} />
            <div>
              <h2 className="lp-h2">{L.problem.title}</h2>
              <p className="lp-lede">{L.problem.lede}</p>
            </div>
          </div>
          <div className="lp-cards">
            {L.problem.cards.map((c) => (
              <div className="lp-card" key={c.title}>
                <h3>{c.title}</h3>
                <p>{c.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="lp-section" id="how">
          <div className="lp-section-head">
            <SectionTag path="how-it-works" label={L.how.kicker} />
            <h2 className="lp-h2">{L.how.title}</h2>
          </div>
          <div className="lp-cards four">
            {L.how.steps.map((s, i) => (
              <div className="lp-card" key={s.title}>
                <div className="n">0{i + 1}</div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            ))}
          </div>
          <div className="grid side-r mt">
            <div className="panel">
              <div className="kicker">{lang === 'zh' ? '拥堵曲线 · 队列深度 → 倍率' : 'Surge curves · queue depth → multiplier'}</div>
              <SurgeChart tables={SURGE_TABLES} />
            </div>
            <div className="panel">
              <div className="kicker">{lang === 'zh' ? '均衡曲线 · 10 USD₮0 基础价' : 'Balanced curve · 10 USD₮0 base'}</div>
              <div className="mt-s">
                <Ladder rungs={priceLadder('balanced', BASE, { allowlisted: false, holdsPartner: false })} current={-1} symbol="USD₮0" fmt={(v) => fmtAmount('USDT0', v)} />
              </div>
              <div className="kicker mt-s">{lang === 'zh' ? '合作电路持有者 · 降一档 · 5 折' : 'Partner-circuit holder · one tier down · 50% off'}</div>
              <div className="mt-s">
                <Ladder rungs={priceLadder('balanced', BASE, { allowlisted: false, holdsPartner: true })} current={-1} symbol="USD₮0" fmt={(v) => fmtAmount('USDT0', v)} />
              </div>
            </div>
          </div>
        </section>

        <section className="lp-section" id="hardware">
          <div className="lp-section-head">
            <SectionTag path="hardware" label={L.hardware.kicker} />
            <div>
              <h2 className="lp-h2">{L.hardware.title}</h2>
              <p className="lp-lede">{L.hardware.lede}</p>
            </div>
          </div>
          <div className="grid side">
            <div className="lp-cards two">
              {L.hardware.facts.map((f) => (
                <div className="lp-card lp-fact" key={f.k + f.v}>
                  <div className="k">
                    {f.k}
                    <small>{f.v}</small>
                  </div>
                  <p>{f.sub}</p>
                </div>
              ))}
            </div>
            <div className="lp-diagram">
              <div>
                <div className="kicker">in[5:0]</div>
                <div className="lp-chip-row mt-s">
                  {L.hardware.pinsIn.map((p) => (
                    <span className="lp-chip" key={p}>
                      {p}
                    </span>
                  ))}
                </div>
              </div>
              <div className="box">
                <div className="kicker">InboxController · nState = 3 · REF ×3 · 6 NAND glue</div>
                {L.hardware.cells.map((c) => {
                  const [name, cost] = c.split(' · ');
                  return (
                    <div className="cell" key={c}>
                      <span>
                        <b>REF</b> {name}
                      </span>
                      <span className="muted">{cost}</span>
                    </div>
                  );
                })}
              </div>
              <div>
                <div className="kicker">out[6:0]</div>
                <div className="lp-chip-row mt-s">
                  {L.hardware.pinsOut.map((p) => (
                    <span className="lp-chip out" key={p}>
                      {p}
                    </span>
                  ))}
                </div>
              </div>
              <div className="row between">
                <Badge tone={proof.ok ? 'ok' : 'bad'}>
                  {proof.total.toLocaleString()} / {proof.total.toLocaleString()} ✓ · {proof.elapsedMs.toFixed(1)} ms
                </Badge>
                <span className="small muted">{L.hardware.prover}</span>
              </div>
            </div>
          </div>
          <p className="lp-lede small mt">{L.hardware.note}</p>
        </section>

        <section className="lp-section" id="lanes">
          <div className="lp-section-head">
            <SectionTag path="lanes" label={L.lanes.kicker} />
            <div>
              <h2 className="lp-h2">{L.lanes.title}</h2>
              <p className="lp-lede">{L.lanes.lede}</p>
            </div>
          </div>
          <div className="panel flush table-wrap">
            <table className="table">
              <thead>
                <tr>
                  {L.lanes.head.map((h, i) => (
                    <th key={i}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {L.lanes.rows.map((r) => (
                  <tr key={r[0]}>
                    <td className="kicker" style={{ paddingTop: 12 }}>
                      {r[0]}
                    </td>
                    <td>{r[1]}</td>
                    <td>{r[2]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted mt-s">{L.lanes.note}</p>
        </section>

        <section className="lp-section" id="trust">
          <div className="lp-section-head">
            <SectionTag path="guarantees" label={L.trust.kicker} />
            <h2 className="lp-h2">{L.trust.title}</h2>
          </div>
          <div className="lp-cards">
            {L.trust.items.map((c) => (
              <div className="lp-card" key={c.title}>
                <h3>{c.title}</h3>
                <p>{c.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="lp-section" id="who">
          <div className="lp-section-head">
            <SectionTag path="who-its-for" label={L.who.kicker} />
            <h2 className="lp-h2">{L.who.title}</h2>
          </div>
          <div className="lp-cards four">
            {L.who.personas.map((p) => (
              <div className="lp-card" key={p.title}>
                <span className="pre">{p.preset}</span>
                <h3>{p.title}</h3>
                <p>{p.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="lp-section" id="model">
          <div className="lp-section-head">
            <SectionTag path="business-model" label={L.model.kicker} />
            <h2 className="lp-h2">{L.model.title}</h2>
          </div>
          <div className="lp-cards">
            {L.model.items.map((c) => (
              <div className="lp-card" key={c.title}>
                <h3>{c.title}</h3>
                <p>{c.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="lp-section" id="stack">
          <div className="lp-section-head">
            <SectionTag path="built-on" label={L.stack.kicker} />
            <h2 className="lp-h2">{L.stack.title}</h2>
          </div>
          <div className="lp-stack">
            {L.stack.items.map((s, i) => (
              <div key={s.name}>
                <div className="name">{s.name}</div>
                <div className="role">{s.role}</div>
                <Addr value={STACK_ADDRS[i]!} link={explorerAddress(STACK_ADDRS[i]!)} />
              </div>
            ))}
          </div>
        </section>

        <section className="lp-section lp-faq" id="faq">
          <div className="lp-section-head">
            <SectionTag path="faq" label={L.faq.kicker} />
            <h2 className="lp-h2">{L.faq.title}</h2>
          </div>
          <Faq items={L.faq.items} />
        </section>

        <section className="lp-cta" id="launch">
          <div className="kicker signal">Voxro · VOXR</div>
          <h2 className="mt-s">{L.cta.title}</h2>
          <p className="lp-lede">{L.cta.body}</p>
          <div className="row mt">
            <a className="btn signal lg" href={launch}>
              {L.cta.launch}
            </a>
            <a className="btn lg" href={href('start')}>
              {L.cta.spec}
            </a>
          </div>
        </section>
      </main>

      <footer className="lp-footer" style={{ borderTop: '1px solid var(--rule)' }}>
        <div className="lp-footer-inner">
          <span>{L.footer.line}</span>
          <span>{L.footer.built}</span>
        </div>
      </footer>
    </div>
  );
}
