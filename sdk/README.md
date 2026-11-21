# @voxro/sdk

TypeScript SDK for Voxro on X Layer: TapeOut netlist core, inbox-gate compiler and exhaustive prover,
TAP-10 v2 TapeSend encryption and `DeWebHub` client, and the DeWEB publisher. Browser and Node, ESM only.

| Module | Import | Contents |
|---|---|---|
| TapeOut core | `@voxro/sdk/tapeout` | LSB-first bit packing, `NAND`/`LATCH`/`REF` codec, TAP-02 well-formedness with the chain's revert strings, one-beat simulator (`beat`, `stepBytes`, `evalBytes`), X Layer addresses, fees and ABIs, viem loader that pulls a circuit's full REF closure |
| Compiler | `@voxro/sdk/compiler` | `NetlistBuilder`, the three standard cells, five REF-composed `InboxController` presets, catalog builder, `proveAgainstModel` / `proveAgainstChain` |
| TapeSend | `@voxro/sdk/tapesend` | TAP-10 v2 `seal` / `openPayload` / `parsePayload`, `encodeContent` / `decodeContent`, `messageId`, `digestOf`, endpoint helpers, key derivation (official TapeSend text and Voxro-domain text), `deWebHubAbi` + read/write helpers, Guest Express lane (`ticketRef`, `sealGuestEnvelope`, `sealGuestReply`, …) |
| DeWEB | `@voxro/sdk/deweb` | 24,000-byte chunker, SHA-256 manifest, ordered `SiteRegistry` call plan, `publishSite` / `bindDomain` executors, ABIs |
| Escrow | `@voxro/sdk/escrow` | `voxroEscrowAbi`, `voxroLensAbi`, `erc721HolderVipAbi` (generated from Foundry artifacts: `pnpm abi`), `handleToBytes32`, `splitBounty`, enums |
| Datasheet | `@voxro/sdk/datasheet` | `renderDatasheetSvg`, `renderReceiptSvg` — self-contained SVGs for circuits and receipts |

## Tests

```bash
pnpm test            # unit: TAP-02 vectors, cells & controllers vs reference models, TAP-10 compat, DeWEB
pnpm test:fork       # X Layer fork: create a processor, mint, tape out the catalog, replay every transition through step()
pnpm typecheck
```

- `test/tap02-vectors.test.ts` — every official TAP-02 vector, including the eight ill-formed cases and their revert reasons.
- `test/cells.test.ts` — each cell and each of the five controllers proven exhaustively against its model (32 / 512 transitions), the demo price walk, Fortress pause, catalog burn.
- `test/tap10-compat.test.ts` — the TypeScript port against the vendored `@tapekit/send` reference (`test/vendor/tap-10`): identical bytes under injected randomness, cross-opening in both directions, error codes, `messageId`, key derivation from a real signature, Guest lane round trip.
- `test/deweb.test.ts` — chunk boundaries, hashes, call order.
- `test/fork.test.ts` — gated on `VOXRO_FORK_RPC`; `scripts/fork-test.sh` pins the fork block and runs it (≈13 s).

Vendored references: `test/vendor/tap-02` (TAP-02 vectors + reference.py) and `test/vendor/tap-10`
(`@tapekit/send` payload/content/keys, MIT). Provenance and the mainnet facts they were checked against live in
`docs/upstream/README.md`.
