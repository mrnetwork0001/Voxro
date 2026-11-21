/**
 * "Create my inbox" wizard: name → price → extras → review (plain-language one-time cost + wallet
 * balance check) → live progress → done (shareable profile link). Uses the same chain calls as
 * Studio's registration; Studio stays available as the advanced editor.
 */
import { PRESET_NAMES, SURGE_TABLES, XLAYER_FEES, circuitsAbi, formatOkb, mintValue, transistorsAbi, type Address, type CurveProfile } from '@voxro/sdk';
import { useEffect, useMemo, useState } from 'react';
import { backend, findInbox, useInboxState, type OnboardStep } from '../backend.ts';
import { publicClient, explorerTx } from '../chain/client.ts';
import { useAsync } from '../chain/hooks.ts';
import { mailboxNetlist } from '../chain/escrow.ts';
import { enableNotifications } from '../chain/relay.ts';
import { useTelemetry } from '../chain/telemetry.ts';
import { Badge, Button, Note, Panel } from '../components/ui.tsx';
import { CONFIG, DEPLOYED } from '../config.ts';
import { parseAmount } from '../format.ts';
import { Intro } from '../help.tsx';
import { useI18n } from '../i18n.tsx';
import { TOKENS, type Token } from '../model.ts';
import { href, profileLink } from '../router.ts';
import { useWallet } from '../wallet/wallet.tsx';
import { TIER_MULT } from '../circuits/catalog.ts';
import { DeploymentNote } from './DeploymentNote.tsx';

type Step = 'name' | 'price' | 'extras' | 'review' | 'run' | 'done';
const ORDER: Step[] = ['name', 'price', 'extras', 'review', 'run', 'done'];
const HANDLE_RE = /^[a-z0-9_]{3,24}$/;
const STYLES: CurveProfile[] = ['balanced', 'gentle', 'steep', 'fortress'];
const PRICE_CHIPS: Record<Token, string[]> = { USDT0: ['5', '10', '25', '50'], USDT: ['5', '10', '25', '50'], OKB: ['0.01', '0.05', '0.1', '0.5'], FAB: ['5', '20', '50', '100'] };
const HOURS = [24, 48, 72, 168];

async function readSetupCost() {
  const transistors = (await publicClient.readContract({ address: CONFIG.mailboxCpu, abi: circuitsAbi, functionName: 'transistors' })) as Address;
  const [mintPrice, protocolFee, tapeoutFee] = await Promise.all([
    publicClient.readContract({ address: transistors, abi: transistorsAbi, functionName: 'mintPrice' }),
    publicClient.readContract({ address: transistors, abi: transistorsAbi, functionName: 'protocolFee' }),
    publicClient.readContract({ address: CONFIG.mailboxCpu, abi: circuitsAbi, functionName: 'TAPEOUT_FEE' }),
  ]);
  return { mint: mintValue(BigInt(mailboxNetlist().nand), mintPrice, protocolFee), tapeout: tapeoutFee };
}

