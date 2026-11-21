import { renderReceiptSvg } from '@voxro/sdk';
import { useMemo } from 'react';
import { Addr, Badge, Button, Note, Panel } from '../components/ui.tsx';
import { fmtMoney, fmtTime } from '../format.ts';
import { useI18n } from '../i18n.tsx';
import { href } from '../router.ts';
import { buildReceipt, type Receipt as ReceiptData } from '../sim/receipt.ts';
import { backend, useInboxState } from '../backend.ts';
import { LAUNCHED } from '../config.ts';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function receiptSvg(r: ReceiptData, labels: { from: string; time: string; digest: string }): string {
  const t = r.ticket;
  return renderReceiptSvg({
    ticketId: t.id,
    handle: r.inbox.handle,
    lane: t.lane,
    sender: t.sender,
    amount: fmtMoney(t.token, t.amount),
    createdAt: fmtTime(t.createdAt),
    deadline: fmtTime(t.deadline),
    replyTargetEndpoint: t.replyTargetEndpoint,
    expectedReplyRef: t.expectedReplyRef,
    envelopeDigest: r.envelopeDigest,
    ...(t.reply && r.entry ? { reply: { inboxIndex: t.reply.inboxIndex, from: r.entry.from, timestamp: fmtTime(r.entry.timestamp), digest: r.entry.digest } } : {}),
    checks: r.checks.map((c) => ({ label: labels[c.key], ok: c.ok })),
    settlement: {
      kind: r.settlement.kind,
      ...(r.settlement.at ? { at: fmtTime(r.settlement.at) } : {}),
      ...(r.settlement.paid !== undefined ? { paid: fmtMoney(t.token, r.settlement.paid) } : {}),
      ...(r.settlement.fee !== undefined ? { fee: fmtMoney(t.token, r.settlement.fee) } : {}),
    },
  });
}

export function receiptHtml(r: ReceiptData, svg: string): string {
  const t = r.ticket;
  const rows: Array<[string, string]> = [
    ['Ticket', `#${t.id} · @${r.inbox.handle} · ${t.lane}`],
    ['Sender', t.sender],
    ['Amount', fmtMoney(t.token, t.amount)],
    ['Locked at', fmtTime(t.createdAt)],
    ['Deadline', fmtTime(t.deadline)],
    ['Reply target endpoint', t.replyTargetEndpoint],
    ['Expected reply ref', t.expectedReplyRef],
    ['Envelope keccak256', r.envelopeDigest],
    ['Recipient container', r.recipientContainer],
  ];
  if (t.reply && r.entry) rows.push(['Reply entry', `inboxAt(target, ${t.reply.inboxIndex}) · from ${r.entry.from} · ${fmtTime(r.entry.timestamp)} · ${r.entry.digest}`]);
  rows.push(['Settlement', r.settlement.kind + (r.settlement.at ? ` · ${fmtTime(r.settlement.at)}` : '') + (r.settlement.paid !== undefined ? ` · paid ${fmtMoney(t.token, r.settlement.paid)}` : '')]);
  return `<!doctype html><html><head><meta charset="utf-8"><title>Voxro receipt #${t.id}</title><style>body{font:14px/1.5 -apple-system,Helvetica,Arial,sans-serif;max-width:760px;margin:40px auto;padding:0 20px;color:#111}table{border-collapse:collapse;width:100%}td{padding:6px 8px;border-bottom:1px solid #ddd;vertical-align:top;font-family:ui-monospace,Menlo,monospace;font-size:12px;word-break:break-all}td:first-child{color:#666;width:200px;font-family:inherit}</style></head><body><h1>Voxro receipt #${t.id}</h1>${svg}<table>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table><p style="color:#666;font-size:12px">digest = keccak256(ref ‖ keccak256(payload)) · verified against DeWebHub storage · voxro.shieldsuite.xyz</p></body></html>`;
}

