// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {VoxroEscrow} from "../src/VoxroEscrow.sol";
import {VoxroLens} from "../src/VoxroLens.sol";
import {ICircuits, IDeWebHub, IFactory, ITransistors} from "../src/interfaces/ITapeOut.sol";
import {CatalogLib} from "../script/CatalogLib.sol";

interface IOpener {
    function FEE() external view returns (uint256);
    function open(address circuits, uint256 tokenId) external payable;
}

/// @notice Full rehearsal on an X Layer fork: real Factory, real circuit implementation, real DeWebHub, real Opener.
///         forge test --match-path test/Fork.t.sol --fork-url $XLAYER_RPC --fork-block-number <n> -vv
contract ForkTest is Test {
    IFactory constant FACTORY = IFactory(0x1f09DAeFA827f02CBb40967cc91b259763760761);
    IDeWebHub constant HUB = IDeWebHub(0xe61A9C7213a6Aa616C246a2B569e555B417b25ee);
    IOpener constant OPENER = IOpener(0x536adD8F30f03b69f6fbF29d425A816A0dC50106);
    /// Processor #212 (LoteGate): created before the Factory proxy change, so DeWebHub accepts its circuits; free transistors.
    address constant MAILBOX_CPU = 0xAa13ae45b0B2D52f210Ad7Ef12997113a0ebAF21;
    bytes constant BUFFER_NETLIST = hex"0000000200000200000003000003"; // s3 = NAND(in0,in0); s4 = NAND(s3,s3)

    address deployer = address(0x1111111111111111111111111111111111111111);
    address bob = address(0xb0B0000000000000000000000000000000000B0B);
    address carol = address(0xCA201000000000000000000000000000000CA201);
    address treasury = address(0x7eA5000000000000000000000000000000007eA5);

    function test_fullRehearsal() public {
        if (block.chainid != 196) {
            console2.log("skipped: not an X Layer fork");
            return;
        }
        vm.deal(deployer, 10 ether);
        vm.deal(bob, 10 ether);
        vm.deal(carol, 1 ether);

        // 1. processor + transistors
        vm.startPrank(deployer);
        (address transistors, address circuits) = FACTORY.createCPU{value: FACTORY.deployFee()}("Voxro", "VOXR", "Attention escrow priced by circuits.", 1_000_000, 1e13);
        CatalogLib.Circuit[] memory cat = CatalogLib.load(vm, circuits);
        (uint256 nand, uint256 latch) = CatalogLib.burn(cat);
        ITransistors t = ITransistors(transistors);
        t.mint{value: nand * t.mintPrice() + t.protocolFee()}(0, nand);
        t.mint{value: latch * t.mintPrice() + t.protocolFee()}(1, latch);
        // 2. tape out the catalog in order
        uint256 fee = ICircuits(circuits).TAPEOUT_FEE();
        for (uint256 i = 0; i < cat.length; i++) {
            uint256 id = ICircuits(circuits).tapeout{value: fee}(cat[i].netlist, cat[i].nIn, cat[i].nOut);
            assertEq(id, cat[i].id, "catalog id");
        }
        (uint32 nIn, uint32 nOut, uint32 nState, uint32 gates) = ICircuits(circuits).circuitInfo(4);
        assertEq(nIn, 6);
        assertEq(nOut, 7);
        assertEq(nState, 3);
        assertEq(gates, 136);
        // 3. mailbox circuit on a hub-compatible processor (new processors fail DeWebHub's codehash pin)
        ITransistors mt = ITransistors(ICircuits(MAILBOX_CPU).transistors());
        mt.mint{value: 2 * mt.mintPrice() + mt.protocolFee()}(0, 2);
        uint256 mailbox = ICircuits(MAILBOX_CPU).tapeout{value: ICircuits(MAILBOX_CPU).TAPEOUT_FEE()}(BUFFER_NETLIST, 1, 1);
        assertEq(ICircuits(MAILBOX_CPU).ownerOf(mailbox), deployer);
        OPENER.open{value: OPENER.FEE()}(MAILBOX_CPU, mailbox);
        assertTrue(HUB.keyFor(MAILBOX_CPU, mailbox).opened, "mailbox container opened");
        // 4. escrow + lens; policy = VOXR #4 FounderBalanced, inbox/container = the mailbox circuit
        VoxroEscrow escrow = new VoxroEscrow(address(FACTORY), address(HUB), treasury);
        VoxroLens lens = new VoxroLens(address(escrow));
        VoxroEscrow.Member[] memory none;
        uint256 inboxId = escrow.registerInbox(VoxroEscrow.RegisterParams("mrnetwork", circuits, 4, MAILBOX_CPU, uint64(mailbox), none, VoxroEscrow.VipKind.None, address(0), address(0), 1e16, 48 hours, 1));
        vm.stopPrank();

        // 5. five cold senders: 0.010 → 0.015 → 0.015 → 0.025 → 0.025 OKB from the real circuit
        uint256[5] memory want = [uint256(1e16), 1.5e16, 1.5e16, 2.5e16, 2.5e16];
        uint256[] memory tids = new uint256[](5);
        bytes memory env = new bytes(120);
        env[0] = 0x54;
        env[1] = 0x53;
        env[2] = 0x02;
        env[3] = 0x01;
        for (uint256 i = 0; i < 5; i++) {
            VoxroEscrow.Quote memory q = escrow.quoteSend(inboxId, bob);
            assertEq(q.price, want[i], "live quote from step()");
            vm.prank(bob);
            tids[i] = escrow.sendGuestPriority{value: q.price}(inboxId, bytes32(uint256(1)), env);
        }
        assertEq(escrow.queueDepth(inboxId), 5);
        assertEq(escrow.payloadOf(tids[0]).length, 120);

        // 6. recipient replies through the real DeWebHub, keeper claims with the reply bytes
        VoxroEscrow.Ticket memory tk = escrow.getTicket(tids[0]);
        bytes memory reply = hex"54530201aabbcc";
        vm.prank(deployer);
        uint256 idx = HUB.send(MAILBOX_CPU, mailbox, tk.replyTargetEndpoint, tk.expectedReplyRef, reply);
        IDeWebHub.Entry memory e = HUB.inboxAt(tk.replyTargetEndpoint, idx);
        assertEq(e.from, HUB.accountOf(MAILBOX_CPU, mailbox));
        assertEq(e.digest, keccak256(abi.encodePacked(tk.expectedReplyRef, keccak256(reply))));
        uint256 before = deployer.balance;
        vm.prank(carol);
        escrow.claimBounty(tids[0], idx, reply);
        assertEq(deployer.balance - before, 0.95e16, "95% to the inbox owner");
        assertEq(carol.balance, 1 ether + 0.001e16, "keeper tip 0.1%");
        assertEq(escrow.queueDepth(inboxId), 4);
        assertEq(escrow.replyPayloadOf(tids[0]), reply);
        VoxroLens.Receipt memory r = lens.receipt(tids[0]);
        assertTrue(r.settled && r.checks[0].ok && r.checks[1].ok);
        console2.log("rehearsal ok: circuits", circuits, "escrow", address(escrow));
        console2.log("inbox svg bytes", bytes(lens.inboxSvg(inboxId)).length);
    }
}
