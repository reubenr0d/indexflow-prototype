// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IOracleAdapter
/// @notice Unified oracle interface for basket pricing and perp policy modules.
/// @dev Used by BasketVault (basket NAV inputs), PricingEngine, and PriceSync. Prices normalized to 1e30 unless noted in implementation.
interface IOracleAdapter {
    /// @notice Source kind for an asset.
    /// @dev Chainlink reads the feed on `getPrice`; CustomRelayer uses keeper-submitted values.
    enum FeedType {
        Chainlink,
        CustomRelayer
    }

    /// @notice Per-asset oracle configuration.
    /// @param feedAddress Chainlink aggregator or unused for custom relayer (implementation-defined).
    /// @param feedType How price updates are sourced.
    /// @param stalenessThreshold Seconds after which `isStale` is true for stored/custom prices.
    /// @param deviationBps Maximum allowed move vs last price for custom submissions (basis points).
    /// @param decimals Raw price decimals used when normalizing to internal precision.
    /// @param active If false, asset is ignored for reads.
    struct AssetConfig {
        address feedAddress;
        FeedType feedType;
        uint256 stalenessThreshold;
        uint256 deviationBps;
        uint8 decimals;
        bool active;
    }

    /// @notice Last stored price sample for custom relayer assets; Chainlink may reflect feed read.
    /// @param price Normalized price (typically 1e30 precision).
    /// @param timestamp Last update time (seconds).
    struct PriceData {
        uint256 price;
        uint256 timestamp;
    }

    /// @notice Latest price for `assetId` (Chainlink round or stored custom price).
    /// @param assetId Logical asset identifier.
    /// @return price Normalized price.
    /// @return timestamp Update timestamp associated with the returned price.
    function getPrice(bytes32 assetId) external view returns (uint256 price, uint256 timestamp);

    /// @notice Batch read of prices for gas-efficient frontends.
    /// @param assetIds List of asset identifiers.
    /// @return Array of `PriceData` in the same order.
    function getPrices(bytes32[] calldata assetIds) external view returns (PriceData[] memory);

    /// @notice Whether the adapter considers `assetId` stale per config rules.
    /// @param assetId Asset to check.
    /// @return True if price is too old or asset inactive/missing per implementation.
    function isStale(bytes32 assetId) external view returns (bool);

    /// @notice Whether `assetId` exists and is marked active.
    /// @param assetId Asset to check.
    /// @return True if configured and active.
    function isAssetActive(bytes32 assetId) external view returns (bool);

    /// @notice Full config record for `assetId`.
    /// @param assetId Asset identifier.
    /// @return cfg Stored `AssetConfig` (inactive assets may return empty/default fields).
    function getAssetConfig(bytes32 assetId) external view returns (AssetConfig memory cfg);
}
