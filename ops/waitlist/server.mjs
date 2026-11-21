// Voxro waitlist: POST /api/waitlist {email, x?, website(honeypot)} → appends to a private JSONL file.
// No dependencies. Listens on 127.0.0.1 only; Caddy proxies /api/waitlist to it.
import { createServer } from 'node:http';
import { appendFileSync, existsSync, mkdirSync, readFileSync, chmodSync } from 'node:fs';

const PORT = Number(process.env.PORT || 4790);
const DIR = process.env.DATA_DIR || '/var/lib/voxro-waitlist';
const FILE = `${DIR}/waitlist.jsonl`;
const ENV_FILE = '/etc/voxro-waitlist.env';
mkdirSync(DIR, { recursive: true, mode: 0o700 });
if (!existsSync(FILE)) { appendFileSync(FILE, ''); chmodSync(FILE, 0o600); }

const EMAIL = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,190}\.[a-z]{2,24}$/i;
const XH = /^@?[A-Za-z0-9_]{1,15}$/;
const seen = new Set(readFileSync(FILE, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l).email; } catch { return null; } }).filter(Boolean));
const hits = new Map(); // ip → timestamps (rate limit: 8 / 10 min)

function telegramConfig() {
  // re-read on each signup so `voxro-waitlist set-telegram` takes effect without a restart
  try {
    const env = Object.fromEntries(readFileSync(ENV_FILE, 'utf8').split('\n').map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]));
    return env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID ? env : null;
  } catch { return null; }
}
async function notify(entry, total) {
  const tg = telegramConfig();
  if (!tg) return;
  const text = `🟢 Voxro waitlist #${total}\n${entry.email}${entry.x ? `\nX: https://x.com/${entry.x.slice(1)}` : ''}`;
  try {
    await fetch(`https://api.telegram.org/bot${tg.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: tg.TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }), signal: AbortSignal.timeout(8000) });
  } catch { /* never fail a signup because Telegram is down */ }
}

const send = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };

createServer((req, res) => {
  if (req.method !== 'POST' || !req.url.startsWith('/api/waitlist')) return send(res, 404, { error: 'not found' });
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 600_000);
  if (recent.length >= 8) return send(res, 429, { error: 'Too many attempts. Try again in a few minutes.' });
  hits.set(ip, [...recent, now]);
  if (hits.size > 5000) hits.clear();

  let raw = '';
  req.on('data', (c) => { raw += c; if (raw.length > 2048) req.destroy(); });
  req.on('end', () => {
    let b;
    try { b = JSON.parse(raw); } catch { return send(res, 400, { error: 'Bad request.' }); }
    if (b.website) return send(res, 200, { ok: true }); // honeypot: pretend success for bots
    const email = String(b.email || '').trim().toLowerCase();
    let x = String(b.x || '').trim().replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, '');
    if (!EMAIL.test(email)) return send(res, 400, { error: 'Please enter a valid email.' });
    if (x && !XH.test(x)) return send(res, 400, { error: 'That X handle doesn’t look right.' });
    if (x && !x.startsWith('@')) x = '@' + x;
    if (seen.has(email)) return send(res, 200, { ok: true, already: true });
    seen.add(email);
    const entry = { t: new Date().toISOString(), email, x: x || null, ip };
    appendFileSync(FILE, JSON.stringify(entry) + '\n');
    send(res, 200, { ok: true });
    void notify(entry, seen.size);
  });
}).listen(PORT, '127.0.0.1', () => console.log(`voxro-waitlist on 127.0.0.1:${PORT}`));
