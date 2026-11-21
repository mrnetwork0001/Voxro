// Offline round trip: a reply sealed exactly as the web app seals it (chain/escrow.ts reply()) opens with
// the key an agent derives from its own signature, and nobody else's.
import { XLAYER_CHAIN_ID, bytesToHex, deriveGuestKeyPair, encodeContent, endpointHex, escrowEndpoint, guestKeyText, seal, XLAYER } from '@voxro/sdk';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { describe, expect, it } from 'vitest';
import { openAgentReply } from '../src/agent.js';
import { ESCROW } from '../src/chain.js';

describe('agent reply decryption', () => {
  it('opens an app-sealed reply with the signature-derived key', async () => {
    const agent = privateKeyToAccount(generatePrivateKey());
    const text = guestKeyText({ escrow: ESCROW, sender: agent.address, chainId: XLAYER_CHAIN_ID });
    const signature = await agent.signMessage({ message: text });
    const envelope = bytesToHex(new Uint8Array(120).fill(7));
    const guest = deriveGuestKeyPair({ signature, escrow: ESCROW, sender: agent.address, envelope: new Uint8Array(120).fill(7), chainId: XLAYER_CHAIN_ID });
    const replyFrom = '0x670B5c500a57d18F154e281fe6630cA694ABa9D1';
    const expectedReplyRef = `0x${'ab'.repeat(32)}` as const;
    // what the recipient's browser does in reply(): to = escrow endpoint, from = member container, ref = expectedReplyRef
    const payload = seal({ to: escrowEndpoint(ESCROW, XLAYER_CHAIN_ID), from: endpointHex(replyFrom, XLAYER_CHAIN_ID), hub: XLAYER.deWebHub, ref: expectedReplyRef, chainId: XLAYER_CHAIN_ID, content: encodeContent({ body: 'Happy to chat, ping me Tuesday.', ts: 1 }), recipients: [guest.publicKey] });
    const c = openAgentReply({ signature, sender: agent.address, envelope, replyPayload: bytesToHex(payload), expectedReplyRef, replyFrom });
    expect(c.body).toBe('Happy to chat, ping me Tuesday.');
    const other = await privateKeyToAccount(generatePrivateKey()).signMessage({ message: text });
    expect(() => openAgentReply({ signature: other, sender: agent.address, envelope, replyPayload: bytesToHex(payload), expectedReplyRef, replyFrom })).toThrow();
  });
});
