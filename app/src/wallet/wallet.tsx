import type { Address } from '@voxro/sdk';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createWalletClient, custom, type WalletClient } from 'viem';
import { xlayer } from '../chain/client.ts';
import { inTelegram } from '../telegram.ts';
import { okxConnectProvider } from './okxConnect.ts';

export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<unknown>;
  on?(event: string, cb: (...a: unknown[]) => void): void;
  removeListener?(event: string, cb: (...a: unknown[]) => void): void;
  isOkxWallet?: boolean;
  isMetaMask?: boolean;
}

interface WalletState {
  address?: Address;
  chainId?: number;
  connecting: boolean;
  error?: string;
  hasProvider: boolean;
  providerName: string;
  walletClient?: WalletClient;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchToXLayer: () => Promise<void>;
  okxDeepLink: string;
}

const Ctx = createContext<WalletState | null>(null);
const KEY = 'voxro.wallet.connected';

function pickProvider(): Eip1193Provider | undefined {
  // inside Telegram there is no injected wallet: sign with OKX Wallet through OKX Connect
  return window.okxwallet ?? window.ethereum ?? (inTelegram() ? okxConnectProvider() : undefined);
}

const X_LAYER_PARAMS = {
  chainId: '0xc4',
  chainName: 'X Layer',
  nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 },
  rpcUrls: ['https://rpc.xlayer.tech', 'https://xlayerrpc.okx.com'],
  blockExplorerUrls: ['https://www.okx.com/web3/explorer/xlayer'],
};

export function WalletProvider({ children }: { children: ReactNode }) {
  const [provider] = useState<Eip1193Provider | undefined>(pickProvider);
  const [address, setAddress] = useState<Address>();
  const [chainId, setChainId] = useState<number>();
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string>();

  const providerName = provider?.isOkxWallet ? 'OKX Wallet' : provider?.isMetaMask ? 'MetaMask' : provider ? 'Injected wallet' : '';

  const readChain = useCallback(async () => {
    if (!provider) return;
    const hex = (await provider.request({ method: 'eth_chainId' })) as string;
    setChainId(parseInt(hex, 16));
  }, [provider]);

  const connect = useCallback(async () => {
    if (!provider) return;
    setConnecting(true);
    setError(undefined);
    try {
      const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[];
      setAddress(accounts[0] as Address | undefined);
      await readChain();
      localStorage.setItem(KEY, '1');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setConnecting(false);
    }
  }, [provider, readChain]);

  const disconnect = useCallback(() => {
    setAddress(undefined);
    localStorage.removeItem(KEY);
    void (provider as { disconnectSession?: () => Promise<void> } | undefined)?.disconnectSession?.();
  }, [provider]);

  const switchToXLayer = useCallback(async () => {
    if (!provider) return;
    try {
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0xc4' }] });
    } catch (e) {
      const code = (e as { code?: number }).code;
      if (code === 4902) await provider.request({ method: 'wallet_addEthereumChain', params: [X_LAYER_PARAMS] });
      else throw e;
    }
    await readChain();
  }, [provider, readChain]);

  useEffect(() => {
    if (!provider) return;
    const onAccounts = (...a: unknown[]) => setAddress((a[0] as string[] | undefined)?.[0] as Address | undefined);
    const onChain = (...a: unknown[]) => setChainId(parseInt(a[0] as string, 16));
    provider.on?.('accountsChanged', onAccounts);
    provider.on?.('chainChanged', onChain);
    if (localStorage.getItem(KEY)) {
      provider
        .request({ method: 'eth_accounts' })
        .then((acc) => {
          const list = acc as string[];
          if (list[0]) setAddress(list[0] as Address);
        })
        .catch(() => {});
      readChain().catch(() => {});
    }
    return () => {
      provider.removeListener?.('accountsChanged', onAccounts);
      provider.removeListener?.('chainChanged', onChain);
    };
  }, [provider, readChain]);

  const walletClient = useMemo(
    () => (provider && address ? createWalletClient({ account: address, chain: xlayer, transport: custom(provider) }) : undefined),
    [provider, address],
  );

  const okxDeepLink = useMemo(() => {
    const target = `okx://wallet/dapp/url?dappUrl=${encodeURIComponent(location.href)}`;
    return `https://www.okx.com/download?deeplink=${encodeURIComponent(target)}`;
  }, []);

  const value = useMemo<WalletState>(
    () => ({ address, chainId, connecting, error, hasProvider: Boolean(provider), providerName, walletClient, connect, disconnect, switchToXLayer, okxDeepLink }),
    [address, chainId, connecting, error, provider, providerName, walletClient, connect, disconnect, switchToXLayer, okxDeepLink],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet(): WalletState {
  const v = useContext(Ctx);
  if (!v) throw new Error('WalletProvider missing');
  return v;
}
