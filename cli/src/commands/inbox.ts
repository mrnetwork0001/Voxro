import {
  XLAYER,
  ZERO_REF,
  bytes32ToHandle,
  bytesToHex,
  deWebHubAbi,
  decodeContent,
  deriveKeyPair,
  digestOf,
  encodeContent,
  endpointHex,
  escrowEndpoint,
  hexToBytes,
  keyDerivationText,
  openPayload,
  seal,
  voxroEscrowAbi,
  voxroLensAbi,
  type Address,
} from '@voxro/sdk';
import { createWalletClient, formatUnits, http, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { xLayer } from 'viem/chains';
import { CliError, bold, client, cyan, dim, green, isAddress, num, red, rpcUrl, str, yellow, type Flags } from '../util.js';

const STATUS = ['pending', 'claimed', 'refunded', 'declined'];

function escrowAddr(f: Flags): Address {
  const a = str(f, 'escrow') ?? process.env.VOXRO_ESCROW;
  if (!a || !isAddress(a)) throw new CliError('escrow address required: --escrow 0x… or VOXRO_ESCROW');
  return a;
}
function account() {
  const pk = process.env.VOXRO_PRIVATE_KEY;
  if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) throw new CliError('VOXRO_PRIVATE_KEY env var is required');
  return privateKeyToAccount(pk as Hex);
}
async function inboxIdOf(f: Flags, target: string): Promise<bigint> {
  if (/^\d+$/.test(target)) return BigInt(target);
  const { handleToBytes32 } = await import('@voxro/sdk');
  const id = await client(f).readContract({ address: escrowAddr(f), abi: voxroEscrowAbi, functionName: 'handleToInbox', args: [handleToBytes32(target)] });
  if (id === 0n) throw new CliError(`no inbox for ${target}`);
  return id;
}

/** Recipient key for the inbox's first member container the signer holds (derived from a signature, never stored). */
async function recipientKey(f: Flags, inboxId: bigint) {
  const pc = client(f);
  const acct = account();
  const members = await pc.readContract({ address: escrowAddr(f), abi: voxroEscrowAbi, functionName: 'memberIdsOf', args: [inboxId] });
  const cpuIndex = num(f, 'cpu-index', -1);
  for (const m of members) {
    const view = await pc.readContract({ address: XLAYER.deWebHub, abi: deWebHubAbi, functionName: 'keyFor', args: [m.circuits as Address, BigInt(m.tokenId)] });
    if (view.current.toLowerCase() !== acct.address.toLowerCase()) continue;
    if (cpuIndex < 0) throw new CliError('--cpu-index <factory index of the member processor> is required to re-derive the key');
    const params = { tokenId: BigInt(m.tokenId), cpuIndex: BigInt(cpuIndex), container: view.container as Address, holder: acct.address, hub: XLAYER.deWebHub, chainId: 196, keyIndex: 0 };
    const signature = await acct.signMessage({ message: keyDerivationText(params, 'voxro') });
    const kp = deriveKeyPair({ ...params, signature, app: 'voxro' });
    if (bytesToHex(kp.publicKey) !== view.key) throw new CliError(`derived key differs from the published one (${view.key}); was it published with --app tapesend or another key index?`);
    return { member: m, container: view.container as Address, kp, acct };
  }
  throw new CliError(`signer ${acct.address} holds none of this inbox's member containers`);
}

