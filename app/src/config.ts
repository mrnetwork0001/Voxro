import { XLAYER, type Address } from '@voxro/sdk';

const env = import.meta.env;
const addr = (v: string | undefined): Address | null => (v && /^0x[0-9a-fA-F]{40}$/.test(v) ? (v as Address) : null);

export const CONFIG = Object.freeze({
  voxrCpu: addr(env.VITE_VOXR_CPU),
  voxrCpuIndex: env.VITE_VOXR_CPU_INDEX ? Number(env.VITE_VOXR_CPU_INDEX) : null,
  escrow: addr(env.VITE_VOXRO_ESCROW),
  lens: addr(env.VITE_VOXRO_LENS),
  /** Circuits address of a hub-compatible processor (Factory index ≤ 386) used for mailbox containers. */
  mailboxCpu: addr(env.VITE_MAILBOX_CPU) ?? ('0xAa13ae45b0B2D52f210Ad7Ef12997113a0ebAF21' as Address), // Factory #212 "LoteGate": hub-compatible, mintPrice 0
  explorer: XLAYER.explorer,
  rpcUrls: XLAYER.rpcUrls,
});

/** True once the VOXR processor and VoxroEscrow are live on X Layer mainnet (Phase 4). */
export const LAUNCHED = Boolean(CONFIG.voxrCpu && CONFIG.escrow && CONFIG.lens);

/** Placeholder processor address used for REF records in the local catalog until VOXR is created. */
export const SIM_CPU: Address = CONFIG.voxrCpu ?? '0x000000000000000000000000000000000000c0de';
/** Placeholder escrow address used by the local simulation for the Guest lane reply endpoint. */
export const SIM_ESCROW: Address = CONFIG.escrow ?? '0x000000000000000000000000000000000000e5c0';
/** Persona used as the sender when no wallet is connected. */
export const DEMO_SENDER: Address = '0x00000000000000000000000000000000000a11ce';
export const VOXR_CPU_INDEX = CONFIG.voxrCpuIndex ?? 404;
