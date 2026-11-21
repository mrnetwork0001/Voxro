# Voxro — Circuits & Smart Contracts Specification

## 1. Why Voxro's Circuits Are Essential (Not Bolted-On)

In Web2 or naive Solidity escrow, inbox pricing and VIP rules are either static or hidden inside unverified custom contracts where a malicious recipient could trap sender funds or silently change terms.

In **Voxro**, every inbox's congestion pricing and VIP passlist logic is compiled into an immutable **TapeOut Sequential Circuit (`NAND` + `LATCH` + `REF`)** on the **`Voxro` (`VOXR`) Processor**:
1. **Hardware EIP-1559 Congestion Control (`LATCH` + `step()`):** Unread message backlog (`0..7`) lives in a 3-bit saturating up/down counter circuit evaluated via `step()`. Burst spam automatically steps up the required USDT stake (`1× → 1.5× → 2.5× → 4×`), and answering/expiring messages steps it back down.
2. **Zero-Burn Ecosystem Composability (`REF`):** Recipients visually wire `REF` calls to reusable standard cells or external X Layer processors (e.g., giving builders who hold a partner circuit a `50%` discount or free VIP pass) with **0 transistor burn**.
3. **100% Provable State-Transition Table:** Because an inbox circuit has bounded state (`3` LATCH bits = `8` states) and compact inputs (`6` bits = `64` input vectors), our browser & SDK compiler exhaustively verifies all **`512` `(state, input) → (nextState, output)` transitions** in `<5ms` before tapeout and can replay every one of them through the processor's `step()` on chain—giving senders a mathematical guarantee of exact pricing and refund rules.

---

## 2. Standard Cell Library & Composed Circuits on `VOXR`

All bit vectors follow TapeOut's **LSB-first** convention (`bit i = (byte[i >> 3] >> (i & 7)) & 1`).

### Circuit #1 — `SaturatingQueue3` (`Sequential Standard Cell`: `nIn = 2`, `nOut = 3`, `nState = 3`)
- **State (`LATCH[2:0]`):** `q0, q1, q2` representing unread queue count `Q ∈ {0 .. 7}`.
- **Inputs (`in[1:0]`):**
  - `in[0] = active`: `1` = state transition enabled, `0` = hold `Q`.
  - `in[1] = dir`: `1` = enqueue (`min(7, Q + 1)`), `0` = dequeue/settle (`max(0, Q - 1)`).
- **Outputs (`out[2:0]`):** Next queue level `Q'[2:0]` (exposed both as combinational output of the step for immediate surge-quote reads and latched into `newState`!).
- **Gate Estimate:** `~38 NAND + 3 LATCH`.

### Circuit #2 — `SurgeCurveDecoder` (`Combinational Standard Cell`: `nIn = 5`, `nOut = 3`, `nState = 0`)
- **Inputs (`in[4:0]`):**
  - `in[2:0]`: Queue depth `Q[2:0]` (`0..7`).
  - `in[4:3]`: Curve profile `P[1:0]` (`00 = Gentle`, `01 = Balanced`, `10 = Steep`, `11 = Fortress`).
- **Outputs (`out[2:0]`):**
  - `out[1:0] = surgeCode`:
    - `00` → `1.0×` (`10000 bps` of `basePrice`)
    - `01` → `1.5×` (`15000 bps`)
    - `10` → `2.5×` (`25000 bps`)
    - `11` → `4.0×` (`40000 bps`)
  - `out[2] = pauseCold`: `1` when `P == Fortress (11)` and `Q == 7` (blocks non-VIP spam completely until inbox cools down!).
- **Curve tables (queue depth `Q = 0..7` → tier), chosen so Balanced yields the demo's `10 → 15 → 25 → 40 USD₮0`:**

  | Profile | Q=0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
  |---|---|---|---|---|---|---|---|---|
  | `00` Gentle | 0 | 0 | 0 | 0 | 1 | 1 | 2 | 3 |
  | `01` Balanced | 0 | 0 | 1 | 1 | 2 | 2 | 3 | 3 |
  | `10` Steep | 0 | 1 | 1 | 2 | 2 | 3 | 3 | 3 |
  | `11` Fortress | 0 | 1 | 2 | 2 | 3 | 3 | 3 | 3 |

  The escrow quotes on the **post-enqueue** depth `Q'`, so the first message into an idle Balanced inbox costs `1.0×` and the next cold sender already sees `1.5×`.
