// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IOracleAdapter} from "./interfaces/IOracleAdapter.sol";

/// @title PricingEngine
/// @notice Enforces: executionPrice = oraclePrice + deterministic slippage.
/// Slippage is size-based and proportional to trade size / available liquidity.
/// No AMM curves, no TWAP drift, no virtual liquidity.
contract PricingEngine is Ownable {
    uint256 public constant PRICE_PRECISION = 1e30;
    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_IMPACT_BPS = 1_000; // 10% max price impact

    IOracleAdapter public oracleAdapter;

    /// @notice Per-asset impact configuration
    struct ImpactConfig {
        uint256 impactFactorBps;
        uint256 maxImpactBps;
        bool configured;
    }

    mapping(bytes32 => ImpactConfig) public impactConfigs;

    uint256 public defaultImpactFactorBps;
    uint256 public defaultMaxImpactBps;

    event ImpactConfigured(bytes32 indexed assetId, uint256 impactFactorBps, uint256 maxImpactBps);
    event DefaultImpactUpdated(uint256 impactFactorBps, uint256 maxImpactBps);

    error StaleOraclePrice(bytes32 assetId);

    constructor(
        address _oracleAdapter,
        address _owner
    ) Ownable(_owner) {
        oracleAdapter = IOracleAdapter(_oracleAdapter);
        defaultImpactFactorBps = 30; // 0.3% base impact factor
        defaultMaxImpactBps = 500; // 5% max impact
    }

    // ─── Configuration ───────────────────────────────────────────

    function setOracleAdapter(address _oracleAdapter) external onlyOwner {
        require(_oracleAdapter != address(0), "Invalid oracle");
        oracleAdapter = IOracleAdapter(_oracleAdapter);
    }

    function configureAssetImpact(
        bytes32 assetId,
        uint256 impactFactorBps,
        uint256 maxImpactBps
    ) external onlyOwner {
        require(maxImpactBps <= MAX_IMPACT_BPS, "Max impact too high");

        impactConfigs[assetId] = ImpactConfig({
            impactFactorBps: impactFactorBps,
            maxImpactBps: maxImpactBps,
            configured: true
        });

        emit ImpactConfigured(assetId, impactFactorBps, maxImpactBps);
    }

    function setDefaultImpact(
        uint256 impactFactorBps,
        uint256 maxImpactBps
    ) external onlyOwner {
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
    function getExecutionPrice(
        bytes32 assetId,
        uint256 sizeDelta,
        uint256 availableLiquidity,
        bool isLong
    ) external view returns (uint256 executionPrice) {
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

    /// @notice Get the raw oracle price without any slippage.
    function getOraclePrice(bytes32 assetId) external view returns (uint256 price, uint256 timestamp) {
        return oracleAdapter.getPrice(assetId);
    }

    /// @notice Calculate the price impact for a given trade size and liquidity.
    function calculateImpact(
        bytes32 assetId,
        uint256 sizeDelta,
        uint256 availableLiquidity
    ) external view returns (uint256) {
        return _calculateImpact(assetId, sizeDelta, availableLiquidity);
    }

    // ─── Internal ────────────────────────────────────────────────

    /// @dev impact = min(sizeDelta / availableLiquidity * impactFactor, maxImpact)
    function _calculateImpact(
        bytes32 assetId,
        uint256 sizeDelta,
        uint256 availableLiquidity
    ) internal view returns (uint256) {
        if (availableLiquidity == 0 || sizeDelta == 0) return 0;

        ImpactConfig memory cfg = impactConfigs[assetId];
        uint256 factorBps = cfg.configured ? cfg.impactFactorBps : defaultImpactFactorBps;
        uint256 maxBps = cfg.configured ? cfg.maxImpactBps : defaultMaxImpactBps;

        // impact = (sizeDelta * factorBps) / availableLiquidity
        uint256 impact = (sizeDelta * factorBps) / availableLiquidity;

        return impact > maxBps ? maxBps : impact;
    }
}
