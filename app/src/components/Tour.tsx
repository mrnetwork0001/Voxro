/**
 * Product tour: a spotlight walk-through of the app shown on a user's first visit (Back / Next /
 * Skip, ← → Esc keys). It can be reopened any time with the Guide button (openTour()).
 * Steps point at elements carrying data-tour="…"; a step whose target is missing or hidden
 * (e.g. the sidebar on phones) is shown as a centered card instead.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n.tsx';

const DONE_KEY = 'voxro.tour';
const OPEN_EVENT = 'voxro:tour';

type Step = { target?: string; title: [string, string]; body: [string, string] };

const STEPS: Step[] = [
  {
    title: ['Welcome to Voxro', '欢迎来到 Voxro'],
    body: [
      'Voxro is a paid priority inbox on X Layer. Senders pay to reach you, you earn when you reply, and if you don’t reply in time they get 100% back. This short tour shows you around.',
      'Voxro 是 X Layer 上的付费优先收件箱。发送方付费联系你，你回复即可赚取赏金；若未按时回复，对方拿回 100%。这个简短的导览带你熟悉一下。',
    ],
  },
  { target: 'nav-pulse', title: ['Pulse', 'Pulse'], body: ['A live dashboard of Voxro and the TapeOut network: fees, inboxes, and how busy things are. Nothing here costs anything.', 'Voxro 与 TapeOut 网络的实时面板：费用、收件箱和繁忙程度。这里的一切都不收费。'] },
  { target: 'nav-directory', title: ['Send: Directory', '发送：目录'], body: ['Find someone and send them a paid, encrypted priority message. The price is quoted live; no reply in time means a full refund.', '找到某人并发送付费加密优先消息。价格实时报价；未按时回复即全额退款。'] },
  { target: 'nav-start', title: ['Receive: Create inbox', '接收：创建收件箱'], body: ['Start here to get paid for your attention. A guided setup: pick a name and a price, see the one-time cost, and get a link for your bio.', '从这里开始为你的注意力定价。引导式设置：选择名字和价格，查看一次性成本，并获得放在简介中的链接。'] },
  { target: 'nav-inbox', title: ['Inbox & Outbox', '收件箱与发件箱'], body: ['Read the paid messages sent to you, reply, and claim 95% of each bounty. Outbox tracks what you sent, the replies and any refunds.', '阅读发给你的付费消息、回复，并领取每笔赏金的 95%。发件箱追踪你发出的消息、回复和退款。'] },
  { target: 'nav-card', title: ['Contact card', '联系名片'], body: ['Publish a small onchain contact card that shows your price and a “message me” button.', '发布一张链上联系名片，展示你的价格和“给我发消息”按钮。'] },
  { target: 'nav-studio', title: ['Build: Studio', '构建：工作室'], body: ['The advanced editor: design exactly how your price rises as messages pile up, and preview it before going live.', '高级编辑器：精确设计消息堆积时价格如何上涨，并在上线前预览。'] },
  { target: 'nav-gallery', title: ['Verify', '验证'], body: ['Circuits and Prover let anyone inspect the logic that prices every inbox and replay it against the live chain. No hidden rules.', '电路与验证器让任何人检查为每个收件箱定价的逻辑，并对照链上重放。没有隐藏规则。'] },
  { target: 'wallet', title: ['Connect your wallet', '连接钱包'], body: ['Connect an X Layer wallet (OKX Wallet works great) to send messages or create your inbox. You sign every transaction yourself.', '连接 X Layer 钱包（推荐 OKX Wallet）以发送消息或创建收件箱。每笔交易都由你亲自签名。'] },
  { target: 'info', title: ['Need an explanation?', '需要解释？'], body: ['Look for the ⓘ icons. Hover or tap one to see what that section means in plain words.', '留意 ⓘ 图标。悬停或点按即可查看该部分的通俗解释。'] },
  { target: 'tour', title: ['Replay this guide', '重新查看导览'], body: ['That’s it! Open this guide again any time from here.', '就这些！随时可以从这里再次打开本导览。'] },
];

/** Reopen the tour from anywhere (e.g. the Guide button). */
export function openTour() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

function findTarget(name?: string): HTMLElement | null {
  if (!name) return null;
  const sel = name === 'info' ? '.view .info-btn' : `[data-tour="${name}"]`;
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
    const r = el.getBoundingClientRect();
    const onScreen = r.right > 0 && r.left < window.innerWidth && r.bottom > 0 && r.top < window.innerHeight;
    if (r.width > 0 && r.height > 0 && onScreen && getComputedStyle(el).visibility !== 'hidden') return el;
  }
  return null;
}

type Box = { top: number; left: number; width: number; height: number };
const PAD = 6;
const CARD_W = 340;

