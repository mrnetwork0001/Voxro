# TapeOut, DeWEB & TapeSend on X Layer — Verified Protocol Spec

Verified against live X Layer mainnet (`chainId: 196`, `https://rpc.xlayer.tech`) and the official `TapeOutProtocol/TapeKit` & `DeWebHub.sol` specifications on **2026-11-01**.

---

## 1. Canonical X Layer Mainnet Addresses (`chainId = 196`)

| Component | Address | Notes |
|---|---|---|
| **Processor Factory (UUPS Proxy)** | `0x1f09DAeFA827f02CBb40967cc91b259763760761` | Frozen processor impl `0xb41c1e7602eb5734be2430b72178ccb814a5293d` (updated `2026-10-22`); `cpuCount() = 404` on 2026-11-01 |
| **Transistor Beacon** | `0x1059Ad62cAbB6a6925bb65aA617300556c60A51B` | Impl `0x265bf10faB9ddEC0eE0A649C6B9DB845f1b9a06b` (ownerless / frozen) |
| **Circuit Beacon** | `0xf70d1ed4f62CF3780157B0b421b7E2F45bD0991C` | Impl `0x977f217887E085D298Cb3819cDAD5A0ee35F29B2` (ownerless / frozen `2026-10-22`) |
| **Container Opener** | `0x536adD8F30f03b69f6fbF29d425A816A0dC50106` | Opens ERC-6551 circuit accounts (`FEE = 0.08 OKB`, excess refunded) |
| **ERC-6551 Registry** | `0x000000006551c19487814612e58FE06813775758` | `salt = bytes32(0)` |
| **ERC-6551 Account Proxy Impl** | `0xac4f791353ee9f06e2c50ae4c34680d28ea52a57` | Beacon `0x9b135f586F7850A3Fa92210c298F732b20bC8f44` → `0x6B6fDa1483367e939314070a4f233c1DFD35996B` |
| **`DeWebHub` (`TapeSend` TAP-10 Proxy)** | `0xe61A9C7213a6Aa616C246a2B569e555B417b25ee` | Live on X Layer (`active: true`, chain bitmap index `2`, short `'xlayer'`). Boot `0xC0D28CA8689248B0bed26cC0aa328CF16Aa4401e` |
| **`SiteRegistry` (`DeWEB` Proxy)** | `0xd6EFb7adCc9c83dC4924Ad56f6a8E4e969b9ADB6` | Pinned impl `0xa85c4143d1d4a77f54b8e4ecc9e6d1418afea45f`; `CHUNK_MAX = 24,000` bytes |
| **`DomainBinding` (`DeWEB` Proxy)** | `0x68809Fd2fb343aA57D0aeB7f33Defe477c9666f9` | Pinned impl `0x5ebf29b80789e548907c707530c3c7607c4347df`; **`monthlyFee() = 0` on X Layer!** |
| **Circuit Market (UUPS Proxy)** | `0xd89f358c48a7B632c9845af2a02A32eB90DD75DB` | Impl `0x38d688F4793a9Bf270c2c99492c9a1e45163dB6E`; `feeBps = 100` (`1%`) |
| **Ownerless Transistor Drops** | `0xf037a5543f19619a2291009ae1542b71d50ff9b9` | Ownerless instance of TapeOut's published `Airdrop` bytecode (`factory = 0x1f09…0761`) |
| **Multicall3** | `0xcA11bde05977b3631167028862bE2a173976CA11` | Standard batching (`eth_getLogs` on X Layer public RPC is capped at 100 blocks — always prefer state views + Multicall3!) |
| **`USD₮0` (Official X Layer Tether)** | `0x779Ded0c9e1022225f8E0630b35a9b54bE713736` | `6` decimals (`~133.7M` supply on X Layer) |
| **`USDT` (Bridged X Layer USDT)** | `0x1E4a5963aBFD975d8c9021ce480b42188849D41d` | `6` decimals (`~3.27M` supply on X Layer) |

---

## 2. Core Processor, Transistors & Circuits Rules

