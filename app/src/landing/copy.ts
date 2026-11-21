/** Landing-page copy, EN + 简体中文. Kept apart from the app dictionary so the dApp bundle stays lean to read. */
import type { Lang } from '../i18n.tsx';

export interface LandingCopy {
  nav: { product: string; how: string; hardware: string; lanes: string; trust: string; faq: string; launch: string; docs: string; prover: string };
  hero: {
    kicker: string;
    h1: [string, string];
    lede: string;
    launch: string;
    secondary: string;
    stats: { block: string; processors: string; proven: string; burn: string };
    widget: { title: string; sub: string; quote: string; queue: string; send: string; reply: string; refund: string; blocked: string };
  };
  problem: { kicker: string; title: string; lede: string; cards: Array<{ title: string; body: string }> };
  how: { kicker: string; title: string; steps: Array<{ title: string; body: string }> };
  hardware: { kicker: string; title: string; lede: string; facts: Array<{ k: string; v: string; sub: string }>; pinsIn: string[]; pinsOut: string[]; cells: string[]; note: string; prover: string };
  lanes: { kicker: string; title: string; lede: string; head: [string, string, string]; rows: Array<[string, string, string]>; note: string };
  trust: { kicker: string; title: string; items: Array<{ title: string; body: string }> };
  who: { kicker: string; title: string; personas: Array<{ title: string; preset: string; body: string }> };
  model: { kicker: string; title: string; items: Array<{ title: string; body: string }> };
  stack: { kicker: string; title: string; items: Array<{ name: string; role: string }> };
  faq: { kicker: string; title: string; items: Array<{ q: string; a: string }> };
  cta: { title: string; body: string; launch: string; spec: string };
  footer: { line: string; built: string };
}

