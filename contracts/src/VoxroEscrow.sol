// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ICircuits, IDeWebHub, IFactory} from "./interfaces/ITapeOut.sol";
import {IVipSource} from "./interfaces/IVipSource.sol";

/// @title VoxroEscrow — attention escrow priced by a TapeOut circuit and settled by a TapeSend reply.
/// @notice Ownerless and non-upgradeable. Every inbox binds an InboxController circuit
///         (pins nIn = 6, nOut = 7, nState = 3) on a registered TapeOut processor. The 3 LATCH bits are
///         the unread backlog; `step()` with dir = 1 quotes and enqueues, dir = 0 dequeues.
///         Settlement verifies the recipient's TAP-10 reply directly in DeWebHub storage.
/// @dev Inbox ownership is the ownership of an ERC-721 circuit (`inboxCircuits` / `inboxCircuitId`):
///      selling that NFT on the Circuit Market transfers the inbox, its handle and its future payouts.
contract VoxroEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── constants ────────────────────────────────────────────────────────────────────────────
    uint16 public constant PROTOCOL_BPS = 500; // 5 % of answered bounties
    uint16 public constant KEEPER_BPS = 10; // 0.1 % tip to whoever finalises (out of the protocol share on claims)
    uint16 public constant VIP_DISCOUNT_BPS = 5000;
    uint32 public constant MIN_SLA = 1 hours;
    uint32 public constant MAX_SLA = 14 days;
    uint256 public constant MAX_MEMBERS = 16; // TAP-10 v2 recipient slots
    uint256 public constant CONTAINER_MESSAGE_WINDOW = 1 days;
    uint256 public constant MAX_ENVELOPE = 16_000;
    uint8 public constant POLICY_NIN = 6;
    uint8 public constant POLICY_NOUT = 7;
    uint8 public constant POLICY_NSTATE = 3;

    IFactory public immutable factory;
    IDeWebHub public immutable hub;
    address public immutable treasury;
    bytes32 public immutable selfEndpoint;

    // ─── types ────────────────────────────────────────────────────────────────────────────────
    enum VipKind {
        None,
        Erc721Holder,
        Adapter
    }
    enum Lane {
        Container,
        Guest
    }
    enum Status {
        Pending,
        Claimed,
        Refunded,
        Declined
    }

    struct Inbox {
        address policyCpu;
        uint64 policyCircuitId;
        address inboxCircuits;
        uint64 inboxCircuitId;
        address paymentToken; // address(0) = OKB
        uint96 basePrice;
        uint32 slaSeconds;
        uint8 curve; // P[1:0] for Configurable controllers; presets ignore it
        bytes1 latchState; // exactly what step() returned (LSB-first, bits 0..2)
        bool active;
        VipKind vipKind;
        address vipSource;
        bytes32 handle;
        uint32 pending;
        uint32 answered;
        uint32 refunded;
        uint64 replySeconds; // sum of reply latencies, for the response-time stat
    }

    struct Ticket {
        uint64 inboxId;
        address sender;
        bytes32 replyTargetEndpoint;
        bytes32 expectedReplyRef;
        address token;
        uint96 amount;
        uint40 createdAt;
        uint40 deadline;
        Status status;
        Lane lane;
        bytes32 guestReplyKey; // Guest lane: X25519 key the reply must be sealed to
        uint32 replyInboxIndex;
        uint40 replyTimestamp;
        address replyFrom;
    }

    struct Member {
        address circuits;
        uint64 tokenId;
    }

    struct RegisterParams {
        bytes32 handle;
        address policyCpu;
        uint64 policyCircuitId;
        address inboxCircuits;
        uint64 inboxCircuitId;
        Member[] members; // containers whose TapeSend reply settles; empty = the inbox circuit's own container
        VipKind vipKind;
        address vipSource;
        address paymentToken;
        uint96 basePrice;
        uint32 slaSeconds;
        uint8 curve;
    }

    struct Quote {
        bool canSend;
        uint256 price;
        bytes1 nextState;
        uint8 tier;
        bool vipDiscount;
        bool allowlisted;
        bool vip;
    }

    // ─── storage ──────────────────────────────────────────────────────────────────────────────
    uint256 public inboxCount;
    uint256 public ticketCount;
    mapping(uint256 => Inbox) internal _inboxes;
    mapping(uint256 => Ticket) internal _tickets;
    mapping(uint256 => address[]) internal _members;
    mapping(uint256 => Member[]) internal _memberIds; // (circuits, tokenId) so clients can call hub.keyFor
    mapping(uint256 => bytes) internal _payloads; // ticket → sealed message (guest envelope or container-lane payload)
    mapping(uint256 => bytes) internal _replies; // ticket → sealed reply payload (stored at claim)
    mapping(uint256 => mapping(address => bool)) public isMember;
    mapping(uint256 => mapping(address => bool)) public allowlisted;
    mapping(bytes32 => uint256) public handleToInbox;
    mapping(address => uint256[]) internal _ticketsBySender;
    mapping(uint256 => uint256[]) internal _ticketsByInbox;
    mapping(bytes32 => bool) public messageLocked; // container-lane msgId → already escrowed
    mapping(bytes32 => mapping(uint256 => bool)) public replyUsed; // replyTarget → inboxIndex → consumed
    mapping(address => uint256) public protocolFees; // token → withdrawable to treasury
    mapping(address => uint256) public settledVolume; // token → total answered bounties
    mapping(address => uint256) public refundedVolume;

    // ─── events ───────────────────────────────────────────────────────────────────────────────
    event InboxRegistered(uint256 indexed inboxId, bytes32 indexed handle, address indexed owner, address policyCpu, uint64 policyCircuitId, address inboxCircuits, uint64 inboxCircuitId);
    event InboxUpdated(uint256 indexed inboxId);
    event MembersSet(uint256 indexed inboxId, address[] containers);
    event AllowlistSet(uint256 indexed inboxId, address indexed sender, bool allowed);
    event StateStepped(uint256 indexed inboxId, bytes1 from, bytes1 to, bool enqueue);
    event TicketLocked(uint256 indexed ticketId, uint256 indexed inboxId, address indexed sender, Lane lane, address token, uint256 amount, uint8 tier, bool vipDiscount, uint40 deadline, bytes32 replyTargetEndpoint, bytes32 expectedReplyRef);
    event GuestEnvelopeSent(uint256 indexed ticketId, uint256 indexed inboxId, address indexed sender, bytes32 guestReplyKey, bytes envelope);
    event Claimed(uint256 indexed ticketId, address indexed recipient, address indexed keeper, uint256 toRecipient, uint256 toProtocol, uint256 toKeeper, uint256 replyInboxIndex);
    event Refunded(uint256 indexed ticketId, address indexed sender, address indexed keeper, uint256 toSender, uint256 toKeeper);
    event Declined(uint256 indexed ticketId, address indexed sender, uint256 amount);
    event ProtocolFeesWithdrawn(address indexed token, uint256 amount);

    // ─── errors ───────────────────────────────────────────────────────────────────────────────
    error NotCPU();
    error BadPolicyPins();
    error BadParams();
    error HandleTaken();
    error NotOwner();
    error NotActive();
    error Paused();
    error BadValue();
    error NotPending();
    error NotExpired();
    error Expired();
    error BadReply();
    error ReplyConsumed();
    error MessageAlreadyLocked();
    error NotMemberEndpoint();
    error BadEnvelope();
    error TransferFailed();

    constructor(address factory_, address hub_, address treasury_) {
        require(factory_ != address(0) && hub_ != address(0) && treasury_ != address(0), "zero");
        factory = IFactory(factory_);
        hub = IDeWebHub(hub_);
        treasury = treasury_;
        selfEndpoint = _endpoint(address(this));
    }

    // ─── views ────────────────────────────────────────────────────────────────────────────────
    function getInbox(uint256 inboxId) external view returns (Inbox memory) {
        return _inboxes[inboxId];
    }

    function getTicket(uint256 ticketId) external view returns (Ticket memory) {
        return _tickets[ticketId];
    }

    function membersOf(uint256 inboxId) external view returns (address[] memory) {
        return _members[inboxId];
    }

    /// @notice Member containers as (circuits, tokenId) so a sender can fetch each TapeSend key with `hub.keyFor`.
    function memberIdsOf(uint256 inboxId) external view returns (Member[] memory) {
        return _memberIds[inboxId];
    }

    /// @notice The sealed TAP-10 message of a ticket (kept in state so no log scanning is ever needed).
    function payloadOf(uint256 ticketId) external view returns (bytes memory) {
        return _payloads[ticketId];
    }

    /// @notice The sealed TAP-10 reply a ticket was settled with (empty until claimed).
    function replyPayloadOf(uint256 ticketId) external view returns (bytes memory) {
        return _replies[ticketId];
    }

    function ticketsBySender(address sender) external view returns (uint256[] memory) {
        return _ticketsBySender[sender];
    }

    function ticketsByInbox(uint256 inboxId) external view returns (uint256[] memory) {
        return _ticketsByInbox[inboxId];
    }

    /// @notice Current recipient = owner of the inbox circuit NFT (so the inbox is transferable).
    function recipientOf(uint256 inboxId) public view returns (address) {
        Inbox storage ib = _inboxes[inboxId];
        return ICircuits(ib.inboxCircuits).ownerOf(ib.inboxCircuitId);
    }

    /// @notice Endpoint of a container on this chain: bytes32((chainid << 160) | container).
    function endpointOf(address container) public view returns (bytes32) {
        return _endpoint(container);
    }

    /// @notice Deterministic reply reference of a Guest lane ticket.
    function ticketRef(uint256 ticketId) public view returns (bytes32) {
        return keccak256(abi.encodePacked("VOXRO/ticket/v1", block.chainid, address(this), ticketId));
    }

    /// @notice TAP-10 v2 message id of entry `inboxIndex` in inbox `to` on this hub.
    function messageId(bytes32 to, uint256 inboxIndex) public view returns (bytes32) {
        return keccak256(abi.encodePacked("TAP-10/msg/v2", block.chainid, address(hub), to, inboxIndex));
    }

    /// @notice Live quote: runs the policy circuit with dir = 1 on the current LATCH state.
    function quoteSend(uint256 inboxId, address sender) public view returns (Quote memory q) {
        Inbox storage ib = _inboxes[inboxId];
        if (!ib.active) return q;
        q.allowlisted = allowlisted[inboxId][sender];
        q.vip = _isVip(inboxId, ib, sender);
        (bytes1 ns, uint8 tier, bool disc, bool canSend) = _run(ib, true, q.allowlisted, q.vip);
        q.nextState = ns;
        q.tier = tier;
        q.vipDiscount = disc;
        q.canSend = canSend;
        q.price = _price(ib.basePrice, tier, disc);
    }

    function queueDepth(uint256 inboxId) external view returns (uint8) {
        return uint8(_inboxes[inboxId].latchState) & 0x07;
    }

    // ─── inbox management ─────────────────────────────────────────────────────────────────────
    function registerInbox(RegisterParams calldata p) external returns (uint256 inboxId) {
        if (!factory.isCPU(p.policyCpu) || !factory.isCPU(p.inboxCircuits)) revert NotCPU();
        (uint32 nIn, uint32 nOut, uint32 nState,) = ICircuits(p.policyCpu).circuitInfo(p.policyCircuitId);
        if (nIn != POLICY_NIN || nOut != POLICY_NOUT || nState != POLICY_NSTATE) revert BadPolicyPins();
        if (ICircuits(p.inboxCircuits).ownerOf(p.inboxCircuitId) != msg.sender) revert NotOwner();
        if (p.basePrice == 0 || p.slaSeconds < MIN_SLA || p.slaSeconds > MAX_SLA || p.curve > 3) revert BadParams();
        if (p.vipKind != VipKind.None && p.vipSource == address(0)) revert BadParams();
        if (p.handle != bytes32(0)) {
            if (handleToInbox[p.handle] != 0) revert HandleTaken();
        }
        inboxId = ++inboxCount;
        Inbox storage ib = _inboxes[inboxId];
        ib.policyCpu = p.policyCpu;
        ib.policyCircuitId = p.policyCircuitId;
        ib.inboxCircuits = p.inboxCircuits;
        ib.inboxCircuitId = p.inboxCircuitId;
        ib.paymentToken = p.paymentToken;
        ib.basePrice = p.basePrice;
        ib.slaSeconds = p.slaSeconds;
        ib.curve = p.curve;
        ib.active = true;
        ib.vipKind = p.vipKind;
        ib.vipSource = p.vipSource;
        ib.handle = p.handle;
        if (p.handle != bytes32(0)) handleToInbox[p.handle] = inboxId;
        _setMembers(inboxId, p.members, p.inboxCircuits, p.inboxCircuitId);
        emit InboxRegistered(inboxId, p.handle, msg.sender, p.policyCpu, p.policyCircuitId, p.inboxCircuits, p.inboxCircuitId);
    }

    function setMembers(uint256 inboxId, Member[] calldata members) external onlyRecipient(inboxId) {
        Inbox storage ib = _inboxes[inboxId];
        _setMembers(inboxId, members, ib.inboxCircuits, ib.inboxCircuitId);
    }

    function setPricing(uint256 inboxId, address paymentToken, uint96 basePrice, uint32 slaSeconds, uint8 curve) external onlyRecipient(inboxId) {
        if (basePrice == 0 || slaSeconds < MIN_SLA || slaSeconds > MAX_SLA || curve > 3) revert BadParams();
        Inbox storage ib = _inboxes[inboxId];
        ib.paymentToken = paymentToken;
        ib.basePrice = basePrice;
        ib.slaSeconds = slaSeconds;
        ib.curve = curve;
        emit InboxUpdated(inboxId);
    }

    function setPolicy(uint256 inboxId, address policyCpu, uint64 policyCircuitId) external onlyRecipient(inboxId) {
        if (!factory.isCPU(policyCpu)) revert NotCPU();
        (uint32 nIn, uint32 nOut, uint32 nState,) = ICircuits(policyCpu).circuitInfo(policyCircuitId);
        if (nIn != POLICY_NIN || nOut != POLICY_NOUT || nState != POLICY_NSTATE) revert BadPolicyPins();
        Inbox storage ib = _inboxes[inboxId];
        ib.policyCpu = policyCpu;
        ib.policyCircuitId = policyCircuitId;
        emit InboxUpdated(inboxId);
    }

    function setVipSource(uint256 inboxId, VipKind kind, address source) external onlyRecipient(inboxId) {
        if (kind != VipKind.None && source == address(0)) revert BadParams();
        Inbox storage ib = _inboxes[inboxId];
        ib.vipKind = kind;
        ib.vipSource = source;
        emit InboxUpdated(inboxId);
    }

    function setActive(uint256 inboxId, bool active) external onlyRecipient(inboxId) {
        _inboxes[inboxId].active = active;
        emit InboxUpdated(inboxId);
    }

    function setAllowlist(uint256 inboxId, address[] calldata senders, bool allowed) external onlyRecipient(inboxId) {
        for (uint256 i = 0; i < senders.length; i++) {
            allowlisted[inboxId][senders[i]] = allowed;
            emit AllowlistSet(inboxId, senders[i], allowed);
        }
    }

    // ─── lane A: container to container ───────────────────────────────────────────────────────
    /// @param toEndpoint   member endpoint that received the sender's TapeSend message
    /// @param inboxIndex   its index in `hub.inbox[toEndpoint]`
    /// @param senderCircuits / senderTokenId  the sender's container NFT (must be held by msg.sender)
    /// @param payload / ref  the TAP-10 payload and ref the sender used, checked against the hub digest and kept in state
    function lockForTapeSend(uint256 inboxId, bytes32 toEndpoint, uint256 inboxIndex, address senderCircuits, uint256 senderTokenId, bytes32 ref, bytes calldata payload)
        external
        payable
        nonReentrant
        returns (uint256 ticketId)
    {
        Inbox storage ib = _inboxes[inboxId];
        if (!ib.active) revert NotActive();
        address member = address(uint160(uint256(toEndpoint)));
        if (!isMember[inboxId][member] || toEndpoint != _endpoint(member)) revert NotMemberEndpoint();
        IDeWebHub.Entry memory e = hub.inboxAt(toEndpoint, inboxIndex);
        if (e.from == address(0) || block.timestamp > uint256(e.timestamp) + CONTAINER_MESSAGE_WINDOW) revert BadReply();
        if (hub.accountOf(senderCircuits, senderTokenId) != e.from || ICircuits(senderCircuits).ownerOf(senderTokenId) != msg.sender) revert NotOwner();
        if (e.digest != keccak256(abi.encodePacked(ref, keccak256(payload))) || payload.length > MAX_ENVELOPE) revert BadEnvelope();
        bytes32 msgId = messageId(toEndpoint, inboxIndex);
        if (messageLocked[msgId]) revert MessageAlreadyLocked();
        messageLocked[msgId] = true;
        ticketId = _lock(inboxId, ib, Lane.Container, _endpoint(e.from), msgId, bytes32(0));
        _payloads[ticketId] = payload;
    }

    // ─── lane B: Guest Express (no container) ─────────────────────────────────────────────────
    /// @param guestReplyKey  X25519 public key generated in the sender's browser; the reply is sealed to it
    /// @param envelope       TAP-10 v2 sealed payload (0x54 0x53 0x02 0x01 …) encrypted to the member keys
    function sendGuestPriority(uint256 inboxId, bytes32 guestReplyKey, bytes calldata envelope) external payable nonReentrant returns (uint256 ticketId) {
        Inbox storage ib = _inboxes[inboxId];
        if (!ib.active) revert NotActive();
        if (envelope.length < 93 || envelope.length > MAX_ENVELOPE || envelope[0] != 0x54 || envelope[1] != 0x53 || envelope[2] != 0x02 || envelope[3] != 0x01) revert BadEnvelope();
        if (guestReplyKey == bytes32(0)) revert BadParams();
        ticketId = ticketCount + 1;
        ticketId = _lock(inboxId, ib, Lane.Guest, selfEndpoint, ticketRef(ticketId), guestReplyKey);
        _payloads[ticketId] = envelope;
        emit GuestEnvelopeSent(ticketId, inboxId, msg.sender, guestReplyKey, envelope);
    }

    // ─── settlement ───────────────────────────────────────────────────────────────────────────
    /// @notice Permissionless. Verifies the member's TapeSend reply in DeWebHub storage, steps the
    ///         queue down and pays 95 % to the inbox owner, 5 % protocol (0.1 % of which tips the caller).
    /// @param replyPayload  the sealed reply exactly as sent through DeWebHub; its hash is checked against the
    ///                      stored digest and the bytes are kept so the sender can decrypt without any log scanning.
    function claimBounty(uint256 ticketId, uint256 replyInboxIndex, bytes calldata replyPayload) external nonReentrant {
        Ticket storage t = _tickets[ticketId];
        if (t.status != Status.Pending) revert NotPending();
        IDeWebHub.Entry memory e = hub.inboxAt(t.replyTargetEndpoint, replyInboxIndex);
        if (!isMember[t.inboxId][e.from]) revert BadReply();
        if (e.timestamp < t.createdAt || e.timestamp > t.deadline) revert BadReply();
        if (e.digest != keccak256(abi.encodePacked(t.expectedReplyRef, keccak256(replyPayload))) || replyPayload.length > MAX_ENVELOPE) revert BadReply();
        if (replyUsed[t.replyTargetEndpoint][replyInboxIndex]) revert ReplyConsumed();
        replyUsed[t.replyTargetEndpoint][replyInboxIndex] = true;
        _replies[ticketId] = replyPayload;

        Inbox storage ib = _inboxes[t.inboxId];
        t.status = Status.Claimed;
        t.replyInboxIndex = uint32(replyInboxIndex);
        t.replyTimestamp = e.timestamp;
        t.replyFrom = e.from;
        ib.pending -= 1;
        ib.answered += 1;
        ib.replySeconds += uint64(e.timestamp - t.createdAt);
        _stepDown(t.inboxId, ib);

        _payClaim(ticketId, t, replyInboxIndex);
    }

    function _payClaim(uint256 ticketId, Ticket storage t, uint256 replyInboxIndex) internal {
        uint256 amount = t.amount;
        uint256 protocol = (amount * PROTOCOL_BPS) / 10_000;
        uint256 keeper = (amount * KEEPER_BPS) / 10_000;
        uint256 toRecipient = amount - protocol;
        protocolFees[t.token] += protocol - keeper;
        settledVolume[t.token] += amount;
        address recipient = recipientOf(t.inboxId);
        _pay(t.token, recipient, toRecipient);
        if (keeper > 0) _pay(t.token, msg.sender, keeper);
        emit Claimed(ticketId, recipient, msg.sender, toRecipient, protocol - keeper, keeper, replyInboxIndex);
    }

    /// @notice Permissionless after the deadline. 100 % back to the sender; a caller other than the
    ///         sender earns a 0.1 % keeper tip out of that amount.
    function refundExpired(uint256 ticketId) external nonReentrant {
        Ticket storage t = _tickets[ticketId];
        if (t.status != Status.Pending) revert NotPending();
        if (block.timestamp <= t.deadline) revert NotExpired();
        Inbox storage ib = _inboxes[t.inboxId];
        t.status = Status.Refunded;
        ib.pending -= 1;
        ib.refunded += 1;
        _stepDown(t.inboxId, ib);
        uint256 amount = t.amount;
        uint256 keeper = msg.sender == t.sender ? 0 : (amount * KEEPER_BPS) / 10_000;
        refundedVolume[t.token] += amount;
        _pay(t.token, t.sender, amount - keeper);
        if (keeper > 0) _pay(t.token, msg.sender, keeper);
        emit Refunded(ticketId, t.sender, msg.sender, amount - keeper, keeper);
    }

    /// @notice The inbox owner can decline early: instant 100 % refund, queue steps down, no fee.
    function declineTicket(uint256 ticketId) external nonReentrant {
        Ticket storage t = _tickets[ticketId];
        if (t.status != Status.Pending) revert NotPending();
        if (msg.sender != recipientOf(t.inboxId)) revert NotOwner();
        Inbox storage ib = _inboxes[t.inboxId];
        t.status = Status.Declined;
        ib.pending -= 1;
        ib.refunded += 1;
        _stepDown(t.inboxId, ib);
        refundedVolume[t.token] += t.amount;
        _pay(t.token, t.sender, t.amount);
        emit Declined(ticketId, t.sender, t.amount);
    }

    /// @notice Anyone may push accrued protocol fees to the immutable treasury (pull pattern, no owner).
    function withdrawProtocolFees(address token) external nonReentrant {
        uint256 amount = protocolFees[token];
        protocolFees[token] = 0;
        if (amount > 0) _pay(token, treasury, amount);
        emit ProtocolFeesWithdrawn(token, amount);
    }

    // ─── internals ────────────────────────────────────────────────────────────────────────────
    modifier onlyRecipient(uint256 inboxId) {
        if (msg.sender != recipientOf(inboxId)) revert NotOwner();
        _;
    }

    function _endpoint(address container) internal view returns (bytes32) {
        return bytes32((block.chainid << 160) | uint256(uint160(container)));
    }

    function _setMembers(uint256 inboxId, Member[] calldata members, address inboxCircuits, uint64 inboxCircuitId) internal {
        address[] storage list = _members[inboxId];
        for (uint256 i = 0; i < list.length; i++) isMember[inboxId][list[i]] = false;
        delete _members[inboxId];
        delete _memberIds[inboxId];
        if (members.length > MAX_MEMBERS) revert BadParams();
        if (members.length == 0) {
            address c = hub.accountOf(inboxCircuits, inboxCircuitId);
            list.push(c);
            _memberIds[inboxId].push(Member(inboxCircuits, inboxCircuitId));
            isMember[inboxId][c] = true;
        } else {
            for (uint256 i = 0; i < members.length; i++) {
                if (!factory.isCPU(members[i].circuits)) revert NotCPU();
                address c = hub.accountOf(members[i].circuits, members[i].tokenId);
                if (isMember[inboxId][c]) revert BadParams();
                list.push(c);
                _memberIds[inboxId].push(members[i]);
                isMember[inboxId][c] = true;
            }
        }
        emit MembersSet(inboxId, list);
    }

    function _isVip(uint256 inboxId, Inbox storage ib, address sender) internal view returns (bool) {
        if (ib.vipKind == VipKind.None) return false;
        if (ib.vipKind == VipKind.Erc721Holder) {
            (bool ok, bytes memory data) = ib.vipSource.staticcall(abi.encodeWithSignature("balanceOf(address)", sender));
            return ok && data.length >= 32 && abi.decode(data, (uint256)) > 0;
        }
        try IVipSource(ib.vipSource).isVip(inboxId, sender) returns (bool v) {
            return v;
        } catch {
            return false;
        }
    }

    /// @dev One beat of the policy circuit. Inputs (LSB-first): active, dir, p0, p1, allowlisted, holdsPartner.
    ///      Outputs: effTier[1:0], vipDiscount50, canSend, Q'[2:0].
    function _run(Inbox storage ib, bool enqueue, bool allow, bool vip) internal view returns (bytes1 newState, uint8 tier, bool disc, bool canSend) {
        uint8 inputs = 1 | (enqueue ? 2 : 0) | ((ib.curve & 1) << 2) | ((ib.curve >> 1) << 3) | (allow ? 16 : 0) | (vip ? 32 : 0);
        (bytes memory ns, bytes memory out) = ICircuits(ib.policyCpu).step(ib.policyCircuitId, abi.encodePacked(ib.latchState), abi.encodePacked(bytes1(inputs)));
        if (ns.length == 0 || out.length == 0) revert BadPolicyPins();
        newState = bytes1(uint8(ns[0]) & 0x07);
        uint8 o = uint8(out[0]);
        tier = o & 0x03;
        disc = (o & 0x04) != 0;
        canSend = (o & 0x08) != 0;
    }

    function _price(uint96 basePrice, uint8 tier, bool disc) internal pure returns (uint256 p) {
        uint16[4] memory bps = [uint16(10_000), 15_000, 25_000, 40_000];
        p = (uint256(basePrice) * bps[tier]) / 10_000;
        if (disc) p = (p * (10_000 - VIP_DISCOUNT_BPS)) / 10_000;
    }

    function _lock(uint256 inboxId, Inbox storage ib, Lane lane, bytes32 replyTarget, bytes32 expectedRef, bytes32 guestKey) internal returns (uint256 ticketId) {
        bool allow = allowlisted[inboxId][msg.sender];
        bool vip = _isVip(inboxId, ib, msg.sender);
        (bytes1 ns, uint8 tier, bool disc, bool canSend) = _run(ib, true, allow, vip);
        if (!canSend) revert Paused();
        uint256 price = _price(ib.basePrice, tier, disc);
        if (price > type(uint96).max) revert BadParams();
        _collect(ib.paymentToken, price);
        bytes1 prev = ib.latchState;
        ib.latchState = ns;
        ib.pending += 1;
        emit StateStepped(inboxId, prev, ns, true);

        ticketId = ++ticketCount;
        Ticket storage t = _tickets[ticketId];
        t.inboxId = uint64(inboxId);
        t.sender = msg.sender;
        t.replyTargetEndpoint = replyTarget;
        t.expectedReplyRef = expectedRef;
        t.token = ib.paymentToken;
        t.amount = uint96(price);
        t.createdAt = uint40(block.timestamp);
        t.deadline = uint40(block.timestamp + ib.slaSeconds);
        t.lane = lane;
        t.guestReplyKey = guestKey;
        _ticketsBySender[msg.sender].push(ticketId);
        _ticketsByInbox[inboxId].push(ticketId);
        emit TicketLocked(ticketId, inboxId, msg.sender, lane, ib.paymentToken, price, tier, disc, t.deadline, replyTarget, expectedRef);
    }

    function _stepDown(uint256 inboxId, Inbox storage ib) internal {
        (bytes1 ns,,,) = _run(ib, false, false, false);
        bytes1 prev = ib.latchState;
        ib.latchState = ns;
        emit StateStepped(inboxId, prev, ns, false);
    }

    function _collect(address token, uint256 amount) internal {
        if (token == address(0)) {
            if (msg.value != amount) revert BadValue();
        } else {
            if (msg.value != 0) revert BadValue();
            IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        }
    }

    function _pay(address token, address to, uint256 amount) internal {
        if (amount == 0) return;
        if (token == address(0)) {
            (bool ok,) = to.call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }
}
