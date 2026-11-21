import { XLAYER, type Address } from '@voxro/sdk';

const env = import.meta.env;
const deployment: typeof __VOXRO_DEPLOYMENT__ = typeof __VOXRO_DEPLOYMENT__ === 'undefined' ? {} : __VOXRO_DEPLOYMENT__;
const addr = (v: string | undefined): Address | null => (v && /^0x[0-9a-fA-F]{40}$/.test(v) ? (v as Address) : null);

export const CONFIG = Object.freeze({
  /** VOXR processor (Circuits ERC-721) created by Factory.createCPU at launch. */
  voxrCpu: addr(env.VITE_VOXR_CPU) ?? addr(deployment.voxrCircuits),
  escrow: addr(env.VITE_VOXRO_ESCROW) ?? addr(deployment.escrow),
  lens: addr(env.VITE_VOXRO_LENS) ?? addr(deployment.lens),
  /** Circuits address of a hub-compatible processor (Factory index ≤ 386) used for mailbox containers. */
  mailboxCpu: addr(env.VITE_MAILBOX_CPU) ?? addr(deployment.mailboxCpu) ?? ('0xAa13ae45b0B2D52f210Ad7Ef12997113a0ebAF21' as Address), // Factory #212 "LoteGate": hub-compatible, mintPrice 0
  explorer: XLAYER.explorer,
  rpcUrls: XLAYER.rpcUrls,
});

/** True once VOXR, VoxroEscrow and VoxroLens are deployed. Until then every write is disabled — there is no simulation. */
export const DEPLOYED = Boolean(CONFIG.voxrCpu && CONFIG.escrow && CONFIG.lens);

/**
 * Key under which the local circuit evaluator resolves VOXR's REF gates. Before launch it is the zero
 * address; it is only an in-memory lookup key and is never sent to the chain.
 */
export const CATALOG_CPU: Address = CONFIG.voxrCpu ?? '0x0000000000000000000000000000000000000000';
