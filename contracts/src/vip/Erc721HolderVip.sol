// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IVipSource} from "../interfaces/IVipSource.sol";

interface IERC721Balance {
    function balanceOf(address owner) external view returns (uint256);
}

/// @notice VIP source: holder of at least `minBalance` tokens of an ERC-721 collection.
/// Works for any TapeOut processor's Circuits contract (partner-circuit holders) and for the
/// ERC-8004 Identity Registry (registered agents), since both are ERC-721.
contract Erc721HolderVip is IVipSource {
    IERC721Balance public immutable collection;
    uint256 public immutable minBalance;

    constructor(address collection_, uint256 minBalance_) {
        require(collection_ != address(0), "collection");
        collection = IERC721Balance(collection_);
        minBalance = minBalance_ == 0 ? 1 : minBalance_;
    }

    function isVip(uint256, address sender) external view returns (bool) {
        try collection.balanceOf(sender) returns (uint256 b) {
            return b >= minBalance;
        } catch {
            return false;
        }
    }
}