/** `menu` (phones): open/close the slide-out menu so the nav steps can point at its links. */
export function Tour({ menu }: { menu?: (open: boolean) => void } = {}) {
  const { lang } = useI18n();
  const zh = lang === 'zh';
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [card, setCard] = useState<{ top: number; left: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    menu?.(false);
    try {
      localStorage.setItem(DONE_KEY, 'done');
    } catch {
      /* ignore */
    }
  }, [menu]);

  // first visit → start automatically; openTour() → start from step 1
  useEffect(() => {
    const start = () => {
      setI(0);
      setOpen(true);
    };
    window.addEventListener(OPEN_EVENT, start);
    let seen = false;
    try {
      seen = localStorage.getItem(DONE_KEY) === 'done';
    } catch {
      seen = true;
    }
    const tm = seen ? undefined : window.setTimeout(start, 700);
    return () => {
      window.removeEventListener(OPEN_EVENT, start);
      if (tm) clearTimeout(tm);
    };
  }, []);

  // measure the spotlight target and place the card next to it
  const place = useCallback(() => {
    const el = findTarget(STEPS[i]?.target);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cw = Math.min(CARD_W, vw - 24);
    const ch = cardRef.current?.offsetHeight ?? 200;
    if (!el) {
      setBox(null);
      setCard({ top: Math.max(12, (vh - ch) / 2), left: (vw - cw) / 2 });
      return;
    }
    const r = el.getBoundingClientRect();
    const b = { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };
    setBox(b);
    let top: number;
    let left: number;
    if (b.left + b.width + 16 + cw <= vw - 12) {
      left = b.left + b.width + 16; // right of the target (sidebar items)
      top = b.top + b.height / 2 - ch / 2;
    } else if (b.top + b.height + 16 + ch <= vh - 12) {
      top = b.top + b.height + 16; // below
      left = b.left + b.width / 2 - cw / 2;
    } else {
      top = b.top - 16 - ch; // above
      left = b.left + b.width / 2 - cw / 2;
    }
    setCard({ top: Math.min(Math.max(12, top), vh - ch - 12), left: Math.min(Math.max(12, left), vw - cw - 12) });
  }, [i]);

  const navStep = Boolean(STEPS[i]?.target?.startsWith('nav-'));
  useEffect(() => {
    if (open && menu) menu(navStep);
  }, [open, navStep, menu]);

  useLayoutEffect(() => {
    if (!open) return;
    const later = [120, 320].map((ms) => window.setTimeout(() => { findTarget(STEPS[i]?.target)?.scrollIntoView({ block: 'nearest' }); place(); }, ms));
    findTarget(STEPS[i]?.target)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    place();
    const raf = requestAnimationFrame(place); // re-place once the card has its real height
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      later.forEach(clearTimeout);
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, i, place, lang]);

  useEffect(() => {
    if (!open) return;
    nextRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') setI((n) => (n < STEPS.length - 1 ? n + 1 : n));
      else if (e.key === 'ArrowLeft') setI((n) => Math.max(0, n - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, i, close]);

  if (!open) return null;
  const step = STEPS[i]!;
  const last = i === STEPS.length - 1;
  const L = zh ? 1 : 0;

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <div className="tour-block" onClick={(e) => e.stopPropagation()} />
      {box ? <div className="tour-spot" style={{ top: box.top, left: box.left, width: box.width, height: box.height }} /> : <div className="tour-dim" />}
      <div ref={cardRef} className="tour-card" style={card ? { top: card.top, left: card.left, width: Math.min(CARD_W, window.innerWidth - 24) } : { visibility: 'hidden' }}>
        <div className="tour-head">
          <span className="tour-count">
            {zh ? '导览' : 'Guide'} · {i + 1}/{STEPS.length}
          </span>
          <button type="button" className="tour-x" onClick={close} aria-label={zh ? '关闭' : 'Close'}>
            ×
          </button>
        </div>
        <h3 id="tour-title">{step.title[L]}</h3>
        <p>{step.body[L]}</p>
        <div className="tour-dots" aria-hidden="true">
          {STEPS.map((_, k) => (
            <span key={k} className={k === i ? 'on' : k < i ? 'done' : ''} />
          ))}
        </div>
        <div className="tour-actions">
          {!last ? (
            <button type="button" className="btn ghost sm" onClick={close}>
              {zh ? '跳过' : 'Skip'}
            </button>
          ) : (
            <span />
          )}
          <span className="row" style={{ gap: 8 }}>
            {i > 0 && (
              <button type="button" className="btn sm" onClick={() => setI(i - 1)}>
                {zh ? '上一步' : 'Back'}
              </button>
            )}
            <button ref={nextRef} type="button" className="btn signal sm" onClick={() => (last ? close() : setI(i + 1))}>
              {last ? (zh ? '完成' : 'Done') : i === 0 ? (zh ? '开始导览' : 'Start tour') : zh ? '下一步' : 'Next'}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
