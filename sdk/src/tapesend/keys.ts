/**
 * TAP-10 §4 — X25519 keys derived from a wallet signature. The secret never touches storage:
 * the same wallet re-signs the same fixed text whenever the key is needed.
 *
 * Two texts are supported:
 *  - the official TapeSend text (domain `www.tapesend.com`), byte-identical to `@tapekit/send`, so a
 *    container key published from the official app can be re-derived here if the user signs it there;
 *  - the Voxro text (domain `voxro.shieldsuite.xyz`), used when Voxro itself publishes a key, so OKX Wallet and
 *    MetaMask never show a cross-domain EIP-4361 warning. Messages sealed to either key are plain TAP-10.
 */
import { x25519 } from '@noble/curves/ed25519.js';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { XLAYER_CHAIN_ID } from '../tapeout/addresses.js';
import { TapeSendError, addressBytes, ascii, bytesToHex, checksumAddress, concat, equalBytes, hexBytes, uint256 } from './bytes.js';

const SECP256K1_N = secp256k1.Point.Fn.ORDER;
const HALF_N = SECP256K1_N >> 1n;

export const TAPESEND_KEY_DOMAIN = 'www.tapesend.com';
export const TAPESEND_KEY_ISSUED_AT = '2026-09-17T00:00:00Z';
export const VOXRO_KEY_DOMAIN = 'voxro.shieldsuite.xyz';
export const VOXRO_KEY_ISSUED_AT = '2026-11-01T00:00:00Z';

export type KeyApp = 'tapesend' | 'voxro';

export interface KeyTextParams {
  tokenId: bigint | number | string;
  cpuIndex: bigint | number | string;
  container: string;
  holder: string;
  hub: string;
  chainId?: number | bigint;
  keyIndex?: number;
}

function decimal(value: bigint | number | string, min: number, name: string): string {
  const v = BigInt(value);
  if (v < BigInt(min)) throw new TapeSendError('bad-input', `${name} must be >= ${min}`);
  return v.toString(10);
}

/** EIP-4361 text the wallet signs. All fields are fixed so the same wallet always produces the same signature. */
export function keyDerivationText(p: KeyTextParams, app: KeyApp = 'voxro'): string {
  const chainId = p.chainId ?? XLAYER_CHAIN_ID;
  const k = decimal(p.keyIndex ?? 0, 0, 'keyIndex');
  if (BigInt(k) > 65535n) throw new TapeSendError('bad-input', 'keyIndex must be <= 65535');
  const label = `#${decimal(p.tokenId, 1, 'tokenId')}@${decimal(p.cpuIndex, 0, 'cpuIndex')}`;
  const domain = app === 'tapesend' ? TAPESEND_KEY_DOMAIN : VOXRO_KEY_DOMAIN;
  const issuedAt = app === 'tapesend' ? TAPESEND_KEY_ISSUED_AT : VOXRO_KEY_ISSUED_AT;
  const statement =
    app === 'tapesend'
      ? `Create the TapeSend encryption key for ${label}. Anyone who obtains this signature can read your messages. Only sign this on ${domain} or in the official TapeSend app.`
      : `Create the Voxro inbox encryption key for ${label}. Anyone who obtains this signature can read your messages. Only sign this on ${domain}.`;
  return [
    `${domain} wants you to sign in with your Ethereum account:`,
    checksumAddress(p.holder),
    '',
    statement,
    '',
    `URI: https://${domain}`,
    'Version: 1',
    `Chain ID: ${decimal(chainId, 1, 'chainId')}`,
    `Nonce: ${app === 'tapesend' ? 'tapesendkey' : 'voxrokey'}${k}`,
    `Issued At: ${issuedAt}`,
    'Resources:',
    `- tapesend:container:${checksumAddress(p.container)}`,
    `- tapesend:hub:${checksumAddress(p.hub)}`,
    `- tapesend:key-index:${k}`,
  ].join('\n');
}

/** EIP-191 `personal_sign` message hash. */
export function personalMessageHash(text: string): Uint8Array {
  const body = ascii(text);
  return keccak_256(concat(ascii(`\x19Ethereum Signed Message:\n${body.length}`), body));
}

