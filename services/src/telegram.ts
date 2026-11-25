/**
 * @VoxrolayerBOT: Voxro in Telegram. It never holds keys: it reads public X Layer data and opens the
 * Voxro Mini App, where the user signs with their own wallet.
 *
 *   /price @h   live quote from the inbox's circuit       /send @h   open the payment screen
 *   /watch @h   new-message, deadline and payout alerts   /me        your watched inboxes
 *   /link @h    the shareable profile link                /inboxes   who you can reach
 *
 * Env (from /etc/voxro-bot.env): TELEGRAM_BOT_TOKEN, ADMIN_CHAT_ID, optional VOXRO_ORIGIN, BOT_DATA_DIR.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { ORIGIN, TIER_X, directory, hours, inboxByHandle, ladder, money, normHandle, profileLink, short, ticketsFor, type Inbox, type Ticket } from './chain.js';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const ADMIN = process.env.ADMIN_CHAT_ID ?? '';
const DIR = process.env.BOT_DATA_DIR ?? '/var/lib/voxro-bot';
const WAITLIST = process.env.WAITLIST_FILE ?? '/var/lib/voxro-waitlist/waitlist.jsonl';
const POLL_MS = 20_000;
const REMIND_S = 6 * 3600;
/** Remind in the last quarter of the reply window, at most 6 h before the deadline (15 min for a 1 h inbox). */
const remindAt = (t: Ticket) => Math.min(REMIND_S, Math.floor((t.deadline - t.createdAt) / 4));
/** The x402 gateway locks on behalf of AI agents that pay over HTTP. */
const GATEWAY = (process.env.VOXRO_GATEWAY_ADDRESS ?? '0x57b9a23f487d385B544aa468976B618B955c6497').toLowerCase();
if (!TOKEN) throw new Error('TELEGRAM_BOT_TOKEN missing');

// ─── state ──────────────────────────────────────────────────────────────────────────────────
interface State {
  offset: number;
  watch: Record<string, string[]>; // chatId → handles
  seen: Record<string, string>; // ticketId → last status we announced
  reminded: number[];
  primed: boolean;
}
mkdirSync(DIR, { recursive: true, mode: 0o700 });
const FILE = `${DIR}/state.json`;
const state: State = existsSync(FILE) ? { offset: 0, watch: {}, seen: {}, reminded: [], primed: false, ...JSON.parse(readFileSync(FILE, 'utf8')) } : { offset: 0, watch: {}, seen: {}, reminded: [], primed: false };
function save() {
  writeFileSync(`${FILE}.tmp`, JSON.stringify(state), { mode: 0o600 });
  renameSync(`${FILE}.tmp`, FILE);
}

// ─── Telegram API ───────────────────────────────────────────────────────────────────────────
type Button = { text: string; url?: string; web_app?: { url: string }; callback_data?: string };
async function api<T = unknown>(method: string, body: Record<string, unknown> = {}, timeoutMs = 15_000): Promise<T> {
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  const j = (await r.json()) as { ok: boolean; result: T; description?: string };
  if (!j.ok) throw new Error(`${method}: ${j.description}`);
  return j.result;
}
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
/** Mini App buttons only work in private chats; groups get plain links. */
const open = (text: string, path: string, isPrivate: boolean): Button => (isPrivate ? { text, web_app: { url: `${ORIGIN}/${path}` } } : { text, url: `${ORIGIN}/${path}` });
async function say(chatId: number | string, html: string, rows: Button[][] = []) {
  await api('sendMessage', { chat_id: chatId, text: html, parse_mode: 'HTML', disable_web_page_preview: true, ...(rows.length ? { reply_markup: { inline_keyboard: rows } } : {}) });
}

// ─── formatting ─────────────────────────────────────────────────────────────────────────────
function record(ib: Inbox): string {
  const avg = ib.avgReplySeconds != null ? ` · avg reply ${hours(ib.avgReplySeconds)}` : '';
  return `${ib.answered} answered · ${ib.refunded} refunded${avg}`;
}
function priceCard(ib: Inbox): string {
  const lad = ladder(ib);
  const q = ib.quote;
  return [
    `<b>@${esc(ib.handle)}</b> · ${esc(ib.preset)}`,
    ib.active ? (q.canSend ? `Price right now: <b>${money(ib.token, q.price)}</b> (${TIER_X[q.tier] ?? ''})` : '⛔ Queue is full: new senders are paused until they reply.') : '⏸ This inbox is paused.',
    `Queue: ${ib.queue}/7 waiting · reply window ${hours(ib.slaSeconds)}`,
    `Price as the queue fills: ${[...new Set(lad.map((p) => money(ib.token, p)))].join(' → ')}`,
    `Reply record: ${record(ib)}`,
    ib.communityVip ? '⭐ TapeOut community (FabX miners, TapeCode-Test1, BEM or FAB holders) pay one tier lower and 50% off.' : '',
    `<i>Priced live by the inbox's onchain circuit. No reply in ${hours(ib.slaSeconds)} = 100% refund.</i>`,
  ].filter(Boolean).join('\n');
}

