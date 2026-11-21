import { formatNetlist, type ControllerInputs } from '@voxro/sdk';
import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { useI18n } from '../i18n.tsx';
import type { CatalogItem, Rung, TableRow, TrafficPoint } from '../sim/catalog.ts';

export const Kicker = ({ children, signal }: { children: ReactNode; signal?: boolean }) => <div className={`kicker${signal ? ' signal' : ''}`}>{children}</div>;

export function Panel({ title, kicker, right, children, className = '', signal }: { title?: ReactNode; kicker?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; signal?: boolean }) {
  return (
    <section className={`panel${signal ? ' signal' : ''} ${className}`}>
      {(title || kicker || right) && (
        <div className="panel-head">
          <div>
            {kicker && <Kicker>{kicker}</Kicker>}
            {title && <h3>{title}</h3>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, tone, mono }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: 'signal' | 'ok' | 'warn'; mono?: boolean }) {
  return (
    <div className={`stat${tone ? ` ${tone}` : ''}`}>
      <div className="kicker">{label}</div>
      <div className={`value${mono ? ' mono' : ''}`}>{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

export const Badge = ({ tone = 'neutral', children }: { tone?: 'ok' | 'warn' | 'bad' | 'signal' | 'fill' | 'neutral'; children: ReactNode }) => <span className={`badge ${tone === 'neutral' ? '' : tone}`}>{children}</span>;

export function Button({ variant, size, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'signal' | 'ghost'; size?: 'sm' }) {
  return (
    <button className={`btn${variant ? ` ${variant}` : ''}${size ? ` ${size}` : ''}`} {...rest}>
      {children}
    </button>
  );
}

export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: Array<{ id: T; label: ReactNode }>; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={o.id === value} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const Note = ({ tone, children }: { tone?: 'warn' | 'ok' | 'signal'; children: ReactNode }) => <div className={`note${tone ? ` ${tone}` : ''}`}>{children}</div>;

export function Copy({ value }: { value: string }) {
  const { t } = useI18n();
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const id = setTimeout(() => setDone(false), 1200);
    return () => clearTimeout(id);
  }, [done]);
  return (
    <button
      type="button"
      className="copy"
      onClick={() => {
        navigator.clipboard?.writeText(value).then(() => setDone(true)).catch(() => {});
      }}
    >
      {done ? t('c.copied') : t('c.copy')}
    </button>
  );
}

export const short = (a: string, n = 6) => (a.length > 2 * n + 2 ? `${a.slice(0, n + 2)}…${a.slice(-n)}` : a);

export function Addr({ value, link, full }: { value: string; link?: string; full?: boolean }) {
  const text = full ? value : short(value);
  return (
    <span className="mono">
      {link ? (
        <a href={link} target="_blank" rel="noreferrer">
          {text}
        </a>
      ) : (
        text
      )}
      <Copy value={value} />
    </span>
  );
}

/** 8-cell LATCH queue gauge; filled cells take the tier colour of that depth. */
export function Gauge({ q, tiers, pause }: { q: number; tiers?: number[]; pause?: boolean }) {
  return (
    <div>
      <div className="gauge" aria-label={`queue ${q} of 7`}>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className={`cell${i <= q && (i > 0 || q > 0) ? ` on t${tiers?.[i] ?? 0}` : ''}`} />
        ))}
      </div>
      <div className="gauge-labels">
        <span>Q = {q}</span>
        <span>{pause ? 'PAUSE' : `${q}/7`}</span>
      </div>
    </div>
  );
}

export function Bits({ bits, labels }: { bits: readonly number[]; labels?: readonly string[] }) {
  return (
    <span className="bits" title={labels?.join(', ')}>
      {bits.map((b, i) => (
        <span key={i} className={b ? 'one' : ''} title={labels?.[i]}>
          {b}
        </span>
      ))}
    </span>
  );
}

const TIER_COLORS = ['var(--tier0)', 'var(--tier1)', 'var(--tier2)', 'var(--tier3)'];

