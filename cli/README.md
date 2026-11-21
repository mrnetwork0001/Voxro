# voxro CLI

Terminal verifier and Demo Day stage companion for Voxro on X Layer (chainId 196). Read-only commands need no key.
Writes sign with `VOXRO_PRIVATE_KEY` (environment variable only, never an argument). Addresses: `--escrow` /
`VOXRO_ESCROW`, `--lens` / `VOXRO_LENS`, RPC `--rpc` / `VOXRO_RPC`.

```bash
pnpm --filter @voxro/sdk build && pnpm --filter @voxro/cli build
node cli/dist/bin.js --help          # or: pnpm --filter @voxro/cli dev -- <command>
```

## Circuits (any processor on X Layer)

| Command | What it does |
|---|---|
| `voxro catalog [--json]` | compiled VOXR catalog: ids, pins, gateCount, burn, bytes, launch budget |
| `voxro prove <ref> [--table] [--netlist] [--json]` | load a circuit with its REF closure and replay every `(state, input)` through `step()` on chain via Multicall3 |
| `voxro step <ref> --state <bits> --inputs <bits>` / `voxro eval <ref> --inputs <bits>` | one beat, local simulator vs chain |

`<ref>` = `#id@2.cpu`, `id.2.cpu.tape` or `0xcircuits:id`. Mainnet example: `voxro prove '#1@2.0'` → `4/4 transitions match step() on chain`.

## TapeSend (DeWebHub)

| Command | What it does |
|---|---|
| `voxro hub inbox <endpoint\|container>` / `hub outbox <container>` / `hub key <circuits> <id>` / `hub msgid <to> <i>` | hub reads |
| `voxro key derive\|publish <circuits> <tokenId> --cpu-index <n>` | derive the X25519 key from the signer's EIP-4361 signature (domain `voxro.shieldsuite.xyz`) and publish it; `--app tapesend` reproduces the official text |

## Escrow

| Command | What it does |
|---|---|
| `voxro quote <@handle\|id> [--sender 0x..]` | `quoteSend()`: queue, price, tier, pause |
| `voxro send <@handle\|id> --body "…" [--subject "…"]` | seal a TAP-10 v2 Guest envelope to every usable member key, approve if ERC-20, `sendGuestPriority`; prints the guest reply secret |
| `voxro stress <@handle\|id> [--n 7] [--interval 1500]` | demo burst; prints the surge ladder as it climbs |
| `voxro inbox <@handle\|id> [--decrypt --cpu-index <n>]` | recipient view; `--decrypt` opens the stored envelopes with the derived key |
| `voxro reply <ticketId> --body "…" --cpu-index <n>` | two taps in one: `DeWebHub.send` the sealed reply, verify the digest, `claimBounty` with the bytes |
| `voxro read <ticketId> --secret 0x..` | sender decrypts the stored reply |
| `voxro refund <ticketId>` | `refundExpired` (anyone after the window; 0.1 % keeper tip) |
| `voxro receipt <ticketId> --lens 0x..` | verifiable receipt from VoxroLens |

## DeWEB

`voxro deweb plan <dir> [--container 0x..] [--fallback /index.html]` — chunk a built site and print the `SiteRegistry` call plan and manifest.

## Verified run (Anvil fork of X Layer, 2026-11-02)

```
$ voxro stress @voxro --n 7
#1 Q 0→1 0.01 OKB    #2 Q 1→2 0.015 OKB   #3 Q 2→3 0.015 OKB   #4 Q 3→4 0.025 OKB
#5 Q 4→5 0.025 OKB   #6 Q 5→6 0.04 OKB    #7 Q 6→7 0.04 OKB
$ voxro inbox @voxro --decrypt --cpu-index 212
  #1 pending 0.01 from 0xA306… guest 47h left   stress 1 — burst message 1 of 7
$ voxro reply 1 --body "Deal. Call Tuesday 10:00 UTC." --cpu-index 212
1/2 reply recorded DeWebHub.send tx 0x20aa… · inboxIndex 0
2/2 bounty claimed tx 0xd63a…
$ voxro receipt 1
  ✓ entry.from is an inbox member container
  ✓ createdAt <= entry.timestamp <= deadline
  ✓ entry.digest == keccak256(expectedReplyRef || keccak256(payload))
$ voxro quote @voxro        → Q = 6 · pending 6 · answered 1 · 0.04 OKB (4.0×)
```
