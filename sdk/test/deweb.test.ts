import { sha256 } from '@noble/hashes/sha2.js';
import { toHex } from 'viem';
import { describe, expect, it } from 'vitest';
import { CHUNK_MAX, XLAYER, buildManifest, chunkFile, planPublish, sitePath } from '../src/index.js';

describe('DeWEB chunker and publish plan', () => {
  const big = new Uint8Array(CHUNK_MAX * 2 + 5).fill(7);
  const html = new TextEncoder().encode('<!doctype html><title>Voxro</title>');
  it('splits at 24,000 bytes and hashes the whole file', () => {
    const f = chunkFile({ path: '/app.js', data: big });
    expect(f.chunks.map((c) => c.length)).toEqual([CHUNK_MAX, CHUNK_MAX, 5]);
    expect(f.sha256).toBe(toHex(sha256(big)));
    expect(f.contentType).toBe('text/javascript; charset=utf-8');
  });
  it('plans putFile → appendChunk… → setFallback in order', () => {
    const files = [chunkFile({ path: '/index.html', data: html }), chunkFile({ path: '/app.js', data: big })];
    const container = '0x00000000000000000000000000000000000000c0';
    const plan = planPublish(container, files, { fallback: '/index.html' });
    expect(plan.registry).toBe(XLAYER.siteRegistry);
    expect(plan.calls.map((c) => c.functionName)).toEqual(['putFile', 'putFile', 'appendChunk', 'appendChunk', 'setFallback']);
    expect(plan.calls[2]).toMatchObject({ functionName: 'appendChunk', args: [container, 'app.js', 1n, expect.any(String)] });
    expect(plan.manifest.totalChunks).toBe(4);
    expect(plan.manifest.files.map((f) => f.path)).toEqual(['app.js', 'index.html']);
    expect(buildManifest(files).root).toBe(plan.manifest.root);
    expect(plan.calls.at(-1)).toEqual({ functionName: 'setFallback', args: [container, 'index.html'] });
  });
  it('stores paths the way TAP-10 §7.2 shells look them up (no leading slash)', () => {
    // TAP-10 test vector: 4246.0.tape lists only `index.html`, fallback `index.html`.
    expect(sitePath('/index.html')).toBe('index.html');
    expect(sitePath('index.html')).toBe('index.html');
    expect(sitePath('//docs//a.css')).toBe('docs/a.css');
    expect(chunkFile({ path: '/index.html', data: html }).path).toBe('index.html');
    for (const bad of ['', '/', 'docs/', '../x', 'a/./b', 'a\u0001b']) expect(() => sitePath(bad)).toThrow(RangeError);
  });
});