1. **Create Processor (`Factory.createCPU`):**
   - `createCPU(string name, string symbol, string story, uint256 transistorSupply, uint256 mintPrice) payable returns (address transistors, address circuits)`
   - `msg.value` must equal `deployFee()` (`0.0066 OKB`; **excess is NOT refunded** — always read `deployFee()` live first).
   - App listing requirement: `supplyCap >= 10_000` and `minted >= 1`.
   - `isCPU(circuits) == true` (`isCPU(transistors) == false`).

2. **Mint Transistors (`Transistors.mint` — ERC-1155):**
   - Token IDs: `NAND = 0`, `LATCH = 1`.
   - `mint(uint256 id, uint256 amount) payable` requires `msg.value == amount * mintPrice + protocolFee()` (`protocolFee` is `0.00066 OKB` flat **per call**, not per transistor; excess is stranded).
   - Creator revenue (`amount * mintPrice`) accrues in `owed(creator)` and is pulled via `withdraw()`.
   - `cpuName()`, `cpuSymbol()`, and `story()` live on the **Transistors** contract.

3. **Tape Out Circuits (`Circuits.tapeout` — ERC-721):**
   - `tapeout(bytes nl, uint32 nIn, uint32 nOut) payable returns (uint256 id)`
   - `msg.value` **must equal `TAPEOUT_FEE()` (`0.0013 OKB`) exactly** (both underpayment and overpayment revert `"tapeout fee"`).
   - Burns `1 NAND` per NAND element and `1 LATCH` per LATCH element from `msg.sender`. **`REF` elements burn ZERO transistors** at any depth.
   - Circuit IDs start at `1`; `nextId()` returns the **last assigned ID** (= total circuits taped out).

4. **Netlist Wire Format & Signal Numbering:**
   - Signal `0 = const0`, `1 = const1`, `2 .. 1 + nIn` = inputs, followed sequentially by element outputs.
   - `NAND`: `0x00 | a:u24 | b:u24` (`7` bytes) — `a, b` must point strictly before this gate's output.
   - `LATCH`: `0x01 | d:u24` (`4` bytes) — `d` may point forward (feedback loop!) as long as `d < totalSignals`.
   - `REF`: `0x02 | cpu:20B | id:u64 | nIns:u8 | nOut:u8 | ins:u24*nIns` — `cpu` must be a registered `circuits` address; pin counts must match `circuitInfo(id)`.
   - Circuit outputs are the **last `nOut` element signals** (`nOut >= 1`).

5. **Execution (`eval` vs `step`) & Bit Packing:**
   - Bit packing is **LSB-first per byte**: bit `i` is `(byte[i >> 3] >> (i & 7)) & 1`.
   - Combinational (`nState == 0`): `eval(uint256 id, bytes inputs) view returns (bytes outputs)`. Reverts `"has latch: use step"` if `nState > 0`.
   - Sequential (`nState > 0`): `step(uint256 id, bytes state, bytes inputs) view returns (bytes newState, bytes outputs)`. Each LATCH outputs its **current** state bit, outputs are evaluated, and every LATCH samples `d` into `newState`. Passing `0x` means all-zero initial state.

6. **State layout, `gateCount` and burn (TAP-02 §4, confirmed on an Anvil fork of X Layer 2026-11-01):**
   - Walking the elements in record order, each `LATCH` takes the next state bit and each `REF` takes the next contiguous block of `nState(sub)` bits. A controller whose first element is `REF(SaturatingQueue3)` therefore keeps the queue depth in state bits `0..2`.
   - `circuitInfo(id)` returns `(uint32 nIn, uint32 nOut, uint32 nState, uint32 gateCount)`; `gateCount` counts NAND + LATCH **including** those reached through `REF`.
   - `tapeout` burns only the **top-level** NAND/LATCH records; the official TAP-02 `toggle` + `ref_with_state` vectors match X Layer's `step()` 16/16 beats (see `docs/upstream/README.md`).

---

## 3. `TapeSend` (`DeWebHub` — TAP-10) Verified Specification

`DeWebHub` (`0xe61A9C7213a6Aa616C246a2B569e555B417b25ee`) has **zero protocol fee** (gas only) and stores message digests directly in contract storage on X Layer!

