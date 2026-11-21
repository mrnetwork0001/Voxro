// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {ICircuits, IDeWebHub} from "./interfaces/ITapeOut.sol";
import {VoxroEscrow} from "./VoxroEscrow.sol";

/// @title VoxroLens — one-call reads for the Voxro client plus on-chain receipts and datasheets.
contract VoxroLens {
    using Strings for uint256;
    using Strings for address;

    VoxroEscrow public immutable escrow;
    IDeWebHub public immutable hub;

    struct InboxView {
        uint256 id;
        VoxroEscrow.Inbox inbox;
        address recipient;
        address[] members;
        bytes32[] memberEndpoints;
        uint8 queueDepth;
        VoxroEscrow.Quote quote; // for `sender` passed to the view
        uint32 nIn;
        uint32 nOut;
        uint32 nState;
        uint32 gateCount;
    }

    struct TicketView {
        uint256 id;
        VoxroEscrow.Ticket ticket;
        bytes32 handle;
        address recipient;
        uint256 secondsLeft;
    }

    struct Check {
        bool ok;
        string label;
    }

    struct Receipt {
        uint256 ticketId;
        VoxroEscrow.Ticket ticket;
        bytes32 handle;
        address recipient;
        IDeWebHub.Entry reply; // zero when no reply recorded
        bytes32 expectedDigestPrefix; // keccak256(ref) — the public commitment half
        Check[3] checks;
        bool settled;
    }

    struct Dashboard {
        uint256 inboxCount;
        uint256 ticketCount;
        uint256 pending;
        uint256 answered;
        uint256 refunded;
        uint256 avgQueueBps; // average queue depth × 10_000 / 7
    }

    constructor(address escrow_) {
        escrow = VoxroEscrow(escrow_);
        hub = escrow.hub();
    }

    function getInbox(uint256 id, address sender) public view returns (InboxView memory v) {
        v.id = id;
        v.inbox = escrow.getInbox(id);
        if (v.inbox.inboxCircuits == address(0)) return v;
        v.recipient = escrow.recipientOf(id);
        v.members = escrow.membersOf(id);
        v.memberEndpoints = new bytes32[](v.members.length);
        for (uint256 i = 0; i < v.members.length; i++) v.memberEndpoints[i] = escrow.endpointOf(v.members[i]);
        v.queueDepth = uint8(v.inbox.latchState) & 0x07;
        v.quote = escrow.quoteSend(id, sender);
        (v.nIn, v.nOut, v.nState, v.gateCount) = ICircuits(v.inbox.policyCpu).circuitInfo(v.inbox.policyCircuitId);
    }

    function getInboxes(uint256[] calldata ids, address sender) external view returns (InboxView[] memory out) {
        out = new InboxView[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) out[i] = getInbox(ids[i], sender);
    }

    /// @notice Directory page: inboxes [start, start+n) in registration order.
    function directory(uint256 start, uint256 n, address sender) external view returns (InboxView[] memory out) {
        uint256 total = escrow.inboxCount();
        if (start >= total) return out;
        uint256 end = start + n > total ? total : start + n;
        out = new InboxView[](end - start);
        for (uint256 i = start; i < end; i++) out[i - start] = getInbox(i + 1, sender);
    }

    function byHandle(bytes32 handle, address sender) external view returns (InboxView memory) {
        return getInbox(escrow.handleToInbox(handle), sender);
    }

    function getTicket(uint256 id) public view returns (TicketView memory v) {
        v.id = id;
        v.ticket = escrow.getTicket(id);
        if (v.ticket.sender == address(0)) return v;
        v.handle = escrow.getInbox(v.ticket.inboxId).handle;
        v.recipient = escrow.recipientOf(v.ticket.inboxId);
        v.secondsLeft = block.timestamp >= v.ticket.deadline ? 0 : v.ticket.deadline - block.timestamp;
    }

    function getTickets(uint256[] calldata ids) external view returns (TicketView[] memory out) {
        out = new TicketView[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) out[i] = getTicket(ids[i]);
    }

    function outbox(address sender) external view returns (TicketView[] memory out) {
        uint256[] memory ids = escrow.ticketsBySender(sender);
        out = new TicketView[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) out[i] = getTicket(ids[i]);
    }

    function inboxTickets(uint256 inboxId) external view returns (TicketView[] memory out) {
        uint256[] memory ids = escrow.ticketsByInbox(inboxId);
        out = new TicketView[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) out[i] = getTicket(ids[i]);
    }

    function dashboard() external view returns (Dashboard memory d) {
        d.inboxCount = escrow.inboxCount();
        d.ticketCount = escrow.ticketCount();
        uint256 q;
        uint256 active;
        for (uint256 i = 1; i <= d.inboxCount; i++) {
            VoxroEscrow.Inbox memory ib = escrow.getInbox(i);
            d.pending += ib.pending;
            d.answered += ib.answered;
            d.refunded += ib.refunded;
            if (ib.active) {
                active++;
                q += uint8(ib.latchState) & 0x07;
            }
        }
        d.avgQueueBps = active == 0 ? 0 : (q * 10_000) / (7 * active);
    }

    /// @notice Verifiable disclosure receipt: the ticket, the DeWebHub reply entry it was settled
    ///         against, and the three `claimBounty` checks evaluated from live chain data.
    function receipt(uint256 ticketId) external view returns (Receipt memory r) {
        r.ticketId = ticketId;
        r.ticket = escrow.getTicket(ticketId);
        if (r.ticket.sender == address(0)) return r;
        r.handle = escrow.getInbox(r.ticket.inboxId).handle;
        r.recipient = escrow.recipientOf(r.ticket.inboxId);
        r.expectedDigestPrefix = keccak256(abi.encodePacked(r.ticket.expectedReplyRef));
        r.settled = r.ticket.status != VoxroEscrow.Status.Pending;
        if (r.ticket.status == VoxroEscrow.Status.Claimed) {
            r.reply = hub.inboxAt(r.ticket.replyTargetEndpoint, r.ticket.replyInboxIndex);
            r.checks[0] = Check(escrow.isMember(r.ticket.inboxId, r.reply.from), "entry.from is an inbox member container");
            r.checks[1] = Check(r.reply.timestamp >= r.ticket.createdAt && r.reply.timestamp <= r.ticket.deadline, "createdAt <= entry.timestamp <= deadline");
            r.checks[2] = Check(true, "entry.digest == keccak256(expectedReplyRef || keccak256(payload)) (verified at claim)");
        }
    }

    // ─── on-chain SVG datasheet ───────────────────────────────────────────────────────────────
    /// @notice Data-URI SVG datasheet of an inbox: handle, queue bits, surge tier, response stats.
    function inboxSvgDataUri(uint256 inboxId) external view returns (string memory) {
        return string.concat("data:image/svg+xml;base64,", Base64.encode(bytes(inboxSvg(inboxId))));
    }

    function inboxSvg(uint256 inboxId) public view returns (string memory) {
        VoxroEscrow.Inbox memory ib = escrow.getInbox(inboxId);
        uint8 q = uint8(ib.latchState) & 0x07;
        VoxroEscrow.Quote memory quote = escrow.quoteSend(inboxId, address(0));
        string memory cells;
        for (uint8 i = 0; i < 8; i++) {
            bool on = q > 0 && i <= q;
            cells = string.concat(cells, '<rect x="', (40 + uint256(i) * 44).toString(), '" y="150" width="38" height="14" fill="', on ? tierColor(quote.tier) : "#1a1d24", '" stroke="#262a33"/>');
        }
        string memory avg = ib.answered == 0 ? "-" : string.concat((uint256(ib.replySeconds) / ib.answered / 60).toString(), " min");
        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" width="420" height="260" viewBox="0 0 420 260" font-family="ui-monospace,Menlo,monospace">',
            '<rect width="420" height="260" fill="#0b0c0f"/>',
            '<text x="40" y="44" fill="#ff5a2e" font-size="11" letter-spacing="2">VOXRO INBOX #', inboxId.toString(), '</text>',
            '<text x="40" y="84" fill="#ece9e1" font-size="28" font-weight="600">@', _handleString(ib.handle), '</text>',
            '<text x="40" y="112" fill="#8c8a82" font-size="11">policy #', uint256(ib.policyCircuitId).toString(), ' on ', ib.policyCpu.toHexString(), '</text>',
            '<text x="40" y="140" fill="#8c8a82" font-size="10" letter-spacing="2">LATCH QUEUE Q=', uint256(q).toString(), '  TIER ', _mult(quote.tier), '</text>',
            cells,
            '<text x="40" y="200" fill="#ece9e1" font-size="12">answered ', uint256(ib.answered).toString(), '  refunded ', uint256(ib.refunded).toString(), '  pending ', uint256(ib.pending).toString(), '</text>',
            '<text x="40" y="222" fill="#ece9e1" font-size="12">median reply ', avg, '  window ', (uint256(ib.slaSeconds) / 3600).toString(), 'h</text>',
            '<text x="40" y="246" fill="#6f6d66" font-size="10">X Layer 196 - TapeOut - TapeSend - no oracle</text></svg>'
        );
    }

    function tierColor(uint8 tier) public pure returns (string memory) {
        if (tier == 0) return "#37b06e";
        if (tier == 1) return "#e09a2c";
        if (tier == 2) return "#ff7a3d";
        return "#e5484d";
    }

    function _mult(uint8 tier) internal pure returns (string memory) {
        if (tier == 0) return "1.0x";
        if (tier == 1) return "1.5x";
        if (tier == 2) return "2.5x";
        return "4.0x";
    }

    function _handleString(bytes32 h) internal pure returns (string memory) {
        uint256 len;
        while (len < 32 && h[len] != 0) len++;
        bytes memory b = new bytes(len);
        for (uint256 i = 0; i < len; i++) b[i] = h[i];
        return string(b);
    }
}
