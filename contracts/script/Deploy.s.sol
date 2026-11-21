// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {VoxroEscrow} from "../src/VoxroEscrow.sol";
import {VoxroLens} from "../src/VoxroLens.sol";
import {ICircuits, IFactory, ITransistors} from "../src/interfaces/ITapeOut.sol";
import {CatalogLib} from "./CatalogLib.sol";

interface IDeWebHubKeys {
    function publishKey(address circuits, uint256 tokenId, uint8 suite, uint16 keyIndex, bytes32 key, uint64 chains) external;
}

interface IOpener {
    function FEE() external view returns (uint256);
    function open(address circuits, uint256 tokenId) external payable;
}

/// @notice One-shot X Layer launch. Signer comes from `--account <keystore>` or `--private-key`; never from a file.
///   Env: VOXRO_TREASURY (defaults to the broadcaster), VOXRO_NAND (2000), VOXRO_LATCH (200), VOXRO_OPEN_CONTAINER (1 = open #1 for DeWEB/TapeSend).
///   Dry run: forge script script/Deploy.s.sol --fork-url $XLAYER_RPC --sender <addr> -vvvv
///   Live:    forge script script/Deploy.s.sol --rpc-url $XLAYER_RPC --account voxro --broadcast --verify --verifier sourcify
contract Deploy is Script {
    IFactory constant FACTORY = IFactory(0x1f09DAeFA827f02CBb40967cc91b259763760761);
    address constant HUB = 0xe61A9C7213a6Aa616C246a2B569e555B417b25ee;
    IOpener constant OPENER = IOpener(0x536adD8F30f03b69f6fbF29d425A816A0dC50106);
    /// DeWebHub pins the Circuits proxy codehash of processors created before Factory index 387, so TapeSend
    /// containers must live on one of those. Default: #212 (free transistors). Override with VOXRO_MAILBOX_CPU.
    address constant DEFAULT_MAILBOX_CPU = 0xAa13ae45b0B2D52f210Ad7Ef12997113a0ebAF21;
    bytes constant BUFFER_NETLIST = hex"0000000200000200000003000003";

    function run() external {
        require(block.chainid == 196, "X Layer only");
        address broadcaster = msg.sender;
        address treasury = vm.envOr("VOXRO_TREASURY", broadcaster);
        uint256 nandHeadroom = vm.envOr("VOXRO_NAND", uint256(2000));
        uint256 latchHeadroom = vm.envOr("VOXRO_LATCH", uint256(200));
        bool openContainer = vm.envOr("VOXRO_OPEN_CONTAINER", uint256(1)) == 1;
        address mailboxCpu = vm.envOr("VOXRO_MAILBOX_CPU", DEFAULT_MAILBOX_CPU);
        // flagship inbox: VOXRO_HANDLE (default "voxro"), VOXRO_TOKEN (default USD₮0), VOXRO_BASE_PRICE (default 10 USD₮0), VOXRO_SLA (48 h)
        bytes32 handle = bytes32(bytes(vm.envOr("VOXRO_HANDLE", string("voxro"))));
        address token = vm.envOr("VOXRO_TOKEN", address(0x779Ded0c9e1022225f8E0630b35a9b54bE713736));
        uint96 basePrice = uint96(vm.envOr("VOXRO_BASE_PRICE", uint256(10_000_000)));
        uint32 sla = uint32(vm.envOr("VOXRO_SLA", uint256(48 hours)));
        bytes32 mailboxKey = vm.envOr("VOXRO_MAILBOX_KEY", bytes32(0)); // X25519 pubkey derived in the app; publishKey needs an EOA

        vm.startBroadcast();
        uint256 deployFee = FACTORY.deployFee();
        (address transistors, address circuits) =
            FACTORY.createCPU{value: deployFee}("Voxro", "VOXR", "Attention escrow and hardware surge pricing for priority inboxes on X Layer. Every inbox is a provable 3-LATCH circuit; replies settle over TapeSend with zero oracle.", 1_000_000, 1e13);
        console2.log("VOXR circuits   ", circuits);
        console2.log("VOXR transistors", transistors);

        CatalogLib.Circuit[] memory cat = CatalogLib.load(vm, circuits);
        (uint256 nand, uint256 latch) = CatalogLib.burn(cat);
        ITransistors t = ITransistors(transistors);
        uint256 mintPrice = t.mintPrice();
        uint256 pf = t.protocolFee();
        t.mint{value: (nand + nandHeadroom) * mintPrice + pf}(0, nand + nandHeadroom);
        t.mint{value: (latch + latchHeadroom) * mintPrice + pf}(1, latch + latchHeadroom);

        uint256 fee = ICircuits(circuits).TAPEOUT_FEE();
        for (uint256 i = 0; i < cat.length; i++) {
            uint256 id = ICircuits(circuits).tapeout{value: fee}(cat[i].netlist, cat[i].nIn, cat[i].nOut);
            require(id == cat[i].id, "catalog id drift");
            console2.log(string.concat("taped out #", vm.toString(id), " ", cat[i].name));
        }

        VoxroEscrow escrow = new VoxroEscrow(address(FACTORY), HUB, treasury);
        VoxroLens lens = new VoxroLens(address(escrow));
        console2.log("VoxroEscrow     ", address(escrow));
        console2.log("VoxroLens       ", address(lens));

        uint256 mailbox;
        if (openContainer) {
            // flagship mailbox: a 2-NAND buffer on a hub-compatible processor, opened for TapeSend + DeWEB
            ITransistors mt = ITransistors(ICircuits(mailboxCpu).transistors());
            mt.mint{value: 2 * mt.mintPrice() + mt.protocolFee()}(0, 2);
            mailbox = ICircuits(mailboxCpu).tapeout{value: ICircuits(mailboxCpu).TAPEOUT_FEE()}(BUFFER_NETLIST, 1, 1);
            OPENER.open{value: OPENER.FEE()}(mailboxCpu, mailbox);
            console2.log("mailbox circuit", mailboxCpu, mailbox);
            if (mailboxKey != bytes32(0)) IDeWebHubKeys(HUB).publishKey(mailboxCpu, mailbox, 1, 0, mailboxKey, 0x4);
            VoxroEscrow.Member[] memory none;
            uint256 inboxId = escrow.registerInbox(VoxroEscrow.RegisterParams(handle, circuits, 4, mailboxCpu, uint64(mailbox), none, VoxroEscrow.VipKind.None, address(0), token, basePrice, sla, 1));
            console2.log("flagship inbox", inboxId);
        }
        vm.stopBroadcast();

        string memory out = string.concat(
            '{"chainId":196,"voxrCircuits":"', vm.toString(circuits), '","voxrTransistors":"', vm.toString(transistors), '","escrow":"', vm.toString(address(escrow)), '","lens":"', vm.toString(address(lens)), '","treasury":"', vm.toString(treasury), '","mailboxCpu":"', vm.toString(mailboxCpu), '","mailboxId":', vm.toString(mailbox), ',"block":', vm.toString(block.number), "}"
        );
        vm.writeFile(string.concat(vm.projectRoot(), "/deployments/xlayer.json"), out);
        console2.log(out);
    }
}