export function ReceiptPanel({ ticketId, compact }: { ticketId: number; compact?: boolean }) {
  const { t } = useI18n();
  const sim = useInboxState();
  const r = buildReceipt(sim, ticketId, backend.verifyClaim);
  const labels = { from: t('inbox.check.from'), time: t('inbox.check.time'), digest: t('inbox.check.digest') };
  const svg = useMemo(() => (r ? receiptSvg(r, labels) : ''), [r, labels.from, labels.time, labels.digest]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!r) return <Note tone="warn">{t('receipt.notFound')}</Note>;
  const tk = r.ticket;
  const dl = (name: string, data: string, type: string) => {
    const url = URL.createObjectURL(new Blob([data], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <Panel
      kicker={t('receipt.title')}
      title={`#${tk.id} · @${r.inbox.handle}`}
      right={
        <div className="row">
          <Button size="sm" onClick={() => dl(`voxro-receipt-${tk.id}.svg`, svg, 'image/svg+xml')}>{t('receipt.download.svg')}</Button>
          <Button size="sm" onClick={() => dl(`voxro-receipt-${tk.id}.html`, receiptHtml(r, svg), 'text/html')}>{t('receipt.download.html')}</Button>
          {!compact && <Button size="sm" variant="ghost" onClick={() => window.print()}>{t('receipt.print')}</Button>}
        </div>
      }
    >
      <div className="steps">
        <div>
          <div>
            <strong>{t('receipt.lock')}</strong> · {fmtTime(tk.createdAt)} · {fmtMoney(tk.token, tk.amount)} · {tk.lane === 'guest' ? t('c.lane.guest') : t('c.lane.container')}
            <div className="small muted mono">
              target <Addr value={tk.replyTargetEndpoint} /> · ref <Addr value={tk.expectedReplyRef} /> · {t('receipt.envelope')} <Addr value={r.envelopeDigest} /> ({r.envelopeBytes} B)
            </div>
          </div>
        </div>
        <div>
          <div>
            <strong>{t('receipt.reply')}</strong>{' '}
            {tk.reply && r.entry ? (
              <>
                · DeWebHub.inboxAt(target, {tk.reply.inboxIndex}) · {fmtTime(r.entry.timestamp)}
                <div className="small muted mono">
                  from <Addr value={r.entry.from} /> · digest <Addr value={r.entry.digest} />
                </div>
                {r.checks.map((c) => (
                  <div key={c.key} className="check-row">
                    <span className={`mark ${c.ok ? 'ok' : 'bad'}`}>{c.ok ? '✓' : '✗'}</span>
                    <span>{labels[c.key]}</span>
                  </div>
                ))}
              </>
            ) : (
              <span className="muted">· {t('receipt.pending')}</span>
            )}
          </div>
        </div>
        <div>
          <div>
            <strong>{t('receipt.settle')}</strong> ·{' '}
            {r.settlement.kind === 'claimed' ? (
              <>
                <Badge tone="ok">{t('c.claimed')}</Badge> {r.settlement.at ? fmtTime(r.settlement.at) : ''} · {t('inbox.paid')} {fmtMoney(tk.token, r.settlement.paid ?? 0n)} · {t('inbox.fee')} {fmtMoney(tk.token, r.settlement.fee ?? 0n)}
              </>
            ) : r.settlement.kind === 'refunded' ? (
              <>
                <Badge>{t('c.refunded')}</Badge> {r.settlement.at ? fmtTime(r.settlement.at) : ''} · 100%
              </>
            ) : (
              <Badge tone="warn">{t('c.pending')}</Badge>
            )}
          </div>
        </div>
      </div>
      {!compact && <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} alt="receipt" className="mt" style={{ width: '100%', border: '1px solid var(--rule)' }} />}
    </Panel>
  );
}

export function Receipt({ arg }: { arg: string }) {
  const { t } = useI18n();
  const id = Number(arg);
  return (
    <>
      <div className="mb">
        <div className="kicker">{t('nav.receipt')}</div>
        <h2>{t('receipt.title')}</h2>
        <p className="lede small mt-s">{t('receipt.lede')}</p>
      </div>
      {LAUNCHED ? <Note tone="ok">{t('chain.liveNote')}</Note> : <Note tone="warn">{t('receipt.sim')}</Note>}
      <div className="mt">{Number.isInteger(id) && id > 0 ? <ReceiptPanel ticketId={id} /> : <Note tone="warn">{t('receipt.notFound')}</Note>}</div>
      <div className="mt">
        <a className="btn ghost sm" href={href('inbox')}>
          ← {t('nav.inbox')}
        </a>
      </div>
    </>
  );
}
