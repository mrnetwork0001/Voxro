import { useSyncExternalStore } from 'react';
import { useI18n } from '../i18n.tsx';
import { okxPending, openOkxWallet } from '../wallet/okxConnect.ts';

/** Inside Telegram: the request is waiting at OKX's relay; one tap opens OKX Wallet to approve it. */
export function OkxPrompt() {
  const p = useSyncExternalStore(okxPending.subscribe, okxPending.get, okxPending.get);
  const { lang } = useI18n();
  if (!p) return null;
  const zh = lang === 'zh';
  const title = p.kind === 'connect' ? (zh ? '连接请求已就绪' : 'Connection request ready') : zh ? '签名请求已就绪' : 'Request ready to sign';
  return (
    <div className="okx-prompt" role="dialog" aria-live="polite">
      <div className="okx-prompt-card">
        <div className="kicker">OKX Wallet</div>
        <div className="okx-prompt-title">{title}</div>
        <p className="small muted">{zh ? '点击下方按钮打开 OKX Wallet 并确认，然后返回 Telegram。' : 'Tap below to open OKX Wallet and approve, then come back to Telegram.'}</p>
        <button className="btn signal" onClick={() => openOkxWallet(p.link)}>
          {zh ? '打开 OKX Wallet 确认' : 'Open OKX Wallet to approve'}
        </button>
      </div>
    </div>
  );
}
