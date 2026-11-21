import { CONTROLLER_PRESETS, CURVE_PROFILES, PRESET_NAMES, SURGE_TABLES, XLAYER_FEES, circuitsAbi, formatOkb, mintValue, transistorsAbi, type Address, type ControllerPreset, type CurveProfile } from '@voxro/sdk';
import { useMemo, useState } from 'react';
import { publicClient } from '../chain/client.ts';
import { useAsync } from '../chain/hooks.ts';
import { useTelemetry } from '../chain/telemetry.ts';
import { Addr, Badge, Button, Field, Ladder, Note, Panel, Segmented, Stat, Toast, TruthTable, Waveform, useToast } from '../components/ui.tsx';
import { CONFIG, DEPLOYED } from '../config.ts';
import { fmtAmount, parseAmount } from '../format.ts';
import { useI18n } from '../i18n.tsx';
import { navigate } from '../router.ts';
import { DEFAULT_TRAFFIC, controllerTable, getController, priceLadder, proveItem, simulateTraffic } from '../circuits/catalog.ts';
import { backend, type OnboardStep } from '../backend.ts';
import { explorerTx } from '../chain/client.ts';
import { TOKENS, type Token } from '../model.ts';
import { mailboxNetlist } from '../chain/escrow.ts';
import { DeploymentNote } from './DeploymentNote.tsx';
import { enableNotifications } from '../chain/relay.ts';
import { useWallet } from '../wallet/wallet.tsx';

/** Live mint price + per-call protocol fee of the mailbox processor's transistors (for the 2-NAND mailbox circuit). */
async function readMailboxMint(): Promise<{ mintPrice: bigint; protocolFee: bigint; tapeoutFee: bigint }> {
  const transistors = (await publicClient.readContract({ address: CONFIG.mailboxCpu, abi: circuitsAbi, functionName: 'transistors' })) as Address;
  const [mintPrice, protocolFee, tapeoutFee] = await Promise.all([
    publicClient.readContract({ address: transistors, abi: transistorsAbi, functionName: 'mintPrice' }),
    publicClient.readContract({ address: transistors, abi: transistorsAbi, functionName: 'protocolFee' }),
    publicClient.readContract({ address: CONFIG.mailboxCpu, abi: circuitsAbi, functionName: 'TAPEOUT_FEE' }),
  ]);
  return { mintPrice, protocolFee, tapeoutFee };
}

