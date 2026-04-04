// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IOracleAdapter} from "./interfaces/IOracleAdapter.sol";

/// @title PricingEngine
/// @notice Enforces: executionPrice = oraclePrice + deterministic slippage.
/// @dev Slippage scales with `sizeDelta / availableLiquidity` and caps at per-asset or default max impact.
/// Longs pay a higher price; shorts a lower. Reverts if oracle reports stale for the asset.
contract PricingEngine is Ownable {
    /// @notice Oracle price scale (1e30).
    uint256 public constant PRICE_PRECISION = 1e30;
    /// @notice Basis points denominator.
    uint256 public constant BPS = 10_000;
    /// @notice Hard cap on configured max impact (10%).
    uint256 public constant MAX_IMPACT_BPS = 1_000;

    /// @notice Oracle for mid prices and staleness.
    IOracleAdapter public oracleAdapter;

    /// @notice Per-asset impact curve.
    /// @param impactFactorBps Multiplier in BPS applied to size/liquidity ratio.
    /// @param maxImpactBps Ceiling on total impact in BPS.
    /// @param configured True after `configureAssetImpact`.
    struct ImpactConfig {
        uint256 impactFactorBps;
        uint256 maxImpactBps;
        bool configured;
    }

    mapping(bytes32 => ImpactConfig) public impactConfigs;

    /// @notice Defaults when no per-asset config.
    uint256 public defaultImpactFactorBps;
    uint256 public defaultMaxImpactBps;

    event ImpactConfigured(bytes32 indexed assetId, uint256 impactFactorBps, uint256 maxImpactBps);
    event DefaultImpactUpdated(uint256 impactFactorBps, uint256 maxImpactBps);

    /// @notice `getExecutionPrice` when `oracleAdapter.isStale(assetId)`.
    error StaleOraclePrice(bytes32 assetId);

    /// @param _oracleAdapter Oracle adapter.
    /// @param _owner Owner.
    constructor(address _oracleAdapter, address _owner) Ownable(_owner) {
        oracleAdapter = IOracleAdapter(_oracleAdapter);
        defaultImpactFactorBps = 30; // 0.3% base impact factor
        defaultMaxImpactBps = 500; // 5% max impact
    }

    // ─── Configuration ───────────────────────────────────────────

    /// @notice Replace oracle adapter reference.
    /// @param _oracleAdapter New adapter (nonzero).
    function setOracleAdapter(address _oracleAdapter) external onlyOwner {
        require(_oracleAdapter != address(0), "Invalid oracle");
        oracleAdapter = IOracleAdapter(_oracleAdapter);
    }

    /// @notice Set impact parameters for an asset.
    /// @param assetId Asset id.
    /// @param impactFactorBps Size/liquidity scaling factor in BPS.
    /// @param maxImpactBps Max impact BPS (must be <= `MAX_IMPACT_BPS`).
    function configureAssetImpact(bytes32 assetId, uint256 impactFactorBps, uint256 maxImpactBps) external onlyOwner {
        require(maxImpactBps <= MAX_IMPACT_BPS, "Max impact too high");

        impactConfigs[assetId] =
            ImpactConfig({impactFactorBps: impactFactorBps, maxImpactBps: maxImpactBps, configured: true});

        emit ImpactConfigured(assetId, impactFactorBps, maxImpactBps);
    }

    /// @notice Defaults for assets without `configureAssetImpact`.
    /// @param impactFactorBps Default factor BPS.
    /// @param maxImpactBps Default max impact BPS (<= `MAX_IMPACT_BPS`).
    function setDefaultImpact(uint256 impactFactorBps, uint256 maxImpactBps) external onlyOwner {
        require(maxImpactBps <= MAX_IMPACT_BPS, "Max impact too high");
        defaultImpactFactorBps = impactFactorBps;
        defaultMaxImpactBps = maxImpactBps;
        emit DefaultImpactUpdated(impactFactorBps, maxImpactBps);
    }

    // ─── Pricing ─────────────────────────────────────────────────

    /// @notice Get execution price for a trade with deterministic slippage.
    /// @param assetId The asset being traded
    /// @param sizeDelta The notional size of the trade
    /// @param availableLiquidity Total pool liquidity available for this asset
    /// @param isLong Whether this is a long position (buy = worse price up)
    /// @return executionPrice The price including slippage
    function getExecutionPrice(bytes32 assetId, uint256 sizeDelta, uint256 availableLiquidity, bool isLong)
        external
        view
        returns (uint256 executionPrice)
    {
        if (oracleAdapter.isStale(assetId)) revert StaleOraclePrice(assetId);

        (uint256 oraclePrice,) = oracleAdapter.getPrice(assetId);
        uint256 impact = _calculateImpact(assetId, sizeDelta, availableLiquidity);

        if (isLong) {
            // Longs pay more (price moves up)
            executionPrice = oraclePrice + ((oraclePrice * impact) / BPS);
        } else {
            // Shorts receive less (price moves down)
            executionPrice = oraclePrice - ((oraclePrice * impact) / BPS);
        }
    }

    /// @notice Passthrough oracle mid; does not check staleness (caller may use `isStale` separately).
    /// @param assetId Asset id.
    /// @return price Normalized price.
    /// @return timestamp Update time.
    function getOraclePrice(bytes32 assetId) external view returns (uint256 price, uint256 timestamp) {
        return oracleAdapter.getPrice(assetId);
    }

    /// @notice Impact in BPS for a hypothetical trade (same formula as execution path).
    /// @param assetId Asset id (selects configured or default factors).
    /// @param sizeDelta Notional size.
    /// @param availableLiquidity Pool depth divisor (e.g. GMX USDC pool amount).
    /// @return impactBps Capped impact in basis points.
    function calculateImpact(bytes32 assetId, uint256 sizeDelta, uint256 availableLiquidity)
        external
        view
        returns (uint256)
    {
        return _calculateImpact(assetId, sizeDelta, availableLiquidity);
    }

    // ─── Internal ────────────────────────────────────────────────

    /// @dev impact = min(sizeDelta / availableLiquidity * impactFactor, maxImpact)
    function _calculateImpact(bytes32 assetId, uint256 sizeDelta, uint256 availableLiquidity)
        internal
        view
        returns (uint256)
    {
        if (availableLiquidity == 0 || sizeDelta == 0) return 0;

        ImpactConfig memory cfg = impactConfigs[assetId];
        uint256 factorBps = cfg.configured ? cfg.impactFactorBps : defaultImpactFactorBps;
        uint256 maxBps = cfg.configured ? cfg.maxImpactBps : defaultMaxImpactBps;

        // impact = (sizeDelta * factorBps) / availableLiquidity
        uint256 impact = (sizeDelta * factorBps) / availableLiquidity;

        return impact > maxBps ? maxBps : impact;
    }
}
