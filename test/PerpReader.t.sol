// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {PerpReader} from "../src/perp/PerpReader.sol";
import {BasketVault} from "../src/vault/BasketVault.sol";
import {MockUSDC} from "../src/vault/MockUSDC.sol";
import {IOracleAdapter} from "../src/perp/interfaces/IOracleAdapter.sol";
import {IPerp} from "../src/perp/interfaces/IPerp.sol";

contract MockPerpAccountingReader is IPerp {
    mapping(address => VaultState) internal _state;
    mapping(address => int256) internal _unrealised;
    mapping(address => int256) internal _realised;

    function setState(address vault, VaultState memory state_, int256 unrealised_, int256 realised_) external {
        _state[vault] = state_;
        _unrealised[vault] = unrealised_;
        _realised[vault] = realised_;
    }

    function getVaultState(address vault) external view returns (VaultState memory state) {
        return _state[vault];
    }

    function getVaultPnL(address vault) external view returns (int256 unrealised, int256 realised) {
        return (_unrealised[vault], _realised[vault]);
    }

    function depositCapital(address, uint256) external {}
    function withdrawCapital(address, uint256) external {}
    function openPosition(address, bytes32, bool, uint256, uint256) external {}
    function closePosition(address, bytes32, bool, uint256, uint256) external {}
    function registerVault(address) external {}

    function isVaultRegistered(address) external pure returns (bool) {
        return true;
    }
}

contract MockOracleAdapterReader is IOracleAdapter {
    mapping(bytes32 => PriceData) internal _prices;
    mapping(bytes32 => bool) internal _stale;
    mapping(bytes32 => bool) internal _active;
    mapping(bytes32 => AssetConfig) internal _config;

    function setAsset(bytes32 assetId, uint256 price, uint256 timestamp, bool stale_, bool active_) external {
        _prices[assetId] = PriceData(price, timestamp);
        _stale[assetId] = stale_;
        _active[assetId] = active_;
        _config[assetId] = AssetConfig(address(0), FeedType.CustomRelayer, 3600, 5000, 8, active_);
    }

    function getPrice(bytes32 assetId) external view returns (uint256 price, uint256 timestamp) {
        PriceData memory p = _prices[assetId];
        return (p.price, p.timestamp);
    }

    function getPrices(bytes32[] calldata assetIds) external view returns (PriceData[] memory out) {
        out = new PriceData[](assetIds.length);
        for (uint256 i = 0; i < assetIds.length; i++) {
            out[i] = _prices[assetIds[i]];
        }
    }

    function isStale(bytes32 assetId) external view returns (bool) {
        return _stale[assetId];
    }

    function isAssetActive(bytes32 assetId) external view returns (bool) {
        return _active[assetId];
    }

    function getAssetConfig(bytes32 assetId) external view returns (AssetConfig memory cfg) {
        return _config[assetId];
    }
}

contract MockGMXReader {
    uint256 public poolAmount;
    uint256 public reservedAmount;
    uint256 public globalShortSize;
    uint256 public guaranteed;

    uint256 public posSize;
    uint256 public posCollateral;
    uint256 public posAvg;
    uint256 public posEntryFunding;
    uint256 public posReserve;
    uint256 public posRealised;
    bool public posHasRealisedProfit;
    uint256 public posLastIncreased;

    bool public deltaHasProfit;
    uint256 public deltaValue;

    function setPool(uint256 pool_, uint256 reserved_, uint256 short_, uint256 guaranteed_) external {
        poolAmount = pool_;
        reservedAmount = reserved_;
        globalShortSize = short_;
        guaranteed = guaranteed_;
    }

    function setPosition(
        uint256 size,
        uint256 collateral,
        uint256 averagePrice,
        uint256 entryFundingRate,
        uint256 reserve,
        uint256 realised,
        bool hasRealisedProfit,
        uint256 lastIncreasedTime
    ) external {
        posSize = size;
        posCollateral = collateral;
        posAvg = averagePrice;
        posEntryFunding = entryFundingRate;
        posReserve = reserve;
        posRealised = realised;
        posHasRealisedProfit = hasRealisedProfit;
        posLastIncreased = lastIncreasedTime;
    }

    function setDelta(bool hasProfit, uint256 delta) external {
        deltaHasProfit = hasProfit;
        deltaValue = delta;
    }

    function poolAmounts(address) external view returns (uint256) {
        return poolAmount;
    }

    function reservedAmounts(address) external view returns (uint256) {
        return reservedAmount;
    }

    function globalShortSizes(address) external view returns (uint256) {
        return globalShortSize;
    }

    function guaranteedUsd(address) external view returns (uint256) {
        return guaranteed;
    }

    function getPosition(address, address, address, bool)
        external
        view
        returns (uint256, uint256, uint256, uint256, uint256, uint256, bool, uint256)
    {
        return (
            posSize,
            posCollateral,
            posAvg,
            posEntryFunding,
            posReserve,
            posRealised,
            posHasRealisedProfit,
            posLastIncreased
        );
    }

    function getDelta(address, uint256, uint256, bool, uint256) external view returns (bool, uint256) {
        return (deltaHasProfit, deltaValue);
    }
}