### 3.1 Endpoint & Message ID Encoding
- **Endpoint (`bytes32`):** `uint32(0) ‖ uint64(chainId) ‖ address(container)`
  - In Solidity on X Layer (`chainId = 196 = 0xc4`): `bytes32((uint256(196) << 160) | uint256(uint160(container)))`, matching `hub.endpointOf(container)`.
  - Human display format on X Layer (area code `2`): `#<tokenId>@2.<cpuNumber>` or `<tokenId>.2.<cpuNumber>.tape`.
- **On-Chain Digest (`bytes32`):**
  ```solidity
  bytes32 digest = keccak256(abi.encodePacked(ref, keccak256(payload)));
  ```
- **TAP-10 v2 Message ID (`bytes32` — Verified Byte-for-Byte from `send/module/src/content.js`):**
  ```solidity
  // Exact Solidity match to @tapekit/send messageId(chainId, hub, to, inboxIndex):
  bytes32 msgId = keccak256(
      abi.encodePacked("TAP-10/msg/v2", uint256(block.chainid), address(hub), bytes32(to), uint256(inboxIndex))
  );
  ```
- **Pinned `DeWebHub` Implementation on X Layer (`chainId = 196`):**
  `0xdcc57797089ebd9f26e686379a4323f353a3f9c6` (from `HUB_IMPLEMENTATIONS_BY_CHAIN[196]` in `send/module/src/chain.js`; read ERC-1967 slot `0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc`).
- **TAP-10 v2 Sealed Payload Envelope (`0x54 0x53 0x02 0x01` — Verified from `payload.js`):**
  - Preamble `P` (`93` bytes): `MAGIC ("TS" = 0x54, 0x53) | VERSION (0x02) | KIND_SEALED (0x01) | E (32B ephemeral X25519 pubkey) | N (24B XChaCha20 nonce) | commit (32B sha256("TAP-10/commit/v2" ‖ K)) | slotCount (1B, 1..16)`
  - Slots `S` (`56 × slotCount` bytes): each slot is `fingerprint(8B = sha256(R)[0..8]) | xchacha20poly1305(kek, N, P ‖ T).encrypt(K) (48B)` where `T = "TAP-10/X/v2" ‖ toEndpoint(32B) ‖ fromEndpoint(32B) ‖ ref(32B) ‖ hub(20B)` and `kek = hkdf_sha256(ecdh(e, R), salt="TAP-10/wrap/v2", info=E ‖ R ‖ T, 32)`.
  - Ciphertext `C`: `xchacha20poly1305(K, N, P ‖ S ‖ T).encrypt(utf8JsonContent)` where JSON content is `{"v":1,"kind":"message","subject":"...","body":"...","ts":...,"attachments":[...]}`.
  - **EIP-4361 Domain Guard Note (`keys.js`):** Official `www.tapesend.com` derives container keys from an EIP-4361 message bound to `KEY_DOMAIN = 'www.tapesend.com'`. Never prompt `www.tapesend.com` EIP-4361 on `voxro.shieldsuite.xyz` (wallets flag cross-domain SIWE); instead: (a) read existing `DeWebHub.keyFor()` public keys directly to encrypt `100%` TAP-10-compatible messages readable in official TapeSend, and (b) when publishing a new container key inside Voxro, sign a domain-matched Voxro key-derivation message so OKX Wallet / MetaMask shows zero domain-mismatch warnings!

