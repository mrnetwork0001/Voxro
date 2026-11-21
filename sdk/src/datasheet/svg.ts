/**
 * Self-contained SVG renderers (no external fonts or images) in Voxro's editorial style:
 * obsidian background, signal-orange accent, hairlines, large numerals.
 *  - renderDatasheetSvg: one circuit's datasheet (pins, gates, burn, proof status)
 *  - renderReceiptSvg:   a disclosure / settlement receipt for one escrow ticket
 */

const esc = (s: string) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const SANS = 'Helvetica Neue, Helvetica, Arial, PingFang SC, Noto Sans SC, sans-serif';
const BG = '#0b0c0f';
const PANEL = '#13151a';
const INK = '#ece9e1';
const INK2 = '#b7b3a8';
const INK3 = '#6f6d66';
const RULE = '#262a33';
const SIGNAL = '#ff5a2e';
const OK = '#37b06e';
const BAD = '#e5484d';

export interface DatasheetParams {
  name: string;
  cpu: string;
  id: bigint | number | string;
  nIn: number;
  nOut: number;
  nState: number;
  gateCount: number;
  burn: { nand: number; latch: number };
  proven?: { total: number; ok: boolean; elapsedMs: number };
  /** Optional line under the title, e.g. the processor name or the DeWEB name. */
  label?: string;
}

const shortAddr = (a: string) => (a.length > 14 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a);

function pinGrid(x: number, y: number, n: number, color: string, max = 16): string {
  const cells: string[] = [];
  const size = 12;
  const gap = 3;
  for (let i = 0; i < Math.min(n, max); i++) {
    cells.push(`<rect x="${x + i * (size + gap)}" y="${y}" width="${size}" height="${size}" fill="${color}" rx="1"/>`);
  }
  if (n > max) cells.push(`<text x="${x + max * (size + gap) + 4}" y="${y + 10}" font-family="${MONO}" font-size="10" fill="${INK3}">+${n - max}</text>`);
  if (n === 0) cells.push(`<text x="${x}" y="${y + 10}" font-family="${MONO}" font-size="10" fill="${INK3}">none</text>`);
  return cells.join('');
}

export function renderDatasheetSvg(p: DatasheetParams): string {
  const W = 720;
  const H = 440;
  const id = String(p.id);
  const proven = p.proven;
  const provenColor = proven ? (proven.ok ? OK : BAD) : INK3;
  const provenText = proven ? `${proven.total.toLocaleString()} transitions ${proven.ok ? 'verified' : 'MISMATCH'} · ${proven.elapsedMs.toFixed(1)} ms` : 'not proven';
  const stat = (x: number, label: string, value: string, sub: string, accent = INK) => `
  <g transform="translate(${x},232)">
    <line x1="0" y1="0" x2="150" y2="0" stroke="${INK}" stroke-width="2"/>
    <text x="0" y="22" font-family="${MONO}" font-size="10" letter-spacing="1.4" fill="${INK3}">${esc(label.toUpperCase())}</text>
    <text x="0" y="62" font-family="${SANS}" font-size="34" font-weight="600" letter-spacing="-1.2" fill="${accent}">${esc(value)}</text>
    <text x="0" y="82" font-family="${SANS}" font-size="11" fill="${INK2}">${esc(sub)}</text>
  </g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(p.name)} datasheet">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" fill="none" stroke="${RULE}"/>
  <text x="32" y="40" font-family="${MONO}" font-size="11" letter-spacing="2" fill="${SIGNAL}">VOXRO · TAPEOUT DATASHEET · X LAYER 196</text>
  <text x="32" y="86" font-family="${SANS}" font-size="38" font-weight="600" letter-spacing="-1.5" fill="${INK}">${esc(p.name)}</text>
  <text x="32" y="110" font-family="${MONO}" font-size="12" fill="${INK2}">#${esc(id)} · ${esc(shortAddr(p.cpu))}${p.label ? ` · ${esc(p.label)}` : ''}</text>
  <line x1="32" y1="128" x2="${W - 32}" y2="128" stroke="${INK}" stroke-width="1"/>
  <g transform="translate(32,146)">
    <text x="0" y="10" font-family="${MONO}" font-size="10" letter-spacing="1.4" fill="${INK3}">IN[${p.nIn}]</text>
    ${pinGrid(90, 0, p.nIn, INK2)}
    <text x="0" y="34" font-family="${MONO}" font-size="10" letter-spacing="1.4" fill="${INK3}">OUT[${p.nOut}]</text>
    ${pinGrid(90, 24, p.nOut, SIGNAL)}
    <text x="0" y="58" font-family="${MONO}" font-size="10" letter-spacing="1.4" fill="${INK3}">STATE[${p.nState}]</text>
    ${pinGrid(90, 48, p.nState, OK)}
  </g>
  ${stat(32, 'gateCount', String(p.gateCount), 'NAND + LATCH incl. REF')}
  ${stat(202, 'burn', `${p.burn.nand}N ${p.burn.latch}L`, 'top-level transistors', SIGNAL)}
  ${stat(372, 'pins', `${p.nIn}/${p.nOut}/${p.nState}`, 'nIn / nOut / nState')}
  ${stat(542, 'kind', p.nState ? 'step()' : 'eval()', p.nState ? 'sequential' : 'combinational')}
  <rect x="32" y="${H - 72}" width="${W - 64}" height="40" fill="${PANEL}" stroke="${RULE}"/>
  <circle cx="52" cy="${H - 52}" r="5" fill="${provenColor}"/>
  <text x="66" y="${H - 48}" font-family="${MONO}" font-size="12" fill="${INK}">${esc(provenText)}</text>
  <text x="${W - 40}" y="${H - 48}" text-anchor="end" font-family="${MONO}" font-size="10" fill="${INK3}">TAP-02 · exhaustive prover</text>
</svg>`;
}

