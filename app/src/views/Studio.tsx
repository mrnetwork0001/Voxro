import { CONTROLLER_PRESETS, CURVE_PROFILES, NAND_TOKEN_ID, PRESET_NAMES, SURGE_TABLES, XLAYER_FEES, circuitsAbi, formatOkb, mintValue, transistorsAbi, type Address, type ControllerPreset, type CurveProfile } from '@voxro/sdk';
import { useMemo, useState } from 'react';
import { publicClient } from '../chain/client.ts';
import { useTelemetry } from '../chain/telemetry.ts';
import { Addr, Badge, Button, Field, Ladder, Note, Panel, Segmented, Stat, Toast, TruthTable, Waveform, useToast } from '../components/ui.tsx';
import { CONFIG, DEMO_SENDER, LAUNCHED, SIM_CPU } from '../config.ts';
import { fmtAmount, parseAmount } from '../format.ts';
import { useI18n } from '../i18n.tsx';
import { navigate } from '../router.ts';
import { DEFAULT_TRAFFIC, controllerTable, getController, priceLadder, proveItem, simulateTraffic } from '../sim/catalog.ts';
import { backend, type OnboardStep } from '../backend.ts';
import { explorerTx } from '../chain/client.ts';
import { TOKENS, type Token } from '../sim/escrow.ts';
import { useWallet } from '../wallet/wallet.tsx';

const DEFAULT_MINT_PRICE = 10_000_000_000_000n; // 0.00001 OKB per transistor (VOXR launch parameter)

