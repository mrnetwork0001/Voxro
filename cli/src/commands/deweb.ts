import { bindDomain, chunkFile, planPublish, publishSite, type Address, type ChunkedFile } from '@voxro/sdk';
import { createWalletClient, http, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { xLayer } from 'viem/chains';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { CliError, bold, client, dim, green, isAddress, rpcUrl, str, table, type Flags } from '../util.js';

function walk(dir: string, root = dir): ChunkedFile[] {
  const out: ChunkedFile[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, root));
    else out.push(chunkFile({ path: '/' + relative(root, p).split(sep).join('/'), data: new Uint8Array(readFileSync(p)) }));
  }
  return out;
}

export async function deweb(f: Flags): Promise<void> {
  if (f._[1] === 'publish') return publish(f);
  if (f._[1] !== 'plan' || !f._[2]) throw new CliError('usage: voxro deweb plan|publish <dir> [--container 0x..] [--fallback /index.html] [--bind <#id>.2.<cpu>.tape] [--json]');
  const container = (str(f, 'container') ?? '0x0000000000000000000000000000000000000000') as Address;
  if (!isAddress(container)) throw new CliError('--container must be an address');
  const files = walk(f._[2]);
  const plan = planPublish(container, files, { fallback: str(f, 'fallback') ?? '/index.html' });
  if (f.json) {
    console.log(JSON.stringify({ ...plan, calls: plan.calls.map((c) => ({ functionName: c.functionName, args: c.args.map((a) => (typeof a === 'bigint' ? a.toString() : typeof a === 'string' && a.length > 80 ? `${a.slice(0, 18)}…(${(a.length - 2) / 2} B)` : a)) })) }, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
    return;
  }
  console.log(bold(`DeWEB publish plan`) + dim(`  registry ${plan.registry}  container ${container}`));
  console.log(table(plan.manifest.files.map((x) => ({ path: x.path, type: x.contentType, bytes: x.size, chunks: x.chunks, sha256: x.sha256 }))));
  console.log(`\n${plan.manifest.files.length} files · ${plan.manifest.totalBytes.toLocaleString()} B · ${plan.manifest.totalChunks} chunks · manifest root ${plan.manifest.root}\n`);
  plan.calls.forEach((c, i) => {
    const a = c.args as readonly unknown[];
    const size = c.functionName === 'putFile' ? (String(a[4]).length - 2) / 2 : c.functionName === 'appendChunk' ? (String(a[3]).length - 2) / 2 : 0;
    console.log(`  ${String(i + 1).padStart(3)}. SiteRegistry.${c.functionName}(${c.functionName === 'putFile' ? `"${a[1]}", "${a[2]}", ${String(a[3]).slice(0, 12)}…, ${size} B` : c.functionName === 'appendChunk' ? `"${a[1]}", ${String(a[2])}, ${size} B` : `"${a[1]}"`})`);
  });
}


/** voxro deweb publish <dir> --container 0x.. [--fallback /index.html] [--bind name] — putFile/appendChunk/setFallback from the holder's wallet, then DomainBinding.bind. */
async function publish(f: Flags): Promise<void> {
  const dir = f._[2];
  const container = str(f, 'container');
  if (!dir || !container || !isAddress(container)) throw new CliError('usage: voxro deweb publish <dir> --container 0x.. [--fallback /index.html] [--bind name]   (signer: VOXRO_PRIVATE_KEY = container holder)');
  const pk = process.env.VOXRO_PRIVATE_KEY;
  if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) throw new CliError('VOXRO_PRIVATE_KEY env var is required');
  const wallet = createWalletClient({ account: privateKeyToAccount(pk as Hex), chain: xLayer, transport: http(rpcUrl(f)) });
  const pc = client(f);
  const plan = planPublish(container, walk(dir), { fallback: str(f, 'fallback') ?? '/index.html' });
  console.log(bold(`publishing ${plan.manifest.files.length} files · ${plan.manifest.totalBytes.toLocaleString()} B · ${plan.calls.length} transactions`), dim(`manifest root ${plan.manifest.root}`));
  await publishSite(wallet, pc, plan, (p) => console.log(`  ${p.index + 1}/${p.total} ${p.call.functionName}(${p.call.args[1]}) ${dim(p.hash)}`));
  const name = str(f, 'bind');
  if (name) {
    const h = await bindDomain(wallet, pc, name, container);
    console.log(green(`bound ${name}`), dim(`tx ${h}`));
  }
  console.log(green('published'));
}
