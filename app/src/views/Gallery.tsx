import { CONTROLLER_IN, OP_REF, XLAYER, beat, bitsFromInt, deWebName, intFromBits, renderDatasheetSvg, shortName, type Bit } from '@voxro/sdk';
import { useMemo, useState } from 'react';
import { explorerAddress } from '../chain/client.ts';
import { useTelemetry } from '../chain/telemetry.ts';
import { Addr, Badge, Bits, NetlistView, Panel, Stat } from '../components/ui.tsx';
import { CONFIG, LAUNCHED, SIM_CPU, VOXR_CPU_INDEX } from '../config.ts';
import { useI18n } from '../i18n.tsx';
import { getCatalog, proveItem } from '../sim/catalog.ts';

const CELL_IN: Record<string, string[]> = {
  SaturatingQueue3: ['active', 'dir'],
  SurgeCurveDecoder: ['q0', 'q1', 'q2', 'p0', 'p1'],
  VipPassGate: ['allow', 'partner', 't0', 't1', 'pause'],
};
const CELL_OUT: Record<string, string[]> = {
  SaturatingQueue3: ["q'0", "q'1", "q'2"],
  SurgeCurveDecoder: ['t0', 't1', 'pause'],
  VipPassGate: ['e0', 'e1', 'vip50', 'canSend'],
};
const CTRL_OUT = ['effTier0', 'effTier1', 'vip50', 'canSend', "q'0", "q'1", "q'2"];

