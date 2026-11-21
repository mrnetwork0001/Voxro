#!/usr/bin/env node
import { catalog } from './commands/catalog.js';
import { deweb } from './commands/deweb.js';
import { escrow } from './commands/escrow.js';
import { hub } from './commands/hub.js';
import { inbox, read, receipt, refund, reply } from './commands/inbox.js';
import { key } from './commands/key.js';
import { prove, step } from './commands/prove.js';
import { CliError, bold, dim, parseArgs, red } from './util.js';

export const VERSION = '0.1.0';

const HELP = `${bold('voxro')} ${VERSION} — terminal verifier and stage companion for Voxro on X Layer (chainId 196)

${bold('Circuits')}
  voxro catalog [--json] [--cpu 0x..]              compiled VOXR catalog + launch budget
  voxro prove <ref> [--table] [--netlist] [--json]  load a circuit + REF closure, replay every transition through step()
  voxro step <ref> --state <bits> --inputs <bits>   one beat, local vs chain
  voxro eval <ref> --inputs <bits>                  combinational circuit, local vs chain
  <ref> = #id@2.cpu | id.2.cpu.tape | 0xcircuits:id        bits = 0x hex (LSB-first) or 0110

${bold('TapeSend (DeWebHub)')}
  voxro hub inbox <0xendpoint|0xcontainer> [--start --n]
  voxro hub outbox <0xcontainer> [--start --n]
  voxro hub key <0xcircuits> <tokenId>
  voxro hub msgid <0xendpoint|0xcontainer> <inboxIndex>
  voxro key derive|publish <0xcircuits> <tokenId> --cpu-index <n>   TapeSend X25519 key from a wallet signature (VOXRO_PRIVATE_KEY)

${bold('DeWEB')}
  voxro deweb plan <dir> [--container 0x..] [--fallback /index.html] [--json]
  voxro deweb publish <dir> --container 0x.. [--bind <#id>.2.<cpu>.tape]   putFile/appendChunk/setFallback + DomainBinding.bind (VOXRO_PRIVATE_KEY)

${bold('Escrow')} ${dim('(--escrow 0x.. or VOXRO_ESCROW; writes sign with VOXRO_PRIVATE_KEY)')}
  voxro quote <@handle|id> [--sender 0x..] [--json]      live quoteSend(): queue, price, tier, pause
  voxro send <@handle|id> --body "…" [--subject "…"]    seal a TAP-10 v2 Guest envelope to every member key + lock the stake
  voxro stress <@handle|id> [--n 7] [--interval 1500]     demo burst: n guest messages, prints the surge ladder as it climbs
  voxro inbox <@handle|id> [--decrypt --cpu-index <n>]    tickets of an inbox; --decrypt opens them with the recipient key (signer)
  voxro reply <ticketId> --body "…" --cpu-index <n>      two taps in one: DeWebHub.send the sealed reply, then claimBounty (95 %)
  voxro read <ticketId> --secret 0x..                     sender decrypts the stored reply with the guest reply secret
  voxro refund <ticketId>                                 refundExpired (permissionless after the window)
  voxro receipt <ticketId> --lens 0x..                    verifiable receipt from VoxroLens

${bold('Options')}  --rpc <url> (or VOXRO_RPC)   --help   --version
`;

async function main(argv: string[]) {
  const f = parseArgs(argv);
  const cmd = f._[0];
  if (f.version) return console.log(VERSION);
  if (!cmd || f.help || cmd === 'help') return console.log(HELP);
  switch (cmd) {
    case 'catalog': return catalog(f);
    case 'prove': return prove(f);
    case 'step': return step(f, 'step');
    case 'eval': return step(f, 'eval');
    case 'hub': return hub(f);
    case 'key': return key(f);
    case 'inbox': return inbox(f);
    case 'reply': return reply(f);
    case 'read': return read(f);
    case 'refund': return refund(f);
    case 'receipt': return receipt(f);
    case 'deweb': return deweb(f);
    case 'quote':
    case 'send':
    case 'stress': return escrow(cmd, f);
    default: throw new CliError(`unknown command "${cmd}" (try --help)`);
  }
}

main(process.argv.slice(2)).catch((e: unknown) => {
  const msg = e instanceof CliError ? e.message : e instanceof Error ? (e.message.split('\n')[0] ?? String(e)) : String(e);
  console.error(red(`voxro: ${msg}`));
  process.exitCode = 1;
});
