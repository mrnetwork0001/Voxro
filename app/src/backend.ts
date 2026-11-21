/**
 * The views' single entry point to Voxro: VoxroEscrow + VoxroLens + DeWebHub on X Layer mainnet
 * (chain/escrow.ts). There is no simulated backend; before launch (`DEPLOYED` false) the state stays
 * empty and every write is disabled in the UI.
 */
import type { Address, ControllerPreset, CurveProfile } from '@voxro/sdk';
import * as chain from './chain/escrow.ts';
import type { ChainState, Token } from './model.ts';

export type { MailboxPick, OnboardStep, TxStatus } from './chain/escrow.ts';
export { findInbox } from './model.ts';

export interface RegisterParams {
  handle: string;
  preset: ControllerPreset;
  curve: CurveProfile;
  partnerCpu: Address | null;
  token: Token;
  basePrice: bigint;
  slaSeconds: number;
  /** reuse a circuit the wallet already holds on a hub-compatible processor as the mailbox */
  mailbox?: chain.MailboxPick;
}

export const backend = {
  quoteFor: chain.quoteFor,
  verifyClaim: chain.verifyClaim,
  lock: chain.lock,
  openEnvelope: chain.openEnvelope,
  reply: chain.reply,
  claim: chain.claim,
  refundExpired: chain.refundExpired,
  decline: chain.decline,
  openReply: chain.openReply,
  registerInbox: (p: RegisterParams, onStep: (s: chain.OnboardStep) => void) => chain.registerInbox(p, onStep),
  publishCard: chain.publishCard,
  publishInboxKey: chain.publishInboxKey,
  setPricing: chain.setPricing,
  setActive: chain.setActive,
  setAllowlist: chain.setAllowlist,
  setMembers: chain.setMembers,
  isAllowlisted: chain.isAllowlisted,
};

export const useInboxState: () => ChainState = chain.useChainState;
export const stateNow = (): ChainState => chain.chainStore.get();
