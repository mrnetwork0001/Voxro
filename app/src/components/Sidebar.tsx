/**
 * Desktop sidebar that folds into an icon rail (Desktop/products_building/Sidebar_Collapse.md):
 * grouped workflow sections, live inbox badges, pinned footer (network chip, language, wallet),
 * remembered state, `[` shortcut, forced rail below 1024px; not rendered below 900px (phone drawer).
 */
import { useCallback, useEffect, useState } from 'react';
import { useNow } from '../chain/hooks.ts';
import { useTelemetry } from '../chain/telemetry.ts';
import { DEPLOYED } from '../config.ts';
import { useI18n, type MsgKey } from '../i18n.tsx';
import { useInboxState } from '../backend.ts';
import { href, type AppRouteId } from '../router.ts';
import { useWallet } from '../wallet/wallet.tsx';
import mark from '../assets/shieldsuite-mark.png';
import { IconCard, IconCircuits, IconDirectory, IconInbox, IconLogout, IconPanelClose, IconPanelOpen, IconProver, IconPulse, IconStart, IconStudio, IconWallet, type Icon } from './icons.tsx';

const ICONS: Record<AppRouteId, Icon> = { start: IconStart, pulse: IconPulse, directory: IconDirectory, inbox: IconInbox, studio: IconStudio, card: IconCard, gallery: IconCircuits, prover: IconProver, receipt: IconProver };
const GROUPS: Array<{ label: MsgKey | ''; ids: AppRouteId[] }> = [
  { label: '', ids: ['pulse'] },
  { label: 'side.send', ids: ['directory'] },
  { label: 'side.receive', ids: ['start', 'inbox', 'card'] },
  { label: 'side.build', ids: ['studio'] },
  { label: 'side.verify', ids: ['gallery', 'prover'] },
];
const KEY = 'voxro.sidebar';
const URGENT_SECONDS = 6 * 3600;

export function useMedia(query: string) {
  const [m, setM] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return m;
}

/** Pending paid messages in the connected wallet's inboxes, and those whose reply window ends within 6 h. */
function useInboxCounts() {
  const state = useInboxState();
  const w = useWallet();
  const now = useNow(30_000);
  const me = w.address?.toLowerCase();
  if (!me) return { waiting: 0, urgent: 0 };
  const owned = new Set(state.inboxes.filter((i) => i.owner.toLowerCase() === me).map((i) => i.id));
  const pending = state.tickets.filter((t) => owned.has(t.inboxId) && t.status === 'Pending' && !t.reply && t.deadline > now);
  return { waiting: pending.length, urgent: pending.filter((t) => t.deadline - now <= URGENT_SECONDS).length };
}