contract PerpReaderTest is Test {
    bytes32 internal constant ASSET = keccak256("XAU");

    MockUSDC internal usdc;
    MockOracleAdapterReader internal oracle;
    MockPerpAccountingReader internal perp;
    MockGMXReader internal gmx;
    BasketVault internal basket;
    PerpReader internal reader;

    function setUp() public {
        usdc = new MockUSDC();
        oracle = new MockOracleAdapterReader();
        perp = new MockPerpAccountingReader();
        gmx = new MockGMXReader();

        reader = new PerpReader(address(gmx), address(oracle), address(perp));
        basket = new BasketVault("Alpha", address(usdc), address(oracle), address(this));

        oracle.setAsset(ASSET, 2000e30, block.timestamp, false, true);

        bytes32[] memory assets = new bytes32[](1);
        assets[0] = ASSET;
        basket.setAssets(assets);

        usdc.mint(address(this), 1_000_000e6);
        usdc.approve(address(basket), type(uint256).max);
        basket.deposit(100_000e6);

        IPerp.VaultState memory s = IPerp.VaultState({
            depositedCapital: 10_000e6,
            realisedPnL: 123e6,
            openInterest: 77,
            collateralLocked: 55,
            positionCount: 2,
            registered: true
        });
        perp.setState(address(basket), s, 500e6, 123e6);

        gmx.setPool(1_000_000e6, 250_000e6, 100_000e6, 50_000e30);
        gmx.setPosition(11, 22, 33, 44, 55, 66, true, 77);
        gmx.setDelta(true, 88);
    }

    function test_getBasketInfo_single_and_batch() public view {
        PerpReader.BasketInfo memory single = reader.getBasketInfo(address(basket));
        assertEq(single.vault, address(basket));
        assertEq(single.shareToken, address(basket.shareToken()));
        assertEq(single.totalSupply, basket.shareToken().totalSupply());
        assertEq(single.usdcBalance, usdc.balanceOf(address(basket)));
        assertEq(single.assetCount, 1);

        address[] memory vaults = new address[](1);
        vaults[0] = address(basket);
        PerpReader.BasketInfo[] memory batch = reader.getBasketInfoBatch(vaults);
        assertEq(batch.length, 1);
        assertEq(batch[0].vault, single.vault);
        assertEq(batch[0].sharePrice, single.sharePrice);
    }

    function test_vault_accounting_passthrough_and_total_value() public {
        IPerp.VaultState memory s = reader.getVaultState(address(basket));
        assertEq(s.depositedCapital, 10_000e6);
        assertEq(s.realisedPnL, 123e6);

        (int256 unrealised, int256 realised) = reader.getVaultPnL(address(basket));
        assertEq(unrealised, 500e6);
        assertEq(realised, 123e6);

        uint256 total = reader.getTotalVaultValue(address(basket));
        assertEq(total, usdc.balanceOf(address(basket)) + uint256(unrealised + realised));

        IPerp.VaultState memory zero;
        perp.setState(address(basket), zero, -1_000_000_000_000e6, -1_000_000_000_000e6);
        assertEq(reader.getTotalVaultValue(address(basket)), 0, "floors negative values at zero");
    }

    function test_oracle_views() public view {
        (uint256 price, uint256 ts) = reader.getOraclePrice(ASSET);
        assertEq(price, 2000e30);
        assertEq(ts, block.timestamp);

        bytes32[] memory ids = new bytes32[](1);
        ids[0] = ASSET;
        IOracleAdapter.PriceData[] memory prices = reader.getOraclePrices(ids);
        assertEq(prices.length, 1);
        assertEq(prices[0].price, 2000e30);

        assertFalse(reader.isOracleStale(ASSET));
    }

    function test_pool_and_gmx_position_views() public view {
        PerpReader.PoolUtilization memory util = reader.getPoolUtilization(address(0xABCD));
        assertEq(util.poolAmount, 1_000_000e6);
        assertEq(util.reservedAmount, 250_000e6);
        assertEq(util.globalShortSize, 100_000e6);
        assertEq(util.utilizationBps, 2500);

        (
            uint256 size,
            uint256 collateral,
            uint256 avg,
            uint256 entryFunding,
            uint256 reserve,
            uint256 realisedPnl,
            bool hasRealised,
            uint256 t
        ) = reader.getGMXPosition(address(this), address(usdc), address(0xABCD), true);
        assertEq(size, 11);
        assertEq(collateral, 22);
        assertEq(avg, 33);
        assertEq(entryFunding, 44);
        assertEq(reserve, 55);
        assertEq(realisedPnl, 66);
        assertTrue(hasRealised);
        assertEq(t, 77);

        (bool hasProfit, uint256 delta) = reader.getGMXPositionDelta(address(0xABCD), size, avg, true, t);
        assertTrue(hasProfit);
        assertEq(delta, 88);
    }
}
