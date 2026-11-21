/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_VOXR_CPU?: string;
  readonly VITE_VOXRO_ESCROW?: string;
  readonly VITE_VOXRO_LENS?: string;
  readonly VITE_RPC_URL?: string;
  readonly VITE_MAILBOX_CPU?: string;
  readonly VITE_TAPE_RELAY_URL?: string;
  readonly VITE_TAPE_RELAY_CONTAINER?: string;
}
/** Contents of contracts/deployments/xlayer.json at build time ({} before the mainnet launch). */
declare const __VOXRO_DEPLOYMENT__: { voxrCircuits?: string; escrow?: string; lens?: string; mailboxCpu?: string };
interface Window {
  ethereum?: import('./wallet/wallet.tsx').Eip1193Provider;
  okxwallet?: import('./wallet/wallet.tsx').Eip1193Provider;
}
