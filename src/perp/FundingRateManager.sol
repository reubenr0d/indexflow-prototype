// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IGMXVault} from "./interfaces/IGMXVault.sol";
import {IOracleAdapter} from "./interfaces/IOracleAdapter.sol";

/// @title FundingRateManager
/// @notice Manages funding rate configuration for the GMX-derived perp vault.
/// @dev Adapts GMX utilization-style funding by letting keepers push new `fundingRateFactor` values via
/// `gmxVault.setFundingRate`. Off-chain or owner-configured per-asset curves use pool long/short imbalance
/// (`reservedAmounts` vs `globalShortSizes`). GMX still applies `fundingRateFactor` in `getNextFundingRate`.
contract FundingRateManager is Ownable {
    /// @notice Basis points scale for imbalance ratios.
    uint256 public constant BPS = 10_000;
    /// @notice Precision constant reserved for future use / parity with GMX naming.
    uint256 public constant FUNDING_RATE_PRECISION = 1_000_000;

    /// @notice GMX core vault.
    IGMXVault public gmxVault;
    /// @notice Oracle adapter (policy hook; imbalance math uses GMX pool state today).
    IOracleAdapter public oracleAdapter;

    /// @notice Per-asset funding configuration for imbalance scaling.
    /// @param baseFundingRateFactor Factor when imbalance is below threshold.
    /// @param maxFundingRateFactor Ceiling factor at max imbalance.
    /// @param imbalanceThresholdBps Imbalance below this uses `baseFundingRateFactor`.
    /// @param configured True once owner sets `configureFunding`.
    struct FundingConfig {
        uint256 baseFundingRateFactor;
        uint256 maxFundingRateFactor;
        uint256 imbalanceThresholdBps;
        bool configured;
    }

    mapping(bytes32 => FundingConfig) public fundingConfigs;
    /// @notice Maps logical asset id to GMX index token for imbalance reads.
    mapping(bytes32 => address) public assetTokens;

    /// @notice Default base factor when no per-asset config.
    uint256 public defaultBaseFundingRateFactor;
    /// @notice Default max factor when no per-asset config.
    uint256 public defaultMaxFundingRateFactor;
    /// @notice Interval passed to GMX `setFundingRate` (seconds).
    uint256 public fundingInterval;

    /// @notice Addresses allowed to call `updateFundingRate` (owner always allowed).
    mapping(address => bool) public keepers;

    /// @notice Emitted from `configureFunding`.
    event FundingConfigured(bytes32 indexed assetId, uint256 baseFactor, uint256 maxFactor);
    /// @notice Reserved for future on-chain factor push per asset (not emitted in current `updateFundingRate`).
    event FundingRateUpdated(bytes32 indexed assetId, uint256 newFactor);
    /// @notice Emitted when `setFundingInterval` runs.
    event FundingIntervalUpdated(uint256 interval);
    /// @notice Emitted when `setKeeper` runs.
    event KeeperUpdated(address indexed keeper, bool active);

    /// @notice Caller is not keeper or owner.
    error Unauthorized();

    modifier onlyKeeper() {
        if (!keepers[msg.sender] && msg.sender != owner()) revert Unauthorized();
        _;
    }

    /// @param _gmxVault GMX vault.
    /// @param _oracleAdapter Oracle adapter.
    /// @param _owner Owner.
    constructor(address _gmxVault, address _oracleAdapter, address _owner) Ownable(_owner) {
        gmxVault = IGMXVault(_gmxVault);
        oracleAdapter = IOracleAdapter(_oracleAdapter);

        defaultBaseFundingRateFactor = 100;
        defaultMaxFundingRateFactor = 10_000;
        fundingInterval = 1 hours;
    }

    // ─── Configuration ───────────────────────────────────────────

    /// @notice Authorize keeper to call `updateFundingRate`.
    /// @param keeper Address to toggle.
    /// @param active Allowed or not.
    function setKeeper(address keeper, bool active) external onlyOwner {
        keepers[keeper] = active;
        emit KeeperUpdated(keeper, active);
    }

    /// @notice Update funding interval stored locally and used in `updateFundingRate`.
    /// @param _interval Seconds; must be nonzero.
    function setFundingInterval(uint256 _interval) external onlyOwner {
        require(_interval > 0, "Invalid interval");
        fundingInterval = _interval;
        emit FundingIntervalUpdated(_interval);
    }

    /// @notice Defaults used when `fundingConfigs[assetId]` is not configured.
    /// @param baseFactor Default base funding rate factor.
    /// @param maxFactor Default max funding rate factor.
    function setDefaultFunding(uint256 baseFactor, uint256 maxFactor) external onlyOwner {
        defaultBaseFundingRateFactor = baseFactor;
        defaultMaxFundingRateFactor = maxFactor;
    }

    /// @notice Per-asset imbalance curve for `_calculateFundingRateFactor`.
    /// @param assetId Logical asset id.
    /// @param baseFundingRateFactor Factor at low imbalance.
    /// @param maxFundingRateFactor Factor cap at high imbalance.
    /// @param imbalanceThresholdBps Imbalance BPS below which factor stays at base.
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

    /// @notice Bind asset id to GMX index token for imbalance sampling.
    /// @param assetId Logical id.
    /// @param token GMX index token address.
    function mapAssetToken(bytes32 assetId, address token) external onlyOwner {
        require(token != address(0), "Invalid token");
        assetTokens[assetId] = token;
    }

    // ─── Funding Rate Calculation ────────────────────────────────

    /// @notice View-only suggested `fundingRateFactor` from imbalance rules (does not change GMX state).
    /// @param assetId Asset id with optional `fundingConfigs` and `assetTokens` mapping.
    /// @return Factor to pass as `newFundingRateFactor` if policy matches this curve.
    /// @dev Higher imbalance above threshold scales factor up toward max.
    function calculateFundingRateFactor(bytes32 assetId) external view returns (uint256) {
        return _calculateFundingRateFactor(assetId);
    }

    /// @notice Keeper pushes new global funding factors on the GMX vault.
    /// @param newFundingRateFactor GMX `fundingRateFactor` argument.
    /// @param newStableFundingRateFactor GMX `stableFundingRateFactor` argument.
    /// @dev Uses stored `fundingInterval`. GMX applies these in `getNextFundingRate`.
    function updateFundingRate(uint256 newFundingRateFactor, uint256 newStableFundingRateFactor) external onlyKeeper {
        gmxVault.setFundingRate(fundingInterval, newFundingRateFactor, newStableFundingRateFactor);
    }

    // ─── Views ───────────────────────────────────────────────────

    /// @notice Long share of total size = reservedAmounts / (reserved + globalShortSizes), in BPS.
    /// @param assetId Asset id mapped in `assetTokens`.
    /// @return longRatioBps 5000 when unmapped or empty book; above 5000 long-heavy.
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

    /// @notice GMX cumulative funding rate for `token`.
    /// @param token Collateral or index token per GMX API.
    /// @return Stored cumulative rate.
    function getCurrentFundingRate(address token) external view returns (uint256) {
        return gmxVault.cumulativeFundingRates(token);
    }

    /// @notice GMX projected next funding rate sample for `token`.
    /// @param token Token key in GMX.
    /// @return Next rate from `gmxVault.getNextFundingRate`.
    function getNextFundingRate(address token) external view returns (uint256) {
        return gmxVault.getNextFundingRate(token);
    }

    // ─── Internal ────────────────────────────────────────────────

    /// @dev Imbalance-driven factor between configured base and max; uses defaults when unconfigured.
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
