/** Pure pieces of the LAUNCHED-mode data layer: Lens → view mapping, envelope contexts, error decoding. */
import { XLAYER, ZERO_REF, endpointHex, escrowEndpoint, hexToBytes, openPayload, randomKeyPair, seal, encodeContent, type Address, type Hex } from '@voxro/sdk';
import { sha256 } from '@noble/hashes/sha2.js';
import { BaseError, ContractFunctionRevertedError, encodeErrorResult } from 'viem';
import { describe, expect, it } from 'vitest';
import { describeError, guestContext, mailboxNetlist, mapInbox, mapTicket, presetOf, replyContext, tierOf, tokenOf, type LensInbox, type LensTicket } from '../src/chain/escrow.ts';
import { voxroEscrowAbi } from '@voxro/sdk';

const ESCROW = '0x00000000000000000000000000000000000000e5' as Address;
const VOXR = '0x000000000000000000000000000000000000c0de' as Address;
const MEMBER = '0x00000000000000000000000000000000000000a1' as Address;
const drbg = (seed: string) => {
  let c = 0;
  return (n: number) => sha256(new TextEncoder().encode(`${seed}${c++}`)).slice(0, n);
};

describe('chain mapping', () => {
  it('tokenOf / presetOf / tierOf', () => {
    expect(tokenOf(XLAYER.usdt0)).toBe('USDT0');
    expect(tokenOf(XLAYER.usdt.toUpperCase())).toBe('USDT');
    expect(tokenOf('0x0000000000000000000000000000000000000000')).toBe('OKB');
    expect(presetOf(VOXR, 5n, VOXR)).toBe('fortress');
    expect(presetOf(VOXR, 8n, VOXR)).toBe('configurable');
    expect(presetOf('0x00000000000000000000000000000000000000ff', 4n, VOXR)).toBe('configurable');
    expect(tierOf(15_000_000n, 10_000_000n)).toEqual({ tier: 1, vip: false });
    expect(tierOf(12_500_000n, 10_000_000n)).toEqual({ tier: 2, vip: true });
    expect(tierOf(40_000_000n, 10_000_000n)).toEqual({ tier: 3, vip: false });
  });

  it('maps a Lens InboxView and TicketView into the view shapes', () => {
    const v: LensInbox = {
      id: 7n,
      inbox: { policyCpu: VOXR, policyCircuitId: 4n, inboxCircuits: '0x00000000000000000000000000000000000000aa', inboxCircuitId: 12n, paymentToken: XLAYER.usdt0, basePrice: 10_000_000n, slaSeconds: 172_800, curve: 1, latchState: '0x02', active: true, vipKind: 1, vipSource: '0x00000000000000000000000000000000000000bb', handle: ('0x' + Buffer.from('mrnetwork').toString('hex').padEnd(64, '0')) as Hex, pending: 2, answered: 3, refunded: 1, replySeconds: 7200n },
      recipient: '0x00000000000000000000000000000000000000cc',
      members: [MEMBER],
      memberEndpoints: [endpointHex(MEMBER)],
      queueDepth: 2,
      quote: { canSend: true, price: 15_000_000n, nextState: '0x03', tier: 1, vipDiscount: false, allowlisted: false, vip: false },
    };
    const ib = mapInbox(v, '0x00000000000000000000000000000000000000dd', { memberIds: [{ circuits: '0x00000000000000000000000000000000000000aa', tokenId: 12n }], publicKey: '0x11', earned: 9_500_000n, voxr: VOXR });
    expect(ib).toMatchObject({ id: 7, handle: 'mrnetwork', preset: 'balanced', token: 'USDT0', latch: 2, containerTokenId: 12, replies: 3, earned: 9_500_000n, container: MEMBER, partnerCpu: '0x00000000000000000000000000000000000000bb' });
    expect(ib.live?.quote).toMatchObject({ price: 15_000_000n, tier: 1, nextQ: 3, canSend: true });

    const tv: LensTicket = { id: 3n, ticket: { inboxId: 7n, sender: '0x00000000000000000000000000000000000000dd', replyTargetEndpoint: escrowEndpoint(ESCROW), expectedReplyRef: ('0x' + '11'.repeat(32)) as Hex, token: XLAYER.usdt0, amount: 15_000_000n, createdAt: 1000, deadline: 2000, status: 1, lane: 1, guestReplyKey: ('0x' + '22'.repeat(32)) as Hex, replyInboxIndex: 4, replyTimestamp: 1500, replyFrom: MEMBER } };
    const t = mapTicket(tv, ib, { envelope: '0x54530201', replyPayload: '0x5453020199' });
    expect(t).toMatchObject({ id: 3, inboxId: 7, lane: 'guest', status: 'Claimed', tier: 1, vip: false, token: 'USDT0' });
    expect(t.reply?.inboxIndex).toBe(4);
    expect(t.payout).toEqual({ recipient: 14_250_000n, protocol: 750_000n });
    const pending = mapTicket({ ...tv, ticket: { ...tv.ticket, status: 0 } }, ib, { envelope: '0x54530201', replyPayload: '0x' });
    expect(pending.status).toBe('Pending');
    expect(pending.reply).toBeUndefined();
  });

  it('guest and reply contexts round-trip a sealed message', () => {
    const member = randomKeyPair(drbg('m'));
    const guest = randomKeyPair(drbg('g'));
    const content = encodeContent({ body: 'hi' });
    const env = seal({ ...guestContext(MEMBER, ESCROW), content, recipients: [member.publicKey] });
    expect(openPayload({ ...guestContext(MEMBER, ESCROW), payload: env, secretKey: member.secretKey }).content).toEqual(content);
    expect(guestContext(MEMBER, ESCROW).ref).toBe(ZERO_REF);
    const ref = ('0x' + 'ab'.repeat(32)) as Hex;
    const rep = seal({ ...replyContext(MEMBER, ref, ESCROW), content, recipients: [guest.publicKey] });
    expect(openPayload({ ...replyContext(MEMBER, ref, ESCROW), payload: rep, secretKey: guest.secretKey }).content).toEqual(content);
    expect(() => openPayload({ ...replyContext(MEMBER, ZERO_REF, ESCROW), payload: rep, secretKey: guest.secretKey })).toThrow();
  });

  it('mailbox netlist is the 2-NAND buffer agreed with the deploy flow', () => {
    expect(mailboxNetlist()).toEqual({ hex: '0x0000000200000200000003000003', nIn: 1, nOut: 1, nand: 2 });
    expect(hexToBytes('0x0000000200000200000003000003').length).toBe(14);
  });

  it('describeError names custom escrow errors', () => {
    const data = encodeErrorResult({ abi: voxroEscrowAbi, errorName: 'Paused' });
    const revert = new ContractFunctionRevertedError({ abi: voxroEscrowAbi, data, functionName: 'sendGuestPriority' });
    const wrapped = new BaseError('call failed', { cause: revert });
    expect(describeError(wrapped)).toBe('Paused');
    expect(describeError(new Error('plain'))).toBe('plain');
  });
});