- **Gate Estimate:** `~34 NAND`.

### Circuit #3 — `VipPassGate` (`Combinational Standard Cell`: `nIn = 5`, `nOut = 4`, `nState = 0`)
- **Inputs (`in[4:0]`):**
  - `in[0]`: `isAllowlisted` (sender on recipient's explicit VIP list).
  - `in[1]`: `holdsEcosystemCircuit` (verified on-chain holder of recipient's chosen partner processor/circuit!).
  - `in[2..3]`: `rawSurgeCode[1:0]` from `SurgeCurveDecoder`.
  - `in[4]`: `rawPauseCold` from `SurgeCurveDecoder`.
- **Outputs (`out[3:0]`):**
  - `out[1:0] = effectiveSurgeCode[1:0]` (allowlisted overrides to `00`; ecosystem holder steps surge down by 1 tier).
  - `out[2] = vipDiscount50` (`1` = `50%` off for verified partner-circuit holders).
  - `out[3] = canSend` (`!rawPauseCold || isAllowlisted || holdsEcosystemCircuit`).
- **Gate Estimate:** `~28 NAND`.

### Circuit #4 – #8 — Preset & Configurable `InboxController` (`REF` Composition: `nIn = 6`, `nOut = 7`, `nState = 3`)
- Composes `REF(#1 SaturatingQueue3)` + `REF(#2 SurgeCurveDecoder)` + `REF(#3 VipPassGate)`!
- **Pins (fixed ABI shared by every controller, so `VoxroEscrow` checks only `circuitInfo == (6, 7, 3, *)`):**
  - `in[5:0] = [active, dir, p0, p1, isAllowlisted, holdsPartnerCircuit]`
  - `out[6:0] = [effTier0, effTier1, vipDiscount50, canSend, Q'0, Q'1, Q'2]`
  - state bits `0..2` = the queue depth (the `REF(#1)` is the first element, TAP-02 §4 layout)
- Presets hard-wire the curve by pointing the decoder's `p0/p1` `REF` inputs at the constant signals `0`/`1` and ignore `in[3:2]`; the Configurable variant routes `in[3:2]` through. Every variant burns **exactly `6 NAND` and `0 LATCH`** (three 2-NAND buffers that re-emit `Q'` after the VIP stage so the outputs are the last seven signals).
- **Why this shines for Judges:**
  - Taping out a custom `InboxController` via `REF` burns **almost zero transistors** (only the tiny glue gates custom to that user's preset bits!), showcasing TapeOut's `REF` hardware reuse natively on X Layer!
  - Presets shipped at launch:
    - **#4 `FounderBalancedInbox`** (Balanced surge curve + ecosystem `REF` 50% discount)
    - **#5 `VcFortressInbox`** (Fortress curve + auto-pause cold outreach at `Q = 7` unless VIP/ecosystem builder)
    - **#6 `AuditorDisclosureInbox`** (Gentle curve + priority bounty lane for whitehat reports)
    - **#7 `SteepInbox`** (Steep curve)
    - **#8 `ConfigurableInbox`** (curve selected per inbox by `VoxroEscrow` through `in[3:2]`)

---

## 3. Smart Contracts Architecture (`contracts/src/`)

All contracts are **ownerless, non-upgradeable, have zero admin backdoors**, use OpenZeppelin `ReentrancyGuard` + `SafeERC20`, and verify with **exact match on Sourcify**.

### 3.1 `VoxroEscrow.sol` *(implemented 2026-11-02 — `contracts/src/VoxroEscrow.sol`, 13 unit/fuzz tests + full X Layer fork rehearsal)*

Ownerless, non-upgradeable, `ReentrancyGuard` + `SafeERC20`, immutable `factory`, `hub` and `treasury`.

#### Storage
```solidity
struct Inbox {
    address policyCpu;  uint64 policyCircuitId;      // InboxController on any registered processor, pins must be (6, 7, 3, *)
    address inboxCircuits; uint64 inboxCircuitId;    // the circuit NFT that *is* the inbox: ownerOf() = recipient, so it is transferable
    address paymentToken; uint96 basePrice; uint32 slaSeconds; uint8 curve;
    bytes1 latchState;                               // exactly what step() returned (LSB-first, bits 0..2)
    bool active; VipKind vipKind; address vipSource; bytes32 handle;
    uint32 pending; uint32 answered; uint32 refunded; uint64 replySeconds;   // public response stats
}
enum VipKind { None, Erc721Holder, Adapter }          // holdsPartner bit: raw ERC-721 (partner CPU, ERC-8004 identity) or any IVipSource
struct Member { address circuits; uint64 tokenId; }   // up to 16 member containers (TAP-10 v2 slots): any member's reply settles
struct Ticket {
    uint64 inboxId; address sender; bytes32 replyTargetEndpoint; bytes32 expectedReplyRef;
    address token; uint96 amount; uint40 createdAt; uint40 deadline; Status status; Lane lane;
    bytes32 guestReplyKey; uint32 replyInboxIndex; uint40 replyTimestamp; address replyFrom;
}
mapping(uint256 => bytes) payloads;  // sealed message per ticket (guest envelope or container-lane payload)
mapping(uint256 => bytes) replies;   // sealed reply per ticket, stored at claim
```
Every ciphertext the client needs lives in contract state (`payloadOf`, `replyPayloadOf`), so the app never scans logs (X Layer public RPC caps `eth_getLogs` at 100 blocks). At 0.02 gwei a 2 KB payload costs well under 0.0001 OKB.

#### External functions
1. `registerInbox(RegisterParams)` — checks `factory.isCPU`, `circuitInfo == (6, 7, 3, *)`, `ownerOf(inboxCircuitId) == msg.sender`, unique `handle`; members default to the inbox circuit's own container.
2. `quoteSend(inboxId, sender) → Quote{canSend, price, nextState, tier, vipDiscount, allowlisted, vip}` — runs `step(latchState, [1, 1, p0, p1, allowlisted, vip])`.
3. **Lane A** `lockForTapeSend(inboxId, toEndpoint, inboxIndex, senderCircuits, senderTokenId, ref, payload)` — `toEndpoint` must be a member endpoint; the `hub.inboxAt` entry must be ≤ 1 day old, from the sender's own container (`accountOf` + `ownerOf == msg.sender`), and its digest must equal `keccak256(ref ‖ keccak256(payload))`; `expectedReplyRef = messageId(toEndpoint, inboxIndex)`, `replyTarget = sender endpoint`; the payload is stored.
4. **Lane B** `sendGuestPriority(inboxId, guestReplyKey, envelope)` — envelope must start `54 53 02 01` (sealed TAP-10 v2) and be ≤ 16,000 B; `replyTarget = escrow endpoint`, `expectedReplyRef = ticketRef(ticketId) = keccak256("VOXRO/ticket/v1" ‖ chainid ‖ escrow ‖ ticketId)`; envelope stored and emitted.
5. `claimBounty(ticketId, replyInboxIndex, replyPayload)` — **permissionless.** Reads `hub.inboxAt(replyTarget, i)`; requires `isMember[from]`, `createdAt ≤ timestamp ≤ deadline`, `digest == keccak256(expectedReplyRef ‖ keccak256(replyPayload))`, entry unused. Steps `dir = 0`, stores the reply, pays **95 %** to `ownerOf(inboxCircuitId)`, **4.9 %** to protocol fees, **0.1 %** keeper tip to `msg.sender`.
6. `refundExpired(ticketId)` — permissionless after `deadline`: 100 % to the sender (99.9 % + 0.1 % keeper tip when a third party finalises), queue steps down, no protocol fee.
7. `declineTicket(ticketId)` — recipient only: immediate 100 % refund, queue steps down.
8. Admin (recipient = current NFT owner): `setMembers`, `setPricing`, `setPolicy`, `setVipSource`, `setActive`, `setAllowlist`. `withdrawProtocolFees(token)` pushes to the immutable treasury (anyone may call).

Properties fuzzed (10,000 runs): every unit locked is paid out exactly once across recipient/treasury/keeper/sender; the escrow balance returns to zero; the queue never exceeds 7.

### 3.2 `VoxroLens.sol` *(implemented 2026-11-02)*
- One-call reads: `directory(start, n, sender)`, `getInbox(es)`, `byHandle`, `outbox(sender)`, `inboxTickets(id)`, `dashboard()` (pending / answered / refunded, average queue depth), all computed from escrow + processor state in a single `eth_call`.
- `receipt(ticketId)` — verifiable disclosure receipt: ticket, the DeWebHub reply entry it settled against, and the three `claimBounty` checks evaluated live.
- `inboxSvg(id)` / `inboxSvgDataUri(id)` — on-chain SVG datasheet with the live LATCH queue cells coloured by tier, response stats and the reply window.