export function Studio(_: { arg: string }) {
  const { t, lang } = useI18n();
  const w = useWallet();
  const tele = useTelemetry();
  const [preset, setPreset] = useState<ControllerPreset>('balanced');
  const [curve, setCurve] = useState<CurveProfile>('balanced');
  const [partner, setPartner] = useState('');
  const [vipRule, setVipRule] = useState<'community' | 'partner' | 'none'>(CONFIG.communityVip ? 'community' : 'none');
  const [handle, setHandle] = useState('');
  const [token, setToken] = useState<Token>('USDT0');
  const [price, setPrice] = useState('10');
  const [slaHours, setSlaHours] = useState('48');
  const [showAll, setShowAll] = useState(false);
  const [toast, setToast] = useToast();
  const [mailboxMode, setMailboxMode] = useState<'new' | 'existing'>('new');
  const [mbCircuits, setMbCircuits] = useState('');
  const [mbToken, setMbToken] = useState('');
  const [steps, setSteps] = useState<OnboardStep[]>([]);
  const [registering, setRegistering] = useState(false);
  const [withNotify, setWithNotify] = useState(true);

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
  const mailboxMint = useAsync(readMailboxMint, []);
  const mailboxNand = BigInt(mailboxNetlist().nand);
  const mbMintCost = mailboxMint.data ? mintValue(mailboxNand, mailboxMint.data.mintPrice, mailboxMint.data.protocolFee) : null;
  const mbTapeoutFee = mailboxMint.data?.tapeoutFee ?? XLAYER_FEES.tapeoutFee;
  const openerFee = tele.data?.openerFee ?? null;
  const newMailboxCost = mbMintCost !== null && openerFee !== null ? mbMintCost + mbTapeoutFee + openerFee : null;
  const partnerAddr = vipRule === 'partner' && /^0x[0-9a-fA-F]{40}$/.test(partner) ? (partner as Address) : null;

  const register = async () => {
    if (!w.address) return setToast(t('onboard.connect'));
    setRegistering(true);
    setSteps([]);
    try {
      const mailbox = mailboxMode === 'existing' && /^0x[0-9a-fA-F]{40}$/.test(mbCircuits) && /^\d+$/.test(mbToken) ? { circuits: mbCircuits as Address, tokenId: BigInt(mbToken) } : undefined;
      if (mailboxMode === 'existing' && !mailbox) throw new Error(t('onboard.mailbox.invalid'));
      const ib = await backend.registerInbox(
        { handle: handle.trim().replace(/^@/, ''), preset, curve, partnerCpu: partnerAddr, community: vipRule === 'community', token, basePrice, slaSeconds: Math.max(1, Number(slaHours)) * 3600, ...(mailbox ? { mailbox } : {}) },
        (st) => setSteps((prev) => [...prev.filter((x) => x.key !== st.key), st]),
      );
      if (!withNotify) {
        setToast(`${t('studio.registered')} · @${ib.handle}`);
        navigate('directory', ib.handle);
        return;
      }
      // optional 5th step: TapeRelay channel key record (the inbox is already registered either way)
      const note = (status: OnboardStep['status'], detail?: string) => setSteps((prev) => [...prev.filter((x) => x.key !== 'notify'), { key: 'notify', status, ...(detail ? { detail } : {}) }]);
      note('running');
      try {
        await enableNotifications(ib);
        note('done', 'TapeRelay · TAP-14');
        setToast(`${t('studio.registered')} · @${ib.handle} · ${t('onboard.notifyOn')}`);
        navigate('directory', ib.handle);
      } catch (e) {
        note('error', e instanceof Error ? e.message.slice(0, 120) : String(e));
        setToast(`${t('studio.registered')} · @${ib.handle} · ${t('onboard.notifyFailed')}`);
      }
    } catch (e) {
      setToast(e instanceof Error ? e.message.slice(0, 200) : String(e));
    } finally {
      setRegistering(false);
    }
  };
  const STEP_KEYS: OnboardStep['key'][] = withNotify ? ['tapeout', 'open', 'key', 'register', 'notify'] : ['tapeout', 'open', 'key', 'register'];

  return (
    <>
      <div className="mb">
        <div className="kicker">{t('nav.studio')}</div>
        <h2>{t('studio.title')}</h2>
        <p className="lede small mt-s">{t('studio.lede')}</p>
      </div>
      <DeploymentNote />
      <div className="grid side mt">
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
              <Field label={t('vip.rule')} hint={vipRule === 'community' ? t('vip.community.hint') : vipRule === 'partner' ? t('studio.partner.hint') : t('vip.none.hint')}>
                <Segmented
                  value={vipRule}
                  options={[
                    ...(CONFIG.communityVip ? [{ id: 'community' as const, label: t('vip.community') }] : []),
                    { id: 'partner' as const, label: t('vip.partner') },
                    { id: 'none' as const, label: t('vip.none') },
                  ]}
                  onChange={setVipRule}
                />
              </Field>
              {vipRule === 'partner' && (
                <input className="input mono" placeholder="0x… (any registered TapeOut processor)" value={partner} onChange={(e) => setPartner(e.target.value.trim())} />
              )}
              <div className="grid cols-2">
                <Field label={t('c.handle')}>
                  <input className="input" placeholder="yourname" value={handle} onChange={(e) => setHandle(e.target.value)} />
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
              </div>
              {DEPLOYED && (
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
              {DEPLOYED && (
                <label className="check" title={t('onboard.notifyHint')}>
                  <input type="checkbox" checked={withNotify} onChange={(e) => setWithNotify(e.target.checked)} disabled={registering} />
                  <span>
                    {t('onboard.notify')} <span className="small muted">· {t('onboard.notifyHint')}</span>
                  </span>
                </label>
              )}
              <div className="row">
                <Button variant="signal" onClick={() => void register()} disabled={!DEPLOYED || !w.address || !handle.trim() || basePrice <= 0n || registering}>
                  {registering ? <span className="spin" /> : null} {!DEPLOYED ? t('c.notDeployed.short') : w.address ? t('onboard.go') : t('onboard.connect')}
                </Button>
              </div>
            </div>
          </Panel>

          <Panel kicker={t('studio.cost')} title={mailboxMode === 'existing' ? t('studio.cost.existing') : newMailboxCost !== null ? `${formatOkb(newMailboxCost)} + gas` : '…'}>
            <dl className="kv">
              <dt>{t('studio.cost.mint')}</dt>
              <dd className="mono">{mbMintCost !== null ? `${formatOkb(mbMintCost)} (${mailboxNand.toString()} NAND)` : '…'}</dd>
              <dt>{t('studio.cost.tapeout')}</dt>
              <dd className="mono">{formatOkb(mbTapeoutFee)}</dd>
              <dt>{t('studio.cost.open')}</dt>
              <dd className="mono">{openerFee !== null ? formatOkb(openerFee) : '…'}</dd>
              <dt>{t('studio.cost.register')}</dt>
              <dd className="mono">gas only</dd>
              {withNotify && (
                <>
                  <dt>{t('onboard.step.notify')}</dt>
                  <dd className="mono">gas only</dd>
                </>
              )}
            </dl>
            <div className="small muted mt-s">{t('studio.cost.note')}</div>
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
              REF → VOXR #1 SaturatingQueue3 · #2 SurgeCurveDecoder · #3 VipPassGate
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
      <Toast msg={toast} />
    </>
  );
}
