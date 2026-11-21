/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_VOXR_CPU?: string;
  readonly VITE_VOXR_CPU_INDEX?: string;
  readonly VITE_VOXRO_ESCROW?: string;
  readonly VITE_VOXRO_LENS?: string;
  readonly VITE_RPC_URL?: string;
  readonly VITE_MAILBOX_CPU?: string;
}
interface Window {
  ethereum?: import('./wallet/wallet.tsx').Eip1193Provider;
  okxwallet?: import('./wallet/wallet.tsx').Eip1193Provider;
}
