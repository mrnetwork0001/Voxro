/**
 * EIP-1193 provider for Telegram Mini Apps, where no wallet is injected: signing goes to the user's
 * OKX Wallet through OKX Connect (and back to Telegram), plain reads go to X Layer's public RPC.
 * Voxro never sees a key; OKX Connect is loaded only inside Telegram.
 */
import type { Eip1193Provider } from './wallet.tsx';

const CHAIN = 'eip155:196';
const RPC = 'https://rpc.xlayer.tech';
const ICON = 'https://voxro.shieldsuite.xyz/voxro-icon.png';
const WALLET_METHODS = new Set(['eth_sendTransaction', 'personal_sign', 'eth_signTypedData_v4', 'eth_sign', 'wallet_watchAsset']);

type Uni = {
  connected(): boolean;
  connect(o: unknown): Promise<unknown>;
  disconnect(): Promise<void>;
  request(a: { method: string; params?: unknown }, chain: string): Promise<unknown>;
  on(e: string, cb: (...a: unknown[]) => void): void;
  session?: { namespaces?: Record<string, { accounts?: string[] }> };
};

/**
 * The request has to reach OKX's relay before OKX Wallet opens: on iPhone the library opens the wallet first,
 * Telegram then freezes this page, and the wallet finds nothing to approve. So inside Telegram the library
 * never opens the wallet itself (openUniversalUrl: false); once the request is sent, the app shows an
 * "Open OKX Wallet" button and the user's own tap opens it (iOS only opens apps from a direct tap).
 */
export interface OkxPending { link: string; kind: 'connect' | 'sign' }
let pending: OkxPending | null = null;
const pendingListeners = new Set<() => void>();
const setPending = (p: OkxPending | null) => {
  pending = p;
  pendingListeners.forEach((l) => l());
};
export const okxPending = {
  get: () => pending,
  subscribe(cb: () => void) {
    pendingListeners.add(cb);
    return () => void pendingListeners.delete(cb);
  },
};
/** Opens OKX Wallet from a user tap: Telegram's own openLink when available. */
export function openOkxWallet(link: string) {
  const tgw = (window as unknown as { Telegram?: { WebApp?: { openLink?: (u: string) => void } } }).Telegram?.WebApp;
  if (tgw?.openLink) tgw.openLink(link);
  else window.open(link, '_blank');
}
const WALLET_LINK = 'https://web3.okx.com/ul/connect';

/**
 * After coming back from OKX Wallet the page has just been unfrozen and the relay socket is reconnecting;
 * a request sent in that moment never reaches the wallet. Wait until the page has been visible for a bit.
 */
let shownAt = Date.now();
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') shownAt = Date.now(); });
async function settled(ms = 2500) {
  for (let i = 0; i < 40; i++) {
    const since = Date.now() - shownAt;
    if (document.visibilityState === 'visible' && since >= ms) return;
    await new Promise((r) => setTimeout(r, Math.max(250, ms - since)));
  }
}

let uni: Promise<Uni> | null = null;
function load(): Promise<Uni> {
  return (uni ??= import('@okxconnect/universal-provider').then((m) => (m as unknown as { OKXUniversalProvider: { init(o: unknown): Promise<Uni> } }).OKXUniversalProvider.init({ dappMetaData: { name: 'Voxro', icon: ICON } })));
}

const accountsOf = (p: Uni) => (p.session?.namespaces?.eip155?.accounts ?? []).filter((a) => a.startsWith(`${CHAIN}:`)).map((a) => a.split(':')[2]!);

let rpcId = 0;
async function rpc(method: string, params: unknown) {
  const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params: params ?? [] }) });
  const j = (await r.json()) as { result?: unknown; error?: { message: string; code: number } };
  if (j.error) throw Object.assign(new Error(j.error.message), { code: j.error.code });
  return j.result;
}

export function okxConnectProvider(): Eip1193Provider & { disconnectSession(): Promise<void> } {
  const listeners = new Map<string, Set<(...a: unknown[]) => void>>();
  const emit = (e: string, ...a: unknown[]) => listeners.get(e)?.forEach((cb) => cb(...a));
  void load().then((p) => {
    p.on('session_update', () => emit('accountsChanged', accountsOf(p)));
    p.on('session_delete', () => emit('accountsChanged', []));
  });
  return {
    isOkxWallet: true,
    async request({ method, params }) {
      switch (method) {
        case 'eth_chainId':
          return '0xc4';
        case 'eth_accounts': {
          const p = await load();
          return p.connected() ? accountsOf(p) : [];
        }
        case 'eth_requestAccounts': {
          const p = await load();
          if (!p.connected() || !accountsOf(p).length) {
            // In Telegram the webview is paused while the user approves in OKX Wallet, and connect() can miss the
            // bridge's answer and never settle. So also watch the session itself: every second and whenever the
            // user comes back to Telegram, for up to 5 minutes; whichever sees the account first wins.
            const ready = () => p.connected() && accountsOf(p).length > 0;
            p.on('display_uri', (u) => typeof u === 'string' && setPending({ link: u, kind: 'connect' }));
            const viaConnect = p.connect({ namespaces: { eip155: { chains: [CHAIN], defaultChain: '196' } }, sessionConfig: { redirect: 'tg://resolve', openUniversalUrl: false } });
            const viaSession = new Promise<void>((resolve, reject) => {
              const started = Date.now();
              const check = () => {
                if (ready()) return done(resolve);
                if (Date.now() - started > 300_000) return done(() => reject(new Error('OKX Wallet did not confirm the connection. Please try again.')));
              };
              const timer = setInterval(check, 1000);
              const onShow = () => document.visibilityState === 'visible' && setTimeout(check, 400);
              document.addEventListener('visibilitychange', onShow);
              window.addEventListener('focus', onShow);
              const done = (f: () => void) => {
                clearInterval(timer);
                document.removeEventListener('visibilitychange', onShow);
                window.removeEventListener('focus', onShow);
                f();
              };
            });
            try {
              await Promise.race([viaConnect.then(() => undefined), viaSession]);
            } finally {
              setPending(null);
            }
          }
          const acc = accountsOf(p);
          if (!acc.length) throw new Error('OKX Wallet did not share an X Layer account');
          return acc;
        }
        case 'wallet_switchEthereumChain':
        case 'wallet_addEthereumChain':
          return null; // the session is already on X Layer
        default:
          if (WALLET_METHODS.has(method)) {
            const p = await load();
            await settled();
            const sent = p.request({ method, params }, CHAIN);
            setPending({ link: WALLET_LINK, kind: 'sign' });
            try {
              return await sent;
            } finally {
              setPending(null);
            }
          }
          return rpc(method, params);
      }
    },
    on(e, cb) {
      (listeners.get(e) ?? listeners.set(e, new Set()).get(e)!).add(cb);
    },
    removeListener(e, cb) {
      listeners.get(e)?.delete(cb);
    },
    async disconnectSession() {
      if (uni) await (await uni).disconnect().catch(() => {});
    },
  };
}
