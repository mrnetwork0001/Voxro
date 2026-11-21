// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Vm} from "forge-std/Vm.sol";
import {stdJson} from "forge-std/StdJson.sol";

/// @notice Loads test/fixtures/catalog.json (exported by sdk/scripts/export-catalog.mts) and rewrites the
///         REF sentinel processor address (0xc0de…c0de) to the real VOXR Circuits address.
library CatalogLib {
    using stdJson for string;

    address constant SENTINEL = 0xC0Dec0dec0DeC0Dec0dEc0DEC0DEC0DEC0DEC0dE;

    struct Circuit {
        uint256 id;
        string name;
        uint32 nIn;
        uint32 nOut;
        uint256 nand;
        uint256 latch;
        bytes netlist;
    }

    function load(Vm vm, address realCpu) internal view returns (Circuit[] memory out) {
        string memory json = vm.readFile(string.concat(vm.projectRoot(), "/test/fixtures/catalog.json"));
        uint256 n = 8;
        out = new Circuit[](n);
        for (uint256 i = 0; i < n; i++) {
            string memory k = string.concat(".circuits[", vm.toString(i), "]");
            out[i].id = json.readUint(string.concat(k, ".id"));
            out[i].name = json.readString(string.concat(k, ".name"));
            out[i].nIn = uint32(json.readUint(string.concat(k, ".nIn")));
            out[i].nOut = uint32(json.readUint(string.concat(k, ".nOut")));
            out[i].nand = json.readUint(string.concat(k, ".burn.nand"));
            out[i].latch = json.readUint(string.concat(k, ".burn.latch"));
            out[i].netlist = patch(json.readBytes(string.concat(k, ".hex")), realCpu);
        }
    }

    function burn(Circuit[] memory cat) internal pure returns (uint256 nand, uint256 latch) {
        for (uint256 i = 0; i < cat.length; i++) {
            nand += cat[i].nand;
            latch += cat[i].latch;
        }
    }

    /// @dev Walk the TAP-02 records; for every REF (0x02) rewrite the 20-byte cpu field if it is the sentinel.
    function patch(bytes memory nl, address realCpu) internal pure returns (bytes memory) {
        uint256 p = 0;
        while (p < nl.length) {
            uint8 op = uint8(nl[p]);
            if (op == 0x00) {
                p += 7;
            } else if (op == 0x01) {
                p += 4;
            } else if (op == 0x02) {
                address cpu;
                assembly {
                    cpu := shr(96, mload(add(add(nl, 0x20), add(p, 1))))
                }
                if (cpu == SENTINEL) {
                    bytes20 real = bytes20(realCpu);
                    for (uint256 i = 0; i < 20; i++) nl[p + 1 + i] = real[i];
                }
                uint8 nIns = uint8(nl[p + 29]);
                p += 31 + 3 * uint256(nIns);
            } else {
                revert("bad opcode");
            }
        }
        return nl;
    }
}
