import { ChainBridge } from './chain/Bridge.tsx';
import { useTelemetry } from './chain/telemetry.ts';
import { Badge, Button, Segmented } from './components/ui.tsx';
import { LAUNCHED } from './config.ts';
import { useI18n, type MsgKey } from './i18n.tsx';
import { ROUTES, href, useRoute } from './router.ts';
import { useTheme } from './theme.tsx';
import { Card } from './views/Card.tsx';
import { Directory } from './views/Directory.tsx';
import { Gallery } from './views/Gallery.tsx';
import { Inbox } from './views/Inbox.tsx';
import { Landing } from './views/Landing.tsx';
import { Prover } from './views/Prover.tsx';
import { Pulse } from './views/Pulse.tsx';
import { Receipt } from './views/Receipt.tsx';
import { Studio } from './views/Studio.tsx';
import { useWallet } from './wallet/wallet.tsx';

const VIEWS = { pulse: Pulse, directory: Directory, inbox: Inbox, studio: Studio, card: Card, gallery: Gallery, prover: Prover, receipt: Receipt } as const;

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

export function App() {
  const { id, arg } = useRoute();
  const { t, lang, setLang } = useI18n();
  const { theme, toggle } = useTheme();
  const tele = useTelemetry();
  if (id === 'landing')
    return (
      <>
        <ChainBridge />
        <Landing />
      </>
    );
  const View = VIEWS[id];
  return (
    <div className="shell">
      <header className="masthead">
        <div className="masthead-inner">
          <a className="wordmark" href="#/" title="Voxro home">
            <svg className="mark" viewBox="0 0 32 32" aria-hidden="true">
              <path d="M6 7h5l5 13 5-13h5L19 26h-6z" fill="var(--signal)" />
            </svg>
            VOXRO
          </a>
          <nav className="nav" aria-label="Views">
            {ROUTES.map((r) => (
              <a key={r} href={href(r)} aria-current={r === id ? 'page' : undefined}>
                {t(`nav.${r}` as MsgKey)}
              </a>
            ))}
          </nav>
          <div className="spacer" />
          <div className="ticker" title={tele.error ?? ''}>
            <span className={`dot ${tele.error ? 'bad' : tele.data ? 'live' : ''}`} />
            <span>X Layer · {tele.data ? `#${tele.data.block.toString()}` : tele.error ? 'RPC' : '…'}</span>
            <span className="muted">· {LAUNCHED ? t('c.mainnet') : t('c.prelaunch')}</span>
          </div>
          <div className="controls">
            <Segmented
              value={lang}
              options={[
                { id: 'en', label: 'EN' },
                { id: 'zh', label: '中文' },
              ]}
              onChange={setLang}
            />
            <button className="btn ghost sm" onClick={toggle} aria-label="Toggle theme" title={theme}>
              {theme === 'dark' ? '☀' : '☾'}
            </button>
            <WalletButton />
          </div>
        </div>
      </header>
      <main className="view">
        <View arg={arg} />
      </main>
      <ChainBridge />
      <footer className="footer">
        <div className="footer-inner">
          <span>Voxro (VOXR) · {t('app.tag')}</span>
          <span>X Layer TapeOut Accelerate · mrnetwork0001 · MIT · chainId 196</span>
        </div>
      </footer>
    </div>
  );
}
