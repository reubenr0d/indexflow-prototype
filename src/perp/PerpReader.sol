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
/// @dev Stateless; holds immutable references to GMX vault, oracle adapter, and `VaultAccounting`.
contract PerpReader {
    /// @notice Internal USD price scalar matching basket/oracle conventions (1e30).
    uint256 public constant PRICE_PRECISION = 1e30;

    /// @notice Forked GMX core vault (0.6.12) exposed with 0.8.24 interface.
    IGMXVault public immutable gmxVault;
    /// @notice Oracle adapter for basket and sync source prices.
    IOracleAdapter public immutable oracleAdapter;
    /// @notice `VaultAccounting` (or any `IPerp`) for per-vault PnL and state.
    IPerp public immutable vaultAccounting;

    /// @notice Snapshot of a `BasketVault` for dashboards.
    /// @param vault Basket vault address.
    /// @param shareToken ERC20 share token for the basket.
    /// @param name Human-readable basket name.
    /// @param basketPrice Backward-compatible price field; mirrors `sharePrice`.
    /// @param sharePrice Implied value per share: (USDC on hand + perp allocated) / supply, or basket price if zero supply.
    /// @param totalSupply Outstanding basket shares (6 decimals).
    /// @param usdcBalance USDC held in the basket vault contract.
    /// @param perpAllocated USDC marked as sent to perp module (book entry on basket).
    /// @param assetCount Number of assets in the basket composition.
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

    /// @notice Enriched view of a single GMX leg (by account) for tooling.
    /// @param vault Basket vault (used when reading via accounting keys off-chain).
    /// @param asset Logical asset id.
    /// @param isLong Long vs short.
    /// @param size GMX position size.
    /// @param collateral GMX collateral.
    /// @param averagePrice GMX average entry.
    /// @param currentPrice GMX mark from `getMaxPrice`/`getMinPrice` depending on side (implementation in caller).
    /// @param unrealisedPnL Signed mark-to-market in USD terms when combined with `hasProfit`/`delta`.
    /// @param hasProfit From GMX `getPositionDelta`.
    /// @param delta Absolute PnL delta from GMX.
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

    /// @notice GMX pool usage snapshot for a collateral/index token.
    /// @param token ERC20 token address in GMX.
    /// @param poolAmount GMX `poolAmounts`.
    /// @param reservedAmount GMX `reservedAmounts` (long usage).
    /// @param globalShortSize GMX aggregate short notional for the token.
    /// @param guaranteedUsd GMX guaranteed USD for the pool.
    /// @param utilizationBps `reservedAmount * 10_000 / poolAmount` if pool nonzero, else zero.
    struct PoolUtilization {
        address token;
        uint256 poolAmount;
        uint256 reservedAmount;
        uint256 globalShortSize;
        uint256 guaranteedUsd;
        uint256 utilizationBps;
    }

    /// @notice Wire immutable dependencies for read aggregation.
    /// @param _gmxVault GMX `Vault` contract address.
    /// @param _oracleAdapter `OracleAdapter` contract address.
    /// @param _vaultAccounting `VaultAccounting` (`IPerp`) contract address.
    constructor(address _gmxVault, address _oracleAdapter, address _vaultAccounting) {
        gmxVault = IGMXVault(_gmxVault);
        oracleAdapter = IOracleAdapter(_oracleAdapter);
        vaultAccounting = IPerp(_vaultAccounting);
    }

    // ─── Basket Views ────────────────────────────────────────────

    /// @notice Build `BasketInfo` for a single basket vault.
    /// @param basketVault Address of a deployed `BasketVault`.
    /// @return info Populated snapshot.
    function getBasketInfo(address basketVault) external view returns (BasketInfo memory info) {
        BasketVault bv = BasketVault(basketVault);
        BasketShareToken st = bv.shareToken();

        info.vault = basketVault;
        info.shareToken = address(st);
        info.name = bv.name();
        info.basketPrice = bv.getSharePrice();
        info.totalSupply = st.totalSupply();
        info.usdcBalance = IERC20(address(bv.usdc())).balanceOf(basketVault);
        info.perpAllocated = bv.perpAllocated();
        info.assetCount = bv.getAssetCount();

        info.sharePrice = bv.getSharePrice();
    }

    /// @notice Batch variant of `getBasketInfo` preserving calldata order.
    /// @param basketVaults List of `BasketVault` addresses.
    /// @return infos Parallel array of snapshots.
    function getBasketInfoBatch(address[] calldata basketVaults) external view returns (BasketInfo[] memory infos) {
        infos = new BasketInfo[](basketVaults.length);
        for (uint256 i = 0; i < basketVaults.length; i++) {
            BasketVault bv = BasketVault(basketVaults[i]);
            BasketShareToken st = bv.shareToken();

            infos[i].vault = basketVaults[i];
            infos[i].shareToken = address(st);
            infos[i].name = bv.name();
            infos[i].basketPrice = bv.getSharePrice();
            infos[i].totalSupply = st.totalSupply();
            infos[i].usdcBalance = IERC20(address(bv.usdc())).balanceOf(basketVaults[i]);
            infos[i].perpAllocated = bv.perpAllocated();
            infos[i].assetCount = bv.getAssetCount();

            infos[i].sharePrice = bv.getSharePrice();
        }
    }

    // ─── Vault Accounting Views ──────────────────────────────────

    /// @notice Passthrough to `vaultAccounting.getVaultState`.
    /// @param vault Basket vault address.
    /// @return Current `IPerp.VaultState`.
    function getVaultState(address vault) external view returns (IPerp.VaultState memory) {
        return vaultAccounting.getVaultState(vault);
    }

    /// @notice Passthrough to `vaultAccounting.getVaultPnL`.
    /// @param vault Basket vault address.
    /// @return unrealised Aggregate mark-to-market from open legs.
    /// @return realised Cumulative realised PnL.
    function getVaultPnL(address vault) external view returns (int256 unrealised, int256 realised) {
        return vaultAccounting.getVaultPnL(vault);
    }

    /// @notice Mark-to-market basket value: USDC on hand + perp allocation + realised + unrealised PnL (GMX price delta).
    /// @param basketVault Basket vault address.
    /// @return Total value floored at zero (USD/USDC units on hand + attributed PnL).
    /// @dev Unrealised uses GMX `getPositionDelta` aggregate via `VaultAccounting`; excludes funding accrual.
    function getTotalVaultValue(address basketVault) external view returns (uint256) {
        BasketVault bv = BasketVault(basketVault);
        uint256 usdcBalance = IERC20(address(bv.usdc())).balanceOf(basketVault);
        uint256 perpAlloc = bv.perpAllocated();

        (int256 unrealisedPnL, int256 realisedPnL) = vaultAccounting.getVaultPnL(basketVault);
        int256 total = int256(usdcBalance) + int256(perpAlloc) + realisedPnL + unrealisedPnL;

        return total > 0 ? uint256(total) : 0;
    }

    // ─── Oracle Views ────────────────────────────────────────────

    /// @notice Adapter price for one asset.
    /// @param assetId Logical asset id.
    /// @return price Normalized oracle price.
    /// @return timestamp Associated update time.
    function getOraclePrice(bytes32 assetId) external view returns (uint256 price, uint256 timestamp) {
        return oracleAdapter.getPrice(assetId);
    }

    /// @notice Batch oracle read.
    /// @param assetIds Asset ids to fetch.
    /// @return Array of `PriceData` aligned with `assetIds`.
    function getOraclePrices(bytes32[] calldata assetIds) external view returns (IOracleAdapter.PriceData[] memory) {
        return oracleAdapter.getPrices(assetIds);
    }

    /// @notice Whether the adapter marks `assetId` stale.
    /// @param assetId Asset id.
    /// @return True if stale per adapter rules.
    function isOracleStale(bytes32 assetId) external view returns (bool) {
        return oracleAdapter.isStale(assetId);
    }

    // ─── Pool Utilization Views ──────────────────────────────────

    /// @notice GMX pool utilization snapshot for `token`.
    /// @param token GMX-listed token address.
    /// @return util Filled `PoolUtilization` struct.
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

    /// @notice Direct read of GMX `getPosition` for any `account` (e.g. `VaultAccounting`).
    /// @param account GMX position owner (trader).
    /// @param collateralToken GMX collateral token address.
    /// @param indexToken GMX index token address.
    /// @param isLong Position side.
    /// @return size GMX size.
    /// @return collateral GMX collateral.
    /// @return averagePrice Average entry price.
    /// @return entryFundingRate Entry cumulative funding rate.
    /// @return reserveAmount Reserved amount.
    /// @return realisedPnl Realised PnL field from GMX storage.
    /// @return hasRealisedProfit Flag from GMX.
    /// @return lastIncreasedTime Last increase timestamp.
    function getGMXPosition(address account, address collateralToken, address indexToken, bool isLong)
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
        )
    {
        return gmxVault.getPosition(account, collateralToken, indexToken, isLong);
    }

    /// @notice GMX `getDelta` helper for mark-to-market given size and entry.
    /// @param indexToken Index token address.
    /// @param size Position size.
    /// @param averagePrice Average entry price.
    /// @param isLong Long vs short.
    /// @param lastIncreasedTime Last increase time from `getPosition`.
    /// @return hasProfit Whether delta represents profit.
    /// @return delta Absolute PnL delta in GMX USD terms.
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
