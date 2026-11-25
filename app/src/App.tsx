import { ChainBridge } from './chain/Bridge.tsx';
import { useTelemetry } from './chain/telemetry.ts';
import { Badge, Button, Segmented } from './components/ui.tsx';
import { DEPLOYED } from './config.ts';
import { useI18n, type MsgKey } from './i18n.tsx';
import { ROUTES, href, useRoute } from './router.ts';
import { Wordmark } from './components/Wordmark.tsx';
import { Burger, Drawer, useDrawer } from './components/MobileNav.tsx';
import { Sidebar, useMedia } from './components/Sidebar.tsx';
import { Card } from './views/Card.tsx';
import { Directory } from './views/Directory.tsx';
import { Gallery } from './views/Gallery.tsx';
import { Inbox } from './views/Inbox.tsx';
import { Landing } from './views/Landing.tsx';
import { Prover } from './views/Prover.tsx';
import { Pulse } from './views/Pulse.tsx';
import { Receipt } from './views/Receipt.tsx';
import { Tour, openTour } from './components/Tour.tsx';
import { IconGuide } from './components/icons.tsx';
import { Start } from './views/Start.tsx';
import { Studio } from './views/Studio.tsx';
import { useWallet } from './wallet/wallet.tsx';

const VIEWS = { start: Start, pulse: Pulse, directory: Directory, inbox: Inbox, studio: Studio, card: Card, gallery: Gallery, prover: Prover, receipt: Receipt } as const;

function WalletButton() {
  const { t } = useI18n();
  const w = useWallet();
  if (!w.hasProvider) {
    return (
      <a className="btn ghost sm" href={w.okxDeepLink} target="_blank" rel="noreferrer" title={t('c.noWallet')}>
        {t('c.openInOkx')}
      </a>
    );
  }
  if (!w.address) {
    return (
      <Button size="sm" onClick={() => void w.connect()} disabled={w.connecting}>
        {w.connecting ? t('c.connecting') : t('c.connect')}
      </Button>
    );
  }
  return (
    <span className="row" style={{ gap: 6 }}>
      {/* phones: a compact chip; the full wallet panel lives in the menu */}
      <span className="wallet-chip" title={w.address}>
        <span className="wallet-dot" style={{ background: `linear-gradient(135deg, #${w.address.slice(2, 8)}, #${w.address.slice(-6)})` }} />
        {w.address.slice(0, 6)}…{w.address.slice(-4)}
      </span>
      {w.chainId !== 196 ? (
        <Button size="sm" variant="signal" onClick={() => void w.switchToXLayer()}>
          {t('c.switch')}
        </Button>
      ) : (
        <Badge tone="ok">X Layer</Badge>
      )}
      <span className="mono small" title={w.address}>
        {w.address.slice(0, 6)}…{w.address.slice(-4)}
      </span>
      <button className="copy" onClick={w.disconnect}>
        {t('c.disconnect')}
      </button>
    </span>
  );
}

/** The wallet block at the foot of the phone menu: who is connected, on which network, and how to leave. */
function WalletPanel() {
  const { t } = useI18n();
  const w = useWallet();
  if (!w.address) return <WalletButton />;
  return (
    <div className="wallet-panel">
      <span className="wallet-dot lg" style={{ background: `linear-gradient(135deg, #${w.address.slice(2, 8)}, #${w.address.slice(-6)})` }} />
      <div className="wallet-panel-main">
        <button type="button" className="mono wallet-addr" title={w.address} onClick={() => void navigator.clipboard?.writeText(w.address!).catch(() => {})}>
          {w.address.slice(0, 8)}…{w.address.slice(-6)}
        </button>
        {w.chainId !== 196 ? (
          <button type="button" className="copy" onClick={() => void w.switchToXLayer()}>{t('c.switch')}</button>
        ) : (
          <span className="small ok">● X Layer</span>
        )}
      </div>
      <button type="button" className="btn ghost sm" onClick={w.disconnect}>{t('c.disconnect')}</button>
    </div>
  );
}

export function App() {
  const { id, arg } = useRoute();
  const { t, lang, setLang } = useI18n();
  const tele = useTelemetry();
  const drawer = useDrawer();
  const phone = useMedia('(max-width: 900px)');
  if (id === 'landing')
    return (
      <>
        <ChainBridge />
        <Landing />
      </>
    );
  const View = VIEWS[id];
  return (
    <div className="shell with-sidebar">
      {!phone && <Sidebar active={id} />}
      <div className="shell-main">
      <header className="masthead">
        <div className="masthead-inner">
          <Wordmark />
          <nav className="nav" aria-label="Views">
            {ROUTES.map((r) => (
              <a key={r} href={href(r)} aria-current={r === id ? 'page' : undefined}>
                {t(`nav.${r}` as MsgKey)}
              </a>
            ))}
          </nav>
          <div className="masthead-right">
          <div className="controls">
            <Segmented
              className="lang-desktop"
              value={lang}
              options={[
                { id: 'en', label: 'EN' },
                { id: 'zh', label: '中文' },
              ]}
              onChange={setLang}
            />
            <span data-tour="wallet" className="row">
              <WalletButton />
            </span>
          </div>
          {phone && (
            <button type="button" data-tour="tour" className="guide-btn" onClick={openTour} aria-label={t('tour.open')} title={t('tour.open')}>
              <IconGuide />
            </button>
          )}
          <Burger open={drawer.open} onToggle={drawer.toggle} />
          </div>
        </div>
      </header>
      <Drawer
        open={drawer.open}
        onClose={drawer.close}
        footer={
          <>
            <WalletPanel />
            <div className="ticker">
              <span className={`dot ${tele.error ? 'bad' : tele.data ? 'live' : ''}`} />
              <span>X Layer {tele.data ? `#${tele.data.block.toString()}` : '…'} · {DEPLOYED ? t('c.mainnet') : t('c.notDeployed.short')}</span>
            </div>
            <Segmented
              value={lang}
              options={[
                { id: 'en', label: 'EN' },
                { id: 'zh', label: '中文' },
              ]}
              onChange={setLang}
            />
          </>
        }
      >
        {ROUTES.map((r) => (
          <a key={r} data-tour={`nav-${r}`} href={href(r)} aria-current={r === id ? 'page' : undefined} onClick={drawer.close}>
            {t(`nav.${r}` as MsgKey)}
          </a>
        ))}
      </Drawer>
      <main className="view">
        <View arg={arg} />
      </main>
      <ChainBridge />
      <Tour menu={phone ? (o) => (o ? drawer.show() : drawer.close()) : undefined} />
      <footer className="footer">
        <div className="footer-inner">
          <span>Voxro · {t('app.tag')}</span>
          <span>
            A <a href="https://shieldsuite.xyz" target="_blank" rel="noreferrer">ShieldSuite</a> product · built on X Layer
          </span>
        </div>
      </footer>
      </div>
    </div>
  );
}
