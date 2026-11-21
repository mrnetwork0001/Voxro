/**
 * Guest Express lane helpers (Lane B). A sender without a container seals a TAP-10 v2 envelope to the
 * recipient's `DeWebHub.keyFor()` key and hands it to `VoxroEscrow.sendGuestPriority`, which emits it.
 * Context used for the envelope: to = recipient container endpoint, from = escrow endpoint, ref = 0.
 * The recipient replies through `DeWebHub.send(to = escrow endpoint, ref = ticketRef)` sealed to the
 * guest's reply key; the escrow verifies `digest == keccak256(ticketRef ‖ keccak256(payload))`.
 */
import { keccak_256 } from '@noble/hashes/sha3.js';
import { randomBytes } from '@noble/hashes/utils.js';
import { XLAYER, XLAYER_CHAIN_ID } from '../tapeout/addresses.js';
import type { Address } from '../tapeout/netlist.js';
import { addressBytes, ascii, bytesToHex, concat, uint256 } from './bytes.js';
import { digestOf } from './content.js';
import { randomKeyPair } from './keys.js';
import { endpointHex, openPayload, seal, ZERO_REF, type Hex } from './payload.js';

export interface GuestKeyPair {
  secretKey: Uint8Array;
  publicKey: Uint8Array;
}

/** Endpoint the escrow uses as the Guest lane reply target: bytes32((chainId << 160) | escrow). */
export const escrowEndpoint = (escrow: Address, chainId: number | bigint = XLAYER_CHAIN_ID): Hex => endpointHex(escrow, chainId);

/** The guest's reply key pair; the secret stays in the sender's browser. */
export const newGuestKeyPair = (random: (n: number) => Uint8Array = randomBytes): GuestKeyPair => randomKeyPair(random);

/** Deterministic reply reference for a Guest lane ticket: keccak256("VOXRO/ticket/v1" ‖ uint256(chainId) ‖ escrow ‖ uint256(ticketId)). */
export function ticketRef(escrow: Address, ticketId: bigint | number, chainId: number | bigint = XLAYER_CHAIN_ID): Hex {
  return bytesToHex(keccak_256(concat(ascii('VOXRO/ticket/v1'), uint256(chainId), addressBytes(escrow), uint256(ticketId))));
}

interface LaneContext {
  recipientEndpoint: Hex;
  escrow: Address;
  hub?: Address;
  chainId?: number | bigint;
}

export function sealGuestEnvelope(p: LaneContext & { content: Uint8Array; recipientKey: Uint8Array; random?: (n: number) => Uint8Array }): Uint8Array {
  const chainId = p.chainId ?? XLAYER_CHAIN_ID;
  return seal({
    content: p.content,
    recipients: [p.recipientKey],
    to: p.recipientEndpoint,
    from: escrowEndpoint(p.escrow, chainId),
    hub: p.hub ?? XLAYER.deWebHub,
    ref: ZERO_REF,
    chainId,
    ...(p.random ? { random: p.random } : {}),
  });
}

export function openGuestEnvelope(p: LaneContext & { envelope: Uint8Array; recipientSecretKey: Uint8Array }): Uint8Array {
  const chainId = p.chainId ?? XLAYER_CHAIN_ID;
  return openPayload({
    payload: p.envelope,
    secretKey: p.recipientSecretKey,
    to: p.recipientEndpoint,
    from: escrowEndpoint(p.escrow, chainId),
    hub: p.hub ?? XLAYER.deWebHub,
    ref: ZERO_REF,
    chainId,
  }).content;
}

export function sealGuestReply(p: LaneContext & { content: Uint8Array; guestPublicKey: Uint8Array; ticketRef: Hex; random?: (n: number) => Uint8Array }): Uint8Array {
  const chainId = p.chainId ?? XLAYER_CHAIN_ID;
  return seal({
    content: p.content,
    recipients: [p.guestPublicKey],
    to: escrowEndpoint(p.escrow, chainId),
    from: p.recipientEndpoint,
    hub: p.hub ?? XLAYER.deWebHub,
    ref: p.ticketRef,
    chainId,
    ...(p.random ? { random: p.random } : {}),
  });
}

export function openGuestReply(p: LaneContext & { payload: Uint8Array; guestSecretKey: Uint8Array; ticketRef: Hex }): Uint8Array {
  const chainId = p.chainId ?? XLAYER_CHAIN_ID;
  return openPayload({
    payload: p.payload,
    secretKey: p.guestSecretKey,
    to: escrowEndpoint(p.escrow, chainId),
    from: p.recipientEndpoint,
    hub: p.hub ?? XLAYER.deWebHub,
    ref: p.ticketRef,
    chainId,
  }).content;
}

/** What `claimBounty` recomputes and compares with `DeWebHub.inboxAt(...).digest`. */
export const replyDigest = (ref: Hex, payload: Uint8Array): Hex => digestOf(ref, payload);