/** Step chart of the four surge curves (queue depth → tier). */
export function SurgeChart({ tables, highlight }: { tables: Record<string, readonly number[]>; highlight?: string }) {
  const W = 560;
  const H = 200;
  const px = 40;
  const py = 16;
  const x = (q: number) => px + (q * (W - px - 10)) / 8;
  const y = (tier: number) => H - py - (tier * (H - 2 * py)) / 3;
  const names = Object.keys(tables);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H + 18}`} role="img">
      {[0, 1, 2, 3].map((tier) => (
        <g key={tier}>
          <line className="grid" x1={px} x2={W - 10} y1={y(tier)} y2={y(tier)} />
          <text x={4} y={y(tier) + 3}>
            {['1.0×', '1.5×', '2.5×', '4.0×'][tier]}
          </text>
        </g>
      ))}
      {Array.from({ length: 8 }, (_, q) => (
        <text key={q} x={x(q) + (x(1) - x(0)) / 2 - 6} y={H + 12}>
          Q{q}
        </text>
      ))}
      {names.map((name, k) => {
        const table = tables[name]!;
        const d = table.map((tier, q) => `${q === 0 ? 'M' : 'L'}${x(q)},${y(tier)} L${x(q + 1)},${y(tier)}`).join(' ');
        const dim = highlight && highlight !== name;
        return <path key={name} d={d} fill="none" stroke={TIER_COLORS[k % 4]} strokeWidth={highlight === name ? 3 : 1.6} opacity={dim ? 0.28 : 1} strokeLinejoin="round" />;
      })}
      {names.map((name, k) => (
        <g key={`l${name}`} transform={`translate(${px + k * 110}, ${py - 6})`}>
          <rect width={10} height={3} fill={TIER_COLORS[k % 4]} y={-3} />
          <text x={14} y={1}>
            {name}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** Queue depth and tier over a scripted traffic sequence. */
export function Waveform({ points }: { points: TrafficPoint[] }) {
  const W = 620;
  const H = 180;
  const px = 36;
  const n = Math.max(points.length, 1);
  const x = (i: number) => px + (i * (W - px - 10)) / n;
  const yq = (q: number) => H - 20 - (q * (H - 60)) / 7;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H + 24}`} role="img">
      {[0, 7].map((q) => (
        <g key={q}>
          <line className="grid" x1={px} x2={W - 10} y1={yq(q)} y2={yq(q)} />
          <text x={6} y={yq(q) + 3}>
            Q{q}
          </text>
        </g>
      ))}
      <path d={points.map((p, i) => `${i === 0 ? `M${x(i)},${yq(0)} L` : 'L'}${x(i)},${yq(p.q)} L${x(i + 1)},${yq(p.q)}`).join(' ')} fill="none" stroke="var(--ink)" strokeWidth={1.8} />
      {points.map((p, i) => (
        <g key={i}>
          <rect x={x(i) + 1} y={H - 12} width={Math.max(x(i + 1) - x(i) - 2, 1)} height={8} fill={TIER_COLORS[p.tier]} opacity={p.canSend ? 1 : 0.35} />
          <text x={x(i) + 3} y={H + 10}>
            {p.event.kind === 'send' ? (p.canSend ? (p.event.holdsPartner ? 'S*' : 'S') : '✕') : p.event.kind === 'reply' ? 'R' : 'X'}
          </text>
          <text x={x(i) + 3} y={H + 21} fill="var(--ink-3)">
            {['1', '1.5', '2.5', '4'][p.tier]}×
          </text>
        </g>
      ))}
    </svg>
  );
}

export function Ladder({ rungs, current, symbol, fmt }: { rungs: Rung[]; current: number; symbol: string; fmt: (v: bigint) => string }) {
  return (
    <div className="ladder">
      {rungs.map((r) => (
        <div key={r.q} className={`rung${r.q === current ? ' cur' : ''}${r.canSend ? '' : ' pause'}`} title={`Q ${r.q} → ${r.nextQ}`}>
          <div className="q">Q{r.q}→{r.nextQ}</div>
          <div className={`p tier-${r.tier}`}>{fmt(r.price)}</div>
          <div className="q">{symbol}</div>
        </div>
      ))}
    </div>
  );
}

const IN_LABELS = ['active', 'dir', 'p0', 'p1', 'allow', 'partner'];
const bitsOf = (i: ControllerInputs) => [i.active, i.dir, i.p0, i.p1, i.allowlisted, i.holdsPartner];

export function TruthTable({ rows, limit = 512 }: { rows: TableRow[]; limit?: number }) {
  return (
    <div className="scroll">
      <table className="table">
        <thead>
          <tr>
            <th>Q</th>
            <th>in[5:0]</th>
            <th>Q′</th>
            <th>tier</th>
            <th>×</th>
            <th>vip50</th>
            <th>canSend</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, limit).map((r, k) => (
            <tr key={k}>
              <td className="mono">{r.q}</td>
              <td>
                <Bits bits={bitsOf(r.input)} labels={IN_LABELS} />
              </td>
              <td className="mono">{r.out.q}</td>
              <td className={`mono tier-${r.out.effTier}`}>{r.out.effTier}</td>
              <td className="mono">{['1.0', '1.5', '2.5', '4.0'][r.out.effTier]}</td>
              <td className="mono">{r.out.vipDiscount50}</td>
              <td className={`mono ${r.out.canSend ? 'ok' : 'bad'}`}>{r.out.canSend}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function NetlistView({ item }: { item: CatalogItem }) {
  return (
    <pre className="mono small" style={{ maxHeight: 360, overflow: 'auto' }}>
      {formatNetlist({ nIn: item.circuit.nIn, nOut: item.circuit.nOut, elements: item.circuit.elements })}
    </pre>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="muted small" style={{ padding: '18px 0' }}>
      {children}
    </div>
  );
}

export function Toast({ msg }: { msg: string | null }) {
  return msg ? <div className="toast">{msg}</div> : null;
}

export function useToast(): [string | null, (m: string) => void] {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const id = setTimeout(() => setMsg(null), 2600);
    return () => clearTimeout(id);
  }, [msg]);
  return [msg, setMsg];
}
