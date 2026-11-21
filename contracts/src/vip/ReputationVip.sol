// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IVipSource} from "../interfaces/IVipSource.sol";

interface IScoreOracle {
    /// @dev Generic "score of an address" view; ERC-8004 reputation registries and similar expose one.
    function scoreOf(address subject) external view returns (uint256);
}

/// @notice VIP source: identity holder (ERC-721 registry) whose score on a reputation view is >= threshold.
/// Intended for ERC-8004: identity = IdentityRegistry (ERC-721), score = a reputation aggregator.
contract ReputationVip is IVipSource {
    address public immutable identity;
    address public immutable scores;
    uint256 public immutable threshold;

    constructor(address identity_, address scores_, uint256 threshold_) {
        identity = identity_;
        scores = scores_;
        threshold = threshold_;
    }

    function isVip(uint256, address sender) external view returns (bool) {
        if (identity != address(0)) {
            (bool ok, bytes memory data) = identity.staticcall(abi.encodeWithSignature("balanceOf(address)", sender));
            if (!ok || data.length < 32 || abi.decode(data, (uint256)) == 0) return false;
        }
        if (scores == address(0)) return true;
        try IScoreOracle(scores).scoreOf(sender) returns (uint256 s) {
            return s >= threshold;
        } catch {
            return false;
        }
    }
}
