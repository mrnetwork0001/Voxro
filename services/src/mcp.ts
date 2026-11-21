#!/usr/bin/env node
/**
 * Voxro MCP server (stdio), for Claude, Cursor or any MCP client running on the agent's machine.
 *
 *   { "mcpServers": { "voxro": { "command": "node", "args": ["voxro-mcp.mjs"],
 *                                "env": { "VOXRO_AGENT_KEY": "0x…" } } } }
 *
 * VOXRO_AGENT_KEY is the agent's own X Layer wallet key. It never leaves this process: messages are
 * sealed and transactions signed locally. Without it, the read tools still work.
 */
import { createInterface } from 'node:readline';
import { privateKeyToAccount } from 'viem/accounts';
import { handleRpc } from './tools.js';

const key = process.env.VOXRO_AGENT_KEY?.trim();
const account = key && /^0x[0-9a-fA-F]{64}$/.test(key) ? privateKeyToAccount(key as `0x${string}`) : undefined;
if (key && !account) process.stderr.write('voxro-mcp: VOXRO_AGENT_KEY is not a 0x-prefixed 32-byte hex key; running read-only\n');
process.stderr.write(`voxro-mcp ready${account ? ` (agent wallet ${account.address})` : ' (read-only)'}\n`);

const rl = createInterface({ input: process.stdin });
rl.on('line', async (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) + '\n');
    return;
  }
  const res = await handleRpc(msg, { account, gateway: process.env.VOXRO_GATEWAY_URL });
  if (res) process.stdout.write(JSON.stringify(res) + '\n');
});
