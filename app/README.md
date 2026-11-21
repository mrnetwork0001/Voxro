# @voxro/app

Bilingual (EN + 简体中文) six-view React + Vite client for Voxro on X Layer. Ships as one relative-path bundle
(`base: './'`, no CDN, no webfonts, no analytics) so the same build serves from `https://voxro.shieldsuite.xyz` and from a
DeWEB `tape://` container and passes TapeKit's 100% on-chain check.

## Run

```bash
pnpm install
pnpm --filter @voxro/app dev       # http://127.0.0.1:5173
pnpm --filter @voxro/app build     # dist/ (≈220 kB gzipped)
pnpm --filter @voxro/app test      # end-to-end run of the simulated escrow
```

## Views (hash routes)

| Route | View | What it does today |
|---|---|---|
| `#/` | Landing | Bilingual marketing page with a live gate demo (the real FounderBalancedInbox circuit stepped on a timer), problem, how-it-works, hardware, lanes, guarantees, personas, model, stack, FAQ and “Launch app” → `#/pulse`. The VOXRO wordmark anywhere in the app returns here. |
| `#/pulse` | Network Pulse | Live X Layer telemetry (block, Factory `cpuCount`, deploy/tape-out/opener/market fees, DeWebHub), the compiled VOXR catalog with the exhaustive prover run in the browser, surge curves, network stats |
| `#/directory` | Directory & Compose | Search inboxes, live `quoteSend()` from the real controller circuit, LATCH gauge, price ladder, Guest Express or Container lane, TAP-10 v2 encrypt & lock |
| `#/inbox` | Inbox & Outbox | Client-side X25519 decryption, SLA countdown, two-tap reply (`DeWebHub.send`) + permissionless claim with the three `claimBounty` checks shown, expired refund, sim clock fast-forward |
| `#/studio` | Gate Studio | Pick a preset or configurable curve and partner processor, see pins/gateCount/burn/netlist, 512-transition proof, truth table, traffic waveform, tape-out cost; register the inbox (simulation) or mint + `tapeout()` once VOXR exists |
| `#/card` | Contact Card | Generate a self-contained `tape://<#ID>.2.<cpu>.tape` bio page, preview it, see the 24,000-byte chunk plan, SHA-256 and the exact `SiteRegistry` / `DomainBinding` calls, download it |
| `#/gallery` | Circuit Gallery | Every VOXR circuit with its netlist, REF targets and a live bench that runs one `step()` beat locally; Genesis Drop and Circuit Market addresses |

## Simulation mode

Until the contracts are on mainnet (`VITE_VOXR_CPU` and `VITE_VOXRO_ESCROW` unset), every write goes through
`src/sim/escrow.ts`, a local model of `VoxroEscrow` plus the `DeWebHub` inbox it reads:

- prices come from `beat()` on the real compiled `InboxController` (the same bytes that will be taped out);
- envelopes and replies are real TAP-10 v2 seals (`@voxro/sdk/tapesend`), decrypted in the browser;
- `claim` recomputes exactly the three on-chain checks (`from`, time window, `digest == keccak256(ref ‖ keccak256(payload))`);
- state persists in `localStorage` (`voxro.sim.v1`); “Reset simulation” reseeds it.

Chain reads (telemetry, fees, Circuit Market `feeBps`) are always live against X Layer mainnet through a
fallback of the public RPCs. Wallet connection uses EIP-1193 (`window.okxwallet` preferred) with an
`wallet_addEthereumChain` fallback for X Layer and an OKX Wallet deep link when no provider is injected.

## Layout

```
src/
  App.tsx            masthead, nav, wallet button, routing
  i18n.tsx           EN / zh-CN dictionary (useI18n)
  theme.tsx          Obsidian dark / Paper light (data-theme)
  styles.css         design tokens and components
  chain/             viem public client, async hook, telemetry reads
  wallet/            EIP-1193 provider context
  sim/               compiled catalog helpers and the escrow simulation store
  card/              contact-card HTML template
  components/ui.tsx  Panel, Stat, Gauge, SurgeChart, Waveform, TruthTable, …
  views/             Pulse, Directory, Inbox, Studio, Card, Gallery
```