export interface ReceiptParams {
  ticketId: bigint | number | string;
  handle: string;
  lane: 'container' | 'guest';
  sender: string;
  amount: string;
  createdAt: string;
  deadline: string;
  replyTargetEndpoint: string;
  expectedReplyRef: string;
  envelopeDigest: string;
  reply?: { inboxIndex: number; from: string; timestamp: string; digest: string };
  checks?: Array<{ label: string; ok: boolean }>;
  settlement?: { kind: 'claimed' | 'refunded' | 'pending'; at?: string; paid?: string; fee?: string };
  chainLabel?: string;
}

export function renderReceiptSvg(p: ReceiptParams): string {
  const W = 720;
  const rows: Array<[string, string]> = [
    ['ticket', `#${p.ticketId} · @${p.handle} · ${p.lane === 'guest' ? 'Guest Express' : 'Container lane'}`],
    ['sender', p.sender],
    ['locked', `${p.amount} · ${p.createdAt}`],
    ['deadline', p.deadline],
    ['reply target', p.replyTargetEndpoint],
    ['expected ref', p.expectedReplyRef],
    ['envelope digest', p.envelopeDigest],
  ];
  if (p.reply) {
    rows.push(['reply entry', `inboxAt(target, ${p.reply.inboxIndex}) · from ${p.reply.from}`]);
    rows.push(['reply time', p.reply.timestamp]);
    rows.push(['reply digest', p.reply.digest]);
  }
  const checks = p.checks ?? [];
  const settle = p.settlement;
  const settleText = !settle || settle.kind === 'pending' ? 'PENDING' : settle.kind === 'claimed' ? `CLAIMED · ${settle.paid ?? ''} paid · ${settle.fee ?? ''} fee · ${settle.at ?? ''}` : `REFUNDED 100% · ${settle.at ?? ''}`;
  const settleColor = !settle || settle.kind === 'pending' ? INK3 : settle.kind === 'claimed' ? OK : INK2;
  const rowH = 22;
  const top = 128;
  const checksTop = top + rows.length * rowH + 24;
  const H = checksTop + checks.length * 22 + 96;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Voxro receipt ${esc(String(p.ticketId))}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" fill="none" stroke="${RULE}"/>
  <text x="32" y="40" font-family="${MONO}" font-size="11" letter-spacing="2" fill="${SIGNAL}">VOXRO · DISCLOSURE &amp; SETTLEMENT RECEIPT · ${esc(p.chainLabel ?? 'X LAYER 196')}</text>
  <text x="32" y="84" font-family="${SANS}" font-size="34" font-weight="600" letter-spacing="-1.4" fill="${INK}">Ticket #${esc(String(p.ticketId))}</text>
  <line x1="32" y1="104" x2="${W - 32}" y2="104" stroke="${INK}"/>
  ${rows
    .map(
      ([k, v], i) => `<text x="32" y="${top + i * rowH}" font-family="${MONO}" font-size="10" letter-spacing="1.2" fill="${INK3}">${esc(k.toUpperCase())}</text>
  <text x="190" y="${top + i * rowH}" font-family="${MONO}" font-size="11.5" fill="${INK}">${esc(v)}</text>`,
    )
    .join('\n  ')}
  <line x1="32" y1="${checksTop - 14}" x2="${W - 32}" y2="${checksTop - 14}" stroke="${RULE}"/>
  <text x="32" y="${checksTop}" font-family="${MONO}" font-size="10" letter-spacing="1.4" fill="${INK3}">CLAIMBOUNTY CHECKS</text>
  ${checks
    .map(
      (c, i) => `<text x="32" y="${checksTop + 22 + i * 22}" font-family="${MONO}" font-size="12" fill="${c.ok ? OK : BAD}">${c.ok ? '✓' : '✗'}</text>
  <text x="52" y="${checksTop + 22 + i * 22}" font-family="${MONO}" font-size="11.5" fill="${INK}">${esc(c.label)}</text>`,
    )
    .join('\n  ')}
  <rect x="32" y="${H - 64}" width="${W - 64}" height="36" fill="${PANEL}" stroke="${RULE}"/>
  <circle cx="52" cy="${H - 46}" r="5" fill="${settleColor}"/>
  <text x="66" y="${H - 42}" font-family="${MONO}" font-size="12" fill="${INK}">${esc(settleText)}</text>
</svg>`;
}
