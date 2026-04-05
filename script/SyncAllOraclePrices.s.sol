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

/// @notice Sync all configured oracle asset prices into GMX SimplePriceFeed via PriceSync.
/// @dev Reads addresses from a deployment config file.
///      - Default: apps/web/src/config/local-deployment.json
///      - Override: DEPLOYMENT_CONFIG=/abs/or/relative/path.json
contract SyncAllOraclePrices is Script {
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
            console2.log("Asset index:", i);
            console2.logBytes32(assetId);
            console2.log("Active:", isActive);
        }

        for (uint256 i = 0; i < mappingCount; i++) {
            (bytes32 mappedAssetId, address gmxToken) = sync.getMapping(i);
            (uint256 adapterPrice,) = oraclePriceView.getPrice(mappedAssetId);
            uint256 beforePrice = feed.prices(gmxToken);
            console2.log("Mapping index:", i);
            console2.logBytes32(mappedAssetId);
            console2.log("GMX token:", gmxToken);
            console2.log("Adapter price:", adapterPrice);
            console2.log("Feed price before sync:", beforePrice);
        }

        vm.startBroadcast(deployerPrivateKey);
        sync.syncAll();
        vm.stopBroadcast();

        console2.log("syncAll() sent.");
        console2.log("Active assets observed:", activeCount);

        for (uint256 i = 0; i < mappingCount; i++) {
            (bytes32 mappedAssetId, address gmxToken) = sync.getMapping(i);
            uint256 afterPrice = feed.prices(gmxToken);
            console2.log("Post-sync mapping index:", i);
            console2.logBytes32(mappedAssetId);
            console2.log("GMX token:", gmxToken);
            console2.log("Feed price after sync:", afterPrice);
        }
    }

    function _resolveConfigPath() internal view returns (string memory) {
        if (vm.envExists("DEPLOYMENT_CONFIG")) {
            return vm.envString("DEPLOYMENT_CONFIG");
        }
        return string.concat(vm.projectRoot(), "/apps/web/src/config/local-deployment.json");
    }
}
