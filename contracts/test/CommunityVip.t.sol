// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {TapeOutCommunityVip} from "../src/vip/TapeOutCommunityVip.sol";

contract MockBal {
    mapping(address => uint256) public balanceOf;

    function set(address a, uint256 v) external {
        balanceOf[a] = v;
    }
}

contract Reverter {
    function balanceOf(address) external pure returns (uint256) {
        revert("nope");
    }
}

interface IOwnerOf {
    function ownerOf(uint256) external view returns (address);
}

contract CommunityVipTest is Test {
    MockBal rigs;
    MockBal tc;
    MockBal bem;
    MockBal fab;
    TapeOutCommunityVip vip;
    address alice = address(0xA11CE);

    function setUp() public {
        rigs = new MockBal();
        tc = new MockBal();
        bem = new MockBal();
        fab = new MockBal();
        vip = new TapeOutCommunityVip(address(rigs), address(tc), address(bem), address(fab), 1e6, 1e8);
    }

    function test_nobody_is_vip_by_default() public view {
        assertFalse(vip.isVip(1, alice));
        assertEq(vip.eligibility(alice), 0);
    }

    function test_each_membership_alone_grants_vip() public {
        rigs.set(alice, 1);
        assertTrue(vip.isVip(1, alice));
        assertEq(vip.eligibility(alice), vip.FABX_RIG());
        rigs.set(alice, 0);

        tc.set(alice, 3);
        assertEq(vip.eligibility(alice), vip.TAPECODE_NFT());
        tc.set(alice, 0);

        bem.set(alice, 1e6);
        assertEq(vip.eligibility(alice), vip.BEM_HOLDER());
        bem.set(alice, 1e6 - 1);
        assertFalse(vip.isVip(1, alice));

        fab.set(alice, 1e8);
        assertEq(vip.eligibility(alice), vip.FAB_HOLDER());
    }

    function test_flags_combine() public {
        rigs.set(alice, 2);
        fab.set(alice, 5e8);
        assertEq(vip.eligibility(alice), vip.FABX_RIG() | vip.FAB_HOLDER());
    }

    function test_a_reverting_source_never_blocks() public {
        Reverter r = new Reverter();
        TapeOutCommunityVip v = new TapeOutCommunityVip(address(r), address(tc), address(r), address(fab), 1, 1);
        assertFalse(v.isVip(1, alice));
        tc.set(alice, 1);
        assertTrue(v.isVip(1, alice));
    }

    function test_constructor_rejects_zero_and_zero_thresholds() public {
        vm.expectRevert(bytes("zero"));
        new TapeOutCommunityVip(address(0), address(tc), address(bem), address(fab), 1, 1);
        vm.expectRevert(bytes("threshold"));
        new TapeOutCommunityVip(address(rigs), address(tc), address(bem), address(fab), 0, 1);
    }

    /// Real holders on X Layer mainnet (runs only with XLAYER_RPC set).
    function test_fork_real_fabx_and_tapecode_holders() public {
        string memory rpc = vm.envOr("XLAYER_RPC", string(""));
        if (bytes(rpc).length == 0) return;
        vm.createSelectFork(rpc);
        address FAB_GENISIS = 0x87BFCa3494Aa228fF589ab9B642143A5e8c8F9a6;
        address TAPECODE = 0x0e91460D6823C711643e650A9a4C0cc21DE41614;
        TapeOutCommunityVip real = new TapeOutCommunityVip(
            FAB_GENISIS, TAPECODE, 0x60e62Efa9405d6873C5deaBD4E6CC91c25363952, 0x72F349B1Eee7833B26f8C81a8410775A4e231ed2, 1e6, 1e8
        );
        address rigOwner = IOwnerOf(FAB_GENISIS).ownerOf(1);
        address tcOwner = IOwnerOf(TAPECODE).ownerOf(1);
        assertTrue(real.isVip(1, rigOwner), "FabX rig owner must be VIP");
        assertTrue(real.eligibility(rigOwner) & real.FABX_RIG() != 0);
        assertTrue(real.isVip(1, tcOwner), "TapeCode-Test1 owner must be VIP");
        assertTrue(real.eligibility(tcOwner) & real.TAPECODE_NFT() != 0);
        assertFalse(real.isVip(1, address(0xDEAD0000)), "random address must not be VIP");
    }
}