export function Start(_: { arg: string }) {
  const { t, lang } = useI18n();
  const zh = lang === 'zh';
  const w = useWallet();
  const state = useInboxState();
  const tele = useTelemetry();
  const [step, setStep] = useState<Step>('name');
  const [handle, setHandle] = useState('');
  const [token, setToken] = useState<Token>('USDT0');
  const [price, setPrice] = useState('10');
  const [hours, setHours] = useState(48);
  const [style, setStyle] = useState<CurveProfile>('balanced');
  const [vip, setVip] = useState(Boolean(CONFIG.communityVip));
  const [notify, setNotify] = useState(true);
  const [steps, setSteps] = useState<OnboardStep[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const cost = useAsync(readSetupCost, []);
  const balance = useAsync(() => (w.address ? publicClient.getBalance({ address: w.address }) : Promise.resolve(null)), [w.address, step]);
  const openFee = tele.data?.openerFee ?? null;
  const setupTotal = cost.data && openFee !== null ? cost.data.mint + cost.data.tapeout + openFee : null;
  const gasBuffer = 2_000_000_000_000_000n / 1000n; // ≈ 0.002 OKB is plenty at X Layer gas prices
  const enough = balance.data != null && setupTotal !== null ? balance.data >= setupTotal + gasBuffer : null;

  const name = handle.trim().replace(/^@/, '').toLowerCase();
  const nameValid = HANDLE_RE.test(name);
  const taken = nameValid && state.loaded ? Boolean(findInbox(state, name)) : false;
  const owned = w.address ? state.inboxes.filter((i) => i.owner.toLowerCase() === w.address!.toLowerCase()) : [];
  let basePrice = 0n;
  try {
    basePrice = parseAmount(token, price);
  } catch {
    basePrice = 0n;
  }
  const ladder = useMemo(() => SURGE_TABLES[style].map((tier) => TIER_MULT[tier as 0 | 1 | 2 | 3]), [style]);
  const idx = ORDER.indexOf(step);
  const go = (s: Step) => {
    setError(null);
    setStep(s);
  };
  useEffect(() => setCopied(false), [created]);

  const STYLE_TEXT: Record<CurveProfile, [string, string]> = {
    balanced: ['Recommended. Price rises gently as messages pile up, then steeply when you are swamped.', '推荐。消息堆积时价格温和上涨，忙不过来时陡增。'],
    gentle: ['Stays cheap for longer. Good for open inboxes, support and whitehat disclosures.', '更长时间保持低价。适合开放收件箱、支持与白帽披露。'],
    steep: ['Climbs fast. Good when you want only the most serious messages.', '快速上涨。适合只想收到最认真的消息。'],
    fortress: ['Maximum protection: very steep, and new senders pause when the queue is full.', '最强防护：非常陡峭，队列满时暂停新的发送方。'],
  };

  const create = async () => {
    setStep('run');
    setError(null);
    setSteps([]);
    const put = (st: OnboardStep) => setSteps((prev) => [...prev.filter((x) => x.key !== st.key), st]);
    try {
      const ib = await backend.registerInbox({ handle: name, preset: style, curve: 'balanced', partnerCpu: null, community: vip, token, basePrice, slaSeconds: hours * 3600 }, put);
      if (notify) {
        put({ key: 'notify', status: 'running' });
        try {
          await enableNotifications(ib);
          put({ key: 'notify', status: 'done', detail: 'TapeRelay' });
        } catch (e) {
          put({ key: 'notify', status: 'error', detail: e instanceof Error ? e.message.slice(0, 100) : String(e) });
        }
      }
      setCreated(ib.handle);
      setStep('done');
    } catch (e) {
      setError(e instanceof Error ? e.message.slice(0, 220) : String(e));
    }
  };

  const stepLabels: Array<[Step, string]> = [
    ['name', zh ? '名字' : 'Name'],
    ['price', zh ? '价格' : 'Price'],
    ['extras', zh ? '附加' : 'Extras'],
    ['review', zh ? '确认' : 'Review'],
    ['done', zh ? '完成' : 'Done'],
  ];
  const RUN_KEYS: OnboardStep['key'][] = notify ? ['tapeout', 'open', 'key', 'register', 'notify'] : ['tapeout', 'open', 'key', 'register'];
  const link = created ? profileLink(created) : nameValid ? profileLink(name) : profileLink('yourname');

  return (
    <>
      <div className="mb">
        <div className="kicker">{zh ? '接收' : 'Receive'}</div>
        <h2>{zh ? '创建我的收件箱' : 'Create my inbox'}</h2>
      </div>
      <Intro page="start" />
      <DeploymentNote />

      <ol className="wiz-steps" aria-label="Progress">
        {stepLabels.map(([k, label], i) => {
          const state2 = k === 'done' ? (step === 'done' ? 'on' : '') : ORDER.indexOf(k) < idx || step === 'done' ? 'done' : k === step || (k === 'review' && step === 'run') ? 'on' : '';
          return (
            <li key={k} className={state2}>
              <span>{state2 === 'done' ? '✓' : i + 1}</span>
              {label}
            </li>
          );
        })}
      </ol>

      {DEPLOYED && (
        <div className="wiz">
          {step === 'name' && (
            <Panel kicker={zh ? '第 1 步' : 'Step 1'} title={zh ? '选择你的名字' : 'Pick your name'}>
              <div className="stack">
                {!w.address && (
                  <div className="row">
                    <Button variant="signal" onClick={() => void w.connect()} disabled={w.connecting || !w.hasProvider}>
                      {w.connecting ? t('c.connecting') : t('c.connect')}
                    </Button>
                    <span className="small muted">{zh ? '先连接要接收付款的钱包。' : 'First connect the wallet that will receive payments.'}</span>
                  </div>
                )}
                {owned.length > 0 && (
                  <Note>
                    {zh ? '你已经有收件箱：' : 'You already own '}
                    {owned.map((i) => `@${i.handle}`).join(', ')}.{' '}
                    <a href={href('inbox')}>{zh ? '打开收件箱' : 'Open Inbox'}</a> · {zh ? '也可以再创建一个。' : 'You can still create another one.'}
                  </Note>
                )}
                <label className="wiz-handle">
                  <span>@</span>
                  <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="yourname" maxLength={25} autoFocus aria-label="Handle" />
                </label>
                <div className="small">
                  {!name ? (
                    <span className="muted">{zh ? '3–24 个字符：小写字母、数字或下划线。' : '3–24 characters: lowercase letters, numbers or _.'}</span>
                  ) : !nameValid ? (
                    <span className="bad">{zh ? '只能使用小写字母、数字或下划线（3–24 个字符）。' : 'Use 3–24 lowercase letters, numbers or _.'}</span>
                  ) : taken ? (
                    <span className="bad">@{name} {zh ? '已被占用。' : 'is taken.'}</span>
                  ) : (
                    <span className="ok">✓ @{name} {zh ? '可用' : 'is available'}</span>
                  )}
                </div>
                <div className="wiz-link mono small">{link}</div>
                <div className="row">
                  <Button variant="signal" disabled={!w.address || !nameValid || taken} onClick={() => go('price')}>
                    {zh ? '下一步' : 'Next'}
                  </Button>
                </div>
              </div>
            </Panel>
          )}

          {step === 'price' && (
            <Panel kicker={zh ? '第 2 步' : 'Step 2'} title={zh ? '你的价格' : 'Your price'}>
              <div className="stack">
                <div className="wiz-q">{zh ? '用什么收款？' : 'Get paid in'}</div>
                <div className="wiz-chips">
                  {(Object.keys(TOKENS) as Token[]).map((k) => (
                    <button key={k} type="button" className={`wiz-chip${token === k ? ' on' : ''}`} onClick={() => { setToken(k); setPrice(PRICE_CHIPS[k][1]!); }}>
                      {TOKENS[k].symbol}
                      {k === 'USDT0' && <small>{zh ? '推荐' : 'recommended'}</small>}
                    </button>
                  ))}
                </div>
                <div className="wiz-q">{zh ? '基础价格（队列为空时）' : 'Base price (when your queue is empty)'}</div>
                <div className="wiz-chips">
                  {PRICE_CHIPS[token].map((p) => (
                    <button key={p} type="button" className={`wiz-chip${price === p ? ' on' : ''}`} onClick={() => setPrice(p)}>
                      {p} {TOKENS[token].symbol}
                    </button>
                  ))}
                  <input className="input wiz-custom" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} aria-label="Custom price" />
                </div>
                <div className="wiz-q">{zh ? '你多久之内回复？' : 'You promise to reply within'}</div>
                <div className="wiz-chips">
                  {HOURS.map((h) => (
                    <button key={h} type="button" className={`wiz-chip${hours === h ? ' on' : ''}`} onClick={() => setHours(h)}>
                      {h === 168 ? (zh ? '7 天' : '7 days') : `${h} h`}
                    </button>
                  ))}
                </div>
                <div className="small muted">{zh ? '超时未回复，发送方会拿回 100%。' : 'If you miss it, the sender gets 100% back automatically.'}</div>
                <div className="wiz-q">{zh ? '定价风格' : 'Pricing style'}</div>
                <div className="wiz-styles">
                  {STYLES.map((s) => (
                    <button key={s} type="button" className={`wiz-style${style === s ? ' on' : ''}`} onClick={() => setStyle(s)}>
                      <b>{PRESET_NAMES[s].replace(/Inbox$/, '')}</b>
                      <span>{STYLE_TEXT[s][zh ? 1 : 0]}</span>
                    </button>
                  ))}
                </div>
                <div className="small">
                  {zh ? '随着消息堆积，价格倍数：' : 'As messages pile up, your price goes'} <span className="mono signal-text">{[...new Set(ladder)].join(' → ')}</span>
                </div>
                <div className="row">
                  <Button onClick={() => go('name')}>{zh ? '返回' : 'Back'}</Button>
                  <Button variant="signal" disabled={basePrice <= 0n} onClick={() => go('extras')}>
                    {zh ? '下一步' : 'Next'}
                  </Button>
                </div>
              </div>
            </Panel>
          )}

          {step === 'extras' && (
            <Panel kicker={zh ? '第 3 步' : 'Step 3'} title={zh ? '附加功能' : 'Extras'}>
              <div className="stack">
                {CONFIG.communityVip && (
                  <label className="wiz-toggle">
                    <input type="checkbox" checked={vip} onChange={(e) => setVip(e.target.checked)} />
                    <span>
                      <b>{t('vip.badge')}</b>
                      <small>{t('vip.community.hint')}</small>
                    </span>
                  </label>
                )}
                <label className="wiz-toggle">
                  <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
                  <span>
                    <b>{zh ? '即时通知（TapeRelay）' : 'Instant notifications (TapeRelay)'}</b>
                    <small>{zh ? '有人付费给你发消息时立即提醒你。多 2 次签名和 1 笔仅付 gas 的交易。' : 'Get alerted the moment someone pays to message you. Adds 2 signatures and 1 gas-only transaction.'}</small>
                  </span>
                </label>
                <div className="row">
                  <Button onClick={() => go('price')}>{zh ? '返回' : 'Back'}</Button>
                  <Button variant="signal" onClick={() => go('review')}>
                    {zh ? '下一步' : 'Next'}
                  </Button>
                </div>
              </div>
            </Panel>
          )}

          {(step === 'review' || step === 'run') && (
            <Panel kicker={zh ? '第 4 步' : 'Step 4'} title={zh ? '确认并创建' : 'Review and create'}>
              <div className="stack">
                <dl className="kv">
                  <dt>{zh ? '名字' : 'Name'}</dt>
                  <dd className="mono">@{name}</dd>
                  <dt>{zh ? '价格' : 'Price'}</dt>
                  <dd>
                    {price} {TOKENS[token].symbol} · {PRESET_NAMES[style]}
                  </dd>
                  <dt>{zh ? '回复期限' : 'Reply window'}</dt>
                  <dd>{hours === 168 ? (zh ? '7 天' : '7 days') : `${hours} h`}</dd>
                  <dt>{zh ? '附加' : 'Extras'}</dt>
                  <dd>{[vip && t('vip.badge'), notify && 'TapeRelay'].filter(Boolean).join(' · ') || '—'}</dd>
                </dl>
                <div className="wiz-cost">
                  <div className="wiz-q">{zh ? '一次性设置成本' : 'One-time setup cost'}</div>
                  <div className="wiz-total">{setupTotal !== null ? `≈ ${formatOkb(setupTotal + gasBuffer)}` : '…'}</div>
                  <ul className="small">
                    <li>{zh ? '开通你的私人加密邮箱（TapeOut 开通费）' : 'Open your private, encrypted mailbox (TapeOut opening fee)'}: {openFee !== null ? formatOkb(openFee) : '…'}</li>
                    <li>{zh ? '在链上创建邮箱电路' : 'Create your mailbox circuit onchain'}: {cost.data ? formatOkb(cost.data.mint + cost.data.tapeout) : formatOkb(XLAYER_FEES.tapeoutFee)}</li>
                    <li>{zh ? '网络 gas（很少）' : 'Network gas (tiny)'}: ≈ {formatOkb(gasBuffer)}</li>
                  </ul>
                  <div className="small muted">{zh ? '之后接收消息不再收费。Voxro 只从你已回复的消息中收取 5%。' : 'After this, receiving messages is free. Voxro only takes 5% of messages you actually answer.'}</div>
                  <div className="small">
                    {balance.data == null ? '…' : enough ? <span className="ok">✓ {zh ? '钱包余额足够' : 'Your wallet has enough'} ({formatOkb(balance.data)})</span> : <span className="bad">{zh ? '余额不足：' : 'Not enough OKB: '}{formatOkb(balance.data)}</span>}
                  </div>
                  <div className="small muted">{zh ? `你的钱包会请你确认约 ${notify ? 6 : 4} 笔交易并签名 ${notify ? 3 : 1} 次。` : `Your wallet will ask you to confirm about ${notify ? 6 : 4} transactions and ${notify ? 3 : 1} signature${notify ? 's' : ''}.`}</div>
                </div>
                {step === 'run' && (
                  <div className="steps">
                    {RUN_KEYS.map((k) => {
                      const st = steps.find((x) => x.key === k);
                      return (
                        <div key={k}>
                          <span className={st?.status === 'done' || st?.status === 'skipped' ? 'ok' : st?.status === 'error' ? 'bad' : st?.status === 'running' ? 'warn' : 'muted'}>
                            {st?.status === 'running' ? <span className="spin" style={{ marginRight: 6 }} /> : null}
                            {t(`onboard.step.${k}`)}
                            {st?.detail ? ` · ${st.detail}` : ''}
                            {st?.status === 'done' || st?.status === 'skipped' ? ' · ✓' : ''}
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
                {error && <Note tone="warn">{error}</Note>}
                <div className="row">
                  <Button onClick={() => go('extras')} disabled={step === 'run' && !error}>
                    {zh ? '返回' : 'Back'}
                  </Button>
                  <Button variant="signal" disabled={(step === 'run' && !error) || enough === false || !w.address} onClick={() => void create()}>
                    {step === 'run' && !error ? <span className="spin" /> : null} {error ? (zh ? '重试' : 'Try again') : zh ? `创建 @${name}` : `Create @${name}`}
                  </Button>
                </div>
              </div>
            </Panel>
          )}

          {step === 'done' && created && (
            <Panel signal kicker={zh ? '完成' : 'Done'} title={zh ? `@${created} 已上线` : `@${created} is live`}>
              <div className="stack">
                <div className="wiz-q">{zh ? '你的公开链接，放到 X、Telegram 或 GitHub 简介中：' : 'Your public link. Put it in your X, Telegram or GitHub bio:'}</div>
                <div className="wiz-share">
                  <span className="mono">{profileLink(created)}</span>
                  <Button size="sm" variant="signal" onClick={() => void navigator.clipboard?.writeText(profileLink(created)).then(() => setCopied(true))}>
                    {copied ? (zh ? '已复制' : 'Copied') : zh ? '复制' : 'Copy'}
                  </Button>
                </div>
                {steps.find((x) => x.key === 'notify' && x.status === 'error') && <Note tone="warn">{t('onboard.notifyFailed')}</Note>}
                <div className="row">
                  <a className="btn signal" href={href('inbox')}>
                    {zh ? '打开我的收件箱' : 'Open my inbox'}
                  </a>
                  <a className="btn" href={`#/@${created}`}>
                    {zh ? '查看我的主页' : 'View my profile'}
                  </a>
                  <a className="btn" href={href('card')}>
                    {zh ? '制作联系名片' : 'Make a contact card'}
                  </a>
                </div>
                <Badge tone="ok">{zh ? '有人付费联系你时，记得在回复期限内回复。' : 'When someone pays to reach you, reply within your window to earn it.'}</Badge>
              </div>
            </Panel>
          )}
        </div>
      )}
    </>
  );
}