### 3.2 Write & Read Functions on `DeWebHub`
```solidity
interface IDeWebHub {
    struct Entry {
        address from;       // Sender's container on this chain
        uint56 blockNumber;
        uint40 timestamp;
        bytes32 digest;     // keccak256(abi.encodePacked(ref, keccak256(payload)))
    }

    struct OutEntry {
        bytes32 to;
        uint32 inboxIndex;
        uint56 blockNumber;
        uint40 timestamp;
        bytes32 digest;
    }

    struct KeyView {
        address container;
        bytes32 endpoint;
        bool opened;
        address current;
        uint8 suite;        // 1 = SUITE_X25519
        uint16 keyIndex;
        bytes32 key;        // X25519 public key (0 if holder changed or revoked!)
        bool usable;
        uint32 version;
        uint64 chains;      // Chain bitmap: bit 0 = BNB (56), bit 1 = Base (8453), bit 2 = X Layer (196) -> 0x04 or 0x07
    }

    function publishKey(address circuits, uint256 tokenId, uint8 suite, uint16 keyIndex, bytes32 key, uint64 chains) external;
    function revokeKey(address circuits, uint256 tokenId) external;
    function send(address circuits, uint256 tokenId, bytes32 to, bytes32 ref, bytes calldata payload) external returns (uint256 inboxIndex);

    function keyFor(address circuits, uint256 tokenId) external view returns (KeyView memory);
    function endpointOf(address container) external view returns (bytes32);
    function accountOf(address circuits, uint256 tokenId) external view returns (address);
    function inboxCount(bytes32 to) external view returns (uint256);
    function inboxAt(bytes32 to, uint256 i) external view returns (Entry memory);
    function inboxPage(bytes32 to, uint256 start, uint256 n) external view returns (Entry[] memory);
    function outboxCount(address from) external view returns (uint256);
    function outboxPage(address from, uint256 start, uint256 n) external view returns (OutEntry[] memory);
}
```

