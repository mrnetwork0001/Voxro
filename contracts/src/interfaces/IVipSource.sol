// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Pluggable source for the controller's `holdsPartner` input bit (in[5]).
/// Any contract can implement it: partner-processor holders, ERC-8004 agent identities with a
/// reputation threshold, DAO membership, … The escrow calls it through `staticcall` with try/catch,
/// so a failing source simply yields `false`.
interface IVipSource {
    function isVip(uint256 inboxId, address sender) external view returns (bool);
}
