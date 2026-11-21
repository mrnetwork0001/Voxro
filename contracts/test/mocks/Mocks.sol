// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IDeWebHub} from "../../src/interfaces/ITapeOut.sol";

/// @dev Solidity model of the InboxController (same maths as the SDK reference model) + ERC-721 ownership.
contract MockProcessor {
    mapping(uint256 => address) public owners;
    mapping(address => uint256) public balances;
    mapping(uint256 => bool) public isPreset; // presets ignore p0/p1 and use `presetCurve`
    mapping(uint256 => uint8) public presetCurve;
    uint256 public nextId;

    function mintTo(address to) external returns (uint256 id) {
        id = ++nextId;
        owners[id] = to;
        balances[to] += 1;
    }

    function setPreset(uint256 id, uint8 curve) external {
        isPreset[id] = true;
        presetCurve[id] = curve;
    }

    function transfer(uint256 id, address to) external {
        balances[owners[id]] -= 1;
        owners[id] = to;
        balances[to] += 1;
    }

    function ownerOf(uint256 id) external view returns (address) {
        return owners[id];
    }

    function balanceOf(address o) external view returns (uint256) {
        return balances[o];
    }

    function circuitInfo(uint256) external pure returns (uint32, uint32, uint32, uint32) {
        return (6, 7, 3, 136);
    }

    function table(uint8 curve, uint8 q) internal pure returns (uint8) {
        if (curve == 0) return [0, 0, 0, 0, 1, 1, 2, 3][q];
        if (curve == 1) return [0, 0, 1, 1, 2, 2, 3, 3][q];
        if (curve == 2) return [0, 1, 1, 2, 2, 3, 3, 3][q];
        return [0, 1, 2, 2, 3, 3, 3, 3][q];
    }

    function step(uint256 id, bytes calldata state, bytes calldata inputs) external view returns (bytes memory, bytes memory) {
        uint8 q = uint8(state[0]) & 7;
        uint8 inp = uint8(inputs[0]);
        bool active = inp & 1 != 0;
        bool dir = inp & 2 != 0;
        uint8 curve = isPreset[id] ? presetCurve[id] : ((inp >> 2) & 3);
        bool allow = inp & 16 != 0;
        bool partner = inp & 32 != 0;
        if (active) q = dir ? (q == 7 ? 7 : q + 1) : (q == 0 ? 0 : q - 1);
        uint8 tier = table(curve, q);
        bool pause = curve == 3 && q == 7;
        uint8 eff = allow ? 0 : partner ? (tier == 0 ? 0 : tier - 1) : tier;
        bool canSend = !pause || allow || partner;
        uint8 o = eff | (partner ? 4 : 0) | (canSend ? 8 : 0) | (q << 4);
        return (abi.encodePacked(bytes1(q)), abi.encodePacked(bytes1(o)));
    }

    function eval(uint256, bytes calldata) external pure returns (bytes memory) {
        revert("has latch: use step");
    }
}

contract MockFactory {
    mapping(address => bool) public isCPU;

    function add(address cpu) external {
        isCPU[cpu] = true;
    }
}

contract MockHub is IDeWebHub {
    mapping(bytes32 => Entry[]) internal inboxes;
    mapping(address => mapping(uint256 => address)) public holderOf; // circuits => tokenId => container owner (for send auth)

    function accountOf(address circuits, uint256 tokenId) public pure returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked("container", circuits, tokenId)))));
    }

    function endpointOf(address container) public view returns (bytes32) {
        return bytes32((block.chainid << 160) | uint256(uint160(container)));
    }

    /// @dev Test hub: `send` from the container of (circuits, tokenId); no holder check (tests prank as needed).
    function send(address circuits, uint256 tokenId, bytes32 to, bytes32 ref, bytes calldata payload) external returns (uint256 inboxIndex) {
        address from = accountOf(circuits, tokenId);
        inboxes[to].push(Entry(from, uint56(block.number), uint40(block.timestamp), keccak256(abi.encodePacked(ref, keccak256(payload)))));
        return inboxes[to].length - 1;
    }

    function inboxCount(bytes32 to) external view returns (uint256) {
        return inboxes[to].length;
    }

    function inboxAt(bytes32 to, uint256 i) external view returns (Entry memory) {
        if (i >= inboxes[to].length) return Entry(address(0), 0, 0, bytes32(0));
        return inboxes[to][i];
    }

    function keyFor(address circuits, uint256 tokenId) external pure returns (KeyView memory v) {
        v.container = accountOf(circuits, tokenId);
        v.usable = true;
        v.suite = 1;
    }
}

contract MockUSDT is ERC20 {
    constructor() ERC20("USD T0", "USDT0") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
