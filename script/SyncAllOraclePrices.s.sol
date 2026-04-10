// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";

interface IOracleAdapterView {
    function getAssetCount() external view returns (uint256);
    function assetList(uint256 index) external view returns (bytes32);
    function isAssetActive(bytes32 assetId) external view returns (bool);
}

interface IPriceSync {
    function syncAll() external;
    function oracleAdapter() external view returns (address);
    function simplePriceFeed() external view returns (address);
    function getMappingCount() external view returns (uint256);
    function getMapping(uint256 index) external view returns (bytes32 assetId, address gmxToken);
}

interface ISimplePriceFeedView {
    function prices(address token) external view returns (uint256);
}

interface IOracleAdapterPriceView {
    function getPrice(bytes32 assetId) external view returns (uint256 price, uint256 timestamp);
}

interface IERC20SymbolView {
    function symbol() external view returns (string memory);
}

/// @notice Sync all configured oracle asset prices into GMX SimplePriceFeed via PriceSync.
/// @dev Reads addresses from a deployment config file.
///      - Default: apps/web/src/config/local-deployment.json
///      - Override: DEPLOYMENT_CONFIG=/abs/or/relative/path.json
contract SyncAllOraclePrices is Script {
    struct MappingSnapshot {
        string assetName;
        address gmxToken;
        uint256 adapterPrice;
        uint256 beforePrice;
        uint256 afterPrice;
        bool changed;
    }

    function run() external {
        uint256 deployerPrivateKey = uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80);
        if (vm.envExists("PRIVATE_KEY")) {
            deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        }

        string memory configPath = _resolveConfigPath();
        string memory json = vm.readFile(configPath);
        address oracleAdapter = vm.parseJsonAddress(json, ".oracleAdapter");
        address priceSync = vm.parseJsonAddress(json, ".priceSync");
        require(oracleAdapter != address(0), "SyncAllOraclePrices: oracleAdapter missing");
        require(priceSync != address(0), "SyncAllOraclePrices: priceSync missing");

        IOracleAdapterView oracle = IOracleAdapterView(oracleAdapter);
        IPriceSync sync = IPriceSync(priceSync);
        uint256 assetCount = oracle.getAssetCount();
        uint256 activeCount;
        uint256 mappingCount = sync.getMappingCount();
        address simplePriceFeed = sync.simplePriceFeed();
        ISimplePriceFeedView feed = ISimplePriceFeedView(simplePriceFeed);
        IOracleAdapterPriceView oraclePriceView = IOracleAdapterPriceView(oracleAdapter);
        MappingSnapshot[] memory rows = new MappingSnapshot[](mappingCount);

        console2.log("Config:", configPath);
        console2.log("OracleAdapter:", oracleAdapter);
        console2.log("PriceSync:", priceSync);
        console2.log("SimplePriceFeed:", simplePriceFeed);
        console2.log("Preflight asset count:", assetCount);
        console2.log("Preflight mapping count:", mappingCount);

        for (uint256 i = 0; i < assetCount; i++) {
            bytes32 assetId = oracle.assetList(i);
            bool isActive = oracle.isAssetActive(assetId);
            if (isActive) activeCount++;
        }

        for (uint256 i = 0; i < mappingCount; i++) {
            (bytes32 mappedAssetId, address gmxToken) = sync.getMapping(i);
            (uint256 adapterPrice,) = oraclePriceView.getPrice(mappedAssetId);
            uint256 beforePrice = feed.prices(gmxToken);
            rows[i] = MappingSnapshot({
                assetName: _assetName(gmxToken, i),
                gmxToken: gmxToken,
                adapterPrice: adapterPrice,
                beforePrice: beforePrice,
                afterPrice: 0,
                changed: false
            });
        }

        vm.startBroadcast(deployerPrivateKey);
        sync.syncAll();
        vm.stopBroadcast();

        console2.log("syncAll() sent.");
        console2.log("Active assets observed:", activeCount);
        console2.log("");
        console2.log("Price Sync Results");
        console2.log("| # | Asset | Before | Adapter | After | Status |");
        console2.log("|---|-------|--------|---------|-------|--------|");

        uint256 changedCount;
        for (uint256 i = 0; i < mappingCount; i++) {
            uint256 afterPrice = feed.prices(rows[i].gmxToken);
            rows[i].afterPrice = afterPrice;
            rows[i].changed = afterPrice != rows[i].beforePrice;
            if (rows[i].changed) changedCount++;
            console2.log(_summaryRow(i, rows[i]));
        }

        console2.log("");
        console2.log("Changed Prices");
        if (changedCount == 0) {
            console2.log("(none)");
            return;
        }

        console2.log("| # | Asset | Before -> After |");
        console2.log("|---|-------|-----------------|");
        for (uint256 i = 0; i < mappingCount; i++) {
            if (rows[i].changed) {
                console2.log(_changedRow(i, rows[i]));
            }
        }
    }

    function _resolveConfigPath() internal view returns (string memory) {
        if (vm.envExists("DEPLOYMENT_CONFIG")) {
            return vm.envString("DEPLOYMENT_CONFIG");
        }
        return string.concat(vm.projectRoot(), "/apps/web/src/config/local-deployment.json");
    }

    function _summaryRow(uint256 index, MappingSnapshot memory row) internal pure returns (string memory) {
        string memory beforeValue = _markIfChanged(row.beforePrice, row.changed);
        string memory afterValue = _markIfChanged(row.afterPrice, row.changed);
        string memory status = row.changed ? "CHANGED" : "UNCHANGED";
        return string.concat(
            "| ",
            vm.toString(index),
            " | ",
            row.assetName,
            " | ",
            beforeValue,
            " | ",
            vm.toString(row.adapterPrice),
            " | ",
            afterValue,
            " | ",
            status,
            " |"
        );
    }

    function _changedRow(uint256 index, MappingSnapshot memory row) internal pure returns (string memory) {
        return string.concat(
            "| ",
            vm.toString(index),
            " | ",
            row.assetName,
            " | ",
            vm.toString(row.beforePrice),
            " -> ",
            vm.toString(row.afterPrice),
            " |"
        );
    }

    function _markIfChanged(uint256 value, bool changed) internal pure returns (string memory) {
        string memory textValue = vm.toString(value);
        if (!changed) return textValue;
        return string.concat(">>", textValue, "<<");
    }

    function _assetName(address gmxToken, uint256 index) internal view returns (string memory) {
        try IERC20SymbolView(gmxToken).symbol() returns (string memory symbol) {
            if (bytes(symbol).length > 0) {
                return symbol;
            }
        } catch {}
        return string.concat("ASSET_", vm.toString(index));
    }
}
