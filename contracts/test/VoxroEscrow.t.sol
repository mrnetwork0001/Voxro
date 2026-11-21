// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {VoxroEscrow} from "../src/VoxroEscrow.sol";
import {VoxroLens} from "../src/VoxroLens.sol";
import {Erc721HolderVip} from "../src/vip/Erc721HolderVip.sol";
import {MockFactory, MockHub, MockProcessor, MockUSDT} from "./mocks/Mocks.sol";

contract VoxroEscrowTest is Test {
    MockFactory factory;
    MockHub hub;
    MockProcessor voxr; // policy + inbox circuits
    MockProcessor partner;
    MockUSDT usdt;
    VoxroEscrow escrow;
    VoxroLens lens;

    address treasury = address(0x7EA5);
    address alice = address(0xA11CE); // recipient
    address bob = address(0xB0B); // sender
    address carol = address(0xCA201); // keeper / second sender

    uint256 constant BALANCED = 4;
    uint256 constant FORTRESS = 5;
    uint256 constant CONFIGURABLE = 8;
    uint256 inboxTokenId;
    uint256 inboxId;

    function setUp() public {
        factory = new MockFactory();
        hub = new MockHub();
        voxr = new MockProcessor();
        partner = new MockProcessor();
        usdt = new MockUSDT();
        factory.add(address(voxr));
        factory.add(address(partner));
        for (uint256 i = 1; i <= 8; i++) voxr.mintTo(address(this)); // ids 1..8 = catalog
        voxr.setPreset(BALANCED, 1);
        voxr.setPreset(FORTRESS, 3);
        voxr.setPreset(6, 0);
        voxr.setPreset(7, 2);
        inboxTokenId = voxr.mintTo(alice); // alice's inbox circuit (#9)
        escrow = new VoxroEscrow(address(factory), address(hub), treasury);
        lens = new VoxroLens(address(escrow));
        usdt.mint(bob, 10_000e6);
        usdt.mint(carol, 10_000e6);
        vm.prank(bob);
        usdt.approve(address(escrow), type(uint256).max);
        vm.prank(carol);
        usdt.approve(address(escrow), type(uint256).max);
        inboxId = _register(alice, "mrnetwork", BALANCED, address(usdt), 10e6, 48 hours, VoxroEscrow.VipKind.None, address(0));
    }

    function _register(address owner, bytes32 handle, uint256 policyId, address token, uint96 price, uint32 sla, VoxroEscrow.VipKind kind, address src) internal returns (uint256 id) {
        VoxroEscrow.Member[] memory none;
        VoxroEscrow.RegisterParams memory p = VoxroEscrow.RegisterParams({
            handle: handle,
            policyCpu: address(voxr),
            policyCircuitId: uint64(policyId),
            inboxCircuits: address(voxr),
            inboxCircuitId: uint64(inboxTokenId),
            members: none,
            vipKind: kind,
            vipSource: src,
            paymentToken: token,
            basePrice: price,
            slaSeconds: sla,
            curve: 1
        });
        vm.prank(owner);
        id = escrow.registerInbox(p);
    }

    function _envelope() internal pure returns (bytes memory e) {
        e = new bytes(120);
        e[0] = 0x54;
        e[1] = 0x53;
        e[2] = 0x02;
        e[3] = 0x01;
    }

    function _guest(address from, uint256 id) internal returns (uint256 tid) {
        vm.prank(from);
        tid = escrow.sendGuestPriority(id, bytes32(uint256(0xBEEF)), _envelope());
    }

    function _reply(uint256 tid, bytes memory payload) internal returns (uint256 idx) {
        VoxroEscrow.Ticket memory t = escrow.getTicket(tid);
        idx = hub.send(address(voxr), inboxTokenId, t.replyTargetEndpoint, t.expectedReplyRef, payload);
    }

    // ─── registration ─────────────────────────────────────────────────────────────────────────
    function test_registerValidatesPinsOwnerAndHandle() public {
        VoxroEscrow.Member[] memory none;
        VoxroEscrow.RegisterParams memory p = VoxroEscrow.RegisterParams("x", address(voxr), 4, address(voxr), uint64(inboxTokenId), none, VoxroEscrow.VipKind.None, address(0), address(0), 1e18, 2 hours, 1);
        vm.expectRevert(VoxroEscrow.NotOwner.selector);
        vm.prank(bob);
        escrow.registerInbox(p);
        p.handle = "mrnetwork";
        vm.expectRevert(VoxroEscrow.HandleTaken.selector);
        vm.prank(alice);
        escrow.registerInbox(p);
        p.handle = "y";
        p.policyCpu = address(0xdead);
        vm.expectRevert(VoxroEscrow.NotCPU.selector);
        vm.prank(alice);
        escrow.registerInbox(p);
        assertEq(escrow.membersOf(inboxId)[0], hub.accountOf(address(voxr), inboxTokenId));
        assertEq(escrow.memberIdsOf(inboxId)[0].tokenId, uint64(inboxTokenId));
        assertEq(escrow.payloadOf(_guest(bob, inboxId)).length, 120);
        assertEq(escrow.recipientOf(inboxId), alice);
    }

    // ─── pricing ──────────────────────────────────────────────────────────────────────────────
    function test_balancedLadder_10_15_15_25_25() public {
        uint256[5] memory want = [uint256(10e6), 15e6, 15e6, 25e6, 25e6];
        for (uint256 i = 0; i < 5; i++) {
            VoxroEscrow.Quote memory q = escrow.quoteSend(inboxId, bob);
            assertEq(q.price, want[i], "quote");
            assertTrue(q.canSend);
            uint256 before = usdt.balanceOf(bob);
            _guest(bob, inboxId);
            assertEq(before - usdt.balanceOf(bob), want[i], "charged");
        }
        assertEq(escrow.queueDepth(inboxId), 5);
        assertEq(escrow.getInbox(inboxId).pending, 5);
    }

    // ─── guest lane end to end ─────────────────────────────────────────────────────────────────
    function test_guestLane_claimPays95_5_withKeeperTip() public {
        uint256 tid = _guest(bob, inboxId);
        VoxroEscrow.Ticket memory t = escrow.getTicket(tid);
        assertEq(t.replyTargetEndpoint, escrow.selfEndpoint());
        assertEq(t.expectedReplyRef, escrow.ticketRef(tid));
        bytes memory payload = hex"5453020100";
        vm.warp(block.timestamp + 1 hours);
        uint256 idx = _reply(tid, payload);
        // wrong payload hash fails
        vm.expectRevert(VoxroEscrow.BadReply.selector);
        escrow.claimBounty(tid, idx, "nope");
        vm.prank(carol); // keeper
        escrow.claimBounty(tid, idx, payload);
        assertEq(usdt.balanceOf(alice), 9.5e6, "recipient 95%");
        assertEq(usdt.balanceOf(carol), 10_000e6 + 0.01e6, "keeper 0.1%");
        assertEq(escrow.protocolFees(address(usdt)), 0.49e6, "protocol 4.9%");
        assertEq(escrow.queueDepth(inboxId), 0);
        assertEq(uint8(escrow.getTicket(tid).status), uint8(VoxroEscrow.Status.Claimed));
        // reply cannot be reused
        vm.expectRevert(VoxroEscrow.NotPending.selector);
        escrow.claimBounty(tid, idx, payload);
        escrow.withdrawProtocolFees(address(usdt));
        assertEq(usdt.balanceOf(treasury), 0.49e6);
        VoxroLens.Receipt memory r = lens.receipt(tid);
        assertTrue(r.settled && r.checks[0].ok && r.checks[1].ok);
    }

    function test_lateReplyCannotClaim_andRefundWithKeeper() public {
        uint256 tid = _guest(bob, inboxId);
        vm.expectRevert(VoxroEscrow.NotExpired.selector);
        escrow.refundExpired(tid);
        vm.warp(block.timestamp + 48 hours + 1);
        uint256 idx = _reply(tid, hex"01");
        vm.expectRevert(VoxroEscrow.BadReply.selector);
        escrow.claimBounty(tid, idx, hex"01");
        uint256 before = usdt.balanceOf(bob);
        vm.prank(carol);
        escrow.refundExpired(tid);
        assertEq(usdt.balanceOf(bob) - before, 10e6 - 0.01e6, "sender gets 99.9% when a keeper finalises");
        assertEq(usdt.balanceOf(carol), 10_000e6 + 0.01e6);
        assertEq(escrow.queueDepth(inboxId), 0);
    }

    function test_senderRefundsWithoutTip_andDecline() public {
        uint256 t1 = _guest(bob, inboxId);
        uint256 t2 = _guest(bob, inboxId);
        vm.prank(alice);
        escrow.declineTicket(t2);
        assertEq(usdt.balanceOf(bob), 10_000e6 - 10e6, "t2 refunded in full immediately");
        vm.warp(block.timestamp + 49 hours);
        vm.prank(bob);
        escrow.refundExpired(t1);
        assertEq(usdt.balanceOf(bob), 10_000e6);
        assertEq(escrow.queueDepth(inboxId), 0);
    }

    // ─── container lane ───────────────────────────────────────────────────────────────────────
    function test_containerLane_msgIdAndReplyTarget() public {
        uint256 bobToken = voxr.mintTo(bob);
        bytes32 to = escrow.endpointOf(hub.accountOf(address(voxr), inboxTokenId));
        vm.prank(bob);
        uint256 idx = hub.send(address(voxr), bobToken, to, bytes32(0), hex"545302010000");
        vm.prank(carol); // not the holder of bob's container
        vm.expectRevert(VoxroEscrow.NotOwner.selector);
        escrow.lockForTapeSend(inboxId, to, idx, address(voxr), bobToken, bytes32(0), hex"545302010000");
        vm.prank(bob);
        vm.expectRevert(VoxroEscrow.BadEnvelope.selector); // payload must match the hub digest
        escrow.lockForTapeSend(inboxId, to, idx, address(voxr), bobToken, bytes32(0), hex"5453020100ff");
        vm.prank(bob);
        uint256 tid = escrow.lockForTapeSend(inboxId, to, idx, address(voxr), bobToken, bytes32(0), hex"545302010000");
        assertEq(escrow.payloadOf(tid), hex"545302010000");
        VoxroEscrow.Ticket memory t = escrow.getTicket(tid);
        assertEq(t.expectedReplyRef, escrow.messageId(to, idx));
        assertEq(t.replyTargetEndpoint, escrow.endpointOf(hub.accountOf(address(voxr), bobToken)));
        vm.prank(bob);
        vm.expectRevert(VoxroEscrow.MessageAlreadyLocked.selector);
        escrow.lockForTapeSend(inboxId, to, idx, address(voxr), bobToken, bytes32(0), hex"545302010000");
        uint256 r = _reply(tid, hex"aa");
        escrow.claimBounty(tid, r, hex"aa");
        assertEq(escrow.replyPayloadOf(tid), hex"aa");
        assertEq(usdt.balanceOf(alice), 9.5e6);
    }

    // ─── fortress pause + VIP ─────────────────────────────────────────────────────────────────
    function test_fortressPausesColdSenders_vipHolderPassesAtHalf() public {
        Erc721HolderVip vip = new Erc721HolderVip(address(partner), 1);
        vm.prank(alice);
        escrow.setPolicy(inboxId, address(voxr), uint64(FORTRESS));
        vm.prank(alice);
        escrow.setVipSource(inboxId, VoxroEscrow.VipKind.Adapter, address(vip));
        vm.prank(alice);
        escrow.setPricing(inboxId, address(usdt), 50e6, 72 hours, 1);
        for (uint256 i = 0; i < 6; i++) _guest(bob, inboxId);
        assertEq(escrow.queueDepth(inboxId), 6);
        assertFalse(escrow.quoteSend(inboxId, bob).canSend);
        vm.prank(bob);
        vm.expectRevert(VoxroEscrow.Paused.selector);
        escrow.sendGuestPriority(inboxId, bytes32(uint256(1)), _envelope());
        partner.mintTo(carol); // carol holds a partner circuit
        VoxroEscrow.Quote memory q = escrow.quoteSend(inboxId, carol);
        assertTrue(q.canSend && q.vipDiscount);
        assertEq(q.tier, 2);
        assertEq(q.price, 62.5e6); // 50 × 2.5 / 2
        _guest(carol, inboxId);
        assertEq(escrow.queueDepth(inboxId), 7);
        // raw ERC-721 as the VIP source works too
        vm.prank(alice);
        escrow.setVipSource(inboxId, VoxroEscrow.VipKind.Erc721Holder, address(partner));
        assertTrue(escrow.quoteSend(inboxId, carol).vip);
        assertFalse(escrow.quoteSend(inboxId, bob).vip);
    }

    function test_allowlistOverridesToBase() public {
        for (uint256 i = 0; i < 4; i++) _guest(bob, inboxId);
        assertEq(escrow.quoteSend(inboxId, bob).price, 25e6);
        address[] memory s = new address[](1);
        s[0] = bob;
        vm.prank(alice);
        escrow.setAllowlist(inboxId, s, true);
        VoxroEscrow.Quote memory q = escrow.quoteSend(inboxId, bob);
        assertEq(q.price, 10e6);
        assertTrue(q.allowlisted);
    }

    // ─── team inbox: any member's reply settles ───────────────────────────────────────────────
    function test_teamMembers_anyOfN() public {
        uint256 p2 = voxr.mintTo(alice);
        uint256 p3 = voxr.mintTo(alice);
        VoxroEscrow.Member[] memory m = new VoxroEscrow.Member[](3);
        m[0] = VoxroEscrow.Member(address(voxr), uint64(inboxTokenId));
        m[1] = VoxroEscrow.Member(address(voxr), uint64(p2));
        m[2] = VoxroEscrow.Member(address(voxr), uint64(p3));
        vm.prank(alice);
        escrow.setMembers(inboxId, m);
        assertEq(escrow.membersOf(inboxId).length, 3);
        uint256 tid = _guest(bob, inboxId);
        VoxroEscrow.Ticket memory t = escrow.getTicket(tid);
        uint256 idx = hub.send(address(voxr), p3, t.replyTargetEndpoint, t.expectedReplyRef, hex"cc"); // partner #3 answers
        escrow.claimBounty(tid, idx, hex"cc");
        assertEq(usdt.balanceOf(alice), 9.5e6);
        // a non-member reply does not settle
        uint256 t2 = _guest(bob, inboxId);
        uint256 stranger = voxr.mintTo(carol);
        VoxroEscrow.Ticket memory tt = escrow.getTicket(t2);
        uint256 bad = hub.send(address(voxr), stranger, tt.replyTargetEndpoint, tt.expectedReplyRef, hex"dd");
        vm.expectRevert(VoxroEscrow.BadReply.selector);
        escrow.claimBounty(t2, bad, hex"dd");
    }

    // ─── transferable inbox ───────────────────────────────────────────────────────────────────
    function test_transferInboxNftMovesPayoutsAndAdmin() public {
        uint256 tid = _guest(bob, inboxId);
        voxr.transfer(inboxTokenId, carol); // sold on the Circuit Market
        assertEq(escrow.recipientOf(inboxId), carol);
        vm.prank(alice);
        vm.expectRevert(VoxroEscrow.NotOwner.selector);
        escrow.setActive(inboxId, false);
        uint256 idx = _reply(tid, hex"ee");
        uint256 before = usdt.balanceOf(carol);
        escrow.claimBounty(tid, idx, hex"ee");
        assertEq(usdt.balanceOf(carol) - before, 9.5e6, "new owner is paid");
        assertEq(usdt.balanceOf(alice), 0);
    }

    // ─── native OKB path ──────────────────────────────────────────────────────────────────────
    function test_nativeOkbLockAndRefund() public {
        uint256 t2 = voxr.mintTo(alice);
        inboxTokenId = t2;
        uint256 id = _register(alice, "okb", BALANCED, address(0), 1 ether, 2 hours, VoxroEscrow.VipKind.None, address(0));
        vm.deal(bob, 10 ether);
        vm.prank(bob);
        vm.expectRevert(VoxroEscrow.BadValue.selector);
        escrow.sendGuestPriority{value: 0.5 ether}(id, bytes32(uint256(1)), _envelope());
        vm.prank(bob);
        uint256 tid = escrow.sendGuestPriority{value: 1 ether}(id, bytes32(uint256(1)), _envelope());
        vm.warp(block.timestamp + 3 hours);
        vm.prank(bob);
        escrow.refundExpired(tid);
        assertEq(bob.balance, 10 ether);
    }

    // ─── lens ─────────────────────────────────────────────────────────────────────────────────
    function test_lensViewsAndSvg() public {
        _guest(bob, inboxId);
        VoxroLens.InboxView memory v = lens.getInbox(inboxId, bob);
        assertEq(v.queueDepth, 1);
        assertEq(v.quote.price, 15e6);
        assertEq(v.nIn, 6);
        assertEq(lens.outbox(bob).length, 1);
        assertEq(lens.inboxTickets(inboxId).length, 1);
        VoxroLens.Dashboard memory d = lens.dashboard();
        assertEq(d.pending, 1);
        string memory svg = lens.inboxSvg(inboxId);
        assertGt(bytes(svg).length, 500);
        assertTrue(bytes(lens.inboxSvgDataUri(inboxId)).length > 600);
    }

    // ─── fuzz: conservation of funds and queue bounds ────────────────────────────────────────
    function testFuzz_conservation(uint8 sends, uint8 replies, uint96 price) public {
        price = uint96(bound(price, 1e3, 1_000e6));
        sends = uint8(bound(sends, 1, 12));
        replies = uint8(bound(replies, 0, sends));
        uint256 t2 = voxr.mintTo(alice);
        inboxTokenId = t2;
        uint256 id = _register(alice, "fuzz", BALANCED, address(usdt), price, 2 hours, VoxroEscrow.VipKind.None, address(0));
        usdt.mint(bob, uint256(price) * 4 * sends); // worst case: every send at 4×
        uint256 bobStart = usdt.balanceOf(bob);
        uint256[] memory tids = new uint256[](sends);
        uint256 locked;
        for (uint256 i = 0; i < sends; i++) {
            uint256 b = usdt.balanceOf(bob);
            tids[i] = _guest(bob, id);
            locked += b - usdt.balanceOf(bob);
            assertLe(escrow.queueDepth(id), 7);
        }
        for (uint256 i = 0; i < replies; i++) {
            uint256 idx = _reply(tids[i], abi.encodePacked(i));
            vm.prank(carol);
            escrow.claimBounty(tids[i], idx, abi.encodePacked(i));
        }
        vm.warp(block.timestamp + 3 hours);
        for (uint256 i = replies; i < sends; i++) {
            vm.prank(bob);
            escrow.refundExpired(tids[i]);
        }
        escrow.withdrawProtocolFees(address(usdt));
        uint256 outflow = usdt.balanceOf(alice) + usdt.balanceOf(treasury) + (usdt.balanceOf(carol) - 10_000e6) + (usdt.balanceOf(bob) - (bobStart - locked));
        assertEq(outflow, locked, "every unit locked is paid out exactly once");
        assertEq(usdt.balanceOf(address(escrow)), 0);
        assertEq(escrow.queueDepth(id), 0);
    }
}
