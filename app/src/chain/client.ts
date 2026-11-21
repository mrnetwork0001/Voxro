import { XLAYER } from '@voxro/sdk';
import { createPublicClient, defineChain, fallback, http } from 'viem';
import { xLayer } from 'viem/chains';

/** `VITE_RPC_URL` overrides the public RPC list (e.g. an Anvil fork during rehearsals). */
const override = import.meta.env.VITE_RPC_URL;
export const RPC_URLS: readonly string[] = override ? [override] : XLAYER.rpcUrls;

export const xlayer = defineChain({
  ...xLayer,
  name: 'X Layer',
  rpcUrls: { default: { http: [...RPC_URLS] } },
  blockExplorers: { default: { name: 'OKX Explorer', url: XLAYER.explorer } },
});

export const publicClient = createPublicClient({
  chain: xlayer,
  transport: fallback(
    RPC_URLS.map((url) => http(url, { timeout: 15_000, retryCount: 1 })),
    { rank: false },
  ),
  batch: { multicall: { wait: 16 } },
});

export const explorerAddress = (a: string) => `${XLAYER.explorer}/address/${a}`;
export const explorerTx = (h: string) => `${XLAYER.explorer}/tx/${h}`;
