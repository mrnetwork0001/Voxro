// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice TapeOut processor factory on X Layer (0x1f09DAeFA827f02CBb40967cc91b259763760761).
interface IFactory {
    function isCPU(address cpu) external view returns (bool);
    function cpuCount() external view returns (uint256);
    function cpuAt(uint256 i) external view returns (address circuits);
    function deployFee() external view returns (uint256);
    function createCPU(string calldata name, string calldata symbol, string calldata story, uint256 transistorSupply, uint256 mintPrice)
        external
        payable
        returns (address transistors, address circuits);
}

/// @notice Circuits (ERC-721) contract of a processor. `step` evaluates one beat of a sequential circuit.
interface ICircuits {
    function circuitInfo(uint256 id) external view returns (uint32 nIn, uint32 nOut, uint32 nState, uint32 gateCount);
    function step(uint256 id, bytes calldata state, bytes calldata inputs) external view returns (bytes memory newState, bytes memory outputs);
    function eval(uint256 id, bytes calldata inputs) external view returns (bytes memory outputs);
    function tapeout(bytes calldata nl, uint32 nIn, uint32 nOut) external payable returns (uint256 id);
    function TAPEOUT_FEE() external view returns (uint256);
    function nextId() external view returns (uint256);
    function transistors() external view returns (address);
    function ownerOf(uint256 tokenId) external view returns (address);
    function balanceOf(address owner) external view returns (uint256);
}

interface ITransistors {
    function mint(uint256 id, uint256 amount) external payable;
    function mintPrice() external view returns (uint256);
    function protocolFee() external view returns (uint256);
}

/// @notice DeWebHub (TapeSend, TAP-10) on X Layer (0xe61A9C7213a6Aa616C246a2B569e555B417b25ee).
interface IDeWebHub {
    struct Entry {
        address from;
        uint56 blockNumber;
        uint40 timestamp;
        bytes32 digest; // keccak256(ref ‖ keccak256(payload))
    }

    struct KeyView {
        address container;
        bytes32 endpoint;
        bool opened;
        address current;
        uint8 suite;
        uint16 keyIndex;
        bytes32 key;
        bool usable;
        uint32 version;
        uint64 chains;
    }

    function send(address circuits, uint256 tokenId, bytes32 to, bytes32 ref, bytes calldata payload) external returns (uint256 inboxIndex);
    function inboxCount(bytes32 to) external view returns (uint256);
    function inboxAt(bytes32 to, uint256 i) external view returns (Entry memory);
    function endpointOf(address container) external view returns (bytes32);
    function accountOf(address circuits, uint256 tokenId) external view returns (address);
    function keyFor(address circuits, uint256 tokenId) external view returns (KeyView memory);
}
