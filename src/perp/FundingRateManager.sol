// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IGMXVault} from "./interfaces/IGMXVault.sol";
import {IOracleAdapter} from "./interfaces/IOracleAdapter.sol";

/// @title FundingRateManager
/// @notice Manages funding rate configuration for the GMX-derived perp vault.
/// Adapts GMX's utilization-based funding to oracle-anchored, long/short imbalance-based rates.
///
/// GMX baseline: fundingRate = fundingRateFactor * reservedAmounts / poolAmounts * intervals
/// Our adaptation:
/// - fundingRateFactor is dynamically adjusted based on long/short imbalance
/// - Rates are anchored to oracle prices (no drift from pool-only utilization)
/// - Configurable per asset via keeper or owner
contract FundingRateManager is Ownable {
    uint256 public constant BPS = 10_000;
    uint256 public constant FUNDING_RATE_PRECISION = 1_000_000;

    IGMXVault public gmxVault;
    IOracleAdapter public oracleAdapter;

    /// @notice Per-asset funding configuration
    struct FundingConfig {
        uint256 baseFundingRateFactor;
        uint256 maxFundingRateFactor;
        uint256 imbalanceThresholdBps;
        bool configured;
    }

    mapping(bytes32 => FundingConfig) public fundingConfigs;
    mapping(bytes32 => address) public assetTokens;

    uint256 public defaultBaseFundingRateFactor;
    uint256 public defaultMaxFundingRateFactor;
    uint256 public fundingInterval;

    mapping(address => bool) public keepers;

    event FundingConfigured(bytes32 indexed assetId, uint256 baseFactor, uint256 maxFactor);
    event FundingRateUpdated(bytes32 indexed assetId, uint256 newFactor);
    event FundingIntervalUpdated(uint256 interval);
    event KeeperUpdated(address indexed keeper, bool active);

    error Unauthorized();

    modifier onlyKeeper() {
        if (!keepers[msg.sender] && msg.sender != owner()) revert Unauthorized();
        _;
    }

    constructor(
        address _gmxVault,
        address _oracleAdapter,
        address _owner
    ) Ownable(_owner) {
        gmxVault = IGMXVault(_gmxVault);
        oracleAdapter = IOracleAdapter(_oracleAdapter);

        defaultBaseFundingRateFactor = 100;
        defaultMaxFundingRateFactor = 10_000;
        fundingInterval = 1 hours;
    }

    // ─── Configuration ───────────────────────────────────────────

    function setKeeper(address keeper, bool active) external onlyOwner {
        keepers[keeper] = active;
        emit KeeperUpdated(keeper, active);
    }

    function setFundingInterval(uint256 _interval) external onlyOwner {
        require(_interval > 0, "Invalid interval");
        fundingInterval = _interval;
        emit FundingIntervalUpdated(_interval);
    }

    function setDefaultFunding(
        uint256 baseFactor,
        uint256 maxFactor
    ) external onlyOwner {
        defaultBaseFundingRateFactor = baseFactor;
        defaultMaxFundingRateFactor = maxFactor;
    }

    function configureFunding(
        bytes32 assetId,
        uint256 baseFundingRateFactor,
        uint256 maxFundingRateFactor,
        uint256 imbalanceThresholdBps
    ) external onlyOwner {
        fundingConfigs[assetId] = FundingConfig({
            baseFundingRateFactor: baseFundingRateFactor,
            maxFundingRateFactor: maxFundingRateFactor,
            imbalanceThresholdBps: imbalanceThresholdBps,
            configured: true
        });

        emit FundingConfigured(assetId, baseFundingRateFactor, maxFundingRateFactor);
    }

    function mapAssetToken(bytes32 assetId, address token) external onlyOwner {
        require(token != address(0), "Invalid token");
        assetTokens[assetId] = token;
    }

    // ─── Funding Rate Calculation ────────────────────────────────

    /// @notice Calculate the appropriate funding rate factor based on long/short imbalance.
    /// Higher imbalance = higher funding rate to incentivize the minority side.
    function calculateFundingRateFactor(bytes32 assetId) external view returns (uint256) {
        return _calculateFundingRateFactor(assetId);
    }

    /// @notice Keeper calls this to update the GMX vault's funding parameters.
    /// The GMX vault uses `fundingRateFactor` in its internal `getNextFundingRate()`.
    function updateFundingRate(
        uint256 newFundingRateFactor,
        uint256 newStableFundingRateFactor
    ) external onlyKeeper {
        gmxVault.setFundingRate(
            fundingInterval,
            newFundingRateFactor,
            newStableFundingRateFactor
        );
    }

    // ─── Views ───────────────────────────────────────────────────

    /// @notice Get the long/short imbalance ratio for an asset (in BPS).
    /// Returns > 5000 if long-heavy, < 5000 if short-heavy.
    function getLongShortRatio(bytes32 assetId) external view returns (uint256 longRatioBps) {
        address token = assetTokens[assetId];
        if (token == address(0)) return 5000;

        uint256 poolAmount = gmxVault.poolAmounts(token);
        uint256 reservedAmount = gmxVault.reservedAmounts(token);
        uint256 globalShortSize = gmxVault.globalShortSizes(token);

        uint256 longSize = reservedAmount;
        uint256 totalSize = longSize + globalShortSize;

        if (totalSize == 0) return 5000;

        longRatioBps = (longSize * BPS) / totalSize;
    }

    /// @notice Get current funding rate from GMX vault for a token.
    function getCurrentFundingRate(address token) external view returns (uint256) {
        return gmxVault.cumulativeFundingRates(token);
    }

    function getNextFundingRate(address token) external view returns (uint256) {
        return gmxVault.getNextFundingRate(token);
    }

    // ─── Internal ────────────────────────────────────────────────

    function _calculateFundingRateFactor(bytes32 assetId) internal view returns (uint256) {
        address token = assetTokens[assetId];
        if (token == address(0)) return defaultBaseFundingRateFactor;

        FundingConfig memory cfg = fundingConfigs[assetId];
        uint256 baseFactor = cfg.configured ? cfg.baseFundingRateFactor : defaultBaseFundingRateFactor;
        uint256 maxFactor = cfg.configured ? cfg.maxFundingRateFactor : defaultMaxFundingRateFactor;
        uint256 threshold = cfg.configured ? cfg.imbalanceThresholdBps : 2000; // default 20%

        uint256 reservedAmount = gmxVault.reservedAmounts(token);
        uint256 globalShortSize = gmxVault.globalShortSizes(token);

        uint256 longSize = reservedAmount;
        uint256 totalSize = longSize + globalShortSize;

        if (totalSize == 0) return baseFactor;

        // Calculate imbalance: |longSize - shortSize| / totalSize
        uint256 imbalance;
        if (longSize > globalShortSize) {
            imbalance = ((longSize - globalShortSize) * BPS) / totalSize;
        } else {
            imbalance = ((globalShortSize - longSize) * BPS) / totalSize;
        }

        if (imbalance <= threshold) return baseFactor;

        // Scale funding rate linearly with imbalance above threshold
        uint256 excessImbalance = imbalance - threshold;
        uint256 maxExcess = BPS - threshold;

        uint256 scaledFactor = baseFactor + ((maxFactor - baseFactor) * excessImbalance) / maxExcess;

        return scaledFactor > maxFactor ? maxFactor : scaledFactor;
    }
}
