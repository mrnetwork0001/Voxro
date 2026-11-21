/**
 * One API for the views; implementation chosen once at load:
 *  - simulation (default): synchronous local VoxroEscrow model in ../sim/escrow.ts
 *  - chain (LAUNCHED): VoxroEscrow + VoxroLens + DeWebHub on X Layer via ../chain/escrow.ts
 */
import type { Address, ControllerPreset, CurveProfile, DecodedContent } from '@voxro/sdk';
import * as chain from './chain/escrow.ts';
import { DEMO_SENDER, LAUNCHED } from './config.ts';
import * as sim from './sim/escrow.ts';
import type { ClaimCheck, HubEntry, Lane, Quote, SimInbox, SimState, SimTicket, Token } from './sim/escrow.ts';

export type { OnboardStep, TxStatus } from './chain/escrow.ts';

export interface RegisterParams {
  handle: string;
  name: string;
  bio: string;
  owner: Address;
  preset: ControllerPreset;
  curve: CurveProfile;
  partnerCpu: Address | null;
  token: Token;
  basePrice: bigint;
  slaSeconds: number;
  /** chain only: reuse an existing hub-compatible circuit as the mailbox */
  mailbox?: chain.MailboxPick;
}

export interface Backend {
  mode: 'sim' | 'chain';
  quoteFor(inbox: SimInbox, sender: Address, holdsPartner: boolean): Quote;
  verifyClaim(s: SimState, t: SimTicket): { ok: boolean; checks: ClaimCheck[]; entry?: HubEntry };
  containerOf(inbox: SimInbox): Address;
  lock(p: { inboxId: number; sender: Address; lane: Lane; subject: string; body: string; holdsPartner: boolean }): Promise<SimTicket>;
  openEnvelope(t: SimTicket, inbox: SimInbox): Promise<DecodedContent>;
  reply(ticketId: number, body: string): Promise<SimTicket>;
  claim(ticketId: number): Promise<SimTicket>;
  refundExpired(ticketId: number): Promise<SimTicket>;
  decline(ticketId: number): Promise<SimTicket>;
  openReply(t: SimTicket, inbox: SimInbox): Promise<DecodedContent | null>;
  registerInbox(p: RegisterParams, onStep: (s: chain.OnboardStep) => void): Promise<SimInbox>;
  /** sim-only demo controls */
  fastForward?: (seconds: number) => void;
  reset?: () => void;
}

const simBackend: Backend = {
  mode: 'sim',
  quoteFor: sim.quoteFor,
  verifyClaim: sim.verifyClaim,
  containerOf: sim.containerOf,
  lock: async (p) => sim.lock(p),
  openEnvelope: async (t, ib) => sim.openEnvelope(t, ib),
  reply: async (id, body) => sim.reply(id, body),
  claim: async (id) => sim.claim(id),
  refundExpired: async (id) => sim.refundExpired(id),
  decline: async (id) => sim.refundExpired(id),
  openReply: async (t, ib) => sim.openReply(t, ib),
  registerInbox: async (p) => sim.registerInbox(p),
  fastForward: sim.fastForward,
  reset: sim.resetSim,
};

const chainBackend: Backend = {
  mode: 'chain',
  quoteFor: chain.quoteFor,
  verifyClaim: chain.verifyClaim,
  containerOf: (ib) => ib.container ?? sim.containerOf(ib),
  lock: (p) => chain.lock(p),
  openEnvelope: chain.openEnvelope,
  reply: chain.reply,
  claim: chain.claim,
  refundExpired: chain.refundExpired,
  decline: chain.decline,
  openReply: chain.openReply,
  registerInbox: (p, onStep) => chain.registerInbox(p, onStep),
};

export const backend: Backend = LAUNCHED ? chainBackend : simBackend;
export const useInboxState: () => SimState = LAUNCHED ? chain.useChainState : sim.useSim;
export const stateNow = (): SimState => (LAUNCHED ? chain.chainStore.get() : sim.simStore.get());
export const findInbox = sim.findInbox;
export { DEMO_SENDER };