export function Sidebar({ active }: { active: AppRouteId }) {
  const { t, lang, setLang } = useI18n();
  const w = useWallet();
  const tele = useTelemetry();
  const wide = useMedia('(min-width: 1024px)');
  const [userCollapsed, setUserCollapsed] = useState(() => {
    try {
      return localStorage.getItem(KEY) === 'collapsed';
    } catch {
      return false;
    }
  });
  const collapsed = userCollapsed || !wide;
  const counts = useInboxCounts();

  const toggle = useCallback(
    () =>
      setUserCollapsed((c) => {
        try {
          localStorage.setItem(KEY, c ? 'open' : 'collapsed');
        } catch {
          /* ignore */
        }
        return !c;
      }),
    [],
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '[' || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)) return;
      if (!window.matchMedia('(min-width: 1024px)').matches) return;
      toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  const badge = (id: AppRouteId) => (id === 'inbox' ? counts : { waiting: 0, urgent: 0 });
  const short = w.address ? `${w.address.slice(0, 6)}…${w.address.slice(-4)}` : '';

  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}`} aria-label="Navigation">
      <div className="sb-brand">
        <a className="sb-home" href="#/" aria-label="Voxro home" title="Voxro home">
          <img src={mark} alt="" width={30} height={30} />
          {!collapsed && (
            <span>
              <span className="sb-name">Voxro</span>
              <span className="sb-by">by ShieldSuite</span>
            </span>
          )}
        </a>
        {wide && (
          <button type="button" className="sb-toggle" onClick={toggle} aria-label={collapsed ? t('side.expand') : t('side.collapse')} title={`${collapsed ? t('side.expand') : t('side.collapse')}  [`}>
            {collapsed ? <IconPanelOpen /> : <IconPanelClose />}
          </button>
        )}
      </div>

      <nav className="sb-nav">
        {GROUPS.map((g) => (
          <div className="sb-group" key={g.label || 'top'}>
            {g.label &&
              (collapsed ? (
                <div className="sb-divider" />
              ) : (
                <p className="sb-label">
                  {t(g.label)}
                  <span />
                </p>
              ))}
            <ul>
              {g.ids.map((id) => {
                const I = ICONS[id];
                const c = badge(id);
                const on = id === active;
                const name = t(`nav.${id}` as MsgKey);
                const tip = c.urgent ? `${name} · ${t('side.urgent', { n: c.urgent })}` : c.waiting ? `${name} · ${t('side.waiting', { n: c.waiting })}` : name;
                return (
                  <li key={id}>
                    <a className={`sb-item${on ? ' on' : ''}`} href={href(id)} aria-current={on ? 'page' : undefined} aria-label={collapsed ? tip : undefined}>
                      <span className="sb-icon">
                        <I />
                        {collapsed && c.urgent > 0 && <span className="sb-dot urgent" />}
                        {collapsed && !c.urgent && c.waiting > 0 && <span className="sb-dot" />}
                      </span>
                      {!collapsed && (
                        <>
                          <span className="sb-text">
                            {on && <span className="sb-caret">&gt;</span>}
                            {name}
                          </span>
                          {c.urgent > 0 && <span className="sb-badge urgent">{c.urgent}</span>}
                          {c.waiting > 0 && <span className="sb-badge">{c.waiting}</span>}
                        </>
                      )}
                    </a>
                    {collapsed && <span className="sb-tip">{tip}</span>}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="sb-foot">
        <div className="sb-chip" title={`X Layer${tele.data ? ` #${tele.data.block.toString()}` : ''} · ${DEPLOYED ? t('c.mainnet') : t('c.notDeployed.short')}`}>
          <span className={`dot ${tele.error ? 'bad' : tele.data ? 'live' : ''}`} />
          {collapsed ? <span>XL</span> : <span>X Layer · {DEPLOYED ? t('c.mainnet') : t('c.notDeployed.short')}</span>}
        </div>
        {collapsed ? (
          <button type="button" className="sb-tile" onClick={() => setLang(lang === 'en' ? 'zh' : 'en')} title={lang === 'en' ? 'English → 中文' : '中文 → English'}>
            {lang === 'en' ? 'EN' : '中'}
          </button>
        ) : (
          <div className="seg sb-lang" role="tablist">
            <button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>
              EN
            </button>
            <button type="button" aria-pressed={lang === 'zh'} onClick={() => setLang('zh')}>
              中文
            </button>
          </div>
        )}
        {w.address ? (
          <div className="sb-person">
            <span className="sb-avatar" style={{ background: `linear-gradient(135deg, #${w.address.slice(2, 8)}, #${w.address.slice(-6)})` }} aria-hidden="true" />
            {!collapsed && (
              <span className="sb-who">
                <span className="mono">{short}</span>
                <span className="sb-role">{w.chainId === 196 ? 'X Layer' : t('c.switch')}</span>
              </span>
            )}
            <button type="button" className="sb-icon-btn" onClick={w.disconnect} aria-label={t('c.disconnect')} title={t('c.disconnect')}>
              <IconLogout />
            </button>
          </div>
        ) : w.hasProvider ? (
          <button type="button" className={`btn signal sm sb-connect${collapsed ? ' icon' : ''}`} onClick={() => void w.connect()} disabled={w.connecting} title={t('c.connect')} aria-label={t('c.connect')}>
            {collapsed ? <IconWallet /> : w.connecting ? t('c.connecting') : t('c.connect')}
          </button>
        ) : (
          <a className={`btn sm sb-connect${collapsed ? ' icon' : ''}`} href={w.okxDeepLink} target="_blank" rel="noreferrer" title={t('c.openInOkx')} aria-label={t('c.openInOkx')}>
            {collapsed ? <IconWallet /> : t('c.openInOkx')}
          </a>
        )}
      </div>
    </aside>
  );
}
