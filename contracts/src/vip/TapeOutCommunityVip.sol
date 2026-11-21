// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IVipSource} from "../interfaces/IVipSource.sol";

interface IBalanceOf {
    function balanceOf(address owner) external view returns (uint256);
}

/// @title TapeOut Community VIP
/// @notice VIP source for VoxroEscrow (VipKind.Adapter): a sender is VIP when they hold any of
///         - a FabX mining rig (an ERC-721 circuit of the FAB-Genisis processor),
///         - a TapeCode-Test1 NFT,
///         - at least `minBem` BEM on X Layer,
///         - at least `minFab` FAB.
///         Ownerless and immutable: no admin, no upgrade, no state. A token that reverts or is
///         missing simply does not count, so one broken source can never block a quote.
contract TapeOutCommunityVip is IVipSource {
    IBalanceOf public immutable fabRigs;
    IBalanceOf public immutable tapeCodeTest1;
    IBalanceOf public immutable bem;
    IBalanceOf public immutable fab;
    uint256 public immutable minBem;
    uint256 public immutable minFab;

    /// Bit flags returned by `eligibility`.
    uint8 public constant FABX_RIG = 1;
    uint8 public constant TAPECODE_NFT = 2;
    uint8 public constant BEM_HOLDER = 4;
    uint8 public constant FAB_HOLDER = 8;

    constructor(address fabRigs_, address tapeCodeTest1_, address bem_, address fab_, uint256 minBem_, uint256 minFab_) {
        require(fabRigs_ != address(0) && tapeCodeTest1_ != address(0) && bem_ != address(0) && fab_ != address(0), "zero");
        require(minBem_ > 0 && minFab_ > 0, "threshold");
        fabRigs = IBalanceOf(fabRigs_);
        tapeCodeTest1 = IBalanceOf(tapeCodeTest1_);
        bem = IBalanceOf(bem_);
        fab = IBalanceOf(fab_);
        minBem = minBem_;
        minFab = minFab_;
    }

    function isVip(uint256, address sender) external view returns (bool) {
        return eligibility(sender) != 0;
    }

    /// @notice Which memberships `who` holds, as FABX_RIG | TAPECODE_NFT | BEM_HOLDER | FAB_HOLDER.
    function eligibility(address who) public view returns (uint8 flags) {
        if (_bal(fabRigs, who) >= 1) flags |= FABX_RIG;
        if (_bal(tapeCodeTest1, who) >= 1) flags |= TAPECODE_NFT;
        if (_bal(bem, who) >= minBem) flags |= BEM_HOLDER;
        if (_bal(fab, who) >= minFab) flags |= FAB_HOLDER;
    }

    function _bal(IBalanceOf t, address who) private view returns (uint256) {
        try t.balanceOf(who) returns (uint256 b) {
            return b;
        } catch {
            return 0;
        }
    }
}
