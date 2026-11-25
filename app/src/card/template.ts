/** Self-contained DeWEB contact card: inline CSS, no scripts, no external requests. */
export interface CardParams {
  handle: string;
  name: string;
  bio: string;
  presetLabel: string;
  priceLabel: string;
  slaLabel: string;
  tapeName: string;
  circuitLabel: string;
  ladder: Array<{ q: number; price: string }>;
  links: Array<{ label: string; href: string }>;
  lang: 'en' | 'zh';
  theme: 'dark' | 'light';
  sendHref: string;
  /** Public onchain reply record read from VoxroEscrow. */
  record?: { answered: number; expired: number; avgReply: string };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function renderContactCard(p: CardParams): string {
  const zh = p.lang === 'zh';
  const L = {
    send: zh ? '发送优先消息' : 'Send a priority message',
    price: zh ? '当前基础价格' : 'Base price',
    sla: zh ? '回复期限' : 'Reply window',
    curve: zh ? '拥堵曲线' : 'Surge curve',
    ladder: zh ? '队列深度 → 报价' : 'Queue depth → quote',
    refund: zh ? '无人回复则 100% 退款。链上结算，零预言机。' : 'No reply, 100% refund. Settled onchain with zero oracle.',
    verified: zh ? '电路与托管合约在 X Layer 上公开可验证' : 'Circuit and escrow publicly verifiable on X Layer',
    powered: zh ? '由 Voxro 驱动 · ShieldSuite 出品 · X Layer DeWEB · TapeSend' : 'Powered by Voxro, a ShieldSuite product · X Layer DeWEB · TapeSend',
    record: zh ? '链上回复记录' : 'Onchain reply record',
    answered: zh ? '已回复' : 'Answered',
    expired: zh ? '已过期 / 已拒绝' : 'Expired / declined',
    avg: zh ? '平均回复时间' : 'Average reply',
  };
  const dark = p.theme === 'dark';
  const css = `
:root{--bg:${dark ? '#0a0e17' : '#f4f6f2'};--fg:${dark ? '#f0f2f5' : '#0a0e17'};--mut:${dark ? '#8892a6' : '#5a6478'};--rule:${dark ? 'rgba(255,255,255,.1)' : '#d6dbd2'};--sig:${dark ? '#33ff00' : '#1a8f00'};--card:${dark ? '#000000' : '#ffffff'}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 Inter,"Helvetica Neue",Helvetica,-apple-system,system-ui,"PingFang SC","Noto Sans SC",Arial,sans-serif;-webkit-font-smoothing:antialiased}
main{max-width:640px;margin:0 auto;padding:40px 20px 60px}.k{font-family:ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--mut);font-weight:500}
h1{font-size:42px;letter-spacing:-.04em;line-height:1;margin:8px 0 4px;font-weight:800}.h{color:var(--sig);font-weight:600}.bio{color:var(--mut);margin:14px 0 22px;font-size:16px}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--rule);border:1px solid var(--rule);margin:18px 0}.grid div{background:var(--card);padding:12px}.grid b{display:block;font-size:20px;letter-spacing:-.02em;margin-top:4px}
.btn{display:inline-block;background:var(--sig);color:${dark ? '#04140a' : '#fff'};padding:14px 20px;font-weight:700;text-decoration:none;letter-spacing:.02em;border-radius:10px;font-family:ui-monospace,Menlo,monospace}
.lad{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:4px;margin:10px 0 4px}.lad div{border:1px solid var(--rule);padding:8px 4px;text-align:center;font-size:12px;background:var(--card)}.lad small{display:block;color:var(--mut);font-family:ui-monospace,Menlo,monospace;font-size:10px}
.links a{color:var(--fg);margin-right:16px}footer{margin-top:36px;padding-top:14px;border-top:1px solid var(--rule);font-size:12px;color:var(--mut)}code{font-family:ui-monospace,Menlo,monospace;font-size:12px}
html,body{overflow-x:hidden}main{overflow-wrap:anywhere}@media(max-width:480px){h1{font-size:32px}.grid{grid-template-columns:1fr 1fr}.lad{grid-template-columns:repeat(4,minmax(0,1fr))}}`;
  return `<!doctype html>
<html lang="${zh ? 'zh-CN' : 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.name)} — Voxro</title>
<style>${css}</style>
</head>
<body>
<main>
<div class="k">Voxro · ${esc(p.tapeName)}</div>
<h1>${esc(p.name)}</h1>
<div class="h">@${esc(p.handle)}</div>
<p class="bio">${esc(p.bio)}</p>
<p><a class="btn" href="${esc(p.sendHref)}">${L.send}</a></p>
<div class="grid">
<div><span class="k">${L.price}</span><b>${esc(p.priceLabel)}</b></div>
<div><span class="k">${L.sla}</span><b>${esc(p.slaLabel)}</b></div>
<div><span class="k">${L.curve}</span><b>${esc(p.presetLabel)}</b></div>
</div>
${p.record ? `<div class="k">${L.record}</div>
<div class="grid">
<div><span class="k">${L.answered}</span><b>${p.record.answered}</b></div>
<div><span class="k">${L.expired}</span><b>${p.record.expired}</b></div>
<div><span class="k">${L.avg}</span><b>${esc(p.record.avgReply)}</b></div>
</div>` : ''}
<div class="k">${L.ladder}</div>
<div class="lad">${p.ladder.map((r) => `<div><small>Q${r.q}</small>${esc(r.price)}</div>`).join('')}</div>
<p style="color:var(--mut);font-size:13px">${L.refund}</p>
${p.links.length ? `<p class="links">${p.links.map((l) => `<a href="${esc(l.href)}" rel="noreferrer">${esc(l.label)}</a>`).join('')}</p>` : ''}
<footer>${L.verified} · <code>${esc(p.circuitLabel)}</code><br>${L.powered}</footer>
</main>
</body>
</html>
`;
}