export function Studio(_: { arg: string }) {
  const { t, lang } = useI18n();
  const w = useWallet();
  const tele = useTelemetry();
  const [preset, setPreset] = useState<ControllerPreset>('balanced');
  const [curve, setCurve] = useState<CurveProfile>('balanced');
  const [partner, setPartner] = useState('');
  const [handle, setHandle] = useState('');
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [token, setToken] = useState<Token>('USDT0');
  const [price, setPrice] = useState('10');
  const [slaHours, setSlaHours] = useState('48');
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [txs, setTxs] = useState<string[]>([]);
  const [toast, setToast] = useToast();
  const [mailboxMode, setMailboxMode] = useState<'new' | 'existing'>('new');
  const [mbCircuits, setMbCircuits] = useState('');
  const [mbToken, setMbToken] = useState('');
  const [steps, setSteps] = useState<OnboardStep[]>([]);
  const [registering, setRegistering] = useState(false);

  const item = getController(preset);
  const proof = useMemo(() => proveItem(item), [item]);
  const rows = useMemo(() => controllerTable(preset), [preset]);
  const shown = useMemo(() => (showAll ? rows : rows.filter((r) => r.input.active === 1 && r.input.dir === 1 && (preset === 'configurable' ? r.input.p0 === (CURVE_PROFILES.indexOf(curve) & 1) && r.input.p1 === (CURVE_PROFILES.indexOf(curve) >> 1) : r.input.p0 === 0 && r.input.p1 === 0))), [rows, showAll, preset, curve]);
  const basePrice = useMemo(() => {
    try {
      return parseAmount(token, price);
    } catch {
      return 0n;
    }
  }, [token, price]);
  const cold = priceLadder(preset, basePrice, { allowlisted: false, holdsPartner: false }, curve);
  const holder = priceLadder(preset, basePrice, { allowlisted: false, holdsPartner: true }, curve);
  const traffic = useMemo(() => simulateTraffic(preset, basePrice, DEFAULT_TRAFFIC, curve), [preset, basePrice, curve]);
  const effCurve: CurveProfile = preset === 'configurable' ? curve : preset;
  const mintPrice = tele.data?.voxr?.mintPrice ?? DEFAULT_MINT_PRICE;
  const protocolFee = tele.data?.voxr?.protocolFee ?? XLAYER_FEES.mintProtocolFeePerCall;
  const mintCost = mintValue(BigInt(item.circuit.burn.nand), mintPrice, protocolFee);
  const tapeoutFee = tele.data?.tapeoutFee ?? XLAYER_FEES.tapeoutFee;
  const partnerAddr = /^0x[0-9a-fA-F]{40}$/.test(partner) ? (partner as Address) : null;

  const register = async () => {
    if (backend.mode === 'chain' && !w.address) return setToast(t('onboard.connect'));
    setRegistering(true);
    setSteps([]);
    try {
      const mailbox = backend.mode === 'chain' && mailboxMode === 'existing' && /^0x[0-9a-fA-F]{40}$/.test(mbCircuits) && mbToken ? { circuits: mbCircuits as Address, tokenId: BigInt(mbToken) } : undefined;
      const ib = await backend.registerInbox(
        { handle, name: name || `@${handle}`, bio, owner: w.address ?? DEMO_SENDER, preset, curve, partnerCpu: partnerAddr, token, basePrice, slaSeconds: Math.max(1, Number(slaHours)) * 3600, ...(mailbox ? { mailbox } : {}) },
        (st) => setSteps((prev) => [...prev.filter((x) => x.key !== st.key), st]),
      );
      setToast(`${t('studio.registered')} · @${ib.handle}`);
      navigate('directory', ib.handle);
    } catch (e) {
      setToast(e instanceof Error ? e.message.slice(0, 200) : String(e));
    } finally {
      setRegistering(false);
    }
  };
  const STEP_KEYS: OnboardStep['key'][] = ['tapeout', 'open', 'key', 'register'];

  const tapeout = async () => {
    if (!w.walletClient || !w.address || !CONFIG.voxrCpu || !tele.data?.voxr) return;
    setBusy(true);
    try {
      if (w.chainId !== 196) await w.switchToXLayer();
      const tr = tele.data.voxr.transistors;
      const h1 = await w.walletClient.writeContract({ account: w.address, chain: w.walletClient.chain, address: tr, abi: transistorsAbi, functionName: 'mint', args: [NAND_TOKEN_ID, BigInt(item.circuit.burn.nand)], value: mintCost });
      setTxs((x) => [...x, h1]);
      await publicClient.waitForTransactionReceipt({ hash: h1 });
      const h2 = await w.walletClient.writeContract({ account: w.address, chain: w.walletClient.chain, address: CONFIG.voxrCpu, abi: circuitsAbi, functionName: 'tapeout', args: [item.circuit.hex, item.circuit.nIn, item.circuit.nOut], value: tapeoutFee });
      setTxs((x) => [...x, h2]);
      await publicClient.waitForTransactionReceipt({ hash: h2 });
      setToast('tapeout() mined');
    } catch (e) {
      setToast(e instanceof Error ? e.message.slice(0, 160) : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="mb">
        <div className="kicker">{t('nav.studio')}</div>
        <h2>{t('studio.title')}</h2>
        <p className="lede small mt-s">{t('studio.lede')}</p>
      </div>
      <div className="grid side">
        <div className="stack">
          <Panel kicker={t('studio.policy')} title={PRESET_NAMES[preset]}>
            <div className="stack">
              <Field label={t('c.preset')}>
                <select className="input" value={preset} onChange={(e) => setPreset(e.target.value as ControllerPreset)}>
                  {CONTROLLER_PRESETS.map((p) => (
                    <option key={p} value={p}>
                      #{[4, 5, 6, 7, 8][['balanced', 'fortress', 'gentle', 'steep', 'configurable'].indexOf(p)]} {PRESET_NAMES[p]}
                    </option>
                  ))}
                </select>
              </Field>
              {preset === 'configurable' && (
                <Field label={t('c.curve')} hint="in[3:2] = P[1:0] is supplied by the escrow per inbox">
                  <Segmented value={curve} options={CURVE_PROFILES.map((c) => ({ id: c, label: t(`c.curve.${c}`) }))} onChange={setCurve} />
                </Field>
              )}
              <div className="small">
                <span className="kicker">{t('c.curve')}</span> <span className="mono">{effCurve} = [{SURGE_TABLES[effCurve].join(' ')}]</span>
              </div>
              <Field label={t('studio.partner')} hint={t('studio.partner.hint')}>
                <input className="input mono" placeholder="0x… (any registered TapeOut processor)" value={partner} onChange={(e) => setPartner(e.target.value.trim())} />
              </Field>
              <div className="grid cols-2">
                <Field label={t('c.handle')}>
                  <input className="input" placeholder="yourname" value={handle} onChange={(e) => setHandle(e.target.value)} />
                </Field>
                <Field label={t('studio.name')}>
                  <input className="input" placeholder="Display name" value={name} onChange={(e) => setName(e.target.value)} />
                </Field>
                <Field label={t('c.token')}>
                  <select className="input" value={token} onChange={(e) => setToken(e.target.value as Token)}>
                    {(Object.keys(TOKENS) as Token[]).map((k) => (
                      <option key={k} value={k}>
                        {TOKENS[k].symbol}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t('c.basePrice')}>
                  <input className="input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
                </Field>
                <Field label={`${t('c.sla')} (${t('c.hours')})`}>
                  <input className="input" inputMode="numeric" value={slaHours} onChange={(e) => setSlaHours(e.target.value)} />
                </Field>
                <Field label={t('card.bio')}>
                  <input className="input" value={bio} onChange={(e) => setBio(e.target.value)} />
                </Field>
              </div>
              {LAUNCHED && (
                <div className="stack" style={{ borderTop: '1px solid var(--rule)', paddingTop: 12 }}>
                  <div className="kicker">{t('onboard.title')}</div>
                  <Note>{t('onboard.why')}</Note>
                  <Field label={t('onboard.mailbox')}>
                    <Segmented value={mailboxMode} options={[{ id: 'new', label: t('onboard.mailbox.new') }, { id: 'existing', label: t('onboard.mailbox.existing') }]} onChange={setMailboxMode} />
                  </Field>
                  {mailboxMode === 'existing' && (
                    <div className="grid cols-2">
                      <Field label={t('onboard.mailbox.circuits')}>
                        <input className="input mono" placeholder="0x…" value={mbCircuits} onChange={(e) => setMbCircuits(e.target.value.trim())} />
                      </Field>
                      <Field label={t('onboard.mailbox.tokenId')}>
                        <input className="input mono" inputMode="numeric" value={mbToken} onChange={(e) => setMbToken(e.target.value.trim())} />
                      </Field>
                    </div>
                  )}
                  {steps.length > 0 && (
                    <div className="steps">
                      {STEP_KEYS.map((k) => {
                        const st = steps.find((x) => x.key === k);
                        return (
                          <div key={k}>
                            <span className={st?.status === 'done' ? 'ok' : st?.status === 'error' ? 'bad' : st?.status === 'running' ? 'warn' : 'muted'}>
                              {st?.status === 'running' ? <span className="spin" style={{ marginRight: 6 }} /> : null}
                              {t(`onboard.step.${k}`)}
                              {st?.detail ? ` · ${st.detail}` : ''}
                              {st?.status === 'skipped' ? ' · ✓' : st?.status === 'done' ? ' · ✓' : ''}
                            </span>
                            {st?.hash && (
                              <a className="mono small" href={explorerTx(st.hash)} target="_blank" rel="noreferrer" style={{ marginLeft: 8 }}>
                                tx
                              </a>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              <div className="row">
                <Button variant="signal" onClick={() => void register()} disabled={!handle.trim() || basePrice <= 0n || registering || (LAUNCHED && !w.address)}>
                  {registering ? <span className="spin" /> : null} {LAUNCHED ? t('onboard.go') : t('studio.register')}
                </Button>
                <Button onClick={() => void tapeout()} disabled={!LAUNCHED || !w.address || busy} title={LAUNCHED ? '' : t('studio.tapeout.hint')}>
                  {busy ? <span className="spin" /> : null} {t('studio.tapeout')}
                </Button>
              </div>
              {!LAUNCHED && <div className="small muted">{t('studio.tapeout.hint')}</div>}
              {txs.map((h) => (
                <div key={h} className="mono small">
                  tx <Addr value={h} />
                </div>
              ))}
            </div>
          </Panel>

          <Panel kicker={t('studio.cost')} title={formatOkb(mintCost + tapeoutFee)}>
            <dl className="kv">
              <dt>{t('studio.cost.tapeout')}</dt>
              <dd className="mono">{formatOkb(tapeoutFee)}</dd>
              <dt>{t('studio.cost.mint')}</dt>
              <dd className="mono">
                {formatOkb(BigInt(item.circuit.burn.nand) * mintPrice)} ({item.circuit.burn.nand} × {formatOkb(mintPrice)})
              </dd>
              <dt>{t('studio.cost.protocol')}</dt>
              <dd className="mono">{formatOkb(protocolFee)}</dd>
            </dl>
          </Panel>
        </div>

        <div className="stack">
          <Panel kicker={t('studio.compiled')} title={`#${item.id.toString()} ${item.name}`} right={<Badge tone={proof.ok ? 'ok' : 'bad'}>{proof.ok ? `${proof.total} / ${proof.total} ✓` : t('studio.prover.bad')}</Badge>}>
            <div className="grid cols-4">
              <Stat label={t('studio.pins')} value={`${item.resolved.nIn} / ${item.resolved.nOut} / ${item.resolved.nState}`} sub="nIn / nOut / nState" />
              <Stat label={t('studio.gateCount')} value={item.resolved.gateCount} />
              <Stat label={t('studio.burn')} value={`${item.circuit.burn.nand} NAND`} sub={`${item.circuit.burn.latch} LATCH`} tone="signal" />
              <Stat label={t('studio.bytes')} value={item.circuit.bytes.length} sub={<Addr value={item.circuit.hex} />} />
            </div>
            <div className="small muted mt-s">
              REF → {SIM_CPU === CONFIG.voxrCpu ? 'VOXR' : 'VOXR (placeholder until createCPU)'} #1 SaturatingQueue3 · #2 SurgeCurveDecoder · #3 VipPassGate
            </div>
            <div className="mt-s">
              <div className="kicker">{t('studio.prover')}</div>
              <div className={proof.ok ? 'ok' : 'bad'}>
                {proof.ok ? t('studio.prover.ok') : t('studio.prover.bad')} · {proof.total} transitions · {proof.elapsedMs.toFixed(1)} ms
              </div>
            </div>
          </Panel>

          <Panel kicker={t('dir.ladder')} title={`${fmtAmount(token, basePrice)} ${TOKENS[token].symbol} base`}>
            <div className="kicker">cold sender</div>
            <Ladder rungs={cold} current={-1} symbol={TOKENS[token].symbol} fmt={(v) => fmtAmount(token, v)} />
            <div className="kicker mt-s">partner-circuit holder (−1 tier, 50% off)</div>
            <Ladder rungs={holder} current={-1} symbol={TOKENS[token].symbol} fmt={(v) => fmtAmount(token, v)} />
          </Panel>

          <Panel kicker={t('studio.waveform')} title={t('studio.waveform.sub')}>
            <Waveform points={traffic} />
            <div className="small muted">S = cold send · S* = partner holder · R = reply (claim) · X = refund · ✕ = blocked by pause</div>
          </Panel>

          <Panel kicker={t('studio.table')} title={t('studio.table.sub')} right={<Segmented value={showAll ? 'all' : 'enq'} options={[{ id: 'enq', label: t('studio.showEnq') }, { id: 'all', label: t('studio.showAll') }]} onChange={(v) => setShowAll(v === 'all')} />}>
            <TruthTable rows={shown} />
            <div className="small muted mt-s">
              {shown.length} / {rows.length} rows · {lang === 'zh' ? '位序 LSB 在前' : 'bits LSB-first'}: in = [active, dir, p0, p1, allow, partner]
            </div>
          </Panel>
        </div>
      </div>
      {!LAUNCHED && <Note tone="warn">{t('c.simNote')}</Note>}
      <Toast msg={toast} />
    </>
  );
}
