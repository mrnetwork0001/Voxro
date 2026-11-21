# Voxro — Execution Roadmap & Engineering Checklist

## Phase 1 — `@voxro/sdk` (Compiler, Prover, `TapeSend` v2 & `DeWEB`)
- [x] **TapeOut Netlist & Bit-Packing Core (`sdk/src/tapeout/`):** *(done 2026-11-01; passes all TAP-02 vectors)*
  - `NAND` (`0x00`), `LATCH` (`0x01`), `REF` (`0x02`) encoder/decoder, local combinational `eval()` & sequential `step()` simulator, exact fee calculators (`deployFee`, `mintValue`, `TAPEOUT_FEE`, `opener.FEE`).
- [x] **Inbox Gate Compiler & Exhaustive Prover (`sdk/src/compiler/`):** *(done 2026-11-01; 8-circuit catalog, every transition proven against reference models)*
  - Synthesize `SaturatingQueue3` (`3 LATCH`), `SurgeCurveDecoder`, `VipPassGate`, and `REF`-composed `InboxController` netlists.
  - Exhaustive `512`-transition verifier (`local simulator == Anvil X Layer fork eth_call` across 100% of `(state, input)` pairs).
- [x] **`TAP-10 v2` Encryption & `DeWebHub` Client (`sdk/src/tapesend/`):** *(done 2026-11-01; `seal()`/`openPayload()` byte-identical to the vendored `@tapekit/send` under injected randomness, cross-opens both ways, Guest Express `ticketRef`/envelope helpers, Voxro-domain key text; 8 compat tests)*
  - Exact `0x54 0x53 0x02` `X25519 + XChaCha20-Poly1305` `seal()` / `openPayload()`, `messageId()` (`keccak256("TAP-10/msg/v2" ‖ uint256(chainId) ‖ hub ‖ to ‖ uint256(inboxIndex))`), `keyFor()`, `inboxPage()`, `outboxPage()`, and Guest Express Envelope helpers.
- [x] **`DeWEB` Publisher & `TapeKit` Verifier (`sdk/src/deweb/`):** *(chunker, SHA-256 manifest and ordered `putFile`/`appendChunk`/`setFallback` call plan done 2026-11-01)*
  - `24,000`-byte chunk splitter, SHA-256 manifest builder, `SiteRegistry.putFile` / `appendChunk` / `setFallback`, and `DomainBinding.bind("<#ID>.2.<cpu>.tape", container, 120)`.
  - [ ] Fetch-back verifier (read the published file from `SiteRegistry` and compare SHA-256) once a container exists.

## Phase 2 — Smart Contracts (`contracts/`)
- [x] **`VoxroEscrow.sol`:** *(done 2026-11-02; team members ≤ 16, pluggable VIP sources incl. ERC-8004 identity, transferable inbox NFT, keeper tips, decline, on-chain payload storage)*
  - Inbox registration (`@handle`, `policyCpu`, `policyCircuitId`, `inboxCircuitId`, `partnerCpu`, `paymentToken` ∈ `{OKB, USD₮0, USDT}`, `basePrice`, `slaSeconds`, VIP allowlist).
  - Live `quoteSend()` calling `policyCpu.step(policyCircuitId, latchState, packedInputs)`.
  - Dual-lane locking (`lockForTapeSend` + `sendGuestPriority`) stepping `latchState` (`dir = 1`).
  - Oracle-free `claimBounty()` verifying `DeWebHub(0xe61A…25ee).inboxAt(replyTargetEndpoint, replyIdx)` (`from == recipientContainer`, `timestamp <= deadline`, `digest == keccak256(expectedReplyRef ‖ replyPayloadHash)`), stepping `latchState` down (`dir = 0`), paying `95%` recipient / `5%` protocol.
  - `refundExpired()` returning `100%` to sender (`0%` fee) after `deadline` and stepping `latchState` down (`dir = 0`).
- [x] **`VoxroLens.sol`:** *(done 2026-11-02; directory/outbox/receipt views + on-chain SVG)*
  - Single-call multicall views for directory, inbox tickets, outbox tickets, circuit catalog, X Layer Circuit Market listings, Genesis Drop status, and dynamic SVG `tokenURI`.