const HELP = [
  '<b>Voxro</b>: a paid priority inbox on X Layer. People pay to reach you, you earn 95% when you reply, and if you don’t reply in time they get 100% back. The price rises automatically when you’re busy.',
  '',
  '/price @voxro: live price, priced by the inbox’s circuit',
  '/send @voxro: send a paid, encrypted message',
  '/watch @yourname: alerts for new messages, deadlines and payouts',
  '/me: your watched inboxes · /inboxes: who you can reach',
  '/link @yourname: your shareable link for your bio',
  '/unwatch @yourname: stop alerts',
  '',
  'This bot never asks for your keys. You sign in your own wallet inside the Voxro app.',
].join('\n');

// ─── commands ───────────────────────────────────────────────────────────────────────────────
async function needInbox(chat: number, arg: string, cmd: string): Promise<Inbox | null> {
  if (!arg) {
    await say(chat, `Which inbox? Try <code>/${cmd} @voxro</code>`);
    return null;
  }
  const ib = await inboxByHandle(arg);
  if (!ib) await say(chat, `I couldn’t find <b>@${esc(normHandle(arg))}</b> on Voxro. /inboxes lists everyone you can reach.`);
  return ib;
}

async function handle(msg: { chat: { id: number; type: string }; text?: string; from?: { username?: string } }) {
  const chat = msg.chat.id;
  const priv = msg.chat.type === 'private';
  const text = (msg.text ?? '').trim();
  if (!text.startsWith('/')) {
    if (priv) await say(chat, HELP, [[open('Open Voxro', '#/pulse', priv)]]);
    return;
  }
  const [rawCmd, ...rest] = text.split(/\s+/);
  const cmd = rawCmd!.slice(1).split('@')[0]!.toLowerCase();
  const arg = rest.join(' ');

  switch (cmd) {
    case 'start': {
      const m = arg.match(/^(watch|send|price)_([a-z0-9_]{1,31})$/);
      if (m) return handle({ ...msg, text: `/${m[1]} @${m[2]}` });
      return say(chat, `👋 ${HELP}`, [[open('Open Voxro', '#/pulse', priv), open('Create my inbox', '#/start', priv)], [{ text: 'Try it: price of @voxro', callback_data: 'price:voxro' }]]);
    }
    case 'help':
      return say(chat, HELP);
    case 'price': {
      const ib = await needInbox(chat, arg, 'price');
      if (ib) await say(chat, priceCard(ib), [[open(`Message @${ib.handle}`, `#/@${ib.handle}`, priv)], [{ text: '🔔 Watch this inbox', callback_data: `watch:${ib.handle}` }]]);
      return;
    }
    case 'send': {
      const ib = await needInbox(chat, arg, 'send');
      if (ib)
        await say(chat, `Send a paid, end-to-end encrypted message to <b>@${esc(ib.handle)}</b>.\nIt costs <b>${money(ib.token, ib.quote.price)}</b> right now. Your payment is held by the escrow contract and refunded in full if there’s no reply within ${hours(ib.slaSeconds)}.`, [[open(`✉️ Write to @${ib.handle}`, `#/@${ib.handle}`, priv)]]);
      return;
    }
    case 'link': {
      const ib = await needInbox(chat, arg, 'link');
      if (ib) {
        const url = profileLink(ib.handle);
        await say(chat, `Your link for X, Telegram or GitHub bios:\n<code>${url}</code>\n\nPeople who really want your attention pay; everyone else stays out.`, [[{ text: 'Share', url: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(`Reach me on Voxro: @${ib.handle}`)}` }]]);
      }
      return;
    }
    case 'watch': {
      const ib = await needInbox(chat, arg, 'watch');
      if (!ib) return;
      const list = (state.watch[chat] ??= []);
      if (!list.includes(ib.handle)) list.push(ib.handle);
      // only alert on what happens from now on
      for (const t of (await ticketsFor([ib.id])).get(ib.id) ?? []) state.seen[String(t.id)] ??= t.status;
      save();
      return say(chat, `🔔 Watching <b>@${esc(ib.handle)}</b>. You’ll get a message here when a paid message arrives, when a reply window is about to close, and when a bounty is paid or refunded.`, [[open('Open my inbox', '#/inbox', priv)]]);
    }
    case 'unwatch': {
      const h = normHandle(arg);
      state.watch[chat] = (state.watch[chat] ?? []).filter((x) => x !== h);
      save();
      return say(chat, h ? `Stopped alerts for @${esc(h)}.` : 'Which inbox? Try <code>/unwatch @yourname</code>');
    }
    case 'me': {
      const list = state.watch[chat] ?? [];
      if (!list.length) return say(chat, 'You aren’t watching any inbox yet. Use <code>/watch @yourname</code>, or create one:', [[open('Create my inbox', '#/start', priv)]]);
      const all = await directory();
      const mine = all.filter((i) => list.includes(i.handle));
      const tickets = await ticketsFor(mine.map((i) => i.id));
      const now = Math.floor(Date.now() / 1000);
      const lines = mine.map((ib) => {
        const ts = tickets.get(ib.id) ?? [];
        const waiting = ts.filter((t) => t.status === 'Pending' && t.deadline > now);
        const earned = ts.filter((t) => t.status === 'Claimed').reduce((s, t) => s + (t.amount * 9500n) / 10_000n, 0n);
        const soonest = waiting.reduce((m, t) => Math.min(m, t.deadline), Infinity);
        return [
          `<b>@${esc(ib.handle)}</b> · ${ib.active ? 'active' : 'paused'}`,
          `Waiting for a reply: ${waiting.length}${waiting.length ? ` · next deadline in ${hours(soonest - now)}` : ''}`,
          `Earned: ${money(ib.token, earned)} · price now ${money(ib.token, ib.quote.price)} · queue ${ib.queue}/7`,
          `Record: ${record(ib)}`,
        ].join('\n');
      });
      return say(chat, lines.join('\n\n') || 'No data yet.', [[open('Open my inbox', '#/inbox', priv)]]);
    }
    case 'inboxes': {
      const all = (await directory()).filter((i) => i.active).slice(0, 15);
      if (!all.length) return say(chat, 'No inboxes yet. Be the first:', [[open('Create my inbox', '#/start', priv)]]);
      return say(chat, ['<b>Who you can reach on Voxro</b>', ...all.map((i) => `@${esc(i.handle)} · ${money(i.token, i.quote.price)} · replies in ${hours(i.slaSeconds)} · ${i.answered} answered`), '', 'Use <code>/price @name</code> or <code>/send @name</code>.'].join('\n'), [[open('Open the directory', '#/directory', priv)]]);
    }
    case 'waitlist': {
      if (String(chat) !== ADMIN) return; // private to the owner
      const rows = existsSync(WAITLIST) ? readFileSync(WAITLIST, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as { t: string; name?: string; email: string; x?: string }) : [];
      return say(chat, [`<b>Waitlist: ${rows.length}</b>`, ...rows.slice(-10).reverse().map((r) => `${r.t.slice(5, 16).replace('T', ' ')} · ${esc(r.name ?? '—')} · ${esc(r.email)}${r.x ? ` · ${esc(r.x)}` : ''}`)].join('\n'));
    }
    default:
      if (priv) await say(chat, HELP);
  }
}

async function onCallback(cb: { id: string; data?: string; message?: { chat: { id: number; type: string } } }) {
  await api('answerCallbackQuery', { callback_query_id: cb.id }).catch(() => {});
  const [kind, h] = (cb.data ?? '').split(':');
  if (cb.message && h && (kind === 'price' || kind === 'watch')) await handle({ chat: cb.message.chat, text: `/${kind} @${h}` });
}

// ─── alerts ─────────────────────────────────────────────────────────────────────────────────
function watchersOf(handle: string): string[] {
  return Object.entries(state.watch).filter(([, hs]) => hs.includes(handle)).map(([c]) => c);
}
async function alertLoop() {
  const handles = [...new Set(Object.values(state.watch).flat())];
  const inboxes = await directory();
  const watched = state.primed ? inboxes.filter((i) => handles.includes(i.handle)) : inboxes;
  const byInbox = await ticketsFor(watched.map((i) => i.id));
  const now = Math.floor(Date.now() / 1000);
  const senders = new Map(inboxes.map((i) => [i.owner.toLowerCase(), i.handle]));
  const who = (a: string) => (senders.has(a.toLowerCase()) ? `@${senders.get(a.toLowerCase())}` : short(a));
  for (const ib of watched) {
    for (const t of byInbox.get(ib.id) ?? []) {
      const key = String(t.id);
      const prev = state.seen[key];
      if (!state.primed) {
        state.seen[key] = t.status; // first run: remember history without alerting
        continue;
      }
      const chats = watchersOf(ib.handle);
      const btn = (c: string) => [[open('Open inbox', '#/inbox', !c.startsWith('-'))]];
      if (prev !== t.status) {
        state.seen[key] = t.status;
        const msg = alertText(t, ib, prev, who(t.sender), now);
        if (msg) for (const c of chats) await say(c, msg, btn(c)).catch((e) => console.error('send', c, e.message));
      }
      if (t.status === 'Pending' && t.deadline > now && t.deadline - now <= remindAt(t) && !state.reminded.includes(t.id) && t.createdAt < now - 60) {
        state.reminded.push(t.id);
        for (const c of chats) await say(c, `⏰ <b>${hours(t.deadline - now)} left</b> to reply to the ${money(t.token, t.amount)} message to @${esc(ib.handle)}. Reply now or the sender is refunded.`, btn(c)).catch(() => {});
      }
    }
  }
  if (!state.primed) state.primed = true;
  if (state.reminded.length > 2000) state.reminded = state.reminded.slice(-1000);
  save();
}

function alertText(t: Ticket, ib: Inbox, prev: string | undefined, from: string, now: number): string | null {
  const amt = money(t.token, t.amount);
  if (t.status === 'Pending' && !prev) return `💰 <b>New paid message</b> to @${esc(ib.handle)}: <b>${amt}</b> from ${t.sender.toLowerCase() === GATEWAY ? 'an AI agent (paid over x402)' : esc(from)}.\nReply within ${hours(t.deadline - now)} to earn ${money(t.token, (t.amount * 9500n) / 10_000n)}. The message is encrypted and opens only in your browser.`;
  if (t.status === 'Claimed') return `✅ <b>Bounty claimed</b>: ${money(t.token, (t.amount * 9500n) / 10_000n)} paid to @${esc(ib.handle)} for replying.`;
  if (t.status === 'Refunded') return `↩️ A ${amt} message to @${esc(ib.handle)} wasn’t answered in time, so ${t.sender.toLowerCase() === GATEWAY ? 'the AI agent' : 'the sender'} got 100% back.`;
  if (t.status === 'Declined') return `🚫 @${esc(ib.handle)} declined a ${amt} message; the sender was refunded in full.`;
  return null;
}

// ─── main ───────────────────────────────────────────────────────────────────────────────────
async function setup() {
  await api('setMyCommands', {
    commands: [
      { command: 'price', description: 'Live price to message someone, e.g. /price @voxro' },
      { command: 'send', description: 'Send a paid, encrypted message' },
      { command: 'watch', description: 'Alerts for your inbox: new messages, deadlines, payouts' },
      { command: 'me', description: 'Your watched inboxes' },
      { command: 'inboxes', description: 'Who you can reach on Voxro' },
      { command: 'link', description: 'Your shareable link for your bio' },
      { command: 'help', description: 'What Voxro is' },
    ],
  });
  await api('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Open Voxro', web_app: { url: `${ORIGIN}/#/pulse` } } });
  await api('setMyDescription', { description: 'Voxro: a paid priority inbox on X Layer. People pay to reach you, you earn when you reply, and they get 100% back if you don’t. Prices rise automatically when you’re busy. This bot never asks for your keys.' }).catch(() => {});
  await api('setMyShortDescription', { short_description: 'Get paid to read your DMs. Paid priority inbox on X Layer.' }).catch(() => {});
}

async function pollUpdates() {
  for (;;) {
    try {
      const ups = await api<Array<{ update_id: number; message?: Parameters<typeof handle>[0]; callback_query?: Parameters<typeof onCallback>[0] }>>('getUpdates', { offset: state.offset, timeout: 50, allowed_updates: ['message', 'callback_query'] }, 60_000);
      for (const u of ups) {
        state.offset = u.update_id + 1;
        try {
          if (u.message) await handle(u.message);
          else if (u.callback_query) await onCallback(u.callback_query);
        } catch (e) {
          console.error('update', u.update_id, (e as Error).message);
          const chat = u.message?.chat.id ?? u.callback_query?.message?.chat.id;
          if (chat) await say(chat, 'Sorry, X Layer didn’t answer in time. Please try again in a moment.').catch(() => {});
        }
      }
      if (ups.length) save();
    } catch (e) {
      console.error('getUpdates', (e as Error).message);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

async function main() {
  await setup().catch((e) => console.error('setup', e.message));
  setInterval(() => void alertLoop().catch((e) => console.error('alerts', e.message)), POLL_MS);
  void alertLoop().catch((e) => console.error('alerts', e.message));
  console.log('voxro bot running');
  await pollUpdates();
}
void main();
