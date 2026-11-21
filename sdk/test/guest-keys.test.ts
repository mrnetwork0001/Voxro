import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { describe, expect, it } from 'vitest';
import { bytesToHex, deriveGuestKeyPair, encodeContent, endpointHex, escrowEndpoint, guestKeyText, openPayload, seal } from '../src/index.js';

// personal_sign over the text with a fixed key (RFC 6979 → deterministic, like real wallets)
const sk = keccak_256(new TextEncoder().encode('voxro-guest-test'));
const sender = (() => {
  const pub = secp256k1.getPublicKey(sk, false).slice(1);
  return '0x' + Buffer.from(keccak_256(pub).slice(12)).toString('hex');
})();
const personalSign = (text: string) => {
  const msg = new TextEncoder().encode(text);
  const h = keccak_256(new Uint8Array([...new TextEncoder().encode(`\x19Ethereum Signed Message:\n${msg.length}`), ...msg]));
  const sig = secp256k1.sign(h, sk, { prehash: false, format: 'recovered' });
  // noble 'recovered' = [recovery, r, s]; Ethereum = r ‖ s ‖ v
  return '0x' + Buffer.from([...sig.slice(1), sig[0]! + 27]).toString('hex');
};
const ESCROW = '0x00000000000000000000000000000000000000e5';

describe('recoverable guest reply keys', () => {
  it('same wallet + same envelope → same key on any device; different envelope → different key', () => {
    const sig = personalSign(guestKeyText({ escrow: ESCROW, sender }));
    const env1 = new Uint8Array([1, 2, 3]);
    const a = deriveGuestKeyPair({ signature: sig, escrow: ESCROW, sender, envelope: env1 });
    const b = deriveGuestKeyPair({ signature: personalSign(guestKeyText({ escrow: ESCROW, sender })), escrow: ESCROW, sender, envelope: env1 });
    expect(bytesToHex(a.secretKey)).toBe(bytesToHex(b.secretKey));
    const c = deriveGuestKeyPair({ signature: sig, escrow: ESCROW, sender, envelope: new Uint8Array([9]) });
    expect(bytesToHex(c.publicKey)).not.toBe(bytesToHex(a.publicKey));
  });

  it('rejects a signature from another account', () => {
    const sig = personalSign(guestKeyText({ escrow: ESCROW, sender }));
    expect(() => deriveGuestKeyPair({ signature: sig, escrow: ESCROW, sender: '0x00000000000000000000000000000000000000aa', envelope: new Uint8Array([1]) })).toThrow();
  });

  it('a reply sealed to the derived public key opens with the re-derived secret', () => {
    const env = new Uint8Array([7, 7, 7]);
    const k = deriveGuestKeyPair({ signature: personalSign(guestKeyText({ escrow: ESCROW, sender })), escrow: ESCROW, sender, envelope: env });
    const ctx = { to: escrowEndpoint(ESCROW), from: endpointHex('0x00000000000000000000000000000000000000a1'), hub: '0xe61A9C7213a6Aa616C246a2B569e555B417b25ee' as const, ref: ('0x' + '33'.repeat(32)) as `0x${string}`, chainId: 196 };
    const content = encodeContent({ body: 'hi' });
    const payload = seal({ ...ctx, content, recipients: [k.publicKey] });
    const again = deriveGuestKeyPair({ signature: personalSign(guestKeyText({ escrow: ESCROW, sender })), escrow: ESCROW, sender, envelope: env });
    expect(openPayload({ ...ctx, payload, secretKey: again.secretKey }).content).toEqual(content);
  });
});
