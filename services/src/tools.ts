/**
 * Voxro tools for AI agents (Model Context Protocol). Read tools work everywhere; paying tools need an
 * agent wallet (local MCP: VOXRO_AGENT_KEY) or point to the x402 gateway (hosted MCP).
 */
import { parseUnits, type LocalAccount } from 'viem';
import { readReply, refund, sendPaid } from './agent.js';
import { ORIGIN, TIER_X, chainNow, directory, hours, inboxByHandle, ladder, money, profileLink, tokenInfo, type Inbox } from './chain.js';

export interface Tool {
  name: string;
  description: string;
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
}

const handleProp = { type: 'string', description: 'Inbox handle, e.g. "voxro" or "@voxro"' };

export const READ_TOOLS: Tool[] = [
  { name: 'voxro_list_inboxes', description: 'List people reachable on Voxro (a paid priority inbox on X Layer) with their live price, reply window and reply record.', inputSchema: { type: 'object', properties: {} } },
  {
    name: 'voxro_get_inbox',
    description: 'Live details for one Voxro inbox: current price to message it (computed by its onchain circuit), how the price rises as its queue fills, reply window, reply record and VIP rule. Messaging a human through Voxro costs money; check this before sending.',
    inputSchema: { type: 'object', properties: { handle: handleProp }, required: ['handle'] },
  },
];

export const PAY_TOOLS: Tool[] = [
  {
    name: 'voxro_send_message',
    description: 'Send a paid, end-to-end encrypted priority message to a human on Voxro. The price is locked in the VoxroEscrow contract on X Layer: the recipient earns 95% only by replying within their reply window, otherwise the agent can take a 100% refund. Set max_price to cap what you are willing to pay.',
    inputSchema: {
      type: 'object',
      properties: {
        handle: handleProp,
        subject: { type: 'string', description: 'Short subject line' },
        body: { type: 'string', description: 'The message. Be specific about why the recipient should reply.' },
        max_price: { type: 'string', description: 'Maximum price in the inbox token, e.g. "25" for 25 USD₮0. The send is refused if the live price is higher.' },
      },
      required: ['handle', 'body'],
    },
  },
  { name: 'voxro_check_reply', description: 'Status of a message this agent sent, and the decrypted reply once the recipient has answered.', inputSchema: { type: 'object', properties: { ticket_id: { type: 'number' } }, required: ['ticket_id'] } },
  { name: 'voxro_refund', description: 'Take a 100% refund for a message whose reply window passed without an answer.', inputSchema: { type: 'object', properties: { ticket_id: { type: 'number' } }, required: ['ticket_id'] } },
];

function describe(ib: Inbox): string {
  const q = ib.quote;
  return [
    `@${ib.handle} (${ib.preset}), ${ib.active ? 'active' : 'paused'}`,
    q.canSend ? `Price now: ${money(ib.token, q.price)} (${TIER_X[q.tier]})` : 'Queue full: new senders are paused',
    `Queue: ${ib.queue}/7 · reply window ${hours(ib.slaSeconds)} · price as the queue fills: ${[...new Set(ladder(ib).map((p) => money(ib.token, p)))].join(' → ')}`,
    `Record: ${ib.answered} answered, ${ib.refunded} refunded${ib.avgReplySeconds != null ? `, average reply ${hours(ib.avgReplySeconds)}` : ''}`,
    ib.communityVip ? 'VIP: TapeOut community wallets (FabX rigs, TapeCode-Test1, ≥0.01 BEM or ≥1 FAB) pay one tier lower and 50% off' : '',
    `Profile: ${profileLink(ib.handle)}`,
  ].filter(Boolean).join('\n');
}

const text = (t: string, isError = false) => ({ content: [{ type: 'text', text: t }], ...(isError ? { isError: true } : {}) });

