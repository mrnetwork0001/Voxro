// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {TapeOutCommunityVip} from "../src/vip/TapeOutCommunityVip.sol";

/// Deploys the ownerless TapeOut Community VIP source (FabX rigs, TapeCode-Test1, BEM, FAB holders)
/// and records it as `communityVip` in deployments/xlayer.json. Gas only.
///   forge script script/DeployCommunityVip.s.sol --rpc-url https://rpc.xlayer.tech --account voxro --sender <addr> --broadcast
contract DeployCommunityVip is Script {
    address constant FAB_GENISIS = 0x87BFCa3494Aa228fF589ab9B642143A5e8c8F9a6; // FabX mining rigs (ERC-721 circuits)
    address constant TAPECODE_TEST1 = 0x0e91460D6823C711643e650A9a4C0cc21DE41614; // TapeCode-Test1 NFT
    address constant BEM = 0x60e62Efa9405d6873C5deaBD4E6CC91c25363952; // BEM on X Layer, 8 decimals
    address constant FAB = 0x72F349B1Eee7833B26f8C81a8410775A4e231ed2; // FAB, 8 decimals

    function run() external {
        require(block.chainid == 196, "X Layer only");
        uint256 minBem = vm.envOr("VOXRO_VIP_MIN_BEM", uint256(1_000_000)); // 0.01 BEM
        uint256 minFab = vm.envOr("VOXRO_VIP_MIN_FAB", uint256(100_000_000)); // 1 FAB
        vm.startBroadcast();
        TapeOutCommunityVip vip = new TapeOutCommunityVip(FAB_GENISIS, TAPECODE_TEST1, BEM, FAB, minBem, minFab);
        vm.stopBroadcast();
        console2.log("TapeOutCommunityVip", address(vip));
        string memory path = string.concat(vm.projectRoot(), "/deployments/xlayer.json");
        if (vm.exists(path)) vm.writeJson(vm.toString(address(vip)), path, ".communityVip");
    }
}
