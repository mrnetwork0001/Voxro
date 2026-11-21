import { PRESET_NAMES, XLAYER, chunkFile, deWebName, planPublish, type Address } from '@voxro/sdk';
import { useMemo, useState } from 'react';
import { explorerAddress } from '../chain/client.ts';
import { Addr, Button, Field, Note, Panel, Segmented, Stat } from '../components/ui.tsx';
import { LAUNCHED, VOXR_CPU_INDEX } from '../config.ts';
import { renderContactCard } from '../card/template.ts';
import { fmtAmount, fmtDuration } from '../format.ts';
import { useI18n, type Lang } from '../i18n.tsx';
import { priceLadder } from '../sim/catalog.ts';
import { backend, useInboxState } from '../backend.ts';
import { TOKENS } from '../sim/escrow.ts';
import { useWallet } from '../wallet/wallet.tsx';

export function Card(_: { arg: string }) {
  const { t, lang } = useI18n();
  const sim = useInboxState();
  const w = useWallet();
  const [inboxId, setInboxId] = useState(sim.inboxes[0]?.id ?? 1);
  const inbox = sim.inboxes.find((i) => i.id === inboxId) ?? sim.inboxes[0];
  if (!inbox) return <Note tone="warn">{t('chain.noInboxes')}</Note>;
  const [name, setName] = useState(inbox.name);
  const [bio, setBio] = useState(inbox.bio);
  const [x, setX] = useState('');
  const [tg, setTg] = useState('');
  const [gh, setGh] = useState('');
  const [cardLang, setCardLang] = useState<Lang>(lang);
  const [cardTheme, setCardTheme] = useState<'dark' | 'light'>('dark');

  const tapeName = deWebName(inbox.containerTokenId, VOXR_CPU_INDEX);
  const html = useMemo(() => {
    const ladder = priceLadder(inbox.preset, inbox.basePrice, { allowlisted: false, holdsPartner: false }, inbox.curve).map((r) => ({ q: r.q, price: `${fmtAmount(inbox.token, r.price)} ${TOKENS[inbox.token].symbol}` }));
    const links = [x && { label: 'X', href: `https://x.com/${x.replace(/^@/, '')}` }, tg && { label: 'Telegram', href: `https://t.me/${tg.replace(/^@/, '')}` }, gh && { label: 'GitHub', href: `https://github.com/${gh.replace(/^@/, '')}` }].filter(Boolean) as Array<{ label: string; href: string }>;
    return renderContactCard({
      handle: inbox.handle,
      name,
      bio,
      presetLabel: PRESET_NAMES[inbox.preset],
      priceLabel: `${fmtAmount(inbox.token, inbox.basePrice)} ${TOKENS[inbox.token].symbol}`,
      slaLabel: fmtDuration(inbox.slaSeconds, cardLang),
      tapeName,
      circuitLabel: `VOXR #${inbox.circuitId} · ${PRESET_NAMES[inbox.preset]} · container ${backend.containerOf(inbox).slice(0, 10)}…`,
      ladder,
      links,
      lang: cardLang,
      theme: cardTheme,
      sendHref: `https://voxro.shieldsuite.xyz/#/directory/${inbox.handle}`,
    });
  }, [inbox, name, bio, x, tg, gh, cardLang, cardTheme, tapeName]);

  const bundle = useMemo(() => {
    const file = chunkFile({ path: '/index.html', data: new TextEncoder().encode(html) });
    const plan = planPublish(backend.containerOf(inbox), [file], { fallback: '/index.html' });
    return { file, plan };
  }, [html, inbox]);

  const download = () => {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'index.html';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <>
      <div className="mb">
        <div className="kicker">{t('nav.card')}</div>
        <h2>{t('card.title')}</h2>
        <p className="lede small mt-s">{t('card.lede')}</p>
      </div>
      <div className="grid side">
        <div className="stack">
          <Panel kicker={t('c.handle')} title={`@${inbox.handle}`}>
            <div className="stack">
              <select
                className="input"
                value={inbox.id}
                onChange={(e) => {
                  const next = sim.inboxes.find((i) => i.id === Number(e.target.value));
                  if (next) {
                    setInboxId(next.id);
                    setName(next.name);
                    setBio(next.bio);
                  }
                }}
              >
                {sim.inboxes.map((i) => (
                  <option key={i.id} value={i.id}>
                    @{i.handle}
                  </option>
                ))}
              </select>
              <Field label={t('studio.name')}>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label={t('card.bio')}>
                <textarea className="input" value={bio} onChange={(e) => setBio(e.target.value)} />
              </Field>
              <div className="grid cols-3">
                <Field label="X">
                  <input className="input" placeholder="@handle" value={x} onChange={(e) => setX(e.target.value)} />
                </Field>
                <Field label="Telegram">
                  <input className="input" placeholder="@handle" value={tg} onChange={(e) => setTg(e.target.value)} />
                </Field>
                <Field label="GitHub">
                  <input className="input" placeholder="user" value={gh} onChange={(e) => setGh(e.target.value)} />
                </Field>
              </div>
              <div className="row">
                <Segmented value={cardLang} options={[{ id: 'en', label: 'EN' }, { id: 'zh', label: '中文' }]} onChange={setCardLang} />
                <Segmented value={cardTheme} options={[{ id: 'dark', label: 'Obsidian' }, { id: 'light', label: 'Paper' }]} onChange={setCardTheme} />
              </div>
            </div>
          </Panel>

          <Panel kicker={t('card.bundle')} title={tapeName}>
            <div className="grid cols-3">
              <Stat label={t('card.size')} value={`${bundle.file.size.toLocaleString()} B`} />
              <Stat label={t('card.chunks')} value={bundle.file.chunks.length} sub={`CHUNK_MAX 24,000`} />
              <Stat label={t('card.sha')} value={<Addr value={bundle.file.sha256} />} mono />
            </div>
            <div className="kicker mt-s">{t('card.calls')}</div>
            <ol className="small" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {bundle.plan.calls.map((c, i) => (
                <li key={i} className="mono">
                  SiteRegistry.{c.functionName}({c.functionName === 'putFile' ? `container, "${c.args[1]}", "${c.args[2]}", sha256, ${(c.args[4].length - 2) / 2} B` : c.functionName === 'appendChunk' ? `container, "${c.args[1]}", ${c.args[2].toString()}, ${(c.args[3].length - 2) / 2} B` : `container, "${c.args[1]}"`})
                </li>
              ))}
              <li className="mono">
                DomainBinding.bind("{tapeName}", container, 120) · monthlyFee 0
              </li>
            </ol>
            <dl className="kv mt-s">
              <dt>SiteRegistry</dt>
              <dd>
                <Addr value={XLAYER.siteRegistry} link={explorerAddress(XLAYER.siteRegistry)} />
              </dd>
              <dt>DomainBinding</dt>
              <dd>
                <Addr value={XLAYER.domainBinding} link={explorerAddress(XLAYER.domainBinding)} />
              </dd>
              <dt>manifest root</dt>
              <dd>
                <Addr value={bundle.plan.manifest.root} />
              </dd>
            </dl>
            <div className="row mt-s">
              <Button onClick={download}>{t('card.download')}</Button>
              <Button variant="signal" disabled={!LAUNCHED || !w.address} title={LAUNCHED ? '' : t('card.publish.hint')}>
                {t('card.publish')}
              </Button>
            </div>
            {!LAUNCHED && <div className="small muted mt-s">{t('card.publish.hint')}</div>}
          </Panel>
        </div>
        <Panel kicker={t('card.preview')} title={`tape://${tapeName}`} className="flush">
          <iframe className="frame" title="Contact card preview" sandbox="" srcDoc={html} />
        </Panel>
      </div>
      {!LAUNCHED && <Note tone="warn">{t('c.simNote')}</Note>}
      <span hidden>{(w.address ?? '') as Address}</span>
    </>
  );
}
