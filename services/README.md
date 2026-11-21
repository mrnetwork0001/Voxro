# Voxro services

Three small Node services that share one read-only view of Voxro on X Layer (`src/chain.ts`).
`pnpm build` bundles each into a single file in `dist/`.

## Telegram bot: `voxro-telegram.mjs` (@VoxrolayerBOT)

Commands: `/price @h`, `/send @h`, `/watch @h`, `/me`, `/inboxes`, `/link @h`.
Alerts for watched inboxes: new paid message, 6 hours left to reply, bounty claimed, refunded, declined.
The menu button opens Voxro as a Telegram Mini App, where users sign with OKX Wallet through OKX Connect.
**The bot never holds keys**; it only reads public chain data.

Env: `TELEGRAM_BOT_TOKEN`, `ADMIN_CHAT_ID` (only that chat may use `/waitlist`), optional `VOXRO_ORIGIN`, `BOT_DATA_DIR`.

## MCP server for AI agents: `voxro-mcp.mjs`

Tools: `voxro_list_inboxes`, `voxro_get_inbox`, `voxro_send_message`, `voxro_check_reply`, `voxro_refund`.

```json
{ "mcpServers": { "voxro": { "command": "node", "args": ["/path/to/voxro-mcp.mjs"],
  "env": { "VOXRO_AGENT_KEY": "0x… (the agent's own funded X Layer wallet)" } } } }
```

The key stays in the agent's process: messages are sealed to the recipient's published key and the
escrow lock is signed locally. The reply key is derived from the agent's signature, so replies can always
be recovered by the same wallet. Without a key, the read tools still work.

## x402 gateway: `voxro-gateway.mjs`

For agents that pay over HTTP:

1. `POST /api/agent/send/:handle` with `{"subject","body"}` → **402** with x402 `exact` requirements
   (USD₮0 on X Layer, `eip155:196`, EIP-712 domain `USD₮0` v1).
2. Retry with `X-PAYMENT` (EIP-3009 `transferWithAuthorization` to `payTo`) → **200** with `ticketId`
   and a private status URL, plus an `X-PAYMENT-RESPONSE` header.
3. `GET /api/agent/ticket/:id?token=…` → status, and the decrypted reply once answered.

The gateway wallet only fronts the escrow lock. If the recipient doesn't reply in time, a keeper refunds
the ticket and forwards 100% to the paying agent; if the lock fails after payment, the payment is
returned at once. `POST /mcp` serves the same MCP tools over HTTP (read tools plus x402 instructions).

Env: `GATEWAY_KEY` (generated on the server, never committed), `GATEWAY_PORT` (4791), `GATEWAY_DATA_DIR`.

## Tests

`pnpm test` runs the offline reply round trip. `VOXRO_LIVE=1 pnpm test` adds a live mainnet read.
The MCP and x402 flows were exercised end to end on an X Layer mainnet fork (send, 402 → pay,
replayed payment rejected, deadline refund forwarded to the payer).
