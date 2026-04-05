// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";

interface IOracleAdapterAdmin {
    struct AssetConfig {
        address feedAddress;
        uint8 feedType;
        uint256 stalenessThreshold;
        uint256 deviationBps;
        uint8 decimals;
        bool active;
    }

    function getAssetCount() external view returns (uint256);
    function assetList(uint256 index) external view returns (bytes32);
    function getAssetConfig(bytes32 assetId) external view returns (AssetConfig memory);
    function getPrice(bytes32 assetId) external view returns (uint256 price, uint256 timestamp);
    function submitPrices(bytes32[] calldata assetIds, uint256[] calldata prices_) external;
}

interface IPriceSyncAdmin {
    function syncAll() external;
    function getMappingCount() external view returns (uint256);
    function getMapping(uint256 index) external view returns (bytes32 assetId, address gmxToken);
    function simplePriceFeed() external view returns (address);
}

interface ISimplePriceFeedView {
    function prices(address token) external view returns (uint256);
}

/// @notice Submit custom-relayer prices to OracleAdapter, then sync them into SimplePriceFeed.
/// @dev Reads addresses from a deployment config file.
///      - Default: apps/web/src/config/local-deployment.json
///      - Override: DEPLOYMENT_CONFIG=/abs/or/relative/path.json
///      For XAU/XAG, optional env overrides are supported:
///      - XAU_PRICE_RAW (8-decimal raw feed value)
///      - XAG_PRICE_RAW (8-decimal raw feed value)
///      If unset, script re-submits each asset's current price (raw-denormalized) to refresh timestamp.
contract SubmitAndSyncOraclePrices is Script {
    uint8 internal constant FEED_TYPE_CUSTOM_RELAYER = 1;
    bytes32 internal constant XAU = keccak256("XAU");
    bytes32 internal constant XAG = keccak256("XAG");

    function run() external {
        uint256 deployerPrivateKey = uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80);
        if (vm.envExists("PRIVATE_KEY")) {
            deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        }

        string memory configPath = _resolveConfigPath();
        string memory json = vm.readFile(configPath);
        address oracleAdapter = vm.parseJsonAddress(json, ".oracleAdapter");
        address priceSync = vm.parseJsonAddress(json, ".priceSync");
        require(oracleAdapter != address(0), "SubmitAndSync: oracleAdapter missing");
        require(priceSync != address(0), "SubmitAndSync: priceSync missing");

        IOracleAdapterAdmin oracle = IOracleAdapterAdmin(oracleAdapter);
        IPriceSyncAdmin sync = IPriceSyncAdmin(priceSync);
        ISimplePriceFeedView feed = ISimplePriceFeedView(sync.simplePriceFeed());

        uint256 assetCount = oracle.getAssetCount();
        bytes32[] memory candidateIds = new bytes32[](assetCount);
        uint256[] memory candidatePrices = new uint256[](assetCount);
        uint256 customCount;

        console2.log("Config:", configPath);
        console2.log("OracleAdapter:", oracleAdapter);
        console2.log("PriceSync:", priceSync);
        console2.log("Preflight asset count:", assetCount);

        for (uint256 i = 0; i < assetCount; i++) {
            bytes32 assetId = oracle.assetList(i);
            IOracleAdapterAdmin.AssetConfig memory cfg = oracle.getAssetConfig(assetId);
            if (!cfg.active || cfg.feedType != FEED_TYPE_CUSTOM_RELAYER) {
                continue;
            }

            (uint256 normalizedPrice, uint256 oldTs) = oracle.getPrice(assetId);
            uint256 rawPrice = _toRawPrice(normalizedPrice, cfg.decimals);

            // Optional explicit price overrides for local XAU/XAG workflow.
            if (assetId == XAU && vm.envExists("XAU_PRICE_RAW")) {
                rawPrice = vm.envUint("XAU_PRICE_RAW");
            } else if (assetId == XAG && vm.envExists("XAG_PRICE_RAW")) {
                rawPrice = vm.envUint("XAG_PRICE_RAW");
            }

            candidateIds[customCount] = assetId;
            candidatePrices[customCount] = rawPrice;
            customCount++;

            console2.log("Custom asset index:", i);
            console2.logBytes32(assetId);
            console2.log("Decimals:", cfg.decimals);
            console2.log("Old timestamp:", oldTs);
            console2.log("Raw price to submit:", rawPrice);
            console2.log("Normalized pre-submit:", normalizedPrice);
        }

        require(customCount > 0, "SubmitAndSync: no active custom assets");

        bytes32[] memory submitIds = new bytes32[](customCount);
        uint256[] memory submitPrices = new uint256[](customCount);
        for (uint256 i = 0; i < customCount; i++) {
            submitIds[i] = candidateIds[i];
            submitPrices[i] = candidatePrices[i];
        }

        vm.startBroadcast(deployerPrivateKey);
        oracle.submitPrices(submitIds, submitPrices);
        sync.syncAll();
        vm.stopBroadcast();

        console2.log("Submitted custom prices:", customCount);
        console2.log("syncAll() sent.");

        uint256 mappingCount = sync.getMappingCount();
        for (uint256 i = 0; i < mappingCount; i++) {
            (bytes32 assetId, address token) = sync.getMapping(i);
            (uint256 oraclePrice, uint256 oracleTs) = oracle.getPrice(assetId);
            uint256 feedPrice = feed.prices(token);
            console2.log("Post-sync mapping:", i);
            console2.logBytes32(assetId);
            console2.log("Token:", token);
            console2.log("Oracle price:", oraclePrice);
            console2.log("Oracle timestamp:", oracleTs);
            console2.log("Feed price:", feedPrice);
        }
    }

    function _toRawPrice(uint256 normalizedPrice, uint8 decimals) internal pure returns (uint256) {
        if (decimals < 30) {
            uint256 divisor = 10 ** (30 - decimals);
            require(normalizedPrice % divisor == 0, "SubmitAndSync: non-divisible normalized");
            return normalizedPrice / divisor;
        }
        return normalizedPrice * (10 ** (decimals - 30));
    }

    function _resolveConfigPath() internal view returns (string memory) {
        if (vm.envExists("DEPLOYMENT_CONFIG")) {
            return vm.envString("DEPLOYMENT_CONFIG");
        }
        return string.concat(vm.projectRoot(), "/apps/web/src/config/local-deployment.json");
    }
}
