// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Vm} from "forge-std/Vm.sol";

/// @dev Fetches 8-decimal USD raw prices: `vm.ffi` runs Node (writes `cache/yf-seed-price.txt`), then `vm.readFile`.
library YahooFinanceSeed {
    error YahooFinanceSeedFailed(string hint);

    /// @notice 8-decimal USD integer (same units as `OracleAdapter.submitPrices` for `decimals=8`).
    /// @dev If env `SEED_PRICE_RAW` is set, returns that uint and skips FFI (offline / CI fallback).
    function rawUsdPrice8(Vm vm, string memory symbol) internal returns (uint256) {
        if (vm.envExists("SEED_PRICE_RAW")) {
            return vm.envUint("SEED_PRICE_RAW");
        }
        if (bytes(symbol).length == 0) revert YahooFinanceSeedFailed("empty symbol");

        string memory root = vm.projectRoot();
        string[] memory cmd = new string[](3);
        cmd[0] = "node";
        cmd[1] = string.concat(root, "/scripts/fetch-yf-asset-price.js");
        cmd[2] = symbol;

        vm.ffi(cmd);

        // Relative to project root (same as `vm.projectRoot()`).
        string memory content = vm.readFile("cache/yf-seed-price.txt");
        bytes memory b = bytes(content);
        b = _trimLeadingAsciiWs(_trimTrailingAsciiWs(b));
        if (b.length == 0) revert YahooFinanceSeedFailed("empty seed file");

        uint256 p = vm.parseUint(string(b));
        if (p == 0) revert YahooFinanceSeedFailed("parsed price is zero");
        return p;
    }

    function _trimTrailingAsciiWs(bytes memory b) private pure returns (bytes memory) {
        uint256 end = b.length;
        while (end > 0) {
            bytes1 c = b[end - 1];
            if (c != bytes1(0x0a) && c != bytes1(0x0d) && c != bytes1(0x20) && c != bytes1(0x09)) {
                break;
            }
            unchecked {
                end--;
            }
        }
        if (end == b.length) return b;
        bytes memory t = new bytes(end);
        for (uint256 i; i < end; ++i) {
            t[i] = b[i];
        }
        return t;
    }

    function _trimLeadingAsciiWs(bytes memory b) private pure returns (bytes memory) {
        uint256 start;
        uint256 len = b.length;
        while (start < len) {
            bytes1 c = b[start];
            if (c != bytes1(0x0a) && c != bytes1(0x0d) && c != bytes1(0x20) && c != bytes1(0x09)) {
                break;
            }
            unchecked {
                start++;
            }
        }
        if (start == 0) return b;
        bytes memory t = new bytes(len - start);
        for (uint256 i; i < t.length; ++i) {
            t[i] = b[start + i];
        }
        return t;
    }
}
