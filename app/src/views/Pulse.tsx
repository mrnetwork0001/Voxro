import { SURGE_TABLES, XLAYER, catalogBurn, formatOkb } from '@voxro/sdk';
import { useMemo } from 'react';
import { explorerAddress } from '../chain/client.ts';
import { useTelemetry } from '../chain/telemetry.ts';
import { Addr, Badge, Kicker, Note, Panel, Stat, SurgeChart } from '../components/ui.tsx';
import { CONFIG, LAUNCHED } from '../config.ts';
import { fmtMoney } from '../format.ts';
import { useI18n } from '../i18n.tsx';
import { href } from '../router.ts';
import { getCatalog, proveAll } from '../sim/catalog.ts';
import { useInboxState } from '../backend.ts';
import { settledByToken } from '../sim/escrow.ts';

export function Pulse(_: { arg: string }) {
  const { t } = useI18n();
  const tele = useTelemetry();
  const sim = useInboxState();
  const catalog = getCatalog();
  const burn = useMemo(() => catalogBurn(catalog), [catalog]);
  const proof = useMemo(() => proveAll(), []);
  const settled = settledByToken(sim);
  const d = tele.data;
  const pending = sim.tickets.filter((x) => x.status === 'Pending').length;
  const activeInboxes = sim.inboxes.filter((i) => i.active);
  const surgeIndex = activeInboxes.length ? activeInboxes.reduce((a, i) => a + i.latch, 0) / activeInboxes.length : 0;

  return (
    <>
      <section className="hero">
        <Kicker signal>{t('app.tag')}</Kicker>
        <h1 className="mt-s">{t('pulse.h1')}</h1>
        <p className="lede mt-s">{t('pulse.lede')}</p>
        <div className="actions">
          <a className="btn signal" href={href('directory')}>
            {t('pulse.cta.send')}
          </a>
          <a className="btn" href={href('studio')}>
            {t('pulse.cta.studio')}
          </a>
        </div>
      </section>

      {!LAUNCHED ? <Note tone="warn">{t('c.simNote')}</Note> : <Note tone="ok">{t('chain.liveNote')}</Note>}

      <div className="grid cols-4 mt">
        <Stat label={t('c.block')} value={d ? `#${d.block.toString()}` : tele.error ? '—' : '…'} sub={tele.error ? <span className="bad">{tele.error.slice(0, 80)}</span> : 'X Layer · chainId 196'} tone={d ? 'ok' : undefined} />
        <Stat label={t('pulse.processors')} value={d ? d.cpuCount.toString() : '…'} sub={<Addr value={XLAYER.factory} link={explorerAddress(XLAYER.factory)} />} />
        <Stat label={t('pulse.deployFee')} value={d ? formatOkb(d.deployFee) : '…'} sub="Factory.deployFee()" />
        <Stat label={t('pulse.tapeoutFee')} value={d ? formatOkb(d.tapeoutFee) : '…'} sub="Circuits.TAPEOUT_FEE()" />
        <Stat label={t('pulse.openerFee')} value={d ? formatOkb(d.openerFee) : '…'} sub="Opener.FEE()" />
        <Stat label={t('pulse.marketFee')} value={d ? `${(Number(d.marketFeeBps) / 100).toFixed(2)} %` : '…'} sub="CircuitMarket.feeBps()" />
        <Stat label={t('pulse.hub')} value={<Addr value={XLAYER.deWebHub} link={explorerAddress(XLAYER.deWebHub)} />} sub="DeWebHub · TAP-10 v2" mono />
        <Stat
          label={t('pulse.voxr')}
          value={d?.voxr ? `${d.voxr.symbol} · ${d.voxr.nextId.toString()} ids` : <Badge tone="warn">{t('c.prelaunch')}</Badge>}
          sub={d?.voxr ? <Addr value={CONFIG.voxrCpu!} link={explorerAddress(CONFIG.voxrCpu!)} /> : t('pulse.voxr.pre')}
          tone={d?.voxr ? 'signal' : undefined}
        />
      </div>

      <div className="grid side mt">
        <Panel kicker={t('pulse.catalog')} title="VOXR · 8 circuits">
          <div className="grid cols-2">
            <Stat label={t('pulse.circuits')} value={catalog.length} sub="3 cells + 5 controllers" />
            <Stat label={t('pulse.burn')} value={`${burn.nand} NAND · ${burn.latch} LATCH`} sub="top-level records only" />
            <Stat label={t('pulse.proven')} value={proof.total.toLocaleString()} sub={proof.ok ? <span className="ok">0 mismatches</span> : <span className="bad">mismatch</span>} tone={proof.ok ? 'ok' : 'warn'} />
            <Stat label={t('pulse.proveTime')} value={`${proof.elapsedMs.toFixed(1)} ms`} sub="in this browser, just now" />
          </div>
          <div className="table-wrap mt-s">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>{t('c.circuit')}</th>
                <th>in/out/state</th>
                <th className="num">gates</th>
                <th className="num">burn</th>
                <th className="num">proved</th>
              </tr>
            </thead>
            <tbody>
              {catalog.map((c, i) => (
                <tr key={c.id.toString()}>
                  <td className="mono">{c.id.toString()}</td>
                  <td>{c.name}</td>
                  <td className="mono">
                    {c.resolved.nIn}/{c.resolved.nOut}/{c.resolved.nState}
                  </td>
                  <td className="num mono">{c.resolved.gateCount}</td>
                  <td className="num mono">
                    {c.circuit.burn.nand}N{c.circuit.burn.latch ? ` ${c.circuit.burn.latch}L` : ''}
                  </td>
                  <td className="num mono ok">{proof.perCircuit[i]?.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </Panel>
        <Panel kicker={t('pulse.curves')} title={t('pulse.curves.sub')}>
          <SurgeChart tables={SURGE_TABLES} />
          <div className="grid cols-4 mt-s">
            {(['gentle', 'balanced', 'steep', 'fortress'] as const).map((p) => (
              <div key={p} className="small">
                <div className="kicker">{t(`c.curve.${p}`)}</div>
                <div className="mono">[{SURGE_TABLES[p].join(' ')}]</div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid side-r mt">
        <Panel kicker={t('pulse.how')} title="LATCH → price → reply → settle">
          <div className="steps">
            <div>{t('pulse.how.1')}</div>
            <div>{t('pulse.how.2')}</div>
            <div>{t('pulse.how.3')}</div>
          </div>
        </Panel>
        <Panel kicker={LAUNCHED ? t('c.live') : t('c.sim')} title={t('pulse.network')}>
          <div className="grid cols-2">
            <Stat label={t('pulse.inboxes')} value={sim.inboxes.filter((i) => i.active).length} />
            <Stat label={t('pulse.pendingTickets')} value={pending} />
            <Stat label={t('pulse.surgeIndex')} value={`${surgeIndex.toFixed(2)} / 7`} sub={t('pulse.surgeIndex.sub')} tone={surgeIndex >= 4 ? 'warn' : undefined} />
            <Stat label={t('pulse.settled')} value={fmtMoney('USDT0', settled.USDT0.recipient + settled.USDT0.protocol)} sub={`${fmtMoney('USDT', settled.USDT.recipient + settled.USDT.protocol)} · ${fmtMoney('OKB', settled.OKB.recipient + settled.OKB.protocol)}`} />
            <Stat label={t('pulse.protocol')} value={fmtMoney('USDT0', settled.USDT0.protocol)} sub="5% of claimed bounties" />
          </div>
        </Panel>
      </div>
    </>
  );
}