export function Gallery(_: { arg: string }) {
  const { t } = useI18n();
  const tele = useTelemetry();
  const catalog = getCatalog();
  const [sel, setSel] = useState(0);
  const [state, setState] = useState<Bit[]>([]);
  const [inputs, setInputs] = useState<Bit[]>([]);
  const item = catalog[sel]!;
  const c = item.resolved;
  const st = state.length === c.nState ? state : (bitsFromInt(0, c.nState) as Bit[]);
  const inp = inputs.length === c.nIn ? inputs : (bitsFromInt(0, c.nIn) as Bit[]);
  const result = useMemo(() => beat(c, st, inp), [c, st, inp]);
  const proof = useMemo(() => proveItem(item), [item]);
  const inLabels = item.kind === 'controller' ? Object.keys(CONTROLLER_IN) : (CELL_IN[item.name] ?? []);
  const outLabels = item.kind === 'controller' ? CTRL_OUT : (CELL_OUT[item.name] ?? []);
  const refs = item.circuit.elements.filter((e) => e.op === OP_REF);
  const datasheet = useMemo(
    () => renderDatasheetSvg({ name: item.name, cpu: SIM_CPU, id: item.id, nIn: c.nIn, nOut: c.nOut, nState: c.nState, gateCount: c.gateCount, burn: item.circuit.burn, proven: { total: proof.total, ok: proof.ok, elapsedMs: proof.elapsedMs }, label: deWebName(item.id, VOXR_CPU_INDEX) }),
    [item, c, proof],
  );
  const datasheetUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(datasheet)}`;

  const toggle = (which: 'state' | 'input', i: number) => {
    if (which === 'state') setState(st.map((b, k) => (k === i ? ((1 - b) as Bit) : b)));
    else setInputs(inp.map((b, k) => (k === i ? ((1 - b) as Bit) : b)));
  };

  return (
    <>
      <div className="mb">
        <div className="kicker">{t('nav.gallery')}</div>
        <h2>{t('gal.title')}</h2>
        <p className="lede small mt-s">{t('gal.lede')}</p>
      </div>
      <div className="grid side">
        <Panel className="flush table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>{t('c.circuit')}</th>
                <th>in/out/st</th>
                <th className="num">gates</th>
                <th className="num">burn</th>
                <th className="num">bytes</th>
              </tr>
            </thead>
            <tbody>
              {catalog.map((x, i) => (
                <tr key={x.id.toString()} className={`click${i === sel ? ' sel' : ''}`} onClick={() => { setSel(i); setState([]); setInputs([]); }}>
                  <td className="mono">{x.id.toString()}</td>
                  <td>
                    {x.name}
                    <div className="small muted">{x.kind === 'cell' ? t('gal.kind.cell') : t('gal.kind.controller')}</div>
                  </td>
                  <td className="mono">
                    {x.resolved.nIn}/{x.resolved.nOut}/{x.resolved.nState}
                  </td>
                  <td className="num mono">{x.resolved.gateCount}</td>
                  <td className="num mono">
                    {x.circuit.burn.nand}N{x.circuit.burn.latch ? ` ${x.circuit.burn.latch}L` : ''}
                  </td>
                  <td className="num mono">{x.circuit.bytes.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <div className="stack">
          <Panel kicker={`#${item.id.toString()} · ${shortName(item.id, VOXR_CPU_INDEX)}`} title={item.name} right={<Badge tone={proof.ok ? 'ok' : 'bad'}>{proof.total} transitions ✓</Badge>}>
            <div className="grid cols-4">
              <Stat label="nIn / nOut / nState" value={`${c.nIn} / ${c.nOut} / ${c.nState}`} />
              <Stat label="gateCount" value={c.gateCount} sub="incl. REF" />
              <Stat label={t('studio.burn')} value={`${item.circuit.burn.nand}N ${item.circuit.burn.latch}L`} />
              <Stat label={t('gal.onchain')} value={LAUNCHED && CONFIG.voxrCpu ? <Addr value={CONFIG.voxrCpu} link={explorerAddress(CONFIG.voxrCpu)} /> : `#${item.id.toString()}`} sub={LAUNCHED ? 'VOXR' : <Badge tone="warn">{t('gal.onchain.pre')}</Badge>} />
            </div>
            {refs.length > 0 && (
              <div className="small mt-s">
                <span className="kicker">{t('gal.refs')}</span>{' '}
                {refs.map((r, i) => (r.op === OP_REF ? <span key={i} className="mono">#{r.id.toString()} ({r.ins.length}→{r.nOuts}) </span> : null))}
              </div>
            )}
          </Panel>

          <Panel kicker={t('gal.bench')} title={t('gal.bench.sub')}>
            <div className="grid cols-2">
              <div>
                <div className="kicker">{t('c.state')} ({c.nState} bits)</div>
                <div className="row mt-s">
                  {st.length === 0 && <span className="muted small">combinational</span>}
                  {st.map((b, i) => (
                    <button key={i} className={`btn sm${b ? ' signal' : ' ghost'}`} onClick={() => toggle('state', i)}>
                      s{i}={b}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="kicker">{t('c.inputs')} ({c.nIn} bits)</div>
                <div className="row mt-s">
                  {inp.map((b, i) => (
                    <button key={i} className={`btn sm${b ? ' signal' : ' ghost'}`} onClick={() => toggle('input', i)} title={inLabels[i]}>
                      {inLabels[i] ?? `in${i}`}={b}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="grid cols-2 mt">
              <Stat label={`${t('c.outputs')} (LSB-first)`} value={<Bits bits={result.outputs} labels={outLabels} />} sub={outLabels.map((l, i) => `${l}=${result.outputs[i]}`).join(' · ')} />
              <Stat label="newState" value={<Bits bits={result.newState} />} sub={c.nState ? `Q' = ${intFromBits(result.newState)}` : '—'} />
            </div>
          </Panel>

          <Panel kicker={t('prover.datasheet')} title={item.name} right={<a className="btn sm" href={datasheetUrl} download={`${item.name}-datasheet.svg`}>{t('prover.download')}</a>}>
            <img src={datasheetUrl} alt="datasheet" style={{ width: '100%', border: '1px solid var(--rule)' }} />
          </Panel>

          <Panel kicker={t('gal.netlist')} title={`${item.circuit.bytes.length} B · ${item.circuit.elements.length} records`} right={<Addr value={item.circuit.hex} />}>
            <NetlistView item={item} />
          </Panel>

          <div className="grid cols-2">
            <Panel kicker={t('gal.drop')} title="Transistor Drops">
              <p className="small muted">{t('gal.drop.sub')}</p>
              <div className="mt-s">
                <Addr value={XLAYER.transistorDrops} link={explorerAddress(XLAYER.transistorDrops)} />
              </div>
            </Panel>
            <Panel kicker={t('gal.market')} title={tele.data ? `feeBps ${tele.data.marketFeeBps.toString()}` : 'CircuitMarket'}>
              <p className="small muted">{t('gal.market.sub')}</p>
              <div className="mt-s">
                <Addr value={XLAYER.circuitMarket} link={explorerAddress(XLAYER.circuitMarket)} />
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </>
  );
}
