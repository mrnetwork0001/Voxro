import { XLAYER, accountOf, endpointHex, inboxCount, inboxPage, keyFor, messageId, outboxCount, outboxPage, parseEndpoint, type Address } from '@voxro/sdk';
import { CliError, bold, client, dim, isAddress, num, table, type Flags } from '../util.js';

const ts = (t: number) => new Date(t * 1000).toISOString();

export async function hub(f: Flags): Promise<void> {
  const sub = f._[1];
  const pc = client(f);
  const hubAddr = (typeof f.hub === 'string' ? f.hub : XLAYER.deWebHub) as Address;
  if (sub === 'inbox') {
    const target = f._[2];
    if (!target) throw new CliError('usage: voxro hub inbox <0xendpoint|0xcontainer> [--start 0 --n 20]');
    const to = isAddress(target) ? endpointHex(target) : (target as `0x${string}`);
    const { chainId, container } = parseEndpoint(to);
    const count = await inboxCount(pc, to, { hub: hubAddr });
    console.log(bold(`inbox ${to}`) + dim(`  chain ${chainId} container ${container}  count ${count}`));
    const n = num(f, 'n', 20);
    const start = BigInt(num(f, 'start', Math.max(0, Number(count) - n)));
    const page = await inboxPage(pc, to, start, n, { hub: hubAddr });
    console.log(table(page.map((e, i) => ({ i: (start + BigInt(i)).toString(), from: e.from, block: e.blockNumber.toString(), time: ts(e.timestamp), digest: e.digest, messageId: messageId(XLAYER.chainId, hubAddr, to, start + BigInt(i)) }))));
    return;
  }
  if (sub === 'outbox') {
    const from = f._[2];
    if (!from || !isAddress(from)) throw new CliError('usage: voxro hub outbox <0xcontainer> [--start 0 --n 20]');
    const count = await outboxCount(pc, from, { hub: hubAddr });
    console.log(bold(`outbox ${from}`) + dim(`  count ${count}`));
    const n = num(f, 'n', 20);
    const start = BigInt(num(f, 'start', Math.max(0, Number(count) - n)));
    const page = await outboxPage(pc, from, start, n, { hub: hubAddr });
    console.log(table(page.map((e) => ({ to: e.to, inboxIndex: e.inboxIndex, block: e.blockNumber.toString(), time: ts(e.timestamp), digest: e.digest }))));
    return;
  }
  if (sub === 'key') {
    const [cpu, tokenId] = [f._[2], f._[3]];
    if (!cpu || !isAddress(cpu) || !tokenId) throw new CliError('usage: voxro hub key <0xcircuits> <tokenId>');
    const [k, acct] = await Promise.all([keyFor(pc, cpu, BigInt(tokenId), { hub: hubAddr }), accountOf(pc, cpu, BigInt(tokenId), { hub: hubAddr })]);
    console.log(bold(`keyFor(${cpu}, ${tokenId})`));
    for (const [kk, v] of Object.entries({ container: k.container, account: acct, endpoint: k.endpoint, opened: k.opened, current: k.current, usable: k.usable, suite: k.suite, keyIndex: k.keyIndex, key: k.key, version: k.version, chains: `0x${k.chains.toString(16)}` })) console.log(`  ${kk.padEnd(10)} ${String(v)}`);
    return;
  }
  if (sub === 'msgid') {
    const [to, idx] = [f._[2], f._[3]];
    if (!to || !idx) throw new CliError('usage: voxro hub msgid <0xendpoint|0xcontainer> <inboxIndex>');
    const ep = isAddress(to) ? endpointHex(to) : (to as `0x${string}`);
    console.log(messageId(XLAYER.chainId, hubAddr, ep, BigInt(idx)));
    return;
  }
  throw new CliError('usage: voxro hub <inbox|outbox|key|msgid> …');
}
