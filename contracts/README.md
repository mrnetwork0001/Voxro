# Voxro contracts

Foundry project: `VoxroEscrow.sol` (attention escrow priced by a TapeOut circuit, settled by a TapeSend reply),
`VoxroLens.sol` (one-call reads, receipts, on-chain SVG), VIP adapters (`Erc721HolderVip`, `ReputationVip`).
Solidity 0.8.28, OpenZeppelin 5.1, via-IR, 2,000 optimizer runs. No owner, no upgrades.

## Test

```bash
forge test                                   # 13 unit + fuzz tests (10,000-run conservation fuzz)
forge test --match-path test/Fork.t.sol \
  --fork-url https://rpc.xlayer.tech \
  --fork-block-number $(( $(cast block-number --rpc-url https://rpc.xlayer.tech) - 20 )) -vv
```

The fork test is the full launch rehearsal against the real Factory, circuit implementation, Opener and DeWebHub:
create VOXR → mint → tape out the 8-circuit catalog (ids 1..8) → mailbox circuit on a hub-compatible processor →
`registerInbox` → five live quotes (0.010 / 0.015 / 0.015 / 0.025 / 0.025 OKB) → real `DeWebHub.send` →
permissionless `claimBounty` with the keeper tip → Lens receipt.

## Why a “mailbox” on another processor

DeWebHub pins the Circuits proxy codehash of processors created before Factory index 387. Newer processors
(VOXR included) are rejected by `send` / `publishKey` with `NotCPU`. Voxro therefore keeps the **policy circuit on
VOXR** and the **TapeSend container on a hub-compatible processor** (default #212, free transistors). See
`TAPEOUT_XLAYER_SPEC.md` §3.4.

## Deploy (X Layer mainnet)

Never paste a private key into a chat or a shell history. Import it once into a Foundry keystore:

```bash
cast wallet import voxro --interactive        # prompts for the key and a password; stored under ~/.foundry/keystores
export XLAYER_RPC=https://rpc.xlayer.tech
```

**TapeOut Factory V2 (upgraded after the original rehearsal; re-verified on a fork on 2026-11-21):**

- `createCPU` no longer takes OKB. The deploy fee is **0.1 BEM** (`Factory.bem()`, 8 decimals), pulled with
  `transferFrom`, so the script approves it first.
- New processors charge transistor mints in BEM too: `mintPrice` (capped by `Factory.MAX_MINT_PRICE()`, 1e12 =
  10,000 BEM) plus a **0.01 BEM** protocol fee per mint call. VOXR's mint price defaults to **0** (`VOXRO_MINT_PRICE`).
- Tape-out fees, the Opener and processors created before V2 (e.g. the mailbox processor #212) still charge OKB.

Budget (measured on the fork): **≈ 0.093 OKB** (8 tape-outs × 0.0013 + mailbox mint 0.00066 + mailbox tape-out
0.0013 + Opener 0.08) **+ gas (≈ 0.002 OKB at 0.02 gwei)** and **0.12 BEM** (deploy fee 0.1 + 2 mint fees × 0.01).
Fund the deploy wallet with **≥ 0.15 OKB and ≥ 0.15 BEM**. The wallet must be an EOA with no contract code
(transistors are ERC-1155 and are minted to it).

```bash
# 1. dry run on a fork (no funds move). On the fork, give the deploy wallet BEM first, e.g.
#    cast rpc anvil_setStorageAt 0x60e62efa9405d6873c5deabd4e6cc91c25363952 $(cast index address <wallet> 5) <amount-as-32-byte-hex>
BLOCK=$(( $(cast block-number --rpc-url $XLAYER_RPC) - 20 ))
anvil --fork-url $XLAYER_RPC --fork-block-number $BLOCK --port 8572 --timeout 20000 --retries 2 &
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8572 --account voxro --broadcast --slow

# 2. live
VOXRO_HANDLE=voxro VOXRO_TREASURY=<treasury> \
forge script script/Deploy.s.sol --rpc-url $XLAYER_RPC --account voxro --broadcast --slow \
  --verify --verifier sourcify

# 3. record the addresses
cat deployments/xlayer.json       # voxrCircuits, voxrTransistors, escrow, lens, mailboxCpu, mailboxId
```

Environment knobs: `VOXRO_TREASURY` (default: broadcaster), `VOXRO_NAND` / `VOXRO_LATCH` headroom (2000 / 200),
`VOXRO_OPEN_CONTAINER` (1), `VOXRO_MAILBOX_CPU`, `VOXRO_HANDLE`, `VOXRO_TOKEN` (default USD₮0), `VOXRO_BASE_PRICE`
(default 10 USD₮0), `VOXRO_SLA` (48 h), `VOXRO_MAILBOX_KEY` (X25519 pubkey to publish; otherwise publish it from the
app with the wallet signature).

After deployment:

1. Commit `deployments/xlayer.json`. The app reads it at build time and switches from "not deployed" to mainnet; no
   `.env` edits are needed (`VITE_*` vars still override it for fork rehearsals).
2. Publish the flagship inbox's TapeSend key: open the app, connect the deploy wallet, go to **Inbox** and press
   **Publish key** (one signature + one gas-only transaction). Until then nobody can message `@voxro`.
3. Rebuild and redeploy the app (`pnpm --filter @voxro/app build`).
4. Regenerate the SDK ABI only if the contracts changed (`pnpm --filter @voxro/sdk abi`).

The full app flow against a fork is covered by `app/test/fork.e2e.test.ts` (register → send → decrypt → reply →
claim → read reply, refund, decline, DeWEB card, USD₮0 inbox, flagship key; also after wiping browser storage).

## Sourcify

`--verify --verifier sourcify` submits the exact metadata; if it fails, run
`forge verify-contract <addr> src/VoxroEscrow.sol:VoxroEscrow --verifier sourcify --chain 196 --constructor-args $(cast abi-encode "c(address,address,address)" <factory> <hub> <treasury>)`.