- [x] **Foundry Test Suite (`contracts/test/`):** *(13 unit/fuzz tests incl. a 10,000-run conservation fuzz, plus `Fork.t.sol`: createCPU → mint → tape out 8 → register → 5 live quotes → real DeWebHub reply → keeper claim on an X Layer fork)*
  - Unit + fuzz tests (`10,000` runs on queue saturation, fee math, deadline boundaries, reentrancy).
  - Live X Layer Mainnet Anvil fork integration suite testing real `Factory`, `Opener`, `DeWebHub`, `SiteRegistry`, `DomainBinding`, `CircuitMarket`, `Drops`, and `USD₮0`.

## Phase 3 — Bilingual 6-View dApp & `DeWEB` Bundle (`app/` + `cli/`)
- [x] **Design System:** *(done 2026-11-01: `app/src/styles.css`, system typefaces only, Obsidian/Paper themes, EN + 简体中文 dictionary, OKX Wallet deep link, `base: './'` bundle with zero external requests)* Editorial Swiss-Financial Signal Terminal (Obsidian Dark + Crisp Paper Light, bilingual **English + 简体中文**, mobile + OKX Wallet deep links, zero external CDN dependencies so it passes `TapeKit` 100% On-Chain check).
- [x] **6 Views:** *(scaffolded 2026-11-01 — all six render and run end-to-end against a local `VoxroEscrow` simulation driven by the real compiled circuits and real TAP-10 seals; chain reads are live; write paths unlock when `VITE_VOXR_CPU` / `VITE_VOXRO_ESCROW` are set)*
  - [x] Chain backend behind `app/src/backend.ts` (done 2026-11-02): Lens-backed store, Guest-lane send with multi-recipient TAP-10 seals, signature-derived recipient keys, two-tap reply + claim, refund/decline, 4-step mainnet onboarding (mailbox circuit → open → publishKey → registerInbox); read paths verified live on an Anvil fork, write paths typechecked.
  1. **Network Pulse (Landing & Live Telemetry)** — Live reads from X Layer (`VOXR` circuits, active inboxes, surge levels, settled `USD₮0`/`OKB` volume).
  2. **Directory & Priority Compose** — Search `@handle` or `#id@2.cpu`, inspect live `LATCH` queue gauge & verified truth table, send via Container Lane or 1-click Guest Express Lane.
  3. **Encrypted Inbox & Outbox** — Client-side X25519 decryption, SLA countdowns, two-tap `TapeSend` reply + permissionless `95%` bounty claim, 1-click expired refund.
  4. **Inbox Gate Studio** — Visual builder for surge curves + `REF` partner VIP rules → live waveform/truth-table prover → claim Genesis Drop / mint transistors → `tapeout()`.
  5. **`DeWEB` Contact Card Studio (`tape://`)** — Generate, preview, and publish unstoppable `tape://<#ID>.2.<cpu>.tape` bio pages to X Layer `SiteRegistry`.
  6. **Circuit Gallery, Genesis Drop & Market** — Inspect every `VOXR` circuit netlist, run live `step()`/`eval()`, claim starter transistors, and trade reusable circuits (with strict anti-self-trade guards).
- [x] **`voxro` CLI (`cli/`):** *(done 2026-11-02: catalog, prove, step/eval, hub, deweb plan, escrow quote/stress)* Terminal verifier & live Demo Day stage companion.

## Phase 4 — Mainnet Deployment, Sourcify & Demo Film
- [x] Full dry-run of deployment on an X Layer fork (`contracts/script/Deploy.s.sol`, `test/Fork.t.sol`).
- [ ] User-signed X Layer mainnet launch (`≈0.126 OKB` + gas, see `contracts/README.md`) from the dedicated `mrnetwork0001` wallet via a Foundry keystore (`cast wallet import voxro`).
- [ ] Exact-match Sourcify verification of `VoxroEscrow` and `VoxroLens`.
- [ ] Publish `#1.2.<VOXR_CPU>.tape` on X Layer `DeWEB` + deploy HTTPS mirror (`voxro.shieldsuite.xyz`).
- [ ] Record `< 2:50` Demo Video + submit Google Form before Dec 7, 2026 @ 23:59 UTC.
