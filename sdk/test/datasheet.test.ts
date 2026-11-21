import { describe, expect, it } from 'vitest';
import { renderDatasheetSvg, renderReceiptSvg } from '../src/index.js';

describe('datasheet and receipt SVGs', () => {
  it('renders a self-contained datasheet', () => {
    const svg = renderDatasheetSvg({ name: 'FounderBalancedInbox', cpu: '0x000000000000000000000000000000000000c0de', id: 4n, nIn: 6, nOut: 7, nState: 3, gateCount: 136, burn: { nand: 6, latch: 0 }, proven: { total: 512, ok: true, elapsedMs: 2.2 }, label: '4.2.404.tape' });
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
    expect(svg).toContain('FounderBalancedInbox');
    expect(svg).toContain('136');
    expect(svg).toContain('6N 0L');
    expect(svg).toContain('512 transitions verified');
    expect(svg.replaceAll('http://www.w3.org/2000/svg', '')).not.toMatch(/https?:\/\//);
    expect(svg).not.toContain('<script');
  });
  it('escapes markup in names', () => {
    const svg = renderDatasheetSvg({ name: '<b>x</b>', cpu: '0x00', id: 1, nIn: 0, nOut: 1, nState: 0, gateCount: 1, burn: { nand: 1, latch: 0 } });
    expect(svg).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(svg).toContain('not proven');
  });
  it('renders a receipt with checks and settlement', () => {
    const svg = renderReceiptSvg({
      ticketId: 7,
      handle: 'whitehat.audit',
      lane: 'guest',
      sender: '0x00000000000000000000000000000000000a11ce',
      amount: '25 USDT',
      createdAt: '2026-11-02 10:00:00 UTC',
      deadline: '2026-11-09 10:00:00 UTC',
      replyTargetEndpoint: '0x' + '00'.repeat(32),
      expectedReplyRef: '0x' + '11'.repeat(32),
      envelopeDigest: '0x' + '22'.repeat(32),
      reply: { inboxIndex: 3, from: '0x' + 'ab'.repeat(20), timestamp: '2026-11-02 12:00:00 UTC', digest: '0x' + '33'.repeat(32) },
      checks: [{ label: 'from', ok: true }, { label: 'time', ok: true }, { label: 'digest', ok: false }],
      settlement: { kind: 'claimed', at: 'now', paid: '23.75 USDT', fee: '1.25 USDT' },
    });
    expect(svg).toContain('Ticket #7');
    expect(svg).toContain('whitehat.audit');
    expect(svg).toContain('CLAIMED');
    expect(svg).toContain('✗');
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
  });
});
