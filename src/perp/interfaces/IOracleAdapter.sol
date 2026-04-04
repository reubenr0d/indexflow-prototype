// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IOracleAdapter
/// @notice Unified oracle interface for equities, commodities, and crypto assets.
/// Used by both BasketVault (for basket pricing) and PricingEngine (for perp trades).
interface IOracleAdapter {
    enum FeedType {
        Chainlink,
        CustomRelayer
    }

    struct AssetConfig {
        address feedAddress;
        FeedType feedType;
        uint256 stalenessThreshold;
        uint256 deviationBps;
        uint8 decimals;
        bool active;
    }

    struct PriceData {
        uint256 price;
        uint256 timestamp;
    }

    function getPrice(bytes32 assetId) external view returns (uint256 price, uint256 timestamp);
    function getPrices(bytes32[] calldata assetIds) external view returns (PriceData[] memory);
    function isStale(bytes32 assetId) external view returns (bool);
    function isAssetActive(bytes32 assetId) external view returns (bool);
    function getAssetConfig(bytes32 assetId) external view returns (AssetConfig memory);
}
