import { XLAYER, factoryAbi, type Address } from '@voxro/sdk';
import { createPublicClient, http, type PublicClient } from 'viem';
import { xLayer } from 'viem/chains';

const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code: number) => (s: string) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
export const bold = c(1);
export const dim = c(2);
export const red = c(31);
export const green = c(32);
export const yellow = c(33);
export const cyan = c(36);

export class CliError extends Error {}

export interface Flags {
  _: string[];
  [k: string]: string | boolean | string[] | undefined;
}

/** Tiny argv parser: `--k v`, `--k=v`, `--flag`, positionals in `_`. */
export function parseArgs(argv: string[]): Flags {
  const out: Flags = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) out[a.slice(2, eq)] = a.slice(eq + 1);
      else if (i + 1 < argv.length && !argv[i + 1]!.startsWith('--')) out[a.slice(2)] = argv[++i]!;
      else out[a.slice(2)] = true;
    } else out._.push(a);
  }
  return out;
}

export const str = (f: Flags, k: string, d?: string): string | undefined => (typeof f[k] === 'string' ? (f[k] as string) : d);
export const num = (f: Flags, k: string, d: number): number => (typeof f[k] === 'string' ? Number(f[k]) : d);

export function rpcUrl(f: Flags): string {
  return str(f, 'rpc') ?? process.env.VOXRO_RPC ?? XLAYER.rpcUrls[0]!;
}

export function client(f: Flags): PublicClient {
  return createPublicClient({ chain: xLayer, transport: http(rpcUrl(f), { timeout: 30_000, retryCount: 2 }), batch: { multicall: true } });
}

export interface CircuitRef {
  cpuIndex?: number;
  cpu?: Address;
  id: bigint;
}

const ADDR = /^0x[0-9a-fA-F]{40}$/;

/** `#id@2.cpu`, `id.2.cpu.tape`, `id@cpu`, or `<0xcpu>:<id>`. */
export function parseRef(s: string): CircuitRef {
  const t = s.trim();
  let m = /^#?(\d+)@(\d+)\.(\d+)$/.exec(t);
  if (m) return { id: BigInt(m[1]!), cpuIndex: Number(m[3]) };
  m = /^(\d+)\.(\d+)\.(\d+)\.tape$/.exec(t);
  if (m) return { id: BigInt(m[1]!), cpuIndex: Number(m[3]) };
  m = /^#?(\d+)@(\d+)$/.exec(t);
  if (m) return { id: BigInt(m[1]!), cpuIndex: Number(m[2]) };
  m = /^(0x[0-9a-fA-F]{40}):(\d+)$/.exec(t);
  if (m) return { id: BigInt(m[2]!), cpu: m[1] as Address };
  throw new CliError(`cannot parse circuit ref "${s}" (use #id@2.cpu, id.2.cpu.tape or 0xcpu:id)`);
}

export async function resolveCpu(pc: PublicClient, ref: CircuitRef): Promise<Address> {
  if (ref.cpu) return ref.cpu;
  const a = await pc.readContract({ address: XLAYER.factory, abi: factoryAbi, functionName: 'cpuAt', args: [BigInt(ref.cpuIndex!)] });
  return a as Address;
}

export const isAddress = (s: string): s is Address => ADDR.test(s);

export function table(rows: Array<Record<string, string | number | bigint>>): string {
  if (rows.length === 0) return '';
  const keys = Object.keys(rows[0]!);
  const cells = rows.map((r) => keys.map((k) => String(r[k] ?? '')));
  const w = keys.map((k, i) => Math.max(k.length, ...cells.map((r) => r[i]!.length)));
  const line = (r: string[]) => r.map((v, i) => (/^[\d.,-]+$/.test(v) ? v.padStart(w[i]!) : v.padEnd(w[i]!))).join('  ');
  return [bold(line(keys)), dim(w.map((n) => '-'.repeat(n)).join('  ')), ...cells.map(line)].join('\n');
}

export function progress(done: number, total: number, width = 32): string {
  const f = total ? done / total : 1;
  const n = Math.round(f * width);
  return `[${'#'.repeat(n)}${'.'.repeat(width - n)}] ${done}/${total}`;
}

export const fmtMs = (ms: number) => (ms < 1000 ? `${ms.toFixed(0)} ms` : `${(ms / 1000).toFixed(1)} s`);