export async function callTool(name: string, args: Record<string, unknown>, ctx: { account?: LocalAccount; gateway?: string }) {
  try {
    switch (name) {
      case 'voxro_list_inboxes': {
        const all = (await directory()).filter((i) => i.active);
        return text(all.length ? all.map((i) => `@${i.handle}: ${money(i.token, i.quote.price)} · replies within ${hours(i.slaSeconds)} · ${i.answered} answered`).join('\n') : 'No inboxes yet.');
      }
      case 'voxro_get_inbox': {
        const ib = await inboxByHandle(String(args.handle ?? ''), ctx.account?.address);
        return ib ? text(describe(ib)) : text(`No Voxro inbox called ${args.handle}`, true);
      }
      case 'voxro_send_message': {
        if (!ctx.account) {
          const h = String(args.handle ?? '').replace(/^@/, '');
          return text(
            ctx.gateway
              ? `This hosted server has no wallet. Pay with x402 instead: POST ${ctx.gateway}/api/agent/send/${h} with JSON {"subject","body"}. You will get HTTP 402 with the exact USD₮0 amount; retry with an X-PAYMENT header (EIP-3009 authorization on X Layer). Or run the local Voxro MCP server with your own wallet key.`
              : 'No agent wallet configured. Set VOXRO_AGENT_KEY to the private key of a funded X Layer wallet that this agent controls.',
            true,
          );
        }
        const ib = await inboxByHandle(String(args.handle ?? ''), ctx.account.address);
        if (!ib) return text(`No Voxro inbox called ${args.handle}`, true);
        const maxPrice = args.max_price !== undefined ? parseUnits(String(args.max_price), tokenInfo(ib.token).decimals) : undefined;
        const r = await sendPaid(ctx.account, { handle: ib.handle, subject: String(args.subject ?? ''), body: String(args.body ?? ''), maxPrice });
        return text(`Sent. Ticket #${r.ticketId}: ${r.price} locked in escrow for @${r.inbox}. They have ${hours(r.replyWithin)} to reply; otherwise call voxro_refund. Transaction: ${r.tx}`);
      }
      case 'voxro_check_reply': {
        if (!ctx.account) return text('No agent wallet configured; replies can only be decrypted by the wallet that sent the message.', true);
        const r = await readReply(ctx.account, Number(args.ticket_id));
        const left = r.deadline - (await chainNow());
        if (r.reply) return text(`Reply to ticket #${r.ticketId}${r.reply.subject ? ` (${r.reply.subject})` : ''}:\n\n${r.reply.body}`);
        return text(r.status === 'Pending' ? `Ticket #${r.ticketId}: waiting for a reply (${r.amount} locked, ${left > 0 ? `${hours(left)} left` : 'window passed: call voxro_refund'}).` : `Ticket #${r.ticketId}: ${r.status}.`);
      }
      case 'voxro_refund': {
        if (!ctx.account) return text('No agent wallet configured.', true);
        const h = await refund(ctx.account, Number(args.ticket_id));
        return text(`Refunded ticket #${args.ticket_id} in full. Transaction: ${h}`);
      }
      default:
        return text(`Unknown tool ${name}`, true);
    }
  } catch (e) {
    return text((e as Error).message.split('\n')[0]!.slice(0, 400), true);
  }
}

/** Minimal MCP (JSON-RPC 2.0) dispatcher shared by the stdio and HTTP transports. */
export async function handleRpc(msg: { jsonrpc: '2.0'; id?: number | string | null; method: string; params?: Record<string, unknown> }, ctx: { account?: LocalAccount; gateway?: string }) {
  const tools = [...READ_TOOLS, ...PAY_TOOLS];
  const ok = (result: unknown) => ({ jsonrpc: '2.0' as const, id: msg.id ?? null, result });
  switch (msg.method) {
    case 'initialize':
      return ok({
        protocolVersion: (msg.params?.protocolVersion as string) ?? '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'voxro', version: '0.1.0' },
        instructions: `Voxro is a paid priority inbox on X Layer (${ORIGIN}). Reaching a human costs a price set by their onchain circuit; it rises when they are busy. They earn 95% only by replying in time; otherwise you get 100% back. Check voxro_get_inbox before voxro_send_message, and always set max_price.`,
      });
    case 'tools/list':
      return ok({ tools });
    case 'tools/call':
      return ok(await callTool(String(msg.params?.name), (msg.params?.arguments as Record<string, unknown>) ?? {}, ctx));
    case 'ping':
      return ok({});
    default:
      if (msg.id === undefined || msg.method.startsWith('notifications/')) return null;
      return { jsonrpc: '2.0' as const, id: msg.id, error: { code: -32601, message: `Method not found: ${msg.method}` } };
  }
}