/** voxro inbox <@handle|id> [--decrypt --cpu-index n] — tickets of an inbox, optionally decrypted by the recipient. */
export async function inbox(f: Flags): Promise<void> {
  const target = f._[1];
  if (!target) throw new CliError('usage: voxro inbox <@handle|inboxId> [--decrypt --cpu-index <n>] [--escrow 0x..]');
  const pc = client(f);
  const escrow = escrowAddr(f);
  const id = await inboxIdOf(f, target);
  const ib = await pc.readContract({ address: escrow, abi: voxroEscrowAbi, functionName: 'getInbox', args: [id] });
  const ids = await pc.readContract({ address: escrow, abi: voxroEscrowAbi, functionName: 'ticketsByInbox', args: [id] });
  const rk = f.decrypt ? await recipientKey(f, id) : null;
  console.log(bold(`@${bytes32ToHandle(ib.handle)}`), dim(`${ids.length} tickets · Q = ${Number(BigInt(ib.latchState) & 7n)}`));
  for (const tid of ids) {
    const t = await pc.readContract({ address: escrow, abi: voxroEscrowAbi, functionName: 'getTicket', args: [tid] });
    const dec = ib.paymentToken === '0x0000000000000000000000000000000000000000' ? 18 : 6;
    const left = Number(t.deadline) - Math.floor(Date.now() / 1000);
    let body = '';
    if (rk && t.status === 0) {
      try {
        const payload = hexToBytes(await pc.readContract({ address: escrow, abi: voxroEscrowAbi, functionName: 'payloadOf', args: [tid] }));
        const ctx = t.lane === 1 ? { to: endpointHex(rk.container), from: escrowEndpoint(escrow), ref: ZERO_REF } : { to: endpointHex(rk.container), from: t.replyTargetEndpoint, ref: ZERO_REF };
        const c = decodeContent(openPayload({ payload, secretKey: rk.kp.secretKey, hub: XLAYER.deWebHub, chainId: 196, ...ctx }).content);
        body = c.kind === 'message' ? `${c.subject ? bold(c.subject) + ' — ' : ''}${c.body}` : '(unsupported content)';
      } catch (e) {
        body = red(`(cannot decrypt: ${(e as Error).message})`);
      }
    }
    console.log(`  ${cyan(`#${tid}`)} ${STATUS[t.status]?.padEnd(8)} ${formatUnits(t.amount, dec).padStart(8)} from ${t.sender.slice(0, 10)}… ${t.lane === 1 ? 'guest' : 'container'} ${t.status === 0 ? (left > 0 ? `${Math.floor(left / 3600)}h left` : yellow('expired')) : ''}`);
    if (body) console.log(`      ${body}`);
  }
}

/** voxro reply <ticketId> --body "…" --cpu-index n — seal the reply, DeWebHub.send it, then claimBounty with the bytes. */
export async function reply(f: Flags): Promise<void> {
  const tid = f._[1];
  const body = str(f, 'body');
  if (!tid || !/^\d+$/.test(tid) || !body) throw new CliError('usage: voxro reply <ticketId> --body "…" --cpu-index <n> [--escrow 0x..]   (signer = member container holder)');
  const pc = client(f);
  const escrow = escrowAddr(f);
  const t = await pc.readContract({ address: escrow, abi: voxroEscrowAbi, functionName: 'getTicket', args: [BigInt(tid)] });
  if (t.status !== 0) throw new CliError(`ticket is ${STATUS[t.status]}`);
  const rk = await recipientKey(f, BigInt(t.inboxId));
  let recipientPub: Uint8Array;
  if (t.lane === 1) recipientPub = hexToBytes(t.guestReplyKey);
  else {
    const senderContainer = `0x${t.replyTargetEndpoint.slice(-40)}` as Address;
    const rec = await pc.readContract({ address: XLAYER.deWebHub, abi: deWebHubAbi, functionName: 'keyOf' as never, args: [senderContainer] as never }).catch(() => null);
    if (!rec) throw new CliError('container-lane reply needs the sender container key (keyOf)');
    recipientPub = hexToBytes((rec as { key: Hex }).key);
  }
  const payload = seal({
    content: encodeContent({ body, ts: Math.floor(Date.now() / 1000) }),
    recipients: [recipientPub],
    to: t.replyTargetEndpoint,
    from: endpointHex(rk.container),
    hub: XLAYER.deWebHub,
    ref: t.expectedReplyRef,
    chainId: 196,
  });
  const wc = createWalletClient({ account: rk.acct, chain: xLayer, transport: http(rpcUrl(f)) });
  const h1 = await wc.writeContract({ address: XLAYER.deWebHub, abi: deWebHubAbi, functionName: 'send', args: [rk.member.circuits as Address, BigInt(rk.member.tokenId), t.replyTargetEndpoint, t.expectedReplyRef, bytesToHex(payload)] });
  await pc.waitForTransactionReceipt({ hash: h1 });
  const count = await pc.readContract({ address: XLAYER.deWebHub, abi: deWebHubAbi, functionName: 'inboxCount', args: [t.replyTargetEndpoint] });
  const idx = count - 1n;
  const entry = await pc.readContract({ address: XLAYER.deWebHub, abi: deWebHubAbi, functionName: 'inboxAt', args: [t.replyTargetEndpoint, idx] });
  if (entry.digest !== digestOf(t.expectedReplyRef, payload)) throw new CliError('hub digest mismatch after send');
  console.log(green('1/2 reply recorded'), dim(`DeWebHub.send tx ${h1} · inboxIndex ${idx}`));
  const h2 = await wc.writeContract({ address: escrow, abi: voxroEscrowAbi, functionName: 'claimBounty', args: [BigInt(tid), idx, bytesToHex(payload)] });
  const r = await pc.waitForTransactionReceipt({ hash: h2 });
  if (r.status !== 'success') throw new CliError(`claimBounty reverted: ${h2}`);
  console.log(green('2/2 bounty claimed'), dim(`tx ${h2}`));
}

/** voxro read <ticketId> --secret 0x… — the sender decrypts the stored reply with the guest reply secret. */
export async function read(f: Flags): Promise<void> {
  const tid = f._[1];
  const secret = str(f, 'secret');
  if (!tid || !secret) throw new CliError('usage: voxro read <ticketId> --secret 0x<guest reply secret> [--escrow 0x..]');
  const pc = client(f);
  const escrow = escrowAddr(f);
  const t = await pc.readContract({ address: escrow, abi: voxroEscrowAbi, functionName: 'getTicket', args: [BigInt(tid)] });
  const payload = hexToBytes(await pc.readContract({ address: escrow, abi: voxroEscrowAbi, functionName: 'replyPayloadOf', args: [BigInt(tid)] }));
  if (payload.length === 0) throw new CliError('no reply stored yet');
  const from = endpointHex(t.replyFrom);
  const c = decodeContent(openPayload({ payload, secretKey: hexToBytes(secret), to: t.replyTargetEndpoint, from, hub: XLAYER.deWebHub, ref: t.expectedReplyRef, chainId: 196 }).content);
  console.log(bold(`reply to #${tid}`), dim(`from ${t.replyFrom} at ${new Date(Number(t.replyTimestamp) * 1000).toISOString()}`));
  console.log(c.kind === 'message' ? c.body : JSON.stringify(c));
}

/** voxro refund <ticketId> — refundExpired (anyone after the deadline; 0.1 % keeper tip if not the sender). */
export async function refund(f: Flags): Promise<void> {
  const tid = f._[1];
  if (!tid) throw new CliError('usage: voxro refund <ticketId> [--escrow 0x..]   (signer: VOXRO_PRIVATE_KEY)');
  const wc = createWalletClient({ account: account(), chain: xLayer, transport: http(rpcUrl(f)) });
  const h = await wc.writeContract({ address: escrowAddr(f), abi: voxroEscrowAbi, functionName: 'refundExpired', args: [BigInt(tid)] });
  const r = await client(f).waitForTransactionReceipt({ hash: h });
  console.log(r.status === 'success' ? green('refunded') : red('reverted'), dim(`tx ${h}`));
}

export async function receipt(f: Flags): Promise<void> {
  const tid = f._[1];
  const lens = str(f, 'lens') ?? process.env.VOXRO_LENS;
  if (!tid || !lens || !isAddress(lens)) throw new CliError('usage: voxro receipt <ticketId> --lens 0x.. (or VOXRO_LENS)');
  const r = await client(f).readContract({ address: lens, abi: voxroLensAbi, functionName: 'receipt', args: [BigInt(tid)] });
  console.log(bold(`receipt #${tid}`), `@${bytes32ToHandle(r.handle)} · ${STATUS[r.ticket.status]} · settled ${r.settled}`);
  console.log(`  createdAt ${new Date(Number(r.ticket.createdAt) * 1000).toISOString()} · deadline ${new Date(Number(r.ticket.deadline) * 1000).toISOString()}`);
  console.log(`  expectedReplyRef ${r.ticket.expectedReplyRef}`);
  if (r.settled) {
    console.log(`  reply from ${r.reply.from} at ${new Date(Number(r.reply.timestamp) * 1000).toISOString()} digest ${r.reply.digest}`);
    for (const c of r.checks) if (c.label) console.log(`  ${c.ok ? green('✓') : red('✗')} ${c.label}`);
  }
}
