# Voxro (`VOXR`)

**Attention-Escrow & Hardware Surge-Pricing Priority Inbox on X Layer `DeWEB` & `TapeSend`.**

- **Hackathon:** X Layer TapeOut Accelerate (`100,000 USDT` Prize Pool · Deadline: Dec 7, 2026 @ 23:59 UTC)
- **Builder:** `mrnetwork0001` — a new product from the [ShieldSuite](https://shieldsuite.xyz) studio, built from scratch for TapeOut
- **Live:** [voxro.shieldsuite.xyz](https://voxro.shieldsuite.xyz)
- **Target Network:** X Layer Mainnet (`chainId: 196`)
- **Processor Name / Symbol:** `Voxro` / `VOXR` (`1,000,000` transistor cap · `0.00001 OKB` mint price)
- **Ecosystem Stack Used:** TapeOut Processor Factory, `NAND` + `LATCH` + `REF` Sequential Circuits (`step()` / `eval()`), `ERC-6551` Circuit Containers, **`TapeSend` (`DeWebHub` TAP-10)**, **`DeWEB` (`SiteRegistry` + `DomainBinding` `tape://`)**, **`TapeKit`**, X Layer Circuit Market, Ownerless Transistor Drops, and X Layer `USD₮0` / `USDT` / `OKB`.

---

## 1. Executive Summary

Founders, VCs, KOLs, security auditors, and ecosystem BD leads get flooded with hundreds of bot and scam DMs daily on X and Telegram—forcing them to close DMs and miss real deals, whitehat disclosures, and partnerships. Meanwhile, serious senders have no way to guarantee their message gets read without risking wasted outreach fees.

**Voxro** turns attention into a verifiable, self-sovereign market on X Layer *(the `Earn.com` thesis—acquired by Coinbase for \$100M—rebuilt serverlessly on TapeOut)*:

1. **Unstoppable `DeWEB` Contact Cards (`tape://`):** Every user publishes a permanent, censorship-proof inbox & booking page (`<#ID>.2.<cpu>.tape`) directly on X Layer `SiteRegistry`, verified byte-for-byte via `TapeKit`.
2. **Hardware EIP-1559 Surge-Pricing (`LATCH` + `NAND` + `REF` Circuits):** Each recipient binds their inbox to a taped-out **Inbox Controller Circuit** on the `Voxro` Processor. Every unread paid message steps (`step()`) an on-chain `LATCH` saturating backlog counter (`0..7`), automatically surging the required stake (`1× → 1.5× → 2.5× → 4×`) during traffic spikes and cooling back down as messages are answered. Recipients can also wire zero-burn `REF` gates to grant automatic VIP discounts (`50%` or `100%` off) to holders of partner X Layer circuits.
3. **End-to-End Encrypted `TapeSend` (`TAP-10`) + Zero-Container Guest Express Lane:** Messages and attachments are encrypted client-side (`X25519 + XChaCha20-Poly1305`) using the recipient's key published on X Layer `DeWebHub` (`0xe61A9C7213a6Aa616C246a2B569e555B417b25ee`). Power users send container-to-container via `DeWebHub.send()`; brand-new OKX Wallet / Web2 senders use the **1-click Guest Express Lane** without needing to pay `0.08 OKB` to open a container first.
4. **Oracle-Free On-Chain Settlement:** When the recipient sends an encrypted `TapeSend` reply referencing the sender's message (`ref = msgId`), `VoxroEscrow.sol` reads `DeWebHub.inboxAt(...)` directly on-chain and verifies `digest == keccak256(ref ‖ keccak256(replyPayload))` **with zero oracle and zero plaintext exposure**, releasing **95%** of the `USD₮0`/`USDT`/`OKB` bounty to the recipient (`5%` protocol fee). If unanswered past the SLA window, **100%** refunds to the sender (`0%` fee).

---

## 2. Commercial Model & Retention Loop (Mandatory Submission Criteria)

| Dimension | Specification |
|---|---|
| **Target Users** | **Supply Side (Recipients):** Crypto founders, VCs, KOLs, smart-contract auditors, hiring managers, open-source maintainers, OKX/X Layer ecosystem leads. **Demand Side (Senders):** Protocols pitching partnerships/sponsorships, grant/job applicants, whitehat security researchers, B2B sales teams. |
| **User Acquisition (GTM)** | **Bio-Link Viral Loop:** Every recipient puts their `Voxro` link (`voxro.shieldsuite.xyz/@handle` + `tape://<id>.2.<cpu>.tape`) in their X, Telegram, and GitHub bio to monetize inbound DMs. Every inbound sender discovers Voxro at \$0 CAC and launches their own inbox in 60 seconds using free transistors from the **Voxro Genesis Drop**. |
| **Revenue Model** | **1. Settlement Fee (`5%`):** Charged in `USD₮0`, `USDT`, or `OKB` *exclusively* when a recipient replies and claims a bounty (`0%` fee on expired refunds).<br>**2. Transistor Mint Revenue:** `0.00001 OKB` per `NAND`/`LATCH` minted on the `VOXR` Processor when users stamp custom Inbox Surge & VIP circuits (`transistors.withdraw()`).<br>**3. Secondary Circuit Market:** Trading of custom SLA/VIP standard cells and transferable `@handle` inbox containers on X Layer's Circuit Market (`0xd89f…75DB`). |
| **Why Users Pay & Stay** | **Recipients** earn passive daily `USDT` simply by answering high-signal messages while blocking 100% of bots—and pay \$0/month in SaaS/server fees thanks to `DeWEB`. **Senders** willingly lock `10–100 USDT` because **no reply = 100% automatic refund**, guaranteed by an immutable circuit truth table they inspect before signing. |

---

## 3. Repository Structure

```text
Voxro/
├── README.md                          # Project overview, thesis & commercial architecture
├── TAPEOUT_XLAYER_SPEC.md             # Live-verified X Layer TapeOut + DeWEB + TapeSend ABI & fee spec
├── CIRCUITS_AND_CONTRACTS.md          # Gate-level circuit specs, truth tables & Solidity designs
├── contracts/                         # Foundry (Solidity 0.8.28, via-IR, OZ 5.1) — DONE: 13 unit/fuzz tests + full X Layer fork rehearsal
│   ├── src/
│   │   ├── VoxroEscrow.sol           # Attention-escrow + LATCH step() surge state + DeWebHub reply verifier
│   │   └── VoxroLens.sol             # @handle registry, batch multicall reader & on-chain SVG tokenURI
│   ├── script/                        # Fork rehearsal & user-signed mainnet deployment scripts
│   └── test/                          # Unit, fuzz & live X Layer Anvil fork integration tests
├── sdk/                               # @voxro/sdk (TypeScript + viem + @noble/curves + @noble/ciphers) — DONE
│   ├── src/tapeout/                   # TAP-02 netlist codec, simulator, X Layer addresses/fees/ABIs, chain loader
│   ├── src/compiler/                  # Visual policy -> NAND/LATCH/REF compiler + 512-transition formal prover
│   ├── src/tapesend/                  # TAP-10 v2 seal/open, key derivation, DeWebHub client, Guest Express helpers
│   └── src/deweb/                     # SiteRegistry 24KB chunker, SHA-256 manifest & publish plan
├── cli/                               # voxro CLI — DONE: catalog, prove, step/eval, hub, key, deweb plan, quote/send/stress
└── app/                               # Bilingual (EN + 简体中文) 6-view React + Vite dApp (HTTPS + DeWEB) — scaffolded, simulation mode
```

### 3.1 Run it locally

```bash
pnpm install
pnpm --filter @voxro/sdk test          # TAP-02 vectors, cell/controller proofs, TAP-10 compat, DeWEB
pnpm --filter @voxro/app test          # end-to-end run of the simulated escrow
pnpm --filter @voxro/app dev           # http://127.0.0.1:5173  (reads X Layer mainnet live; writes simulated until launch)
pnpm --filter @voxro/sdk test:fork     # replays every circuit transition through step() on an Anvil fork of X Layer
(cd contracts && forge test)           # escrow unit + fuzz tests; see contracts/README.md for the fork rehearsal and the deploy runbook
```

Until Phase 4, `app/` runs every flow (quote → encrypt & lock → reply → claim / refund) against a local
`VoxroEscrow` simulation that uses the real compiled circuits and real TAP-10 v2 seals; copy `app/.env.example`
to `app/.env` and fill in the VOXR and escrow addresses to switch the write paths to mainnet.

### 3.2 A mainnet finding that shaped the design

DeWebHub (TapeSend) pins the bytecode hash of the processors' Circuits proxy. Processors created after Factory index 386 have a different proxy and are rejected with `NotCPU`, so **no newly created processor can send or receive TapeSend today**, VOXR included. Voxro keeps the pricing circuit on VOXR and gives every recipient a free 2-NAND **mailbox circuit** on a hub-compatible processor (#212) for the TapeSend container. Details and the measurement script: `TAPEOUT_XLAYER_SPEC.md` §3.4, `sdk/scripts/scan-mailbox-cpus.mjs`.

---

## 4. Document Index in This Folder

0. **[docs/upstream/README.md](./docs/upstream/README.md)** — Vendored TAP-02 / TAP-10 / `DeWebHub.sol` / `@tapekit/send` sources and the list of facts verified against X Layer mainnet and an Anvil fork on 2026-11-01.

1. **[TAPEOUT_XLAYER_SPEC.md](./TAPEOUT_XLAYER_SPEC.md)** — All verified X Layer (`chainId: 196`) contract addresses, frozen beacon constants, `DeWebHub` (`TapeSend`), `SiteRegistry` & `DomainBinding` (`DeWEB`), `USD₮0`/`USDT`, and exact gas/fee formulas.
2. **[CIRCUITS_AND_CONTRACTS.md](./CIRCUITS_AND_CONTRACTS.md)** — Exact bit-packing, `NAND`/`LATCH`/`REF` gate netlist designs for Hardware EIP-1559 Surge Pricing, and `VoxroEscrow.sol` + `VoxroLens.sol` contract specifications.