const en: LandingCopy = {
  nav: { product: 'Product', how: 'How it works', hardware: 'Hardware', lanes: 'Lanes', trust: 'Guarantees', faq: 'FAQ', launch: 'Launch app', docs: 'Spec', prover: 'Prover' },
  hero: {
    kicker: 'Attention escrow on X Layer · TapeOut circuits · TapeSend · DeWEB',
    h1: ['Your inbox,', 'priced by a circuit.'],
    lede: 'Voxro is a paid priority inbox with no server. Senders lock USD₮0 to reach you, an on-chain LATCH counter raises the price when you are busy, and your encrypted TapeSend reply releases the bounty with zero oracle. No reply, 100% refund.',
    launch: 'Launch app',
    secondary: 'See the circuits',
    stats: { block: 'X Layer block', processors: 'TapeOut processors live', proven: 'Transitions proven', burn: 'Transistors burned by the catalog' },
    widget: { title: 'Live gate · FounderBalancedInbox', sub: 'The real compiled circuit, stepped in your browser', quote: 'Next cold sender pays', queue: 'LATCH queue', send: 'Cold sender locked {price} · Q {from}→{to}', reply: 'Reply verified · {paid} paid, {fee} fee · Q {from}→{to}', refund: 'Silence · 100% refund · Q {from}→{to}', blocked: 'Paused for cold senders at Q = 7' },
  },
  problem: {
    kicker: '01 · Why',
    title: 'Everyone worth reaching has closed their DMs.',
    lede: 'Founders, VCs, auditors and KOLs drown in bots, so they stop reading. Serious senders have no way to prove they are serious. Earn.com sold that market to Coinbase for $100M, with a server in the middle, plaintext messages and 20–50% fees.',
    cards: [
      { title: 'Recipients lose signal', body: 'Partnership offers, whitehat disclosures and job offers sit next to 400 airdrop scams. Closing DMs is the only tool, and it throws away the good with the bad.' },
      { title: 'Senders pay in uncertainty', body: 'A cold email costs nothing, so it is worth nothing. Paying a middleman does not help: the money is gone whether or not anyone reads the message.' },
      { title: 'Middlemen read everything', body: 'Centralised paid inboxes store plaintext, set the price, hold the funds and can disappear. The attention market needs settlement without a trusted operator.' },
    ],
  },
  how: {
    kicker: '02 · How it works',
    title: 'Four steps, all on chain, nothing in between.',
    steps: [
      { title: 'Tape out your gate', body: 'Pick a surge curve and VIP rules. The compiler emits an InboxController circuit on the VOXR processor: six NAND of glue around three reusable REF cells. All 512 state transitions are proven before a single transistor is spent.' },
      { title: 'Senders encrypt and lock', body: 'A sender encrypts to your DeWebHub X25519 key (TAP-10 v2, X25519 + XChaCha20-Poly1305) and locks the quoted stake. The escrow runs your circuit with dir = 1 and the LATCH queue steps up.' },
      { title: 'The price surges with load', body: 'Every unread message raises the queue; every reply or refund lowers it. Quotes move 1× → 1.5× → 2.5× → 4× along your curve, and partner-circuit holders get one tier down and 50% off.' },
      { title: 'A reply settles the bounty', body: 'You answer through DeWebHub.send(). claimBounty reads the inbox entry and checks digest == keccak256(ref ‖ keccak256(payload)). 95% to you, 5% protocol. Silence past the window refunds 100%.' },
    ],
  },
  hardware: {
    kicker: '03 · Hardware',
    title: 'Pricing rules you can read gate by gate.',
    lede: 'Instead of a custom Solidity contract that could trap funds, every inbox is a bounded sequential circuit on a frozen TapeOut processor: 3 LATCH bits of state, 6 input bits, 7 output bits. Small enough to prove exhaustively, composable through REF with zero transistor burn.',
    facts: [
      { k: '512', v: 'transitions', sub: 'every (state, input) pair, proven against the reference model and replayed through step() on an X Layer fork' },
      { k: '6', v: 'NAND per inbox', sub: 'the only transistors a controller burns; the three standard cells are shared through REF' },
      { k: '3', v: 'LATCH bits', sub: 'a saturating 0..7 backlog counter stepped by the escrow' },
      { k: '157 + 3', v: 'NAND + LATCH', sub: 'total burn for the whole launch catalog of 8 circuits' },
    ],
    pinsIn: ['active', 'dir', 'p0', 'p1', 'isAllowlisted', 'holdsPartner'],
    pinsOut: ['effTier0', 'effTier1', 'vipDiscount50', 'canSend', "Q'0", "Q'1", "Q'2"],
    cells: ['#1 SaturatingQueue3 · 56 NAND + 3 LATCH', '#2 SurgeCurveDecoder · 50 NAND', '#3 VipPassGate · 21 NAND'],
    note: 'Five presets ship at launch: #4 FounderBalanced, #5 VcFortress, #6 AuditorDisclosure, #7 Steep and #8 Configurable. The escrow only checks circuitInfo == (6, 7, 3, *), so any recipient can tape out their own variant.',
    prover: 'Proven in this browser just now',
  },
  lanes: {
    kicker: '04 · Two lanes in',
    title: 'Container to container, or one click with no container.',
    lede: 'TapeSend power users send from their own DeWEB container. Everyone else uses the Guest Express lane: same encryption, same escrow, no 0.08 OKB container to open first. In both lanes the reply is verified on chain through DeWebHub.inboxAt().',
    head: ['', 'Container lane', 'Guest Express'],
    rows: [
      ['Who', 'Holders of an opened DeWEB container', 'Any wallet, including first-time OKX Wallet users'],
      ['Message path', 'DeWebHub.send() from your container, escrow verifies the inbox entry', 'Escrow emits your sealed envelope in the lock transaction'],
      ['Reply target', 'Your container endpoint', 'The escrow endpoint (chainId ‖ escrow address)'],
      ['Reply reference', 'TAP-10 messageId of your message', 'Deterministic ticketRef'],
      ['Decrypt the reply with', 'Your container key', 'A reply key generated in your browser'],
      ['Setup cost', '0.08 OKB once (also powers your tape:// site)', 'None'],
    ],
    note: 'DeWebHub only format-checks the destination endpoint, so the escrow address itself is a valid inbox and no relay container is needed.',
  },
  trust: {
    kicker: '05 · Guarantees',
    title: 'What you can verify without trusting us.',
    items: [
      { title: 'End-to-end encrypted', body: 'TAP-10 v2 sealed payloads. Only the recipient key (or the guest reply key) opens a message; the chain stores a digest, never plaintext.' },
      { title: 'Oracle-free settlement', body: 'claimBounty verifies the recipient container, the time window and keccak256(ref ‖ keccak256(payload)) against DeWebHub storage. No signer, no server.' },
      { title: '100% refund on silence', body: 'After the reply window, refundExpired returns the full stake to the sender and steps the queue down. The protocol fee is charged on answered messages only.' },
      { title: 'Pricing you can prove', body: 'The circuit is immutable on a frozen beacon. The app proves every transition before tape-out and can replay them through step() on chain.' },
      { title: 'Ownerless contracts', body: 'No admin keys, no upgrades, no pause switch. Fees are pull-based so an odd token can never block settlement.' },
      { title: 'Unstoppable front end', body: 'The client and every contact card are published to X Layer SiteRegistry as tape:// sites with zero external requests. If voxro.shieldsuite.xyz disappears, nothing changes.' },
    ],
  },
  who: {
    kicker: '06 · Who it is for',
    title: 'One circuit per kind of inbox.',
    personas: [
      { title: 'Founders & BD leads', preset: '#4 FounderBalancedInbox', body: 'Balanced curve. 10 USD₮0 to open a conversation, 40 USD₮0 during a launch week, half price for partner-circuit holders.' },
      { title: 'Venture funds', preset: '#5 VcFortressInbox', body: 'Fortress curve. Price climbs fast and cold outreach pauses entirely when the queue is full; portfolio founders on the allowlist always get through.' },
      { title: 'Security teams', preset: '#6 AuditorDisclosureInbox', body: 'Gentle curve so whitehats are never priced out of a critical disclosure, with a seven-day window and a priority bounty lane.' },
      { title: 'KOLs & maintainers', preset: '#7 Steep / #8 Configurable', body: 'Steep for pure spam defence, or Configurable to let the escrow pick the curve per inbox. Put the tape:// card in your bio and get paid to read.' },
    ],
  },
  model: {
    kicker: '07 · Business model',
    title: 'Paid only when attention is actually delivered.',
    items: [
      { title: '5% settlement fee', body: 'Charged in USD₮0, USDT or OKB when a recipient replies and claims. Expired refunds carry no fee at all.' },
      { title: 'Transistor mint revenue', body: 'Custom inbox gates mint NAND on the VOXR processor at 0.00001 OKB each; creator revenue is withdrawn through transistors.withdraw().' },
      { title: 'Circuit Market', body: 'Reusable surge and VIP cells and transferable @handle containers trade on the X Layer Circuit Market. Voxro never trades its own listings.' },
    ],
  },
  stack: {
    kicker: '08 · Built on',
    title: 'Every address is public and verified.',
    items: [
      { name: 'TapeOut Factory', role: 'Processor registry · createCPU, cpuAt, isCPU' },
      { name: 'DeWebHub (TapeSend)', role: 'TAP-10 hub · keyFor, send, inboxAt, digests in storage' },
      { name: 'SiteRegistry (DeWEB)', role: '24,000-byte chunks · putFile, appendChunk, setFallback' },
      { name: 'DomainBinding', role: '<#ID>.2.<cpu>.tape names · bind, monthlyFee 0' },
      { name: 'Circuit Market', role: 'Trade circuits · feeBps 100' },
      { name: 'Transistor Drops', role: 'Ownerless starter transistors' },
      { name: 'USD₮0 / USDT', role: 'Settlement tokens, 6 decimals' },
      { name: 'Multicall3', role: 'Batched reads, no eth_getLogs limits' },
    ],
  },
  faq: {
    kicker: '09 · FAQ',
    title: 'Questions judges ask.',
    items: [
      { q: 'Why a NAND + LATCH circuit instead of basePrice × multiplier in Solidity?', a: 'Because every recipient wants different rules, and custom Solidity for each would be unaudited code holding other people’s money. A bounded 3-LATCH circuit has 512 transitions; the app proves all of them before tape-out and can replay them on chain, so senders can check the exact pricing and refund rules they are signing up for. REF also lets anyone compose ecosystem discounts with zero transistor burn.' },
      { q: 'What stops a recipient from replying “k” to farm bounties?', a: 'The same thing that keeps Earn.com-style markets honest: a public, on-chain response history and sender ratings on the contact card. A KOL who farms junk replies watches their quality score fall and their inbound dry up.' },
      { q: 'Does every sender have to pay 0.08 OKB to open a container?', a: 'No. Recipients open one container, which powers both their tape:// site and their TapeSend key. Senders can use their own container or the one-click Guest Express lane, encrypted to the exact same key. Both lanes are verified through DeWebHub.inboxAt().' },
      { q: 'What happens if voxro.shieldsuite.xyz goes offline?', a: 'Nothing. The client and contact cards live on SiteRegistry, messages live in DeWebHub, circuits live on the frozen TapeOut beacon and the escrow is ownerless. Anyone can send, reply, claim or refund directly from chain data.' },
      { q: 'Is anything deployed yet?', a: 'The SDK, compiler, prover, TAP-10 port, the VoxroEscrow and VoxroLens contracts (13 unit and fuzz tests) and this client are complete. The whole launch has been rehearsed on an X Layer fork: processor creation, eight tape-outs, a mailbox container, live quotes from step(), a real DeWebHub reply and a keeper claim. Mainnet deployment is the next step; until then the app runs every flow against a local simulation driven by the real circuits.' },
      { q: 'Why is the TapeSend mailbox on another processor?', a: 'DeWebHub pins the bytecode hash of the processors’ Circuits proxy. Processors created after Factory index 386 have a different proxy and are rejected with NotCPU, so no new processor can send TapeSend today. Voxro keeps the pricing circuit on VOXR and gives each recipient a free two-NAND mailbox circuit on a hub-compatible processor. The escrow was designed with the policy circuit and the inbox container separate, so nothing changed.' },
    ],
  },
  cta: { title: 'Open the app and step the circuit yourself.', body: 'Live X Layer reads, real TAP-10 encryption in your browser, and a 512-transition proof you can watch run.', launch: 'Launch app', spec: 'Read the circuit spec' },
  footer: { line: 'Voxro (VOXR) · X Layer chainId 196 · X Layer TapeOut Accelerate', built: 'Built by mrnetwork0001 · MIT' },
};

