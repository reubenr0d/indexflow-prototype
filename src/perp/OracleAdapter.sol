// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IOracleAdapter} from "./interfaces/IOracleAdapter.sol";

/// @title OracleAdapter
/// @notice Unified oracle for equities, commodities, and crypto assets.
/// Supports Chainlink feeds and custom keeper-relayed prices with staleness
/// checks, deviation circuit breakers, and multi-source aggregation.
contract OracleAdapter is IOracleAdapter, Ownable {
    uint256 public constant PRICE_PRECISION = 1e30;
    uint256 public constant BPS = 10_000;

    mapping(bytes32 => AssetConfig) internal _assetConfigs;
    mapping(bytes32 => PriceData) internal _prices;
    mapping(address => bool) public keepers;

    bytes32[] public assetList;

    event AssetConfigured(bytes32 indexed assetId, FeedType feedType, address feedAddress);
    event AssetRemoved(bytes32 indexed assetId);
    event PriceUpdated(bytes32 indexed assetId, uint256 price, uint256 timestamp);
    event KeeperUpdated(address indexed keeper, bool active);

    error AssetNotFound(bytes32 assetId);
    error AssetNotActive(bytes32 assetId);
    error StalePrice(bytes32 assetId, uint256 lastUpdate, uint256 threshold);
    error DeviationTooLarge(bytes32 assetId, uint256 oldPrice, uint256 newPrice, uint256 maxDeviationBps);
    error InvalidPrice();
    error Unauthorized();

    modifier onlyKeeper() {
        if (!keepers[msg.sender] && msg.sender != owner()) revert Unauthorized();
        _;
    }

    constructor(address _owner) Ownable(_owner) {}

    // ─── Admin ───────────────────────────────────────────────────

    function setKeeper(address keeper, bool active) external onlyOwner {
        keepers[keeper] = active;
        emit KeeperUpdated(keeper, active);
    }

    /// @notice Configure or update an asset feed.
    function configureAsset(
        bytes32 assetId,
        address feedAddress,
        FeedType feedType,
        uint256 stalenessThreshold,
        uint256 deviationBps,
        uint8 decimals_
    ) external onlyOwner {
        bool isNew = !_assetConfigs[assetId].active;

        _assetConfigs[assetId] = AssetConfig({
            feedAddress: feedAddress,
            feedType: feedType,
            stalenessThreshold: stalenessThreshold,
            deviationBps: deviationBps,
            decimals: decimals_,
            active: true
        });

        if (isNew) {
            assetList.push(assetId);
        }

        emit AssetConfigured(assetId, feedType, feedAddress);
    }

    function deactivateAsset(bytes32 assetId) external onlyOwner {
        if (!_assetConfigs[assetId].active) revert AssetNotFound(assetId);
        _assetConfigs[assetId].active = false;
        emit AssetRemoved(assetId);
    }

    // ─── Price Submission (Custom Relayer) ────────────────────────

    /// @notice Submit a price update for a custom-relayed asset.
    function submitPrice(bytes32 assetId, uint256 price) external onlyKeeper {
        AssetConfig memory cfg = _assetConfigs[assetId];
        if (!cfg.active) revert AssetNotActive(assetId);
        if (cfg.feedType != FeedType.CustomRelayer) revert Unauthorized();
        if (price == 0) revert InvalidPrice();

        _validateDeviation(assetId, price, cfg.deviationBps);

        uint256 normalizedPrice = _normalize(price, cfg.decimals);

        _prices[assetId] = PriceData({
            price: normalizedPrice,
            timestamp: block.timestamp
        });

        emit PriceUpdated(assetId, normalizedPrice, block.timestamp);
    }

    /// @notice Batch submit prices for multiple assets.
    function submitPrices(
        bytes32[] calldata assetIds,
        uint256[] calldata prices_
    ) external onlyKeeper {
        require(assetIds.length == prices_.length, "Length mismatch");

        for (uint256 i = 0; i < assetIds.length; i++) {
            AssetConfig memory cfg = _assetConfigs[assetIds[i]];
            if (!cfg.active) revert AssetNotActive(assetIds[i]);
            if (cfg.feedType != FeedType.CustomRelayer) revert Unauthorized();
            if (prices_[i] == 0) revert InvalidPrice();

            _validateDeviation(assetIds[i], prices_[i], cfg.deviationBps);

            uint256 normalizedPrice = _normalize(prices_[i], cfg.decimals);

            _prices[assetIds[i]] = PriceData({
                price: normalizedPrice,
                timestamp: block.timestamp
            });

            emit PriceUpdated(assetIds[i], normalizedPrice, block.timestamp);
        }
    }

    // ─── Price Reading ───────────────────────────────────────────

    /// @notice Get the latest price for an asset. Reads from Chainlink or stored keeper price.
    function getPrice(bytes32 assetId) external view override returns (uint256 price, uint256 timestamp) {
        AssetConfig memory cfg = _assetConfigs[assetId];
        if (!cfg.active) revert AssetNotActive(assetId);

        if (cfg.feedType == FeedType.Chainlink) {
            return _readChainlink(cfg);
        }

        PriceData memory pd = _prices[assetId];
        if (pd.price == 0) revert AssetNotFound(assetId);
        return (pd.price, pd.timestamp);
    }

    function getPrices(bytes32[] calldata assetIds) external view override returns (PriceData[] memory result) {
        result = new PriceData[](assetIds.length);
        for (uint256 i = 0; i < assetIds.length; i++) {
            AssetConfig memory cfg = _assetConfigs[assetIds[i]];
            if (!cfg.active) revert AssetNotActive(assetIds[i]);

            if (cfg.feedType == FeedType.Chainlink) {
                (uint256 p, uint256 t) = _readChainlink(cfg);
                result[i] = PriceData({price: p, timestamp: t});
            } else {
                result[i] = _prices[assetIds[i]];
            }
        }
    }

    function isStale(bytes32 assetId) external view override returns (bool) {
        AssetConfig memory cfg = _assetConfigs[assetId];
        if (!cfg.active) return true;

        uint256 lastUpdate;
        if (cfg.feedType == FeedType.Chainlink) {
            (, lastUpdate) = _readChainlink(cfg);
        } else {
            lastUpdate = _prices[assetId].timestamp;
        }

        return (block.timestamp - lastUpdate) > cfg.stalenessThreshold;
    }

    function isAssetActive(bytes32 assetId) external view override returns (bool) {
        return _assetConfigs[assetId].active;
    }

    function getAssetConfig(bytes32 assetId) external view override returns (AssetConfig memory) {
        return _assetConfigs[assetId];
    }

    function getAssetCount() external view returns (uint256) {
        return assetList.length;
    }

    // ─── Internal ────────────────────────────────────────────────

    function _readChainlink(AssetConfig memory cfg) internal view returns (uint256 price, uint256 timestamp) {
        // Chainlink AggregatorV3Interface.latestRoundData()
        // Returns: (roundId, answer, startedAt, updatedAt, answeredInRound)
        (, int256 answer,, uint256 updatedAt,) = IChainlinkFeed(cfg.feedAddress).latestRoundData();
        require(answer > 0, "Chainlink: negative price");

        price = _normalize(uint256(answer), cfg.decimals);
        timestamp = updatedAt;
    }

    function _normalize(uint256 price, uint8 feedDecimals) internal pure returns (uint256) {
        if (feedDecimals < 30) {
            return price * 10 ** (30 - feedDecimals);
        }
        return price;
    }

    function _validateDeviation(bytes32 assetId, uint256 newPrice, uint256 maxDeviationBps) internal view {
        PriceData memory existing = _prices[assetId];
        if (existing.price == 0) return;

        uint256 deviation;
        if (newPrice > existing.price) {
            deviation = ((newPrice - existing.price) * BPS) / existing.price;
        } else {
            deviation = ((existing.price - newPrice) * BPS) / existing.price;
        }

        if (deviation > maxDeviationBps) {
            revert DeviationTooLarge(assetId, existing.price, newPrice, maxDeviationBps);
        }
    }
}

interface IChainlinkFeed {
    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    );
}
