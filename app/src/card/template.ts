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
    refund: zh ? '无人回复则 100% 退款。链上结算，零预言机。' : 'No reply, 100% refund. Settled on chain with zero oracle.',
    verified: zh ? '电路与托管合约在 X Layer 上公开可验证' : 'Circuit and escrow publicly verifiable on X Layer',
    powered: zh ? '由 Voxro 驱动 · X Layer DeWEB · TapeSend' : 'Powered by Voxro · X Layer DeWEB · TapeSend',
  };
  const dark = p.theme === 'dark';
  const css = `
:root{--bg:${dark ? '#0b0c0f' : '#f4f2ec'};--fg:${dark ? '#ece9e1' : '#121212'};--mut:${dark ? '#8c8a82' : '#6b6a66'};--rule:${dark ? '#262a33' : '#d8d5cc'};--sig:${dark ? '#ff5a2e' : '#e8431f'};--card:${dark ? '#13151a' : '#ffffff'}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 "Helvetica Neue",Helvetica,-apple-system,system-ui,"PingFang SC","Noto Sans SC",Arial,sans-serif;-webkit-font-smoothing:antialiased}
main{max-width:640px;margin:0 auto;padding:40px 20px 60px}.k{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--mut);font-weight:600}
h1{font-size:40px;letter-spacing:-.03em;line-height:1;margin:8px 0 4px}.h{color:var(--sig);font-weight:600}.bio{color:var(--mut);margin:14px 0 22px;font-size:16px}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--rule);border:1px solid var(--rule);margin:18px 0}.grid div{background:var(--card);padding:12px}.grid b{display:block;font-size:20px;letter-spacing:-.02em;margin-top:4px}
.btn{display:inline-block;background:var(--sig);color:${dark ? '#0b0c0f' : '#fff'};padding:14px 20px;font-weight:700;text-decoration:none;letter-spacing:.02em;border-radius:2px}
.lad{display:grid;grid-template-columns:repeat(8,1fr);gap:4px;margin:10px 0 4px}.lad div{border:1px solid var(--rule);padding:8px 4px;text-align:center;font-size:12px;border-radius:2px}.lad small{display:block;color:var(--mut);font-family:ui-monospace,Menlo,monospace;font-size:10px}
.links a{color:var(--fg);margin-right:16px}footer{margin-top:36px;padding-top:14px;border-top:1px solid var(--rule);font-size:12px;color:var(--mut)}code{font-family:ui-monospace,Menlo,monospace;font-size:12px}
@media(max-width:480px){h1{font-size:32px}.grid{grid-template-columns:1fr 1fr}}`;
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
<p><a class="btn" href="${esc(p.sendHref)}">${L.send} →</a></p>
<div class="grid">
<div><span class="k">${L.price}</span><b>${esc(p.priceLabel)}</b></div>
<div><span class="k">${L.sla}</span><b>${esc(p.slaLabel)}</b></div>
<div><span class="k">${L.curve}</span><b>${esc(p.presetLabel)}</b></div>
</div>
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
