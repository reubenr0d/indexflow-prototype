// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {VaultAccounting} from "../src/perp/VaultAccounting.sol";
import {BasketVault} from "../src/vault/BasketVault.sol";
import {BasketFactory} from "../src/vault/BasketFactory.sol";

/// @notice One-shot migration helper that points a single `BasketVault` at a freshly deployed
/// `VaultAccounting` carrying the `getVaultPnL` unit-scaling fix (USDC 6-dec instead of GMX 1e30).
///
/// Why: `VaultAccounting` is not upgradeable, so an existing basket with open perp legs reports a
/// massively inflated `getPricingNav()` (NAV grows by ~1e24× per dollar of unrealised PnL). Until
/// the basket is rewired, every non-trivial `deposit()` rounds to 0 shares and reverts with
/// "Shares too small". This script:
///
///  1. Closes every open position on the OLD `VaultAccounting` for `BASKET` (iterates `ASSET_IDS`
///     and probes both long/short legs via `getPositionTracking`). Realises PnL into USDC inside
///     the OLD `VaultAccounting`.
///  2. Withdraws **all** available capital back to the basket via `OLD_VA.withdrawCapital`.
///  3. Deploys a new `VaultAccounting` with the fix (skipped if `NEW_VA` env is already set).
///  4. Maps each `(ASSET_IDS[i], INDEX_TOKENS[i])` pair on the new VA.
///  5. Registers the basket on the new VA.
///  6. Calls `BASKET.setVaultAccounting(NEW_VA)`.
///  7. (Optional) Also updates `BasketFactory.setVaultAccounting(NEW_VA)` so newly-created baskets
///     pick up the patched VA automatically, AND grants the factory the `wirer` role on NEW_VA
///     so `BasketFactory.createBasket` can call `IPerp(NEW_VA).registerVault(newBasket)` (which
///     is `onlyOwnerOrWirer` on `VaultAccounting`). Without this grant every `create_vault` would
///     revert and silently strand agents on their previous vault (or worse, on someone else's
///     vault if the agent has no prior history).
///
/// Required env:
///   PRIVATE_KEY    - deployer/signer key; must currently own OLD_VA, BASKET, and (optionally) FACTORY.
///   RPC_URL        - forge --rpc-url target
///   BASKET         - BasketVault address being migrated
///   OLD_VA         - current VaultAccounting wired on the basket
///   USDC           - USDC token address on this chain
///   ASSET_IDS      - comma-separated bytes32 asset ids the basket has ever opened legs on
///   INDEX_TOKENS   - comma-separated GMX index token addresses (1:1 with ASSET_IDS)
///
/// Optional env:
///   NEW_VA           - pre-deployed new VaultAccounting; if unset, the script deploys one
///   GMX_VAULT        - required if NEW_VA is unset
///   ORACLE_ADAPTER   - required if NEW_VA is unset
///   FACTORY          - if set, BasketFactory.setVaultAccounting(NEW_VA) is also called
///   SKIP_CLOSE       - if "true", skip step 1 (assume positions already closed)
///   SKIP_WITHDRAW    - if "true", skip step 2 (assume capital already withdrawn)
///
/// Usage:
///   PATH="/Users/reuben/.foundry/bin:$PATH" \
///   BASKET=0x... OLD_VA=0x... USDC=0x... GMX_VAULT=0x... ORACLE_ADAPTER=0x... \
///   ASSET_IDS=0xaaa...,0xbbb... INDEX_TOKENS=0xccc...,0xddd... \
///   forge script script/MigrateVaultAccounting.s.sol:MigrateVaultAccounting \
///     --root /Users/reuben/Desktop/minestarters/code/snx-prototype \
///     --rpc-url $RPC_URL --broadcast -vvv
contract MigrateVaultAccounting is Script {
    function run() external {
        address basket = vm.envAddress("BASKET");
        address oldVa = vm.envAddress("OLD_VA");
        address usdc = vm.envAddress("USDC");

        bytes32[] memory assetIds = _parseBytes32List(vm.envString("ASSET_IDS"));
        address[] memory indexTokens = _parseAddressList(vm.envString("INDEX_TOKENS"));
        require(assetIds.length == indexTokens.length, "ASSET_IDS and INDEX_TOKENS length mismatch");

        bool skipClose = _envFlag("SKIP_CLOSE");
        bool skipWithdraw = _envFlag("SKIP_WITHDRAW");

        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        // ─── 1. Close every open position on OLD_VA ─────────────────
        if (!skipClose) {
            _closeAllPositions(VaultAccounting(oldVa), basket, assetIds);
        }

        // ─── 2. Withdraw all available capital back to the basket ───
        if (!skipWithdraw) {
            uint256 available = _availableCapital(oldVa, basket, usdc);
            if (available > 0) {
                console2.log("Withdrawing capital from OLD_VA:", available);
                VaultAccounting(oldVa).withdrawCapital(basket, available);
            } else {
                console2.log("No withdrawable capital on OLD_VA");
            }
        }

        // ─── 3. Deploy new VaultAccounting if not provided ──────────
        address newVa;
        if (vm.envExists("NEW_VA")) {
            newVa = vm.envAddress("NEW_VA");
            console2.log("Reusing NEW_VA:", newVa);
        } else {
            address gmxVault = vm.envAddress("GMX_VAULT");
            address oracleAdapter = vm.envAddress("ORACLE_ADAPTER");
            VaultAccounting deployedVa = new VaultAccounting(usdc, gmxVault, oracleAdapter, deployer);
            newVa = address(deployedVa);
            console2.log("Deployed NEW_VA:", newVa);
        }

        // ─── 4. Map assets on the new VA ────────────────────────────
        for (uint256 i = 0; i < assetIds.length; i++) {
            address existing = VaultAccounting(newVa).assetTokens(assetIds[i]);
            if (existing == address(0)) {
                VaultAccounting(newVa).mapAssetToken(assetIds[i], indexTokens[i]);
                console2.log("Mapped asset on NEW_VA");
                console2.logBytes32(assetIds[i]);
                console2.log("  -> token", indexTokens[i]);
            }
        }

        // ─── 5. Register basket on the new VA ───────────────────────
        if (!VaultAccounting(newVa).isVaultRegistered(basket)) {
            VaultAccounting(newVa).registerVault(basket);
            console2.log("Registered basket on NEW_VA");
        }

        // ─── 6. Rewire basket -> NEW_VA ─────────────────────────────
        BasketVault(basket).setVaultAccounting(newVa);
        console2.log("BasketVault.setVaultAccounting(NEW_VA) done");

        // ─── 7. (Optional) point factory at the new VA ──────────────
        if (vm.envExists("FACTORY")) {
            address factory = vm.envAddress("FACTORY");
            BasketFactory(factory).setVaultAccounting(newVa);
            console2.log("BasketFactory.setVaultAccounting(NEW_VA) done");

            // BasketFactory.createBasket calls NEW_VA.registerVault(newBasket) which is
            // onlyOwnerOrWirer. The original Deploy.s.sol granted this role; without
            // mirroring it here every future create_vault would revert with "Not authorized"
            // until manually restored.
            if (!VaultAccounting(newVa).wirers(factory)) {
                VaultAccounting(newVa).setWirer(factory, true);
                console2.log("VaultAccounting.setWirer(factory, true) on NEW_VA");
            }
        }

        vm.stopBroadcast();

        // ─── Post-migration NAV sanity log ──────────────────────────
        uint256 navAfter = BasketVault(basket).getPricingNav();
        console2.log("Post-migration getPricingNav():", navAfter);
        console2.log(
            "Remember to update apps/web/src/config/<chain>-deployment.json vaultAccounting and restart Envio."
        );
    }

    /// @dev Iterates `assetIds` and closes both long/short legs for `basket` that show `exists == true`.
    /// Uses the tracked vault-specific size so the close fully clears the vault's leg.
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

        console2.log("Closing leg on OLD_VA:");
        console2.logBytes32(asset);
        console2.log("  isLong:", isLong);
        console2.log("  size:", pos.size);

        // collateralDelta = 0 → GMX returns the proportional collateral; closePosition realises PnL.
        va.closePosition(basket, asset, isLong, pos.size, 0);
    }

    /// @dev Reads `_availableCapital(basket)` indirectly by simulating `withdrawCapital(type(uint256).max)`
    /// would have surfaced it via the `InsufficientCapital(_, requested, available)` revert. Instead we use
    /// the more direct path: `getVaultState(basket).depositedCapital + realisedPnL - collateralLocked`.
    function _availableCapital(
        address oldVa,
        address basket,
        address /* usdc */
    )
        internal
        view
        returns (uint256)
    {
        VaultAccounting va = VaultAccounting(oldVa);
        // After step 1 all positions are closed, so collateralLocked == 0 in practice; we still
        // floor at the live value to be robust if a caller passes SKIP_CLOSE=true intentionally.
        // VaultState fields: depositedCapital, realisedPnL, openInterest, collateralLocked, ...
        (uint256 depositedCapital, int256 realisedPnL,, uint256 collateralLocked,,) = _getVaultStateTuple(va, basket);

        int256 total = int256(depositedCapital) + realisedPnL - int256(collateralLocked);
        return total > 0 ? uint256(total) : 0;
    }

    function _getVaultStateTuple(VaultAccounting va, address basket)
        internal
        view
        returns (
            uint256 depositedCapital,
            int256 realisedPnL,
            uint256 openInterest,
            uint256 collateralLocked,
            uint256 positionCount,
            bool registered
        )
    {
        // Decode the IPerp.VaultState struct via the getter.
        // The struct is returned in declaration order.
        // Using low-level call to keep this file independent of the interface import path.
        (bool ok, bytes memory data) = address(va).staticcall(abi.encodeWithSignature("getVaultState(address)", basket));
        require(ok && data.length >= 6 * 32, "getVaultState failed");
        (depositedCapital, realisedPnL, openInterest, collateralLocked, positionCount, registered) =
            abi.decode(data, (uint256, int256, uint256, uint256, uint256, bool));
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
        // Accept 0x-prefixed 64-char hex.
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
