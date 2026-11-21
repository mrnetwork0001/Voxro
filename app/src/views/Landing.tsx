import { SURGE_TABLES, XLAYER, catalogBurn, controllerInputsFor, quotePrice } from '@voxro/sdk';
import { useEffect, useMemo, useState } from 'react';
import { explorerAddress } from '../chain/client.ts';
import { useTelemetry } from '../chain/telemetry.ts';
import { Addr, Badge, Gauge, Ladder, Segmented, SurgeChart } from '../components/ui.tsx';
import { LAUNCHED } from '../config.ts';
import { fmtAmount, fmtMoney } from '../format.ts';
import { useI18n } from '../i18n.tsx';
import { LANDING } from '../landing/copy.ts';
import { href } from '../router.ts';
import { getCatalog, priceLadder, proveAll, stepController } from '../sim/catalog.ts';
import { useTheme } from '../theme.tsx';

const BASE = 10_000_000n; // 10 USD₮0
const SCRIPT = ['send', 'send', 'send', 'reply', 'send', 'send', 'send', 'reply', 'reply', 'send', 'send', 'refund', 'reply', 'reply', 'reply', 'reply'] as const;

function fill(tpl: string, vars: Record<string, string | number>) {
  let s = tpl;
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/** Hero widget: the real FounderBalancedInbox circuit stepped on a timer. */
function LiveGate() {
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

const STACK_ADDRS = [XLAYER.factory, XLAYER.deWebHub, XLAYER.siteRegistry, XLAYER.domainBinding, XLAYER.circuitMarket, XLAYER.transistorDrops, XLAYER.usdt0, XLAYER.multicall3];

export function Landing() {
  const { lang, setLang } = useI18n();
  const { theme, toggle } = useTheme();
  const tele = useTelemetry();
  const L = LANDING[lang];
  const catalog = getCatalog();
  const burn = useMemo(() => catalogBurn(catalog), [catalog]);
  const proof = useMemo(() => proveAll(), []);
  const launch = href('pulse');

  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="lp-nav-inner">
          <a className="wordmark" href="#/" title="Voxro">
            <svg className="mark" viewBox="0 0 32 32" aria-hidden="true">
              <path d="M6 7h5l5 13 5-13h5L19 26h-6z" fill="var(--signal)" />
            </svg>
            VOXRO
          </a>
          <nav className="links" aria-label="Sections">
            <a href="#why">{L.nav.product}</a>
            <a href="#how">{L.nav.how}</a>
            <a href="#hardware">{L.nav.hardware}</a>
            <a href="#lanes">{L.nav.lanes}</a>
            <a href="#trust">{L.nav.trust}</a>
            <a href="#faq">{L.nav.faq}</a>
            <a href={href('prover')}>{L.nav.prover}</a>
            <a href={href('gallery')}>{L.nav.docs}</a>
          </nav>
          <div className="controls">
            <Segmented
              value={lang}
              options={[
                { id: 'en', label: 'EN' },
                { id: 'zh', label: '中文' },
              ]}
              onChange={setLang}
            />
            <button className="btn ghost sm" onClick={toggle} aria-label="Toggle theme" title={theme}>
              {theme === 'dark' ? '☀' : '☾'}
            </button>
            <a className="btn signal sm" href={launch}>
              {L.nav.launch} →
            </a>
          </div>
        </div>
      </header>

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
                {L.hero.launch} →
              </a>
              <a className="btn lg" href={href('gallery')}>
                {L.hero.secondary}
              </a>
            </div>
            <div className="row mt" style={{ gap: 8 }}>
              <Badge tone={tele.data ? 'ok' : 'neutral'}>
                <span className={`dot ${tele.data ? 'live' : ''}`} /> X Layer {tele.data ? `#${tele.data.block.toString()}` : '…'}
              </Badge>
              <Badge tone={LAUNCHED ? 'signal' : 'warn'}>{LAUNCHED ? 'Mainnet' : lang === 'zh' ? '上线前 · 本地模拟' : 'Pre-launch · local simulation'}</Badge>
              <Badge>TAP-02 · TAP-10 v2 · DeWEB</Badge>
            </div>
          </div>
          <LiveGate />
        </section>

        <div className="lp-strip">
          <div>
            <div className="kicker">{L.hero.stats.block}</div>
            <div className="v ok">{tele.data ? `#${tele.data.block.toString()}` : '…'}</div>
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
            <div className="lp-num">{L.problem.kicker}</div>
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
            <div className="lp-num">{L.how.kicker}</div>
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
            <div className="lp-num">{L.hardware.kicker}</div>
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
            <div className="lp-num">{L.lanes.kicker}</div>
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
            <div className="lp-num">{L.trust.kicker}</div>
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
            <div className="lp-num">{L.who.kicker}</div>
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
            <div className="lp-num">{L.model.kicker}</div>
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
            <div className="lp-num">{L.stack.kicker}</div>
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
            <div className="lp-num">{L.faq.kicker}</div>
            <h2 className="lp-h2">{L.faq.title}</h2>
          </div>
          {L.faq.items.map((f, i) => (
            <details key={f.q} open={i === 0}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </section>

        <section className="lp-cta" id="launch">
          <div className="kicker signal">Voxro · VOXR</div>
          <h2 className="mt-s">{L.cta.title}</h2>
          <p className="lp-lede">{L.cta.body}</p>
          <div className="row mt">
            <a className="btn signal lg" href={launch}>
              {L.cta.launch} →
            </a>
            <a className="btn lg" href={href('studio')}>
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
