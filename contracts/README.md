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

Budget (verified on fork): createCPU 0.0066 + mint protocol fees 2 × 0.00066 + transistor prices (2,157 NAND +
203 LATCH at 0.00001 OKB ≈ 0.0236, recoverable via `transistors.withdraw()`) + 8 tape-outs × 0.0013 + mailbox
(2 NAND free + 0.0013 tape-out + 0.08 open) ≈ **0.126 OKB** plus gas (a few cents at 0.02 gwei). Fund the wallet
with ~0.2 OKB.

```bash
# 1. dry run on a fork (no funds move)
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

After deployment copy the addresses into `app/.env` (`VITE_VOXR_CPU`, `VITE_VOXR_CPU_INDEX`, `VITE_VOXRO_ESCROW`,
`VITE_VOXRO_LENS`, `VITE_MAILBOX_CPU`) and regenerate the SDK ABI if the contracts changed (`pnpm --filter @voxro/sdk abi`).

## Sourcify

`--verify --verifier sourcify` submits the exact metadata; if it fails, run
`forge verify-contract <addr> src/VoxroEscrow.sol:VoxroEscrow --verifier sourcify --chain 196 --constructor-args $(cast abi-encode "c(address,address,address)" <factory> <hub> <treasury>)`.
