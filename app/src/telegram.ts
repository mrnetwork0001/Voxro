/**
 * Running as a Telegram Mini App: native look, start parameters and clean hash routes.
 * Telegram appends its launch data (tgWebAppData=…) to the URL fragment; telegram-web-app.js reads it
 * first (index.html), then we strip it so the hash router only sees #/route.
 */
interface TgWebApp {
  initData: string;
  initDataUnsafe: { start_param?: string; user?: { username?: string } };
  platform: string;
  ready(): void;
  expand(): void;
  setHeaderColor(c: string): void;
  setBackgroundColor(c: string): void;
  disableVerticalSwipes?(): void;
  openLink(url: string, opts?: { try_instant_view?: boolean }): void;
  openTelegramLink(url: string): void;
}
declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp };
  }
}

export const tg = (): TgWebApp | undefined => (window.Telegram?.WebApp?.initData ? window.Telegram.WebApp : undefined);
export const inTelegram = () => Boolean(tg()) || /tgWebApp/.test(location.hash);

/** start_param from t.me/<bot>/app?startapp=… or the bot's buttons: send_<handle>, watch_<handle>, start */
function routeForStart(p: string | undefined): string | null {
  if (!p) return null;
  const m = p.match(/^(send|price|profile)_([a-z0-9_]{1,31})$/);
  if (m) return `#/@${m[2]}`;
  if (p === 'start' || p === 'create') return '#/start';
  if (p === 'inbox') return '#/inbox';
  return null;
}

export function initTelegram() {
  const raw = location.hash;
  const cut = raw.search(/[#&?]tgWebApp/);
  if (cut >= 0 || raw.startsWith('#tgWebApp')) {
    const route = raw.startsWith('#tgWebApp') ? '' : raw.slice(0, cut);
    history.replaceState(null, '', `${location.pathname}${location.search}${route && route !== '#' ? route : '#/pulse'}`);
  }
  const app = tg();
  if (!app) return;
  document.documentElement.classList.add('in-telegram');
  const start = routeForStart(app.initDataUnsafe.start_param);
  if (start) history.replaceState(null, '', `${location.pathname}${start}`);
  try {
    app.setHeaderColor('#0a0e17');
    app.setBackgroundColor('#0a0e17');
    app.disableVerticalSwipes?.();
    app.expand();
    app.ready();
  } catch {
    /* older clients */
  }
}