function splitSignature(signature: string | Uint8Array): { r: Uint8Array; s: Uint8Array; v: number } {
  const sig = typeof signature === 'string' ? hexBytes(signature, 65) : signature;
  if (!(sig instanceof Uint8Array) || sig.length !== 65) throw new TapeSendError('bad-signature', 'signature must be 65 bytes');
  const r = sig.slice(0, 32);
  const s = sig.slice(32, 64);
  let v = sig[64]!;
  if (v >= 27) v -= 27;
  if (v !== 0 && v !== 1) throw new TapeSendError('bad-signature', 'invalid recovery id');
  return { r, s, v };
}

const toBigInt = (bytes: Uint8Array): bigint => BigInt(bytesToHex(bytes));

/** Recover the (lower-case) signer address of a 65-byte signature. */
export function recoverAddress(messageHash: Uint8Array, signature: string | Uint8Array): string {
  const { r, s, v } = splitSignature(signature);
  const recovered = concat(Uint8Array.of(v), r, s);
  let pub: Uint8Array;
  try {
    pub = secp256k1.recoverPublicKey(recovered, messageHash, { prehash: false });
  } catch {
    throw new TapeSendError('bad-signature', 'signature does not recover');
  }
  const uncompressed = secp256k1.Point.fromBytes(pub).toBytes(false);
  return bytesToHex(keccak_256(uncompressed.slice(1)).slice(12));
}

/** Low-s normalised `r ‖ s` (64 bytes), the HKDF input keying material. */
export function normalizedRS(signature: string | Uint8Array): Uint8Array {
  const { r, s } = splitSignature(signature);
  let sv = toBigInt(s);
  if (sv === 0n || sv >= SECP256K1_N || toBigInt(r) === 0n || toBigInt(r) >= SECP256K1_N) {
    throw new TapeSendError('bad-signature', 'r or s out of range');
  }
  if (sv > HALF_N) sv = SECP256K1_N - sv;
  return concat(r, uint256(sv));
}

/** Two signatures over the same text must normalise to the same bytes (the wallet must sign deterministically). */
export function isDeterministic(a: string | Uint8Array, b: string | Uint8Array): boolean {
  return equalBytes(normalizedRS(a), normalizedRS(b));
}

export interface DerivedKeyPair {
  secretKey: Uint8Array;
  publicKey: Uint8Array;
  text: string;
}

/** TAP-10 §4.2: derive the X25519 key pair from the holder's signature over the key text. */
export function deriveKeyPair(p: KeyTextParams & { signature: string | Uint8Array; app?: KeyApp }): DerivedKeyPair {
  const chainId = p.chainId ?? XLAYER_CHAIN_ID;
  if (BigInt(chainId) <= 0n || BigInt(chainId) >= 1n << 64n) throw new TapeSendError('bad-input', 'chainId out of range');
  const keyIndex = p.keyIndex ?? 0;
  const text = keyDerivationText({ ...p, chainId, keyIndex }, p.app ?? 'voxro');
  const signer = recoverAddress(personalMessageHash(text), p.signature);
  if (signer !== String(p.holder).toLowerCase()) {
    throw new TapeSendError('signer-mismatch', 'the signature was not made by the holder over the key text');
  }
  const ikm = normalizedRS(p.signature);
  const endpoint = concat(new Uint8Array(4), uint256(chainId).slice(24), addressBytes(p.container));
  const info = concat(endpoint, uint256(keyIndex), addressBytes(p.hub));
  const secretKey = hkdf(sha256, ikm, ascii('TAP-10/key/v2'), info, 32);
  return { secretKey, publicKey: x25519.getPublicKey(secretKey), text };
}

/** 8-byte key fingerprint = SHA-256(public key)[0..8]. */
export function fingerprint(publicKey: Uint8Array): Uint8Array {
  return sha256(publicKey).slice(0, 8);
}

/** Fresh random X25519 key pair (guest reply keys, tests). */
export function randomKeyPair(random: (n: number) => Uint8Array): { secretKey: Uint8Array; publicKey: Uint8Array } {
  const secretKey = random(32);
  return { secretKey, publicKey: x25519.getPublicKey(secretKey) };
}
