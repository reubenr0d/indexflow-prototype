// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IGMXVault
/// @notice 0.8.24 interface mirroring the external functions of the forked GMX Vault.sol (0.6.12)
/// for ABI-compatible cross-version calls.
interface IGMXVault {
    function isInitialized() external view returns (bool);
    function isSwapEnabled() external view returns (bool);
    function isLeverageEnabled() external view returns (bool);

    function router() external view returns (address);
    function usdg() external view returns (address);
    function gov() external view returns (address);
    function priceFeed() external view returns (address);

    function maxLeverage() external view returns (uint256);
    function fundingInterval() external view returns (uint256);
    function fundingRateFactor() external view returns (uint256);
    function stableFundingRateFactor() external view returns (uint256);

    function liquidationFeeUsd() external view returns (uint256);
    function marginFeeBasisPoints() external view returns (uint256);

    // ─── Initialization & Configuration ──────────────────────────

    function initialize(
        address _router,
        address _usdg,
        address _priceFeed,
        uint256 _liquidationFeeUsd,
        uint256 _fundingRateFactor,
        uint256 _stableFundingRateFactor
    ) external;

    function setVaultUtils(address _vaultUtils) external;
    function setGov(address _gov) external;
    function setPriceFeed(address _priceFeed) external;
    function setErrorController(address _errorController) external;
    function setError(uint256 _errorCode, string calldata _error) external;

    function setTokenConfig(
        address _token,
        uint256 _tokenDecimals,
        uint256 _tokenWeight,
        uint256 _minProfitBps,
        uint256 _maxUsdgAmount,
        bool _isStable,
        bool _isShortable
    ) external;

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

    function setMaxLeverage(uint256 _maxLeverage) external;
    function setInManagerMode(bool _inManagerMode) external;
    function setIsLeverageEnabled(bool _isLeverageEnabled) external;
    function setIsSwapEnabled(bool _isSwapEnabled) external;

    function setManager(address _manager, bool _isManager) external;
    function isManager(address _account) external view returns (bool);

    function addRouter(address _router) external;
    function removeRouter(address _router) external;
    function approvedRouters(address _account, address _router) external view returns (bool);

    function setMaxGlobalShortSize(address _token, uint256 _amount) external;

    // ─── Funding Rate ─────────────────────────────────────────────

    function setFundingRate(
        uint256 _fundingInterval,
        uint256 _fundingRateFactor,
        uint256 _stableFundingRateFactor
    ) external;

    function lastFundingTimes(address _token) external view returns (uint256);
    function cumulativeFundingRates(address _token) external view returns (uint256);
    function getNextFundingRate(address _token) external view returns (uint256);

    // ─── Position Operations ──────────────────────────────────────

    function increasePosition(
        address _account,
        address _collateralToken,
        address _indexToken,
        uint256 _sizeDelta,
        bool _isLong
    ) external;

    function decreasePosition(
        address _account,
        address _collateralToken,
        address _indexToken,
        uint256 _collateralDelta,
        uint256 _sizeDelta,
        bool _isLong,
        address _receiver
    ) external returns (uint256);

    function liquidatePosition(
        address _account,
        address _collateralToken,
        address _indexToken,
        bool _isLong,
        address _feeReceiver
    ) external;

    // ─── Position Queries ─────────────────────────────────────────

    function getPosition(
        address _account,
        address _collateralToken,
        address _indexToken,
        bool _isLong
    ) external view returns (
        uint256 size,
        uint256 collateral,
        uint256 averagePrice,
        uint256 entryFundingRate,
        uint256 reserveAmount,
        uint256 realisedPnl,
        bool hasRealisedProfit,
        uint256 lastIncreasedTime
    );

    function getPositionDelta(
        address _account,
        address _collateralToken,
        address _indexToken,
        bool _isLong
    ) external view returns (bool hasProfit, uint256 delta);

    function getDelta(
        address _indexToken,
        uint256 _size,
        uint256 _averagePrice,
        bool _isLong,
        uint256 _lastIncreasedTime
    ) external view returns (bool hasProfit, uint256 delta);

    function validateLiquidation(
        address _account,
        address _collateralToken,
        address _indexToken,
        bool _isLong,
        bool _raise
    ) external view returns (uint256, uint256);

    function getPositionKey(
        address _account,
        address _collateralToken,
        address _indexToken,
        bool _isLong
    ) external pure returns (bytes32);

    function getPositionLeverage(
        address _account,
        address _collateralToken,
        address _indexToken,
        bool _isLong
    ) external view returns (uint256);

    // ─── Pool State ───────────────────────────────────────────────

    function poolAmounts(address _token) external view returns (uint256);
    function reservedAmounts(address _token) external view returns (uint256);
    function guaranteedUsd(address _token) external view returns (uint256);
    function globalShortSizes(address _token) external view returns (uint256);
    function globalShortAveragePrices(address _token) external view returns (uint256);
    function feeReserves(address _token) external view returns (uint256);
    function tokenBalances(address _token) external view returns (uint256);
    function usdgAmounts(address _token) external view returns (uint256);

    // ─── Pricing ──────────────────────────────────────────────────

    function getMaxPrice(address _token) external view returns (uint256);
    function getMinPrice(address _token) external view returns (uint256);
    function tokenToUsdMin(address _token, uint256 _tokenAmount) external view returns (uint256);

    // ─── Liquidity ────────────────────────────────────────────────

    function directPoolDeposit(address _token) external;
    function buyUSDG(address _token, address _receiver) external returns (uint256);
    function sellUSDG(address _token, address _receiver) external returns (uint256);

    // ─── Token Config Queries ─────────────────────────────────────

    function whitelistedTokens(address _token) external view returns (bool);
    function tokenDecimals(address _token) external view returns (uint256);
    function stableTokens(address _token) external view returns (bool);
    function shortableTokens(address _token) external view returns (bool);
    function allWhitelistedTokensLength() external view returns (uint256);
    function allWhitelistedTokens(uint256 _index) external view returns (address);
}
