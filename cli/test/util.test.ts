import { describe, expect, it } from 'vitest';
import { parseArgs, parseRef, progress, table } from '../src/util.js';

describe('parseRef', () => {
  it('accepts the three reference forms', () => {
    expect(parseRef('#4@2.404')).toEqual({ id: 4n, cpuIndex: 404 });
    expect(parseRef('4.2.404.tape')).toEqual({ id: 4n, cpuIndex: 404 });
    expect(parseRef('12@7')).toEqual({ id: 12n, cpuIndex: 7 });
    expect(parseRef('0x1f09DAeFA827f02CBb40967cc91b259763760761:3')).toEqual({ id: 3n, cpu: '0x1f09DAeFA827f02CBb40967cc91b259763760761' });
  });
  it('rejects garbage', () => {
    expect(() => parseRef('hello')).toThrow(/cannot parse/);
    expect(() => parseRef('0x1234:1')).toThrow();
  });
});

describe('parseArgs', () => {
  it('handles --k v, --k=v, flags and positionals', () => {
    expect(parseArgs(['prove', '#1@2.0', '--table', '--chunk', '64', '--rpc=http://x'])).toEqual({ _: ['prove', '#1@2.0'], table: true, chunk: '64', rpc: 'http://x' });
  });
});

describe('formatting', () => {
  it('progress bar and table are stable', () => {
    expect(progress(5, 10, 10)).toBe('[#####.....] 5/10');
    const t = table([{ a: 'x', n: 12 }, { a: 'yy', n: 3 }]).split('\n');
    expect(t).toHaveLength(4);
    expect(t[2]).toMatch(/^x\s+12$/);
    expect(t[3]).toMatch(/^yy\s+ 3$/);
  });
});
