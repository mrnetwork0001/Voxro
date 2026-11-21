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
            await p.connect({ namespaces: { eip155: { chains: [CHAIN], defaultChain: '196' } }, sessionConfig: { redirect: 'tg://resolve' } });
          }
          const acc = accountsOf(p);
          if (!acc.length) throw new Error('OKX Wallet did not share an X Layer account');
          return acc;
        }
        case 'wallet_switchEthereumChain':
        case 'wallet_addEthereumChain':
          return null; // the session is already on X Layer
        default:
          if (WALLET_METHODS.has(method)) return (await load()).request({ method, params }, CHAIN);
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
