/**
 * Byte-for-byte compatibility of the TypeScript TAP-10 port with the vendored `@tapekit/send`
 * reference (test/vendor/tap-10, MIT). Randomness is injected so both sides produce identical bytes.
 */
import { sha256 } from '@noble/hashes/sha2.js';
import { keccak256, concat as viemConcat, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { describe, expect, it } from 'vitest';
import {
  XLAYER,
  decodeContent,
  deriveKeyPair,
  digestOf,
  encodeContent,
  endpointHex,
  escrowEndpoint,
  keyDerivationText,
  messageId,
  newGuestKeyPair,
  openGuestEnvelope,
  openGuestReply,
  openPayload,
  parseEndpoint,
  randomKeyPair,
  replyDigest,
  seal,
  sealGuestEnvelope,
  sealGuestReply,
  ticketRef,
  TapeSendError,
} from '../src/index.js';
// @ts-expect-error vendored JS has no types
import * as ref from './vendor/tap-10/index.js';

const CHAIN = 196;
const HUB = XLAYER.deWebHub;
const A = '0x00000000000000000000000000000000000000a1';
const B = '0x00000000000000000000000000000000000000b2';

/** Deterministic byte source: sha256(seed ‖ counter) stream. */
function drbg(seed: string) {
  let counter = 0;
  return (n: number) => {
    const out = new Uint8Array(n);
    let o = 0;
    while (o < n) {
      const block = sha256(new TextEncoder().encode(`${seed}:${counter++}`));
      out.set(block.slice(0, Math.min(32, n - o)), o);
      o += 32;
    }
    return out;
  };
}

const hex = (b: Uint8Array) => toHex(b);

describe('TAP-10 v2 port matches @tapekit/send', () => {
  const r1 = randomKeyPair(drbg('r1'));
  const r2 = randomKeyPair(drbg('r2'));
  const content = encodeContent({ subject: 'Partnership', body: 'Hello from Voxro 你好', ts: 1761955200 });
  const ctx = { to: endpointHex(A, CHAIN), from: endpointHex(B, CHAIN), hub: HUB, ref: `0x${'11'.repeat(32)}`, chainId: CHAIN } as const;

  it('encodeContent is byte-identical', () => {
    const theirs: Uint8Array = ref.encodeContent({ subject: 'Partnership', body: 'Hello from Voxro 你好', ts: 1761955200 });
    expect(hex(content)).toBe(hex(theirs));
  });

  it('seal() produces identical bytes with identical randomness (2 recipients)', () => {
    const ours = seal({ ...ctx, content, recipients: [r1.publicKey, r2.publicKey], random: drbg('seal') });
    const theirs: Uint8Array = ref.seal({ ...ctx, content, recipients: [r1.publicKey, r2.publicKey], random: drbg('seal') });
    expect(ours.length).toBe(93 + 56 * 2 + content.length + 16);
    expect(hex(ours)).toBe(hex(theirs));
  });

  it('cross-opens: reference seal → our open, our seal → reference open', () => {
    const theirs: Uint8Array = ref.seal({ ...ctx, content, recipients: [r1.publicKey, r2.publicKey] });
    const o1 = openPayload({ ...ctx, payload: theirs, secretKey: r2.secretKey });
    expect(hex(o1.content)).toBe(hex(content));
    const ours = seal({ ...ctx, content, recipients: [r1.publicKey] });
    const o2 = ref.openPayload({ ...ctx, payload: ours, secretKey: r1.secretKey });
    expect(hex(o2.content)).toBe(hex(content));
    const d = decodeContent(o2.content);
    expect(d.kind).toBe('message');
    if (d.kind === 'message') expect(d.body).toBe('Hello from Voxro 你好');
  });

  it('rejects the wrong key, a wrong context and tampering with the reference error codes', () => {
    const ours = seal({ ...ctx, content, recipients: [r1.publicKey] });
    expect(() => openPayload({ ...ctx, payload: ours, secretKey: r2.secretKey })).toThrowError(TapeSendError);
    try {
      openPayload({ ...ctx, payload: ours, secretKey: r2.secretKey });
    } catch (e) {
      expect((e as TapeSendError).code).toBe('not-for-key');
    }
    try {
      openPayload({ ...ctx, ref: `0x${'22'.repeat(32)}`, payload: ours, secretKey: r1.secretKey });
    } catch (e) {
      expect((e as TapeSendError).code).toBe('damaged');
    }
    const tampered = ours.slice();
    tampered[tampered.length - 1]! ^= 1;
    try {
      openPayload({ ...ctx, payload: tampered, secretKey: r1.secretKey });
    } catch (e) {
      expect((e as TapeSendError).code).toBe('damaged');
    }
  });

  it('messageId and digestOf match the reference and the Solidity formula', () => {
    const to = endpointHex(A, CHAIN);
    expect(messageId(CHAIN, HUB, to, 7)).toBe(ref.messageId(CHAIN, HUB, to, 7));
    const payload = new TextEncoder().encode('x');
    const r = `0x${'ab'.repeat(32)}` as const;
    expect(digestOf(r, payload)).toBe(keccak256(viemConcat([r, keccak256(payload)])));
  });

  it('endpoints encode as uint32(0) ‖ uint64(chainId) ‖ container', () => {
    const ep = endpointHex(A, CHAIN);
    expect(ep).toBe(`0x${'00'.repeat(4)}${'00'.repeat(7)}c4${A.slice(2)}`);
    expect(parseEndpoint(ep)).toEqual({ chainId: 196n, container: A });
    expect(hex(ref.seal({ ...ctx, to: A, content, recipients: [r1.publicKey], random: drbg('e') }))).toBe(hex(seal({ ...ctx, to: A, content, recipients: [r1.publicKey], random: drbg('e') })));
  });

  it('official key text and derived key pair match the reference', async () => {
    const account = privateKeyToAccount(`0x${'42'.repeat(32)}`);
    const p = { tokenId: 12n, cpuIndex: 404n, container: A, holder: account.address, hub: HUB, chainId: CHAIN, keyIndex: 0 };
    const text = keyDerivationText(p, 'tapesend');
    expect(text).toBe(ref.keyDerivationText(p));
    const signature = await account.signMessage({ message: text });
    const ours = deriveKeyPair({ ...p, signature, app: 'tapesend' });
    const theirs = ref.deriveKeyPair({ ...p, signature });
    expect(hex(ours.secretKey)).toBe(hex(theirs.secretKey));
    expect(hex(ours.publicKey)).toBe(hex(theirs.publicKey));
    const voxro = deriveKeyPair({ ...p, signature: await account.signMessage({ message: keyDerivationText(p, 'voxro') }) });
    expect(voxro.text).toContain('voxro.shieldsuite.xyz wants you to sign in');
    expect(hex(voxro.publicKey)).not.toBe(hex(ours.publicKey));
  });

  it('Guest Express lane round-trips and the reply digest is what claimBounty checks', () => {
    const escrow = '0x00000000000000000000000000000000000000e5';
    const recipient = randomKeyPair(drbg('recipient'));
    const recipientEndpoint = endpointHex(A, CHAIN);
    const guest = newGuestKeyPair(drbg('guest'));
    const envelope = sealGuestEnvelope({ content, recipientKey: recipient.publicKey, recipientEndpoint, escrow });
    expect(hex(openGuestEnvelope({ envelope, recipientSecretKey: recipient.secretKey, recipientEndpoint, escrow }))).toBe(hex(content));
    const tref = ticketRef(escrow, 1n);
    const reply = sealGuestReply({ content: encodeContent({ body: 'Deal.' }), guestPublicKey: guest.publicKey, ticketRef: tref, recipientEndpoint, escrow });
    expect(decodeContent(openGuestReply({ payload: reply, guestSecretKey: guest.secretKey, ticketRef: tref, recipientEndpoint, escrow }))).toMatchObject({ body: 'Deal.' });
    expect(replyDigest(tref, reply)).toBe(keccak256(viemConcat([tref, keccak256(reply)])));
    expect(escrowEndpoint(escrow)).toBe(endpointHex(escrow, CHAIN));
    // the reference implementation can open the reply too (plain TAP-10 with to = escrow endpoint)
    const theirs = ref.openPayload({ payload: reply, secretKey: guest.secretKey, to: escrowEndpoint(escrow), from: recipientEndpoint, hub: HUB, ref: tref, chainId: CHAIN });
    expect(hex(theirs.content)).toBe(hex(openGuestReply({ payload: reply, guestSecretKey: guest.secretKey, ticketRef: tref, recipientEndpoint, escrow })));
  });
});
