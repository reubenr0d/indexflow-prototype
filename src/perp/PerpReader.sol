// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IGMXVault} from "./interfaces/IGMXVault.sol";
import {IOracleAdapter} from "./interfaces/IOracleAdapter.sol";
import {IPerp} from "./interfaces/IPerp.sol";
import {BasketVault} from "../vault/BasketVault.sol";
import {BasketShareToken} from "../vault/BasketShareToken.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title PerpReader
/// @notice Read-only aggregator for positions, vault PnL, pool utilization, oracle prices,
/// and basket vault state. Designed for off-chain consumption and monitoring.
contract PerpReader {
    uint256 public constant PRICE_PRECISION = 1e30;

    IGMXVault public immutable gmxVault;
    IOracleAdapter public immutable oracleAdapter;
    IPerp public immutable vaultAccounting;

    struct BasketInfo {
        address vault;
        address shareToken;
        string name;
        uint256 basketPrice;
        uint256 sharePrice;
        uint256 totalSupply;
        uint256 usdcBalance;
        uint256 perpAllocated;
        uint256 assetCount;
    }

    struct PositionView {
        address vault;
        bytes32 asset;
        bool isLong;
        uint256 size;
        uint256 collateral;
        uint256 averagePrice;
        uint256 currentPrice;
        int256 unrealisedPnL;
        bool hasProfit;
        uint256 delta;
    }

    struct PoolUtilization {
        address token;
        uint256 poolAmount;
        uint256 reservedAmount;
        uint256 globalShortSize;
        uint256 guaranteedUsd;
        uint256 utilizationBps;
    }

    constructor(
        address _gmxVault,
        address _oracleAdapter,
        address _vaultAccounting
    ) {
        gmxVault = IGMXVault(_gmxVault);
        oracleAdapter = IOracleAdapter(_oracleAdapter);
        vaultAccounting = IPerp(_vaultAccounting);
    }

    // ─── Basket Views ────────────────────────────────────────────

    function getBasketInfo(address basketVault) external view returns (BasketInfo memory info) {
        BasketVault bv = BasketVault(basketVault);
        BasketShareToken st = bv.shareToken();

        info.vault = basketVault;
        info.shareToken = address(st);
        info.name = bv.name();
        info.basketPrice = bv.getBasketPrice();
        info.totalSupply = st.totalSupply();
        info.usdcBalance = IERC20(address(bv.usdc())).balanceOf(basketVault);
        info.perpAllocated = bv.perpAllocated();
        info.assetCount = bv.getAssetCount();

        if (info.totalSupply > 0) {
            info.sharePrice = ((info.usdcBalance + info.perpAllocated) * PRICE_PRECISION) / info.totalSupply;
        } else {
            info.sharePrice = info.basketPrice;
        }
    }

    function getBasketInfoBatch(address[] calldata basketVaults) external view returns (BasketInfo[] memory infos) {
        infos = new BasketInfo[](basketVaults.length);
        for (uint256 i = 0; i < basketVaults.length; i++) {
            BasketVault bv = BasketVault(basketVaults[i]);
            BasketShareToken st = bv.shareToken();

            infos[i].vault = basketVaults[i];
            infos[i].shareToken = address(st);
            infos[i].name = bv.name();
            infos[i].basketPrice = bv.getBasketPrice();
            infos[i].totalSupply = st.totalSupply();
            infos[i].usdcBalance = IERC20(address(bv.usdc())).balanceOf(basketVaults[i]);
            infos[i].perpAllocated = bv.perpAllocated();
            infos[i].assetCount = bv.getAssetCount();

            if (infos[i].totalSupply > 0) {
                infos[i].sharePrice = ((infos[i].usdcBalance + infos[i].perpAllocated) * PRICE_PRECISION) / infos[i].totalSupply;
            } else {
                infos[i].sharePrice = infos[i].basketPrice;
            }
        }
    }

    // ─── Vault Accounting Views ──────────────────────────────────

    function getVaultState(address vault) external view returns (IPerp.VaultState memory) {
        return vaultAccounting.getVaultState(vault);
    }

    function getVaultPnL(address vault) external view returns (int256 unrealised, int256 realised) {
        return vaultAccounting.getVaultPnL(vault);
    }

    /// @notice Total vault value = USDC balance + perp allocated capital + realised PnL
    function getTotalVaultValue(address basketVault) external view returns (uint256) {
        BasketVault bv = BasketVault(basketVault);
        uint256 usdcBalance = IERC20(address(bv.usdc())).balanceOf(basketVault);
        uint256 perpAlloc = bv.perpAllocated();

        (, int256 realisedPnL) = vaultAccounting.getVaultPnL(basketVault);
        int256 total = int256(usdcBalance) + int256(perpAlloc) + realisedPnL;

        return total > 0 ? uint256(total) : 0;
    }

    // ─── Oracle Views ────────────────────────────────────────────

    function getOraclePrice(bytes32 assetId) external view returns (uint256 price, uint256 timestamp) {
        return oracleAdapter.getPrice(assetId);
    }

    function getOraclePrices(bytes32[] calldata assetIds) external view returns (IOracleAdapter.PriceData[] memory) {
        return oracleAdapter.getPrices(assetIds);
    }

    function isOracleStale(bytes32 assetId) external view returns (bool) {
        return oracleAdapter.isStale(assetId);
    }

    // ─── Pool Utilization Views ──────────────────────────────────

    function getPoolUtilization(address token) external view returns (PoolUtilization memory util) {
        util.token = token;
        util.poolAmount = gmxVault.poolAmounts(token);
        util.reservedAmount = gmxVault.reservedAmounts(token);
        util.globalShortSize = gmxVault.globalShortSizes(token);
        util.guaranteedUsd = gmxVault.guaranteedUsd(token);

        if (util.poolAmount > 0) {
            util.utilizationBps = (util.reservedAmount * 10_000) / util.poolAmount;
        }
    }

    // ─── GMX Position Views ──────────────────────────────────────

    function getGMXPosition(
        address account,
        address collateralToken,
        address indexToken,
        bool isLong
    ) external view returns (
        uint256 size,
        uint256 collateral,
        uint256 averagePrice,
        uint256 entryFundingRate,
        uint256 reserveAmount,
        uint256 realisedPnl,
        bool hasRealisedProfit,
        uint256 lastIncreasedTime
    ) {
        return gmxVault.getPosition(account, collateralToken, indexToken, isLong);
    }

    function getGMXPositionDelta(
        address indexToken,
        uint256 size,
        uint256 averagePrice,
        bool isLong,
        uint256 lastIncreasedTime
    ) external view returns (bool hasProfit, uint256 delta) {
        return gmxVault.getDelta(indexToken, size, averagePrice, isLong, lastIncreasedTime);
    }
}
