/** 24,000-byte chunking, SHA-256 manifest and the `SiteRegistry` call plan for a DeWEB site. */
import { sha256 } from '@noble/hashes/sha2.js';
import { XLAYER } from '../tapeout/addresses.js';
import type { Address } from '../tapeout/netlist.js';
import { bytesToHex } from '../tapeout/pack.js';

export const CHUNK_MAX = 24_000;
export const MAX_CHUNKS = 350;
export const MAX_FILE_BYTES = CHUNK_MAX * MAX_CHUNKS;

export interface SiteFile {
  /** Served path, e.g. `/index.html`. */
  path: string;
  contentType?: string;
  data: Uint8Array;
}

export interface ChunkedFile {
  path: string;
  contentType: string;
  sha256: `0x${string}`;
  size: number;
  chunks: Uint8Array[];
}

export interface SiteManifest {
  version: 1;
  files: Array<{ path: string; contentType: string; sha256: `0x${string}`; size: number; chunks: number }>;
  totalBytes: number;
  totalChunks: number;
  /** SHA-256 over the canonical JSON of `files`. */
  root: `0x${string}`;
}

const TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  json: 'application/json',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  ico: 'image/x-icon',
  txt: 'text/plain; charset=utf-8',
  woff2: 'font/woff2',
  wasm: 'application/wasm',
};

export function contentTypeFor(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return TYPES[ext] ?? 'application/octet-stream';
}

export function chunkFile(f: SiteFile, chunkMax = CHUNK_MAX): ChunkedFile {
  if (!f.path.startsWith('/')) throw new RangeError(`path must start with "/": ${f.path}`);
  if (f.data.length === 0) throw new RangeError(`empty file: ${f.path}`);
  if (f.data.length > chunkMax * MAX_CHUNKS) throw new RangeError(`${f.path} is ${f.data.length} bytes; max ${chunkMax * MAX_CHUNKS}`);
  const chunks: Uint8Array[] = [];
  for (let o = 0; o < f.data.length; o += chunkMax) chunks.push(f.data.slice(o, o + chunkMax));
  return { path: f.path, contentType: f.contentType ?? contentTypeFor(f.path), sha256: bytesToHex(sha256(f.data)), size: f.data.length, chunks };
}

export function buildManifest(files: readonly ChunkedFile[]): SiteManifest {
  const list = [...files]
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((f) => ({ path: f.path, contentType: f.contentType, sha256: f.sha256, size: f.size, chunks: f.chunks.length }));
  const canonical = new TextEncoder().encode(JSON.stringify(list));
  return {
    version: 1,
    files: list,
    totalBytes: list.reduce((a, f) => a + f.size, 0),
    totalChunks: list.reduce((a, f) => a + f.chunks, 0),
    root: bytesToHex(sha256(canonical)),
  };
}

export type RegistryCall =
  | { functionName: 'putFile'; args: readonly [Address, string, string, `0x${string}`, `0x${string}`] }
  | { functionName: 'appendChunk'; args: readonly [Address, string, bigint, `0x${string}`] }
  | { functionName: 'setFallback'; args: readonly [Address, string] };

export interface PublishPlan {
  registry: Address;
  container: Address;
  calls: RegistryCall[];
  manifest: SiteManifest;
}

/** Ordered `SiteRegistry` calls that publish `files` into `container` (one transaction per call, gas only). */
export function planPublish(container: Address, files: readonly ChunkedFile[], opts: { fallback?: string; registry?: Address } = {}): PublishPlan {
  const calls: RegistryCall[] = [];
  for (const f of files) {
    const [first, ...rest] = f.chunks;
    if (!first) continue;
    calls.push({ functionName: 'putFile', args: [container, f.path, f.contentType, f.sha256, bytesToHex(first)] });
    rest.forEach((chunk, k) => calls.push({ functionName: 'appendChunk', args: [container, f.path, BigInt(k + 1), bytesToHex(chunk)] }));
  }
  if (opts.fallback) calls.push({ functionName: 'setFallback', args: [container, opts.fallback] });
  return { registry: opts.registry ?? XLAYER.siteRegistry, container, calls, manifest: buildManifest(files) };
}
