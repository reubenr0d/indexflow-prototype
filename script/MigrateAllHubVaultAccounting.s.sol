// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {VaultAccounting} from "../src/perp/VaultAccounting.sol";
import {BasketVault} from "../src/vault/BasketVault.sol";
import {BasketFactory} from "../src/vault/BasketFactory.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Batch-migrate every basket from `BasketFactory.getAllBaskets()` to a new
/// `VaultAccounting` (basket-owner perp auth). Preserves each `BasketVault` address.
///
/// Per basket: close open legs on the basket's current VA → withdraw all capital →
/// register on NEW_VA → `setVaultAccounting(NEW_VA)` when the broadcaster owns the basket.
///
/// Required env:
///   PRIVATE_KEY      - must own OLD_VA (close/withdraw/register) and ideally each basket
///   FACTORY          - BasketFactory address
///   USDC             - USDC token
///   ASSET_IDS        - comma-separated bytes32 ids (union of assets to probe for open legs)
///   INDEX_TOKENS     - comma-separated GMX index tokens (1:1 with ASSET_IDS)
///
/// Optional env:
///   NEW_VA           - pre-deployed VaultAccounting; if unset, deploys one
///   OLD_VA           - if set, used as the VA to close/withdraw from; otherwise each basket's wired VA
///   GMX_VAULT        - required when NEW_VA unset
///   ORACLE_ADAPTER   - required when NEW_VA unset
///   SKIP_CLOSE       - "true" skips position closes
///   SKIP_WITHDRAW    - "true" skips capital withdrawal
///   SKIP_FACTORY     - "true" skips BasketFactory.setVaultAccounting + wirer grant
///
/// Usage:
///   PATH="/Users/reuben/.foundry/bin:$PATH" \
///   FACTORY=0x... USDC=0x... ASSET_IDS=0x...,0x... INDEX_TOKENS=0x...,0x... \
///   forge script script/MigrateAllHubVaultAccounting.s.sol:MigrateAllHubVaultAccounting \
///     --root /Users/reuben/Desktop/minestarters/code/snx-prototype \
///     --rpc-url $RPC_URL --broadcast -vvv
contract MigrateAllHubVaultAccounting is Script {
    function run() external {
        address factory = vm.envAddress("FACTORY");
        address usdc = vm.envAddress("USDC");

        bytes32[] memory assetIds = _parseBytes32List(vm.envString("ASSET_IDS"));
        address[] memory indexTokens = _parseAddressList(vm.envString("INDEX_TOKENS"));
        require(assetIds.length == indexTokens.length, "ASSET_IDS and INDEX_TOKENS length mismatch");

        bool skipClose = _envFlag("SKIP_CLOSE");
        bool skipWithdraw = _envFlag("SKIP_WITHDRAW");
        bool skipFactory = _envFlag("SKIP_FACTORY");
        bool useFixedOldVa = vm.envExists("OLD_VA");

        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        address newVa = _deployOrLoadNewVa(usdc, deployer);

        for (uint256 i = 0; i < assetIds.length; i++) {
            if (VaultAccounting(newVa).assetTokens(assetIds[i]) == address(0)) {
                VaultAccounting(newVa).mapAssetToken(assetIds[i], indexTokens[i]);
                console2.log("Mapped asset on NEW_VA");
                console2.logBytes32(assetIds[i]);
            }
        }

        if (!skipFactory) {
            BasketFactory(factory).setVaultAccounting(newVa);
            console2.log("BasketFactory.setVaultAccounting(NEW_VA)");

            if (!VaultAccounting(newVa).wirers(factory)) {
                VaultAccounting(newVa).setWirer(factory, true);
                console2.log("VaultAccounting.setWirer(factory, true)");
            }
        }

        address[] memory baskets = BasketFactory(factory).getAllBaskets();
        console2.log("Migrating basket count:", baskets.length);

        for (uint256 b = 0; b < baskets.length; b++) {
            address basket = baskets[b];
            address oldVa = useFixedOldVa ? vm.envAddress("OLD_VA") : address(BasketVault(basket).vaultAccounting());

            console2.log("--- Basket ---");
            console2.log(basket);
            console2.log("OLD_VA:", oldVa);

            if (oldVa == address(0)) {
                console2.log("SKIP: no vaultAccounting wired");
                continue;
            }

            if (oldVa == newVa) {
                console2.log("SKIP: already on NEW_VA");
                continue;
            }

            VaultAccounting oldAccounting = VaultAccounting(oldVa);

            if (!skipClose) {
                _closeAllPositions(oldAccounting, basket, assetIds);
            }

            if (!skipWithdraw) {
                uint256 available = _availableCapital(oldVa, basket);
                if (available > 0) {
                    console2.log("Withdrawing from OLD_VA:", available);
                    oldAccounting.withdrawCapital(basket, available);
                }
            }

            if (!VaultAccounting(newVa).isVaultRegistered(basket)) {
                VaultAccounting(newVa).registerVault(basket);
                console2.log("Registered on NEW_VA");
            }

            address basketOwner = Ownable(basket).owner();
            if (basketOwner == deployer) {
                BasketVault(basket).setVaultAccounting(newVa);
                console2.log("setVaultAccounting(NEW_VA) done");
            } else {
                console2.log("WARN: deployer is not basket owner - call setVaultAccounting manually");
                console2.log("  basket owner:", basketOwner);
            }

            console2.log("Post-migration NAV:", BasketVault(basket).getPricingNav());
        }

        vm.stopBroadcast();

        console2.log("NEW_VA:", newVa);
        console2.log("Update deployment JSON vaultAccounting and restart Envio.");
    }

    function _deployOrLoadNewVa(address usdc, address deployer) internal returns (address newVa) {
        if (vm.envExists("NEW_VA")) {
            newVa = vm.envAddress("NEW_VA");
            console2.log("Reusing NEW_VA:", newVa);
            return newVa;
        }

        address gmxVault = vm.envAddress("GMX_VAULT");
        address oracleAdapter = vm.envAddress("ORACLE_ADAPTER");
        VaultAccounting deployed = new VaultAccounting(usdc, gmxVault, oracleAdapter, deployer);
        newVa = address(deployed);
        console2.log("Deployed NEW_VA:", newVa);
    }

    function _closeAllPositions(VaultAccounting va, address basket, bytes32[] memory assetIds) internal {
        for (uint256 i = 0; i < assetIds.length; i++) {
            _closeIfOpen(va, basket, assetIds[i], true);
            _closeIfOpen(va, basket, assetIds[i], false);
        }
    }

    function _closeIfOpen(VaultAccounting va, address basket, bytes32 asset, bool isLong) internal {
        bytes32 posKey = va.getPositionKey(basket, asset, isLong);
        VaultAccounting.PositionTracking memory pos = va.getPositionTracking(posKey);
        if (!pos.exists || pos.size == 0) return;

        console2.log("Closing leg:");
        console2.logBytes32(asset);
        console2.log("  isLong:", isLong);
        va.closePosition(basket, asset, isLong, pos.size, 0);
    }

    function _availableCapital(address oldVa, address basket) internal view returns (uint256) {
        VaultAccounting va = VaultAccounting(oldVa);
        (bool ok, bytes memory data) = address(va).staticcall(abi.encodeWithSignature("getVaultState(address)", basket));
        require(ok && data.length >= 6 * 32, "getVaultState failed");
        (uint256 depositedCapital, int256 realisedPnL,, uint256 collateralLocked,,) =
            abi.decode(data, (uint256, int256, uint256, uint256, uint256, bool));

        int256 total = int256(depositedCapital) + realisedPnL - int256(collateralLocked);
        return total > 0 ? uint256(total) : 0;
    }

    function _envFlag(string memory key) internal view returns (bool) {
        if (!vm.envExists(key)) return false;
        string memory v = vm.envString(key);
        bytes32 h = keccak256(bytes(v));
        return h == keccak256("true") || h == keccak256("1") || h == keccak256("yes");
    }

    function _parseBytes32List(string memory csv) internal pure returns (bytes32[] memory out) {
        string[] memory parts = _split(csv, ",");
        out = new bytes32[](parts.length);
        for (uint256 i = 0; i < parts.length; i++) {
            out[i] = _parseBytes32(parts[i]);
        }
    }

    function _parseAddressList(string memory csv) internal pure returns (address[] memory out) {
        string[] memory parts = _split(csv, ",");
        out = new address[](parts.length);
        for (uint256 i = 0; i < parts.length; i++) {
            out[i] = _parseAddress(parts[i]);
        }
    }

    function _split(string memory s, string memory delim) internal pure returns (string[] memory) {
        bytes memory b = bytes(s);
        bytes memory d = bytes(delim);
        require(d.length == 1, "single-char delim only");

        uint256 count = 1;
        for (uint256 i = 0; i < b.length; i++) {
            if (b[i] == d[0]) count++;
        }

        string[] memory out = new string[](count);
        uint256 idx;
        uint256 start;
        for (uint256 i = 0; i < b.length; i++) {
            if (b[i] == d[0]) {
                out[idx++] = _slice(b, start, i);
                start = i + 1;
            }
        }
        out[idx] = _slice(b, start, b.length);
        return out;
    }

    function _slice(bytes memory b, uint256 start, uint256 end) internal pure returns (string memory) {
        bytes memory out = new bytes(end - start);
        for (uint256 i = start; i < end; i++) {
            out[i - start] = b[i];
        }
        return string(out);
    }

    function _parseBytes32(string memory s) internal pure returns (bytes32) {
        bytes memory b = bytes(s);
        require(b.length == 66 && b[0] == "0" && (b[1] == "x" || b[1] == "X"), "asset id must be 0x + 64 hex");
        uint256 acc;
        for (uint256 i = 2; i < 66; i++) {
            acc = (acc << 4) | _hexNibble(uint8(b[i]));
        }
        return bytes32(acc);
    }

    function _parseAddress(string memory s) internal pure returns (address) {
        bytes memory b = bytes(s);
        require(b.length == 42 && b[0] == "0" && (b[1] == "x" || b[1] == "X"), "address must be 0x + 40 hex");
        uint160 acc;
        for (uint256 i = 2; i < 42; i++) {
            acc = (acc << 4) | uint160(_hexNibble(uint8(b[i])));
        }
        return address(acc);
    }

    function _hexNibble(uint8 c) internal pure returns (uint256) {
        if (c >= uint8(bytes1("0")) && c <= uint8(bytes1("9"))) return c - uint8(bytes1("0"));
        if (c >= uint8(bytes1("a")) && c <= uint8(bytes1("f"))) return 10 + c - uint8(bytes1("a"));
        if (c >= uint8(bytes1("A")) && c <= uint8(bytes1("F"))) return 10 + c - uint8(bytes1("A"));
        revert("invalid hex char");
    }
}
