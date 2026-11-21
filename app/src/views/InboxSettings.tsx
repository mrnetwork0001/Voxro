import { CURVE_PROFILES, type Address, type CurveProfile } from '@voxro/sdk';
import { useState } from 'react';
import { backend } from '../backend.ts';
import { Addr, Badge, Button, Field, Note, Panel, Segmented } from '../components/ui.tsx';
import { fmtAmount, parseAmount } from '../format.ts';
import { useI18n } from '../i18n.tsx';
import { TOKENS, type InboxView, type Token } from '../model.ts';

const isAddr = (s: string) => /^0x[0-9a-fA-F]{40}$/.test(s);

/** Recipient-only controls backed by VoxroEscrow's onlyRecipient setters. */
export function InboxSettings({ inbox }: { inbox: InboxView }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
  const [token, setToken] = useState<Token>(inbox.token);
  const [price, setPrice] = useState(fmtAmount(inbox.token, inbox.basePrice).replace(/,/g, ''));
  const [slaHours, setSlaHours] = useState(String(Math.round(inbox.slaSeconds / 3600)));
  const [curve, setCurve] = useState<CurveProfile>(inbox.curve);
  const [allow, setAllow] = useState('');
  const [members, setMembers] = useState(inbox.memberIds.map((m) => ({ circuits: m.circuits, tokenId: m.tokenId })));
  const [newCircuits, setNewCircuits] = useState('');
  const [newToken, setNewToken] = useState('');

  const run = async (key: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
      setMsg({ tone: 'ok', text: done });
    } catch (e) {
      setMsg({ tone: 'warn', text: e instanceof Error ? e.message.slice(0, 220) : String(e) });
    } finally {
      setBusy(null);
    }
  };

  let basePrice = 0n;
  try {
    basePrice = parseAmount(token, price);
  } catch {
    basePrice = 0n;
  }
  const allowList = allow
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const allowValid = allowList.length > 0 && allowList.every(isAddr);

  return (
    <Panel kicker={t('set.kicker')} title={t('set.title')} right={<Badge tone={inbox.active ? 'ok' : 'warn'}>{inbox.active ? t('set.active') : t('set.paused')}</Badge>}>
      <div className="stack">
        {/* status */}
        <div className="row between">
          <span className="small muted">{inbox.active ? t('set.pauseHint') : t('set.resumeHint')}</span>
          <Button size="sm" variant={inbox.active ? undefined : 'signal'} disabled={busy !== null} onClick={() => void run('active', () => backend.setActive(inbox.id, !inbox.active), inbox.active ? t('set.pausedDone') : t('set.resumedDone'))}>
            {busy === 'active' ? <span className="spin" /> : null} {inbox.active ? t('set.pause') : t('set.resume')}
          </Button>
        </div>

        {/* pricing */}
        <div className="kicker mt-s">{t('set.pricing')}</div>
        <div className="grid cols-2">
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
          {inbox.preset === 'configurable' && (
            <Field label={t('c.curve')}>
              <select className="input" value={curve} onChange={(e) => setCurve(e.target.value as CurveProfile)}>
                {CURVE_PROFILES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
        <div className="row">
          <Button size="sm" variant="signal" disabled={busy !== null || basePrice <= 0n || !(Number(slaHours) >= 1)} onClick={() => void run('pricing', () => backend.setPricing(inbox.id, { token, basePrice, slaSeconds: Math.round(Number(slaHours) * 3600), curve }), t('set.saved'))}>
            {busy === 'pricing' ? <span className="spin" /> : null} {t('set.savePricing')}
          </Button>
          <span className="small muted">{t('set.pricingHint')}</span>
        </div>

        {/* allowlist */}
        <div className="kicker mt-s">{t('set.allowlist')}</div>
        <Field label={t('set.allowAddrs')} hint={t('set.allowHint')}>
          <textarea className="input mono" style={{ minHeight: 70 }} placeholder="0x…, 0x…" value={allow} onChange={(e) => setAllow(e.target.value)} />
        </Field>
        <div className="row">
          <Button size="sm" disabled={busy !== null || !allowValid} onClick={() => void run('allow', () => backend.setAllowlist(inbox.id, allowList as Address[], true), t('set.allowDone'))}>
            {busy === 'allow' ? <span className="spin" /> : null} {t('set.allowAdd')}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy !== null || !allowValid} onClick={() => void run('disallow', () => backend.setAllowlist(inbox.id, allowList as Address[], false), t('set.disallowDone'))}>
            {busy === 'disallow' ? <span className="spin" /> : null} {t('set.allowRemove')}
          </Button>
        </div>

        {/* team */}
        <div className="kicker mt-s">{t('set.team')}</div>
        <div className="small muted">{t('set.teamHint')}</div>
        <div className="stack" style={{ gap: 6 }}>
          {members.map((m, i) => (
            <div key={`${m.circuits}-${m.tokenId}`} className="row between">
              <span className="mono small">
                <Addr value={m.circuits} /> #{m.tokenId.toString()}
              </span>
              <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => setMembers(members.filter((_, k) => k !== i))}>
                {t('set.remove')}
              </Button>
            </div>
          ))}
        </div>
        <div className="grid cols-2">
          <Field label={t('onboard.mailbox.circuits')}>
            <input className="input mono" placeholder="0x…" value={newCircuits} onChange={(e) => setNewCircuits(e.target.value.trim())} />
          </Field>
          <Field label={t('onboard.mailbox.tokenId')}>
            <input className="input mono" inputMode="numeric" value={newToken} onChange={(e) => setNewToken(e.target.value.trim())} />
          </Field>
        </div>
        <div className="row">
          <Button
            size="sm"
            disabled={busy !== null || !isAddr(newCircuits) || !/^\d+$/.test(newToken) || members.length >= 16}
            onClick={() => {
              setMembers([...members, { circuits: newCircuits as Address, tokenId: BigInt(newToken) }]);
              setNewCircuits('');
              setNewToken('');
            }}
          >
            {t('set.addMember')}
          </Button>
          <Button size="sm" variant="signal" disabled={busy !== null} onClick={() => void run('members', () => backend.setMembers(inbox.id, members), t('set.saved'))}>
            {busy === 'members' ? <span className="spin" /> : null} {t('set.saveTeam')}
          </Button>
          <Segmented value="n" options={[{ id: 'n', label: `${members.length} / 16` }]} onChange={() => {}} />
        </div>

        {msg && <Note tone={msg.tone}>{msg.text}</Note>}
      </div>
    </Panel>
  );
}
