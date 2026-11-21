/**
 * TAP-14 subset against the official vectors (TapeOutProtocol/TAPs assets/tap-14, CC0):
 * inbox room, sealed inbox wire (0x03) byte-for-byte, its negative cases, the ChannelKeys
 * EIP-712 digest, inbox normalisation hashes and the holder signature.
 */
import { readFileSync } from 'node:fs';
import { privateKeyToAccount } from 'viem/accounts';
import { describe, expect, it } from 'vitest';
import { bytesToHex, channel, endpointHex, hexToBytes } from '../src/index.js';

const inbox = JSON.parse(readFileSync(new URL('./vectors/tap-14/inbox.json', import.meta.url), 'utf8'));
const keys = JSON.parse(readFileSync(new URL('./vectors/tap-14/channel-keys.json', import.meta.url), 'utf8'));
const bare = (h: string) => h.replace(/^0x/, '').toLowerCase();

describe('TAP-14 inbox room + sealed inbox wire (§6.1)', () => {
  const R = hexToBytes(`0x${inbox.recipient.staticPublic}`);
  const room = channel.inboxRoom(inbox.recipient.container, inbox.recipient.chainId);

  it('endpoint and inbox room match the vectors', () => {
    expect(bare(endpointHex(inbox.recipient.container, inbox.recipient.chainId))).toBe(inbox.expected.endpoint);
    expect(bare(bytesToHex(room))).toBe(inbox.expected.inboxRoom);
  });

  it('seals the invite to exactly the vector wire', () => {
    const queue = [hexToBytes(`0x${inbox.ephemeralSecret}`), hexToBytes(`0x${inbox.nonce}`)];
    const wire = channel.sealInboxWire({ recipientKey: R, room, message: inbox.invite, random: () => queue.shift()! });
    expect(wire.length).toBe(inbox.expected.wireLength);
    expect(bare(bytesToHex(wire))).toBe(inbox.expected.wire);
  });

  it('opens the vector wire with the recipient key and returns the invite', () => {
    const m = channel.openInboxWire({ secretKey: hexToBytes(`0x${inbox.recipient.staticSecret}`), room, wire: hexToBytes(`0x${inbox.expected.wire}`) });
    expect(m).toEqual(inbox.invite);
  });

  it('rejects the negative cases: other container, other chain, wrong key, tampered byte', () => {
    const wire = hexToBytes(`0x${inbox.expected.wire}`);
    const sk = hexToBytes(`0x${inbox.recipient.staticSecret}`);
    expect(() => channel.openInboxWire({ secretKey: sk, room: channel.inboxRoom('0x0000000000000000000000000000000000000B0C', inbox.recipient.chainId), wire })).toThrow();
    expect(() => channel.openInboxWire({ secretKey: sk, room: channel.inboxRoom(inbox.recipient.container, 8453), wire })).toThrow();
    expect(() => channel.openInboxWire({ secretKey: hexToBytes(`0x${'11'.repeat(32)}`), room, wire })).toThrow();
    const flipped = wire.slice();
    flipped[flipped.length - 1] ^= 1;
    expect(() => channel.openInboxWire({ secretKey: sk, room, wire: flipped })).toThrow();
  });
});

describe('TAP-14 channel key record (§3)', () => {
  const { sig: _sig, tapechannel: _t, ...unsigned } = keys.record;

  it('canonical JSON of the record matches the vector', () => {
    expect(channel.canonicalJSON(keys.record)).toBe(keys.recordCanonicalJSON);
  });

  it('inbox normalisation hashes match every vector', () => {
    for (const n of keys.inboxNormalisation) expect(channel.channelInboxHash(n.inbox)).toBe(n.inboxHash);
    expect(channel.channelInboxHash(keys.record.inbox)).toBe(keys.expected.inboxHash);
  });

  it('EIP-712 ChannelKeys digest matches; the holder key reproduces the vector signature', async () => {
    expect(channel.channelKeysDigest(unsigned)).toBe(keys.expected.digest);
    const holder = privateKeyToAccount(keys.holderKey);
    expect(holder.address).toBe(keys.holderAddress);
    const sig = await holder.signTypedData(channel.channelKeysTypedData(unsigned));
    expect(sig).toBe(keys.expected.sig);
  });

  it('verifyChannelRecord accepts the vector record for its holder and rejects anyone else', async () => {
    const text = JSON.stringify(keys.record);
    const at = { container: keys.record.container, chainId: keys.record.chainId, now: keys.record.issued + 10 };
    const r = await channel.verifyChannelRecord(text, { ...at, holder: keys.holderAddress });
    expect(r.x25519).toBe(keys.record.x25519);
    await expect(channel.verifyChannelRecord(text, { ...at, holder: '0x00000000000000000000000000000000000000aa' })).rejects.toThrow();
    await expect(channel.verifyChannelRecord(text, { ...at, holder: keys.holderAddress, now: keys.record.expires + 1 })).rejects.toThrow();
  });

  it('strict JSON rejects repeated and forbidden member names', () => {
    expect(() => channel.parseStrictJSON('{"a":1,"a":2}')).toThrow();
    expect(() => channel.parseStrictJSON('{"__proto__":{}}')).toThrow();
    expect(channel.parseStrictJSON('{"a":[1,{"b":"x"}],"c":null}')).toEqual({ a: [1, { b: 'x' }], c: null });
  });
});
