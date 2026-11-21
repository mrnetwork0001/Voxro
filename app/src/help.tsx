/** Plain-language explanations for info hints (ⓘ) and page intros, in English and 简体中文. */
import type { ReactNode } from 'react';
import { PageIntro } from './components/ui.tsx';
import { useI18n } from './i18n.tsx';

const HELP: Record<string, [en: string, zh: string]> = {
  // Directory
  'dir.compose': ['Write your message here. It is encrypted in your browser, so only the recipient can read it. Your payment is held by the escrow contract, not by Voxro, until they reply or the window ends.', '在这里写消息。消息在你的浏览器中加密，只有接收方能读。付款由托管合约保管（不是 Voxro），直到对方回复或期限结束。'],
  'dir.quote': ['What you would pay right now to message this inbox. It is calculated onchain by the recipient’s pricing circuit for your wallet, so VIP or allowlist discounts are already included.', '你现在给该收件箱发消息需要支付的金额。由接收方的定价电路针对你的钱包在链上计算，已包含 VIP 或白名单折扣。'],
  'c.queue': ['How many paid messages are waiting for a reply (0–7). Each new message pushes it up, each reply or refund brings it down. A longer queue means a higher price, so spam gets expensive.', '等待回复的付费消息数量（0–7）。每条新消息使其上升，每次回复或退款使其下降。队列越长价格越高，刷屏就会很贵。'],
  'c.sla': ['How long the recipient has to answer. If they do not reply in time, you can take 100% of your payment back.', '接收方回复的时限。如果对方没有按时回复，你可以拿回 100% 付款。'],
  'dir.ladder': ['The price at each queue level. The highlighted box is where the inbox is right now; prices step up as more unanswered messages pile in.', '每个队列深度对应的价格。高亮的格子是收件箱当前所在位置；未回复的消息越多，价格逐级上涨。'],
  'dir.sent': ['Your paid message is locked in the escrow. You will find it, and any reply, under Inbox → Outbox.', '你的付费消息已锁定在托管合约中。你可以在 收件箱 → 发件箱 查看它以及回复。'],
  // Inbox
  'inbox.pickInbox': ['An inbox you own. Paid messages to it appear on the right; decrypt them, reply, then claim your bounty.', '你拥有的收件箱。发来的付费消息显示在右侧：解密、回复，然后领取赏金。'],
  'inbox.queueNow': ['Unanswered paid messages right now. Replying brings the queue (and the price new senders pay) back down.', '当前未回复的付费消息数。回复会降低队列（以及新发送方需要支付的价格）。'],
  'inbox.earned': ['What you have earned: 95% of every message you answered. 5% goes to the Voxro protocol.', '你已赚取的金额：每条已回复消息的 95%。5% 归 Voxro 协议。'],
  'set.kicker': ['Settings only you, the inbox owner, can change: pause, VIP rule, price and reply window, allowlist and team.', '只有你（收件箱所有者）可以修改的设置：暂停、VIP 规则、价格与回复期限、白名单和团队。'],
  // Studio
  'studio.policy': ['Your pricing style. Each preset is a small circuit that decides how fast your price rises as messages pile up. Balanced suits most people; Fortress is for very busy inboxes.', '你的定价风格。每个预设都是一个小电路，决定消息堆积时价格上涨的速度。Balanced 适合大多数人；Fortress 适合非常繁忙的收件箱。'],
  'studio.cost': ['One-time setup cost, read live from X Layer. It creates your private mailbox and opens it for encrypted messages. After that, receiving messages costs nothing.', '一次性设置成本，实时读取自 X Layer。用于创建你的私人邮箱并开通加密消息。之后接收消息不再收费。'],
  'studio.compiled': ['The actual circuit that will price your inbox, compiled from NAND and LATCH gates. Anyone can inspect it before paying.', '将为你的收件箱定价的实际电路，由 NAND 与 LATCH 门编译而成。任何人付款前都能检查它。'],
  'studio.pins': ['Inputs, outputs and memory bits of the circuit.', '电路的输入、输出与记忆位数量。'],
  'studio.gateCount': ['Total logic gates, including gates reused from other circuits.', '逻辑门总数，包含引用自其他电路的门。'],
  'studio.burn': ['Transistors permanently used up to build this circuit onchain.', '在链上构建该电路所永久消耗的晶体管数量。'],
  'studio.bytes': ['Size of the circuit’s onchain wiring description.', '电路在链上的布线描述大小。'],
  'studio.waveform': ['A preview of how your price would move with example traffic: sends push it up, replies and refunds bring it down.', '用示例流量预览你的价格如何变化：发送使其上升，回复与退款使其下降。'],
  'studio.table': ['Every possible state of the circuit and what it outputs. All 512 are checked automatically, so the pricing rules cannot surprise anyone.', '电路的每一种状态及其输出。全部 512 种都会自动检查，定价规则不会给任何人带来意外。'],
  'studio.handle': ['Your public name, like @yourname. People find you by it, and it is part of your shareable link.', '你的公开名字，例如 @yourname。别人通过它找到你，它也是你分享链接的一部分。'],
  // Card
  'c.handle': ['Choose which of your inboxes this contact card is for, and what it says about you.', '选择这张名片对应你的哪个收件箱，以及上面展示的内容。'],
  'card.bundle': ['Your card is published as a tiny website stored onchain (DeWEB). These are the exact transactions it takes.', '你的名片会作为存储在链上的小网站（DeWEB）发布。这里是所需的具体交易。'],
  'card.preview': ['Exactly what visitors will see at your tape:// address.', '访客在你的 tape:// 地址看到的实际样子。'],
  // Pulse
  'c.block': ['The latest X Layer block. If it keeps rising, the app is reading the chain live.', '最新的 X Layer 区块。持续增长说明应用正在实时读取链上数据。'],
  'pulse.processors': ['How many TapeOut processors exist on X Layer. Voxro’s is one of them.', 'X Layer 上的 TapeOut 处理器总数。Voxro 的处理器是其中之一。'],
  'pulse.deployFee': ['TapeOut’s fee to create a new processor.', 'TapeOut 创建新处理器的费用。'],
  'pulse.tapeoutFee': ['TapeOut’s fee to put a circuit onchain.', 'TapeOut 将电路上链的费用。'],
  'pulse.openerFee': ['TapeOut’s one-time fee to open a circuit’s container so it can send and receive encrypted messages.', 'TapeOut 开通电路容器的一次性费用，开通后才能收发加密消息。'],
  'pulse.marketFee': ['Fee taken by TapeOut’s circuit market on trades.', 'TapeOut 电路市场对交易收取的费用。'],
  'pulse.hub': ['DeWebHub: TapeOut’s onchain messaging hub. Voxro replies are recorded here, which is how payment is released without any middleman.', 'DeWebHub：TapeOut 的链上消息中心。Voxro 的回复记录在这里，因此无需任何中间人就能放款。'],
  'pulse.catalog': ['All circuits Voxro uses, compiled and checked in your browser.', 'Voxro 使用的全部电路，在你的浏览器中编译并检查。'],
  'pulse.circuits': ['Number of circuits in Voxro’s catalog.', 'Voxro 电路目录中的电路数量。'],
  'pulse.burn': ['Transistors used up to build the catalog.', '构建目录所消耗的晶体管。'],
  'pulse.proven': ['Every state of every circuit checked against its reference rules. Zero mismatches means the pricing behaves exactly as documented.', '每个电路的每种状态都已按参考规则检查。零不一致意味着定价完全符合说明。'],
  'pulse.proveTime': ['How long that full check took in your browser.', '在你的浏览器中完成全部检查所用的时间。'],
  'pulse.curves': ['How each pricing style multiplies the base price as the queue grows.', '随着队列增长，每种定价风格如何放大基础价格。'],
  'pulse.how': ['The life of a paid message, from lock to payout.', '一条付费消息从锁定到放款的全过程。'],
  'pulse.inboxes': ['Active Voxro inboxes on X Layer.', 'X Layer 上活跃的 Voxro 收件箱。'],
  'pulse.pendingTickets': ['Paid messages waiting for a reply across all inboxes.', '所有收件箱中等待回复的付费消息。'],
  'pulse.surgeIndex': ['Average queue across inboxes: how busy Voxro is right now.', '各收件箱的平均队列：Voxro 当前有多繁忙。'],
  'pulse.settled': ['Total paid out for answered messages.', '已回复消息的累计结算金额。'],
  'pulse.protocol': ['Voxro’s 5% share of answered messages.', 'Voxro 从已回复消息中获得的 5% 份额。'],
};

