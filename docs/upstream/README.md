# Upstream reference material (vendored)

Byte-exact copies of the normative sources Voxro is built against, retrieved **2026-11-01**.
They are kept here so the SDK test-suite and the contracts can be checked against the
protocol texts offline, and so reviewers can diff our implementation against the originals.

| Path | Source | License |
|---|---|---|
| `tap-02/TAP-02.md`, `reference.py`, `vectors.json`, `chain-verification.md` | https://github.com/TapeOutProtocol/TAPs (`TAPs/TAP-02.md`, `assets/tap-02/`) | CC0-1.0 (spec), MIT (code) |
| `tap-10/TAP-10.md` | https://github.com/TapeOutProtocol/TAPs (`TAPs/TAP-10.md`) | CC0-1.0 |
| `tapekit/DeWebHub.sol` | https://github.com/TapeOutProtocol/TapeKit (`send/contracts/src/DeWebHub.sol`) | MIT |
| `tapekit/send/*.js` | https://github.com/TapeOutProtocol/TapeKit (`send/module/src/`) | MIT |

Upstream `TapeKit` default branch `main`, last pushed 2026-10-22T17:22:00Z.

## Facts verified against X Layer mainnet (chainId 196) on 2026-11-01

Read-only unless noted. Fork experiments used a local Anvil fork of `https://rpc.xlayer.tech`.

- `Factory.cpuCount() = 404`, `deployFee() = 0.0066 OKB`, `cpuAt(i)` returns the **circuits** address, `isCPU(circuits) = true`.
- `Circuits.TAPEOUT_FEE() = 0.0013 OKB`; `circuitInfo(id)` returns `(uint32 nIn, uint32 nOut, uint32 nState, uint32 gateCount)`;
  `netlist(id)` returns the raw bytes; `nextId()` on X Layer returns the **last assigned id** (fresh processor: `0`; after the
  first tape-out: `1`, and that circuit is `#1`).
- `Transistors.protocolFee() = 0.00066 OKB` per `mint` call; `mint(id, amount)` requires `msg.value == amount * mintPrice + protocolFee`;
  creator revenue accrues in `owed(creator)`.
- `Opener.FEE() = 0.08 OKB`; `DomainBinding.monthlyFee() = 0`; `SiteRegistry.CHUNK_MAX() = 24000`; `CircuitMarket.feeBps() = 100`.
- `USD₮0` decimals `6`, symbol `"USD₮0"`.
- ERC-1967 implementation slots: Factory → `0xb41c…293d`, DeWebHub → `0xdcc5…f9c6` (both as pinned by TapeKit `chain.js`).
- **TAP-02 conformance of the X Layer circuit implementation `0x977f…29B2`** (fork, state-changing): the official `toggle`
  and `ref_with_state` vectors tape out and all **16/16 beats** match `step()` bit for bit; packing edge cases on `nand` match;
  `eval` on a sequential circuit reverts `has latch: use step`. TAP-02 lists this comparison as not yet done for X Layer.
- REF semantics (fork): a parent that only `REF`s a 2-LATCH circuit reports `nState = 2` and `gateCount` includes the
  sub-circuit's gates; the transistor burn counts **top-level NAND/LATCH records only** (REF'd gates are not burned again).
- `DeWebHub.send()` requires `ownerOf(tokenId) == msg.sender` and an opened container for the **sender** only; the `to`
  endpoint is format-checked but need not exist or be opened. `publishKey` additionally requires a plain (EOA / EIP-7702) holder.

## Fork rehearsal of the Voxro catalog (2026-11-01)

`sdk/scripts/fork-test.sh` on an Anvil fork pinned at block 74795530: created a throw-away processor
(`createCPU`), minted exactly the catalog's transistor burn, taped out circuits `#1`–`#8` (three standard
cells + five `InboxController` variants, each burning 6 NAND / 0 LATCH), confirmed `circuitInfo` equals the
local resolver for all eight, and replayed **2,656 transitions** (32 + 32 + 32 + 5 × 512) through `step()`
with zero mismatches. Wall time ≈ 13 s.