const zh: LandingCopy = {
  nav: { product: '产品', how: '工作原理', hardware: '硬件', lanes: '通道', trust: '保障', faq: '常见问题', launch: '启动应用', docs: '规范', prover: '验证器' },
  hero: {
    kicker: 'X Layer 上的注意力托管 · TapeOut 电路 · TapeSend · DeWEB',
    h1: ['你的收件箱，', '由电路定价。'],
    lede: 'Voxro 是一个没有服务器的付费优先收件箱。发送方锁定 USD₮0 才能触达你，链上 LATCH 计数器在你忙碌时自动提价，你的加密 TapeSend 回复零预言机释放赏金。无人回复，100% 退款。',
    launch: '启动应用',
    secondary: '查看电路',
    stats: { block: 'X Layer 区块', processors: '在线 TapeOut 处理器', proven: '已验证状态转移', burn: '目录消耗的晶体管' },
    widget: { title: '实时门电路 · FounderBalancedInbox', sub: '真实编译电路，在你的浏览器中逐拍运行', quote: '下一位冷启动发送方支付', queue: 'LATCH 队列', send: '冷启动发送方锁定 {price} · Q {from}→{to}', reply: '回复已验证 · 支付 {paid}，手续费 {fee} · Q {from}→{to}', refund: '无人回复 · 100% 退款 · Q {from}→{to}', blocked: 'Q = 7 时对冷启动发送方暂停' },
  },
  problem: {
    kicker: '01 · 为什么',
    title: '值得联系的人，都已经关闭了私信。',
    lede: '创始人、VC、审计师和 KOL 被机器人淹没，于是干脆不再阅读。认真的发送方无法证明自己的诚意。Earn.com 把这个市场以 1 亿美元卖给了 Coinbase——中间有服务器、明文消息和 20–50% 的手续费。',
    cards: [
      { title: '接收方丢失信号', body: '合作邀约、白帽漏洞披露和工作机会与 400 条空投骗局混在一起。关闭私信是唯一的工具，但它把好消息和坏消息一起扔掉。' },
      { title: '发送方为不确定性买单', body: '一封冷邮件零成本，所以也零价值。付钱给中间商也没用：无论有没有人读，钱都没了。' },
      { title: '中间商读取一切', body: '中心化的付费收件箱存储明文、制定价格、托管资金，还可能随时消失。注意力市场需要无需可信运营方的结算。' },
    ],
  },
  how: {
    kicker: '02 · 工作原理',
    title: '四步，全部在链上，中间没有任何人。',
    steps: [
      { title: '流片你的门电路', body: '选择拥堵曲线与 VIP 规则。编译器在 VOXR 处理器上生成一个 InboxController 电路：三个可复用 REF 单元外加六个 NAND 胶合逻辑。在花费任何晶体管之前验证全部 512 个状态转移。' },
      { title: '发送方加密并锁定', body: '发送方用你的 DeWebHub X25519 公钥加密（TAP-10 v2，X25519 + XChaCha20-Poly1305）并锁定报价。托管合约以 dir = 1 运行你的电路，LATCH 队列上升。' },
      { title: '价格随负载上涨', body: '每条未读消息抬高队列；每次回复或退款降低队列。报价沿你的曲线在 1× → 1.5× → 2.5× → 4× 之间移动，合作电路持有者降一档并享 5 折。' },
      { title: '一条回复完成结算', body: '你通过 DeWebHub.send() 回复。claimBounty 读取收件条目并校验 digest == keccak256(ref ‖ keccak256(payload))。95% 归你，5% 归协议。超过期限无人回复则 100% 退款。' },
    ],
  },
  hardware: {
    kicker: '03 · 硬件',
    title: '逐门可读的定价规则。',
    lede: '每个收件箱不是一份可能锁死资金的自定义 Solidity 合约，而是冻结 TapeOut 处理器上的一个有界时序电路：3 位 LATCH 状态、6 位输入、7 位输出。小到可以穷举验证，并能通过 REF 零晶体管消耗地组合。',
    facts: [
      { k: '512', v: '个状态转移', sub: '每一对（状态，输入），均与参考模型比对，并在 X Layer 分叉上通过 step() 重放' },
      { k: '6', v: '个 NAND / 收件箱', sub: '控制器唯一消耗的晶体管；三个标准单元通过 REF 共享' },
      { k: '3', v: '位 LATCH', sub: '由托管合约步进的 0..7 饱和积压计数器' },
      { k: '157 + 3', v: 'NAND + LATCH', sub: '整个 8 电路发布目录的总消耗' },
    ],
    pinsIn: ['active', 'dir', 'p0', 'p1', 'isAllowlisted', 'holdsPartner'],
    pinsOut: ['effTier0', 'effTier1', 'vipDiscount50', 'canSend', "Q'0", "Q'1", "Q'2"],
    cells: ['#1 SaturatingQueue3 · 56 NAND + 3 LATCH', '#2 SurgeCurveDecoder · 50 NAND', '#3 VipPassGate · 21 NAND'],
    note: '上线时提供五个预设：#4 FounderBalanced、#5 VcFortress、#6 AuditorDisclosure、#7 Steep 与 #8 Configurable。托管合约只检查 circuitInfo == (6, 7, 3, *)，任何接收方都可以流片自己的变体。',
    prover: '刚刚在此浏览器中完成验证',
  },
  lanes: {
    kicker: '04 · 两条入口通道',
    title: '容器到容器，或无需容器一键发送。',
    lede: 'TapeSend 重度用户从自己的 DeWEB 容器发送。其他人使用访客快速通道：相同的加密、相同的托管，无需先花 0.08 OKB 开通容器。两条通道的回复都通过 DeWebHub.inboxAt() 在链上验证。',
    head: ['', '容器通道', '访客快速通道'],
    rows: [
      ['适用对象', '已开通 DeWEB 容器的持有者', '任何钱包，包括首次使用 OKX 钱包的用户'],
      ['消息路径', '从你的容器调用 DeWebHub.send()，托管合约验证收件条目', '托管合约在锁定交易中广播你的密封信封'],
      ['回复目标', '你的容器端点', '托管端点（chainId ‖ 托管地址）'],
      ['回复引用', '你消息的 TAP-10 messageId', '确定性的 ticketRef'],
      ['解密回复所用密钥', '你的容器密钥', '浏览器中生成的回复密钥'],
      ['准备成本', '一次性 0.08 OKB（同时驱动你的 tape:// 站点）', '无'],
    ],
    note: 'DeWebHub 只对目标端点做格式检查，因此托管地址本身就是有效收件箱，无需中继容器。',
  },
  trust: {
    kicker: '05 · 保障',
    title: '无需信任我们即可验证的事。',
    items: [
      { title: '端到端加密', body: 'TAP-10 v2 密封载荷。只有接收方密钥（或访客回复密钥）能打开消息；链上只存摘要，从不存明文。' },
      { title: '零预言机结算', body: 'claimBounty 对照 DeWebHub 存储验证接收方容器、时间窗口以及 keccak256(ref ‖ keccak256(payload))。没有签名者，没有服务器。' },
      { title: '无人回复 100% 退款', body: '回复期限过后，refundExpired 把全部质押退还发送方并让队列下降。协议费只对已回复的消息收取。' },
      { title: '可证明的定价', body: '电路在冻结的 beacon 上不可变。应用在流片前验证每个状态转移，并可在链上通过 step() 重放。' },
      { title: '无主合约', body: '没有管理员密钥，不可升级，没有暂停开关。手续费采用拉取式，异常代币永远无法阻塞结算。' },
      { title: '不可阻挡的前端', body: '客户端与每张联系名片都以 tape:// 站点形式发布到 X Layer SiteRegistry，零外部请求。voxro.shieldsuite.xyz 消失也没有任何影响。' },
    ],
  },
  who: {
    kicker: '06 · 适合谁',
    title: '每一类收件箱，一个电路。',
    personas: [
      { title: '创始人与 BD 负责人', preset: '#4 FounderBalancedInbox', body: '均衡曲线。10 USD₮0 开启一段对话，发布周期间 40 USD₮0，合作电路持有者半价。' },
      { title: '风险投资基金', preset: '#5 VcFortressInbox', body: '堡垒曲线。价格快速攀升，队列满时冷启动外联完全暂停；白名单上的投后创始人始终畅通。' },
      { title: '安全团队', preset: '#6 AuditorDisclosureInbox', body: '温和曲线，白帽永远不会因价格而无法提交关键披露，七天窗口加优先赏金通道。' },
      { title: 'KOL 与开源维护者', preset: '#7 Steep / #8 Configurable', body: '陡峭曲线用于纯粹的反垃圾，或用可配置版让托管合约按收件箱选择曲线。把 tape:// 名片放进简介，阅读即收款。' },
    ],
  },
  model: {
    kicker: '07 · 商业模式',
    title: '只有注意力真正交付时才收费。',
    items: [
      { title: '5% 结算费', body: '接收方回复并领取时以 USD₮0、USDT 或 OKB 收取。过期退款完全不收费。' },
      { title: '晶体管铸造收入', body: '自定义收件箱门电路在 VOXR 处理器上以每个 0.00001 OKB 铸造 NAND；创建者收入通过 transistors.withdraw() 提取。' },
      { title: '电路市场', body: '可复用的拥堵/VIP 单元与可转让的 @handle 容器在 X Layer 电路市场交易。Voxro 绝不交易自己的挂单。' },
    ],
  },
  stack: {
    kicker: '08 · 构建于',
    title: '每个地址都公开且经过验证。',
    items: [
      { name: 'TapeOut Factory', role: '处理器注册表 · createCPU、cpuAt、isCPU' },
      { name: 'DeWebHub (TapeSend)', role: 'TAP-10 中枢 · keyFor、send、inboxAt，摘要存于存储' },
      { name: 'SiteRegistry (DeWEB)', role: '24,000 字节分块 · putFile、appendChunk、setFallback' },
      { name: 'DomainBinding', role: '<#ID>.2.<cpu>.tape 名称 · bind，monthlyFee 0' },
      { name: 'Circuit Market', role: '电路交易 · feeBps 100' },
      { name: 'Transistor Drops', role: '无主的入门晶体管' },
      { name: 'USD₮0 / USDT', role: '结算代币，6 位小数' },
      { name: 'Multicall3', role: '批量读取，无 eth_getLogs 限制' },
    ],
  },
  faq: {
    kicker: '09 · 常见问题',
    title: '评委会问的问题。',
    items: [
      { q: '为什么用 NAND + LATCH 电路，而不是在 Solidity 里算 basePrice × multiplier？', a: '因为每个接收方想要的规则都不同，而为每个人写自定义 Solidity 就是让未经审计的代码托管别人的钱。一个有界的 3-LATCH 电路只有 512 个状态转移；应用在流片前全部验证，并能在链上重放，发送方可以核对自己签下的确切定价与退款规则。REF 还让任何人零晶体管消耗地组合生态折扣。' },
      { q: '怎么防止接收方回一个“k”来刷赏金？', a: '与 Earn.com 式市场保持诚实的机制相同：名片上公开的链上回复历史与发送方评分。刷垃圾回复的 KOL 会看着自己的质量分下降、来信枯竭。' },
      { q: '每个发送方都得付 0.08 OKB 开容器吗？', a: '不用。接收方开一个容器，同时驱动其 tape:// 站点与 TapeSend 密钥。发送方可以用自己的容器，也可以用一键访客快速通道，加密到完全相同的密钥。两条通道都通过 DeWebHub.inboxAt() 验证。' },
      { q: 'voxro.shieldsuite.xyz 下线了怎么办？', a: '没有影响。客户端与名片在 SiteRegistry 上，消息在 DeWebHub 里，电路在冻结的 TapeOut beacon 上，托管合约无主。任何人都能直接基于链上数据发送、回复、领取或退款。' },
      { q: '现在有什么已经部署了？', a: 'SDK、编译器、验证器、TAP-10 移植、VoxroEscrow 与 VoxroLens 合约（13 个单元/模糊测试）以及本客户端均已完成。整个上线流程已在 X Layer 分叉上彩排：创建处理器、八次流片、邮箱容器、来自 step() 的实时报价、真实的 DeWebHub 回复与守护者领取。下一步是主网部署；在此之前，应用用真实电路驱动的本地模拟运行全部流程。' },
      { q: '为什么 TapeSend 邮箱在另一个处理器上？', a: 'DeWebHub 固定了处理器 Circuits 代理的字节码哈希。Factory 索引 386 之后创建的处理器使用了不同的代理，会被 NotCPU 拒绝，因此今天任何新处理器都无法使用 TapeSend。Voxro 把定价电路放在 VOXR 上，并为每位接收方在兼容处理器上免费提供一个两个 NAND 的邮箱电路。托管合约在设计上就把策略电路与收件箱容器分开，所以无需改动。' },
    ],
  },
  cta: { title: '打开应用，亲手步进这个电路。', body: '实时 X Layer 读取、浏览器内真实的 TAP-10 加密，以及你能亲眼看着运行的 512 转移证明。', launch: '启动应用', spec: '阅读电路规范' },
  footer: { line: 'Voxro (VOXR) · X Layer chainId 196 · X Layer TapeOut Accelerate', built: '由 mrnetwork0001 构建 · MIT' },
};

export const LANDING: Record<Lang, LandingCopy> = { en, zh };