const INTRO: Record<string, [titleEn: string, en: string, titleZh: string, zh: string]> = {
  pulse: ['What is Pulse?', 'A live view of Voxro and the TapeOut network on X Layer: fees, circuits and how busy inboxes are. Nothing here costs anything.', 'Pulse 是什么？', 'Voxro 与 X Layer 上 TapeOut 网络的实时视图：费用、电路和收件箱的繁忙程度。这里的一切都不收费。'],
  directory: ['What is the Directory?', 'Find someone and send them a paid priority message. You only pay what the quote shows; if they don’t reply in time, you get 100% back.', '目录是什么？', '找到某人并给 TA 发送付费优先消息。你只需支付报价金额；如果对方没有按时回复，你能拿回 100%。'],
  inbox: ['What is the Inbox?', 'Inbox shows paid messages sent to you: decrypt, reply, and claim 95% of each bounty. Outbox shows messages you sent, their replies, and refunds.', '收件箱是什么？', '收件箱显示别人发给你的付费消息：解密、回复并领取每笔赏金的 95%。发件箱显示你发出的消息、回复和退款。'],
  studio: ['What is the Studio?', 'Design how your inbox is priced and register it. Pick a pricing style, a base price and a reply window; the preview shows exactly what senders will pay.', '工作室是什么？', '设计你的收件箱定价并完成注册。选择定价风格、基础价格和回复期限；预览会准确显示发送方需要支付的金额。'],
  card: ['What is the Card?', 'A contact card for your bio: a small website stored onchain that shows your price and a button to message you.', '名片是什么？', '放在个人简介中的联系名片：一个存储在链上的小网站，展示你的价格和发消息按钮。'],
  gallery: ['What are Circuits?', 'The logic circuits behind Voxro’s pricing. Flip the inputs to see exactly what each circuit does.', '电路是什么？', 'Voxro 定价背后的逻辑电路。切换输入即可看到每个电路的具体行为。'],
  prover: ['What is the Prover?', 'Replays every state of a circuit against the live chain to prove it behaves as documented. For the curious and for auditors.', '验证器是什么？', '将电路的每种状态与链上实际结果对照重放，证明其行为与说明一致。适合好奇的用户与审计者。'],
  start: ['Create your inbox', 'A few guided steps: pick a name and a price, review the one-time cost, then confirm in your wallet. Afterwards you get a link to put in your bio.', '创建你的收件箱', '几个引导步骤：选择名字和价格，确认一次性成本，然后在钱包中确认。完成后会得到一个可放在简介中的链接。'],
};

/** Info-hint text for a key (renders nothing for unknown keys). */
export function H({ k }: { k: string }): ReactNode {
  const { lang } = useI18n();
  const e = HELP[k];
  return e ? (lang === 'zh' ? e[1] : e[0]) : null;
}

/** Page intro banner for an app route. */
export function Intro({ page }: { page: keyof typeof INTRO | string }) {
  const { lang } = useI18n();
  const e = INTRO[page];
  if (!e) return null;
  return (
    <PageIntro id={page} title={lang === 'zh' ? e[2] : e[0]}>
      {lang === 'zh' ? e[3] : e[1]}
    </PageIntro>
  );
}

export const HELP_KEYS = Object.keys(HELP);
