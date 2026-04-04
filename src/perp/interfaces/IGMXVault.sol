// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IGMXVault
/// @notice 0.8.24 interface mirroring the external functions of the forked GMX Vault.sol (0.6.12)
/// for ABI-compatible cross-version calls.
/// @dev Notices below are minimal; see upstream GMX v1 docs for full semantics. Used heavily by `VaultAccounting`, `FundingRateManager`, and `PerpReader`.
interface IGMXVault {
    /// @notice Whether core initialization has run.
    function isInitialized() external view returns (bool);
    /// @notice Global swap toggle.
    function isSwapEnabled() external view returns (bool);
    /// @notice Global leverage toggle.
    function isLeverageEnabled() external view returns (bool);

    /// @notice GMX router address.
    function router() external view returns (address);
    /// @notice USDG token address.
    function usdg() external view returns (address);
    /// @notice Governance address.
    function gov() external view returns (address);
    /// @notice Price feed (e.g. `SimplePriceFeed`) used for GMX pricing.
    function priceFeed() external view returns (address);

    /// @notice Max leverage parameter.
    function maxLeverage() external view returns (uint256);
    /// @notice Funding update interval (seconds).
    function fundingInterval() external view returns (uint256);
    /// @notice Base funding rate factor (non-stable).
    function fundingRateFactor() external view returns (uint256);
    /// @notice Stable funding rate factor.
    function stableFundingRateFactor() external view returns (uint256);

    /// @notice Liquidation fee in USD units.
    function liquidationFeeUsd() external view returns (uint256);
    /// @notice Margin fee in basis points.
    function marginFeeBasisPoints() external view returns (uint256);

    // ─── Initialization & Configuration ──────────────────────────

    /// @notice One-time vault initialization (GMX admin).
    function initialize(
        address _router,
        address _usdg,
        address _priceFeed,
        uint256 _liquidationFeeUsd,
        uint256 _fundingRateFactor,
        uint256 _stableFundingRateFactor
    ) external;

    /// @notice Set vault utils contract.
    function setVaultUtils(address _vaultUtils) external;
    /// @notice Transfer governance.
    function setGov(address _gov) external;
    /// @notice Update price feed contract.
    function setPriceFeed(address _priceFeed) external;
    /// @notice Set error controller.
    function setErrorController(address _errorController) external;
    /// @notice Register error string by code.
    function setError(uint256 _errorCode, string calldata _error) external;

    /// @notice Configure a whitelisted pool token.
    function setTokenConfig(
        address _token,
        uint256 _tokenDecimals,
        uint256 _tokenWeight,
        uint256 _minProfitBps,
        uint256 _maxUsdgAmount,
        bool _isStable,
        bool _isShortable
    ) external;

    /// @notice Update fee parameters.
    function setFees(
        uint256 _taxBasisPoints,
        uint256 _stableTaxBasisPoints,
        uint256 _mintBurnFeeBasisPoints,
        uint256 _swapFeeBasisPoints,
        uint256 _stableSwapFeeBasisPoints,
        uint256 _marginFeeBasisPoints,
        uint256 _liquidationFeeUsd,
        uint256 _minProfitTime,
        bool _hasDynamicFees
    ) external;

    /// @notice Update max leverage.
    function setMaxLeverage(uint256 _maxLeverage) external;
    /// @notice Toggle manager-only mode.
    function setInManagerMode(bool _inManagerMode) external;
    /// @notice Enable or disable leverage.
    function setIsLeverageEnabled(bool _isLeverageEnabled) external;
    /// @notice Enable or disable swaps.
    function setIsSwapEnabled(bool _isSwapEnabled) external;

    /// @notice Grant or revoke manager role.
    function setManager(address _manager, bool _isManager) external;
    /// @notice Whether account is manager.
    function isManager(address _account) external view returns (bool);

    /// @notice Whitelist a router.
    function addRouter(address _router) external;
    /// @notice Remove router whitelist entry.
    function removeRouter(address _router) external;
    /// @notice Whether router is approved for account.
    function approvedRouters(address _account, address _router) external view returns (bool);

    /// @notice Cap global short size for a token.
    function setMaxGlobalShortSize(address _token, uint256 _amount) external;

    // ─── Funding Rate ─────────────────────────────────────────────

    /// @notice Update funding interval and factors (`FundingRateManager` calls this).
    function setFundingRate(uint256 _fundingInterval, uint256 _fundingRateFactor, uint256 _stableFundingRateFactor)
        external;

    /// @notice Last funding update time per token.
    function lastFundingTimes(address _token) external view returns (uint256);
    /// @notice Cumulative funding rate per token.
    function cumulativeFundingRates(address _token) external view returns (uint256);
    /// @notice Projected next funding rate sample.
    function getNextFundingRate(address _token) external view returns (uint256);

    // ─── Position Operations ──────────────────────────────────────