### 3.3 Critical Authorization Nuances in `DeWebHub.sol`
1. `publishKey` and `send` check `_authorize(circuits, tokenId)`:
   - `circuits.ownerOf(tokenId) == msg.sender` (must be called directly by the holder EOA or EIP-7702 account — **an external smart contract cannot call `send()` on behalf of an EOA**).
   - `payments.paid(container) == true` (the circuit's ERC-6551 container must be opened via `Opener.open(circuits, tokenId)` costing `0.08 OKB`).
2. **Encryption Envelope:** Payload format `0x02` (`X25519` ECDH + `XChaCha20-Poly1305`), `MAX_PAYLOAD = 16,000` bytes.
3. **`to` is only format-checked:** `send()` accepts any endpoint whose top 32 bits are zero with non-zero chain id and container address; the target need not exist or be opened. Unlike `publishKey`, `send()` also accepts contract holders. Voxro's Guest lane therefore uses an endpoint derived from `VoxroEscrow`'s own address and opens **no** relay container.
4. **Why Voxro Implements Dual-Lane Delivery:**
   - **Recipients** open their Voxro Inbox Container once (`0.08 OKB`), activating *both* their `TapeSend` mailbox AND their `DeWEB` `tape://` Contact Card!
   - **Senders** can either send container-to-container via `DeWebHub.send()` **OR** use Voxro's **1-Click Guest Express Lane** (encrypting to `DeWebHub.keyFor().key` in browser without needing an `0.08 OKB` container). In **both** cases, when the recipient replies via `DeWebHub.send(..., ref, replyPayload)`, `VoxroEscrow.sol` verifies `DeWebHub.inboxAt(...)` on-chain!

---

### 3.4 Hub codehash pin — new processors cannot use TapeSend *(discovered on mainnet 2026-11-02)*
`DeWebHub._authorize` and `_circuitsGenuine` require `circuits.codehash == circuitCodehash` (`0x57aa306f…17d5`, pinned at hub deployment) **in addition to** `factory.isCPU`. The Factory now deploys processors whose Circuits proxy has a different codehash: processors with index **0‥386** match the pin, **388+** (e.g. #390, #400, #404) do not, so `send`, `publishKey` and `keyFor().usable` fail with `NotCPU` for every processor created from now on — including VOXR. Consequences for Voxro:
- The **policy circuit** (InboxController) lives on VOXR; the **inbox / member container** must be a circuit NFT on a hub-compatible processor (index ≤ 386). `VoxroEscrow` keeps these separate (`policyCpu` vs `inboxCircuits`/members), so nothing in the escrow changes.
- Onboarding gives every recipient a **mailbox circuit**: 2 NAND on processor **#212** (`0xAa13ae45b0B2D52f210Ad7Ef12997113a0ebAF21`, free transistors, `tapeout` fee 0.0013 OKB) + `Opener.open` 0.08 OKB. 349 of the 386 compatible processors still have open transistor supply (`sdk/scripts/scan-mailbox-cpus.mjs`).
- Verified end to end in `contracts/test/Fork.t.sol`: VOXR created → catalog taped out → mailbox on #212 → `registerInbox` → 5 live quotes → real `DeWebHub.send` from the mailbox container → `claimBounty`.

## 4. `DeWEB` (`SiteRegistry` & `DomainBinding`) & `TapeKit` Spec

### 4.1 Naming on X Layer (Area Code `2`)
- Canonical DeWEB name: `<#ID>.2.<processorNumber>.tape` (e.g., if `Voxro` is CPU `#405`, circuit `#1` is `1.2.405.tape`, URL `tape://1.2.405.tape/`).
- Shorthand accepted by `TapeKit` address bars: `#1@2.405` or container address `0x...`.

### 4.2 Publishing Files (`SiteRegistry` `0xd6EFb7adCc9c83dC4924Ad56f6a8E4e969b9ADB6`)
- Container must be opened first (`Opener.open(circuits, tokenId)`).
- Holder (or delegated operator via `setOperator(container, op, ttl)`) calls:
  - `putFile(address container, string path, string contentType, bytes32 sha256Hash, bytes data)` — first chunk (`<= 24,000` bytes), non-payable (gas only!).
  - `appendChunk(address container, string path, uint256 expectIndex, bytes data)` — subsequent `<= 24,000`-byte chunks up to `350` chunks (`8.4 MB`).
  - `setFallback(address container, "/index.html")` — SPA routing fallback.
- **100% On-Chain Compliance:** Zero external CDN fonts/scripts! Bundle CSS, SVG icons, and JS inline/locally inside the container so `TapeKit`'s strict off-chain blocker marks the site **100% On-Chain (`ok`)**.

### 4.3 Activating the Name (`DomainBinding` `0x68809Fd2fb343aA57D0aeB7f33Defe477c9666f9`)
- Call `DomainBinding.bind("<#ID>.2.<cpuNumber>.tape", container, 120)` with `msg.value = 120 * DomainBinding.monthlyFee()`.
- Live check on 2026-11-01: `monthlyFee()` on X Layer is **`0`** (`0 OKB` for 10 years of activation! Always read `monthlyFee()` dynamically before calling `bind`).
- Note: Container must not have an active market listing when calling `bind`.

---

## 5. Mainnet Launch Cost Estimate on X Layer (`~0.02 gwei` gas)

| Action | Protocol Fee (`OKB`) | Est. Gas Cost (`OKB`) | Notes |
|---|---|---|---|
| `Factory.createCPU("Voxro", "VOXR", ...)` | `0.0066` | `< 0.00002` | Deploy Voxro Processor |
| `Transistors.mint(NAND, 2000)` + `mint(LATCH, 200)` | `0.00132` (`2 × 0.00066`) | `< 0.00001` | Mint price (`0.022 OKB`) returns to creator via `withdraw()`! |
| Tape out `6` showcase circuits (`#1`–`#6`) | `0.0078` (`6 × 0.0013`) | `< 0.00005` | Standard cells + `REF`-composed Inbox Controllers |
| `Opener.open(circuits, 1)` (Flagship App + Relay Container) | `0.0800` | `< 0.00001` | Opens `#1.2.<cpu>.tape` for `DeWEB` + `TapeSend` |
| `DeWebHub.publishKey` + `DomainBinding.bind` + `SiteRegistry.putFile` | `0.0000` | `< 0.00100` | Publishes live `DeWEB` app & `TapeSend` X25519 key |
| Deploy `VoxroEscrow` + `VoxroLens` + Genesis Drop | `0.0000` | `< 0.00020` | Ownerless, Sourcify-verified contracts |
| **Net Total Launch Budget** | **~`0.097 OKB`** *(~`\$4–\$5`)* | | Ultra-lean mainnet footprint |
