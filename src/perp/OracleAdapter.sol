// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IOracleAdapter} from "./interfaces/IOracleAdapter.sol";

/// @title OracleAdapter
/// @notice Unified oracle for equities, commodities, and crypto assets.
/// @dev Supports Chainlink feeds and custom keeper-relayed prices with staleness checks and deviation limits.
/// All returned prices are normalized to `PRICE_PRECISION` (1e30). Custom relayer submissions compare against
/// the last stored price for deviation; Chainlink paths read `latestRoundData` each call.
contract OracleAdapter is IOracleAdapter, Ownable {
    /// @notice Target internal price scalar (30 decimals).
    uint256 public constant PRICE_PRECISION = 1e30;
    /// @notice Basis points denominator for deviation math.
    uint256 public constant BPS = 10_000;

    mapping(bytes32 => AssetConfig) internal _assetConfigs;
    /// @notice Last submitted price per asset (custom relayer); also used as deviation baseline after first write.
    mapping(bytes32 => PriceData) internal _prices;
    /// @notice Addresses allowed to call `submitPrice` / `submitPrices` (owner is always allowed).
    mapping(address => bool) public keepers;
    /// @notice Addresses authorized alongside owner on guarded admin functions (e.g. `configureAsset`).
    mapping(address => bool) public wirers;
    /// @notice Human-readable symbol for each asset id (set by `configureAsset`).
    mapping(bytes32 => string) public assetSymbols;

    /// @notice All asset ids ever configured while active (append-only; deactivated ids remain listed).
    bytes32[] public assetList;

    /// @notice When true, `configureAsset` is restricted to the canonical receiver.
    bool public canonicalMode;
    /// @notice Address of the OracleConfigReceiver on this chain (only relevant in canonical mode).
    address public canonicalReceiver;
    /// @notice Order-independent hash of all active asset configs (excludes feedAddress).
    bytes32 public configHash;

    /// @notice Emitted when `configureAsset` creates or updates an asset.
    event AssetConfigured(bytes32 indexed assetId, string symbol, FeedType feedType, address feedAddress);
    /// @notice Emitted when `deactivateAsset` runs.
    event AssetRemoved(bytes32 indexed assetId);
    /// @notice Emitted on successful custom relayer write.
    event PriceUpdated(bytes32 indexed assetId, uint256 price, uint256 timestamp);
    /// @notice Emitted when `setKeeper` runs.
    event KeeperUpdated(address indexed keeper, bool active);
    /// @notice Emitted when `setWirer` runs.
    event WirerSet(address indexed account, bool active);
    /// @notice Emitted when a local feed address is set independently of canonical config.
    event LocalFeedAddressSet(bytes32 indexed assetId, address feedAddress);
    /// @notice Emitted when canonical mode is enabled.
    event CanonicalModeEnabled(address indexed receiver);
    /// @notice Emitted when canonical mode is disabled (emergency).
    event CanonicalModeDisabled();

    /// @notice Custom relayer path had no stored price yet where required.
    error AssetNotFound(bytes32 assetId);
    /// @notice Asset missing or `active` false.
    error AssetNotActive(bytes32 assetId);
    /// @notice Read path detected stale data (reserved for stricter modes).
    error StalePrice(bytes32 assetId, uint256 lastUpdate, uint256 threshold);
    /// @notice Custom submission moved beyond `deviationBps` vs last stored price.
    error DeviationTooLarge(bytes32 assetId, uint256 oldPrice, uint256 newPrice, uint256 maxDeviationBps);
    /// @notice Zero price not allowed.
    error InvalidPrice();
    /// @notice Caller is not keeper or owner.
    error Unauthorized();

    modifier onlyKeeper() {
        if (!keepers[msg.sender] && msg.sender != owner()) revert Unauthorized();
        _;
    }

    modifier onlyOwnerOrWirer() {
        require(msg.sender == owner() || wirers[msg.sender], "Not authorized");
        _;
    }

    /// @param _owner Ownable admin.
    constructor(address _owner) Ownable(_owner) {}

    // ─── Admin ───────────────────────────────────────────────────

    /// @notice Authorize or revoke a keeper for custom price submission.
    /// @param keeper Address to toggle.
    /// @param active Whether keeper may submit.
    function setKeeper(address keeper, bool active) external onlyOwner {
        keepers[keeper] = active;
        emit KeeperUpdated(keeper, active);
    }

    /// @notice Authorize or revoke a wirer for `configureAsset`.
    /// @param account Address to toggle.
    /// @param active Whether account may call wirer-guarded functions.
    function setWirer(address account, bool active) external onlyOwner {
        wirers[account] = active;
        emit WirerSet(account, active);
    }

    /// @notice Configure or update an asset feed.
    /// @param symbol Human-readable ticker (e.g. "XAU", "BHP.AX"). Hashed to derive the asset id.
    /// @param feedAddress Chainlink aggregator address, or placeholder for custom relayer.
    /// @param feedType Chainlink (read feed) vs CustomRelayer (keeper writes).
    /// @param stalenessThreshold Max age in seconds before `isStale` is true.
    /// @param deviationBps Max relative change (BPS) between consecutive custom submissions.
    /// @param decimals_ Answer decimals from the feed (or off-chain source) before normalization to 1e30.
    function configureAsset(
        string calldata symbol,
        address feedAddress,
        FeedType feedType,
        uint256 stalenessThreshold,
        uint256 deviationBps,
        uint8 decimals_
    ) external {
        if (canonicalMode) {
            require(msg.sender == canonicalReceiver, "Config locked to canonical source");
        } else {
            require(msg.sender == owner() || wirers[msg.sender], "Not authorized");
        }

        bytes32 assetId = keccak256(bytes(symbol));
        bool isNew = !_assetConfigs[assetId].active;

        if (!isNew) {
            bytes32 oldHash = _assetHash(assetId, _assetConfigs[assetId]);
            configHash ^= oldHash;
        }

        _assetConfigs[assetId] = AssetConfig({
            feedAddress: feedAddress,
            feedType: feedType,
            stalenessThreshold: stalenessThreshold,
            deviationBps: deviationBps,
            decimals: decimals_,
            active: true
        });

        assetSymbols[assetId] = symbol;

        if (isNew) {
            assetList.push(assetId);
        }

        configHash ^= _assetHash(assetId, _assetConfigs[assetId]);

        emit AssetConfigured(assetId, symbol, feedType, feedAddress);
    }

    /// @notice Mark asset inactive; reads revert `AssetNotActive`.
    /// @param assetId Asset to deactivate.
    function deactivateAsset(bytes32 assetId) external onlyOwner {
        if (!_assetConfigs[assetId].active) revert AssetNotFound(assetId);
        configHash ^= _assetHash(assetId, _assetConfigs[assetId]);
        _assetConfigs[assetId].active = false;
        emit AssetRemoved(assetId);
    }

    /// @notice Set canonical mode, locking `configureAsset` to the canonical CCIP receiver.
    function setCanonicalMode(address _receiver) external onlyOwner {
        canonicalReceiver = _receiver;
        canonicalMode = true;
        emit CanonicalModeEnabled(_receiver);
    }

    /// @notice Emergency disable canonical mode (e.g. if canonical chain is compromised).
    function disableCanonicalMode() external onlyOwner {
        canonicalMode = false;
        emit CanonicalModeDisabled();
    }

    /// @notice Set the feed address for an asset without touching canonical config params.
    /// @dev Allows local admin to point at chain-specific Chainlink aggregators.
    function setLocalFeedAddress(bytes32 assetId, address feedAddress) external onlyOwnerOrWirer {
        require(_assetConfigs[assetId].active, "Asset not configured");
        configHash ^= _assetHash(assetId, _assetConfigs[assetId]);
        _assetConfigs[assetId].feedAddress = feedAddress;
        configHash ^= _assetHash(assetId, _assetConfigs[assetId]);
        emit LocalFeedAddressSet(assetId, feedAddress);
    }

    /// @notice Returns true if any active asset has feedAddress == address(0).
    function hasBrokenFeeds() external view returns (bool) {
        for (uint256 i = 0; i < assetList.length; i++) {
            AssetConfig memory cfg = _assetConfigs[assetList[i]];
            if (cfg.active && cfg.feedAddress == address(0)) return true;
        }
        return false;
    }

    // ─── Price Submission (Custom Relayer) ────────────────────────

    /// @notice Submit a price update for a custom-relayed asset.
    /// @param assetId Configured custom asset id.
    /// @param price Raw price in `decimals_` from config (then normalized).
    /// @dev Reverts if feed type is not CustomRelayer or deviation vs last price is too large.
    function submitPrice(bytes32 assetId, uint256 price) external onlyKeeper {
        AssetConfig memory cfg = _assetConfigs[assetId];
        if (!cfg.active) revert AssetNotActive(assetId);
        if (cfg.feedType != FeedType.CustomRelayer) revert Unauthorized();
        if (price == 0) revert InvalidPrice();

        uint256 normalizedPrice = _normalize(price, cfg.decimals);

        _validateDeviation(assetId, normalizedPrice, cfg.deviationBps);

        _prices[assetId] = PriceData({price: normalizedPrice, timestamp: block.timestamp});

        emit PriceUpdated(assetId, normalizedPrice, block.timestamp);
    }

    /// @notice Batch submit prices for multiple custom-relayed assets.
    /// @param assetIds Parallel array of asset ids.
    /// @param prices_ Parallel array of raw prices.
    function submitPrices(bytes32[] calldata assetIds, uint256[] calldata prices_) external onlyKeeper {
        require(assetIds.length == prices_.length, "Length mismatch");

        for (uint256 i = 0; i < assetIds.length; i++) {
            AssetConfig memory cfg = _assetConfigs[assetIds[i]];
            if (!cfg.active) revert AssetNotActive(assetIds[i]);
            if (cfg.feedType != FeedType.CustomRelayer) revert Unauthorized();
            if (prices_[i] == 0) revert InvalidPrice();

            uint256 normalizedPrice = _normalize(prices_[i], cfg.decimals);

            _validateDeviation(assetIds[i], normalizedPrice, cfg.deviationBps);

            _prices[assetIds[i]] = PriceData({price: normalizedPrice, timestamp: block.timestamp});

            emit PriceUpdated(assetIds[i], normalizedPrice, block.timestamp);
        }
    }

    // ─── Price Reading ───────────────────────────────────────────

    /// @notice Latest price: Chainlink round data or last keeper price for custom assets.
    /// @param assetId Asset id.
    /// @return price Normalized to 1e30.
    /// @return timestamp Chainlink `updatedAt` or last submission time.
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

    /// @notice Batch read; each entry uses same rules as `getPrice`.
    /// @param assetIds Asset ids.
    /// @return result Populated `PriceData` array.
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

    /// @notice True if last update is older than `stalenessThreshold` or asset inactive.
    /// @param assetId Asset id.
    /// @return Whether data is considered stale.
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

    /// @inheritdoc IOracleAdapter
    function isAssetActive(bytes32 assetId) external view override returns (bool) {
        return _assetConfigs[assetId].active;
    }

    /// @inheritdoc IOracleAdapter
    function getAssetConfig(bytes32 assetId) external view override returns (AssetConfig memory) {
        return _assetConfigs[assetId];
    }

    /// @notice Length of `assetList` (includes deactivated ids that were never removed from array).
    /// @return Count of configured entries ever pushed.
    function getAssetCount() external view returns (uint256) {
        return assetList.length;
    }

    /// @notice Human-readable symbol stored when `configureAsset` was called.
    /// @param assetId Asset to look up.
    /// @return symbol The symbol string, or empty if never set.
    function getAssetSymbol(bytes32 assetId) external view returns (string memory) {
        return assetSymbols[assetId];
    }

    // ─── Internal ────────────────────────────────────────────────

    /// @dev Reads `latestRoundData`, requires positive answer, normalizes to 1e30.
    function _readChainlink(AssetConfig memory cfg) internal view returns (uint256 price, uint256 timestamp) {
        // Chainlink AggregatorV3Interface.latestRoundData()
        // Returns: (roundId, answer, startedAt, updatedAt, answeredInRound)
        (, int256 answer,, uint256 updatedAt,) = IChainlinkFeed(cfg.feedAddress).latestRoundData();
        require(answer > 0, "Chainlink: negative price");

        price = _normalize(uint256(answer), cfg.decimals);
        timestamp = updatedAt;
    }

    /// @dev Scale up to 30 decimals when feed uses fewer.
    function _normalize(uint256 price, uint8 feedDecimals) internal pure returns (uint256) {
        if (feedDecimals < 30) {
            return price * 10 ** (30 - feedDecimals);
        }
        return price;
    }

    /// @dev Incremental XOR-based hash component for one asset (excludes feedAddress).
    function _assetHash(bytes32 assetId, AssetConfig memory cfg) internal pure returns (bytes32) {
        return keccak256(abi.encode(assetId, cfg.feedType, cfg.stalenessThreshold, cfg.deviationBps, cfg.decimals));
    }

    /// @dev First custom write skips check; subsequent compares relative move in BPS.
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

/// @notice Minimal Chainlink AggregatorV3 interface for price reads.
interface IChainlinkFeed {
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}