    /// @notice Increase position size for `account` (`VaultAccounting` passes itself as account).
    function increasePosition(
        address _account,
        address _collateralToken,
        address _indexToken,
        uint256 _sizeDelta,
        bool _isLong
    ) external;

    /// @notice Decrease position; sends PnL/collateral to `_receiver`.
    function decreasePosition(
        address _account,
        address _collateralToken,
        address _indexToken,
        uint256 _collateralDelta,
        uint256 _sizeDelta,
        bool _isLong,
        address _receiver
    ) external returns (uint256);

    /// @notice Liquidate an underwater position.
    function liquidatePosition(
        address _account,
        address _collateralToken,
        address _indexToken,
        bool _isLong,
        address _feeReceiver
    ) external;

    // ─── Position Queries ─────────────────────────────────────────

    /// @notice Read stored position fields for a trader leg.
    function getPosition(address _account, address _collateralToken, address _indexToken, bool _isLong)
        external
        view
        returns (
            uint256 size,
            uint256 collateral,
            uint256 averagePrice,
            uint256 entryFundingRate,
            uint256 reserveAmount,
            uint256 realisedPnl,
            bool hasRealisedProfit,
            uint256 lastIncreasedTime
        );

    /// @notice Mark-to-market PnL delta for an open leg (`VaultAccounting` aggregates this).
    function getPositionDelta(address _account, address _collateralToken, address _indexToken, bool _isLong)
        external
        view
        returns (bool hasProfit, uint256 delta);

    /// @notice PnL delta from size, entry, and side (`PerpReader` helper).
    function getDelta(
        address _indexToken,
        uint256 _size,
        uint256 _averagePrice,
        bool _isLong,
        uint256 _lastIncreasedTime
    ) external view returns (bool hasProfit, uint256 delta);

    /// @notice Check liquidation eligibility; optional revert when `_raise`.
    function validateLiquidation(
        address _account,
        address _collateralToken,
        address _indexToken,
        bool _isLong,
        bool _raise
    ) external view returns (uint256, uint256);

    /// @notice Deterministic id for a GMX position tuple.
    function getPositionKey(address _account, address _collateralToken, address _indexToken, bool _isLong)
        external
        pure
        returns (bytes32);

    /// @notice Current leverage for a position.
    function getPositionLeverage(address _account, address _collateralToken, address _indexToken, bool _isLong)
        external
        view
        returns (uint256);

    // ─── Pool State ───────────────────────────────────────────────

    /// @notice Pool liquidity amount for token (`FundingRateManager` / `PerpReader` use this).
    function poolAmounts(address _token) external view returns (uint256);
    /// @notice Reserved liquidity (long OI) for token.
    function reservedAmounts(address _token) external view returns (uint256);
    /// @notice Guaranteed USD for pool.
    function guaranteedUsd(address _token) external view returns (uint256);
    /// @notice Aggregate short size for token.
    function globalShortSizes(address _token) external view returns (uint256);
    /// @notice Global short average price.
    function globalShortAveragePrices(address _token) external view returns (uint256);
    /// @notice Fee reserves held in token.
    function feeReserves(address _token) external view returns (uint256);
    /// @notice Token balance in vault contract.
    function tokenBalances(address _token) external view returns (uint256);
    /// @notice USDG debt attributed to token pool.
    function usdgAmounts(address _token) external view returns (uint256);

    // ─── Pricing ──────────────────────────────────────────────────

    /// @notice Ask-side index price from feed.
    function getMaxPrice(address _token) external view returns (uint256);
    /// @notice Bid-side index price from feed.
    function getMinPrice(address _token) external view returns (uint256);
    /// @notice Convert token amount to USD at min price.
    function tokenToUsdMin(address _token, uint256 _tokenAmount) external view returns (uint256);

    // ─── Liquidity ────────────────────────────────────────────────

    /// @notice LP deposit path into pool.
    function directPoolDeposit(address _token) external;
    /// @notice Mint USDG with token.
    function buyUSDG(address _token, address _receiver) external returns (uint256);
    /// @notice Redeem USDG to token.
    function sellUSDG(address _token, address _receiver) external returns (uint256);

    // ─── Token Config Queries ─────────────────────────────────────

    /// @notice Whether token is whitelisted.
    function whitelistedTokens(address _token) external view returns (bool);
    /// @notice Configured decimals for token.
    function tokenDecimals(address _token) external view returns (uint256);
    /// @notice Whether token is stablecoin class.
    function stableTokens(address _token) external view returns (bool);
    /// @notice Whether token is shortable.
    function shortableTokens(address _token) external view returns (bool);
    /// @notice Count of whitelisted tokens.
    function allWhitelistedTokensLength() external view returns (uint256);
    /// @notice Whitelisted token by index.
    function allWhitelistedTokens(uint256 _index) external view returns (address);
}
