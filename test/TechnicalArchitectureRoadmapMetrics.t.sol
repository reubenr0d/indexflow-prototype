// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {PerpReader} from "../src/perp/PerpReader.sol";
import {BasketVault} from "../src/vault/BasketVault.sol";
import {IPerp} from "../src/perp/interfaces/IPerp.sol";
import {IntegrationTest} from "./Integration.t.sol";
import {GlobalLiquiditySharingIntegrationTest} from "./GlobalLiquiditySharingIntegration.t.sol";

contract TechnicalArchitectureRoadmapMetricsBasketTest is IntegrationTest {
    function test_metrics_reserveDepth_redemptionHeadroom_and_topUpEffect() public {
        BasketVault basket =
            new BasketVault("Architecture Gold Basket", address(usdc), address(oracleAdapter), deployer);

        bytes32[] memory assetIds = new bytes32[](1);
        assetIds[0] = GOLD_ID;
        basket.setAssets(assetIds);
        basket.setVaultAccounting(address(vaultAccounting));
        basket.setMinReserveBps(2_000);

        vaultAccounting.registerVault(address(basket));

        address investor = address(0xC0FFEE);
        usdc.mint(investor, 100_000e6);

        vm.startPrank(investor);
        usdc.approve(address(basket), 100_000e6);
        uint256 mintedShares = basket.deposit(100_000e6);
        vm.stopPrank();

        basket.allocateToPerp(50_000e6);

        uint256 totalSupply = basket.shareToken().totalSupply();
        uint256 navBeforeTopUp = basket.getPricingNav();
        uint256 idleBeforeTopUp = usdc.balanceOf(address(basket));
        uint256 redeemableShareFractionBpsBefore = (idleBeforeTopUp * 10_000) / navBeforeTopUp;
        uint256 reserveRatioBpsBefore = (idleBeforeTopUp * 10_000) / navBeforeTopUp;

        emit log_named_uint("metric.reserve_depth.idle_before_top_up_usdc", idleBeforeTopUp);
        emit log_named_uint("metric.reserve_depth.nav_before_top_up_usdc", navBeforeTopUp);
        emit log_named_uint("metric.reserve_depth.reserve_ratio_bps_before", reserveRatioBpsBefore);
        emit log_named_uint(
            "metric.reserve_depth.redeemable_share_fraction_bps_before", redeemableShareFractionBpsBefore
        );
        emit log_named_uint("metric.reserve_depth.required_reserve_before_usdc", basket.getRequiredReserveUsdc());
        emit log_named_uint("metric.reserve_depth.available_for_perp_before_usdc", basket.getAvailableForPerpUsdc());

        uint256 failingRedemptionShares = 60_000e6;

        // With the pending redemption queue, redeem no longer reverts on
        // insufficient liquidity; it partially fills and queues the rest.
        vm.startPrank(investor);
        basket.shareToken().approve(address(basket), type(uint256).max);
        uint256 partialReturn = basket.redeem(failingRedemptionShares);
        vm.stopPrank();

        // Partial fill: 50_000e6 idle available, 60_000e6 owed → partial burn + queue remainder
        assertEq(partialReturn, 50_000e6, "Partial fill should drain all idle USDC");
        assertEq(basket.pendingRedemptionCount(), 1, "Should have queued one remainder");

        // After partial fill the vault has 0 idle USDC; top-up adds 25_000e6
        usdc.approve(address(basket), 25_000e6);
        basket.topUpReserve(25_000e6);

        uint256 idleAfterTopUp = usdc.balanceOf(address(basket));
        assertEq(idleAfterTopUp, 25_000e6, "Top-up should add idle reserve");

        assertEq(totalSupply, 100_000e6, "Initial supply should match bootstrap deposit");
        assertEq(idleBeforeTopUp, 50_000e6, "Idle reserve should drop by the perp allocation");
        assertEq(navBeforeTopUp, 100_000e6, "Pricing NAV should still include allocated capital");
        assertEq(redeemableShareFractionBpsBefore, 5_000, "Only half the NAV is instantly redeemable");
    }

    function test_metrics_openInterest_and_pool_utilization() public {
        BasketVault basket = new BasketVault("Metrics OI Basket", address(usdc), address(oracleAdapter), deployer);

        bytes32[] memory assetIds = new bytes32[](1);
        assetIds[0] = GOLD_ID;
        basket.setAssets(assetIds);
        basket.setVaultAccounting(address(vaultAccounting));
        basket.setMinReserveBps(2_000);

        vaultAccounting.registerVault(address(basket));

        address investor = address(0xFACE);
        usdc.mint(investor, 100_000e6);

        vm.startPrank(investor);
        usdc.approve(address(basket), 100_000e6);
        basket.deposit(100_000e6);
        vm.stopPrank();

        basket.allocateToPerp(60_000e6);
        vaultAccounting.openPosition(address(basket), GOLD_ID, true, 20_000e30, 10_000e6);

        PerpReader reader = new PerpReader(address(gmxVault), address(oracleAdapter), address(vaultAccounting));
        IPerp.VaultState memory state = vaultAccounting.getVaultState(address(basket));
        PerpReader.PoolUtilization memory util = reader.getPoolUtilization(address(usdc));

        emit log_named_uint("metric.utilization.vault_deposited_capital_usdc", state.depositedCapital);
        emit log_named_int("metric.utilization.vault_realised_pnl_usdc", state.realisedPnL);
        emit log_named_uint("metric.utilization.vault_open_interest_usd_1e30", state.openInterest);
        emit log_named_uint("metric.utilization.vault_collateral_locked_usdc", state.collateralLocked);
        emit log_named_uint("metric.utilization.vault_position_count", state.positionCount);
        emit log_named_uint("metric.utilization.pool_amount_usdc", util.poolAmount);
        emit log_named_uint("metric.utilization.pool_reserved_usdc", util.reservedAmount);
        emit log_named_uint("metric.utilization.pool_utilization_bps", util.utilizationBps);
        emit log_named_uint("metric.utilization.pool_global_short_size_usd_1e30", util.globalShortSize);
        emit log_named_uint("metric.utilization.pool_guaranteed_usd_1e30", util.guaranteedUsd);

        assertEq(state.depositedCapital, 60_000e6, "Allocated capital should sit in VaultAccounting");
        assertEq(state.openInterest, 20_000e30, "Open interest should match position size");
        assertEq(state.collateralLocked, 10_000e6, "Collateral lock should match posted collateral");
        assertEq(state.positionCount, 1, "One open leg expected");
        assertEq(
            util.poolAmount,
            1_010_000e6,
            "GMX pool amount should include the seeded 1M plus 10k collateral transferred on open"
        );
        assertEq(util.reservedAmount, 20_000e6, "Long reserve should match position notional in USDC terms");
        assertEq(util.utilizationBps, 198, "20k reserved over the post-open 1.01M pool is ~1.98% utilization");
    }
}

contract TechnicalArchitectureRoadmapMetricsSharedPoolTest is GlobalLiquiditySharingIntegrationTest {
    function test_metrics_shared_pool_stress_waterfall() public {
        _deployStack(150_000e6);

        address vaultA = address(0xA101);
        address vaultB = address(0xB202);

        _registerAndFundVault(vaultA, 80_000e6);
        _registerAndFundVault(vaultB, 80_000e6);

        uint256 collateral = 50_000e6;
        uint256 size = 80_000e30;

        vaultAccounting.openPosition(vaultA, GOLD_ID, true, size, collateral);
        vaultAccounting.openPosition(vaultB, SILVER_ID, true, size, collateral);

        uint256 poolBeforeClose = gmxVault.poolAmounts(address(usdc));
        uint256 reservedBeforeClose = gmxVault.reservedAmounts(address(usdc));

        priceFeed.setPrice(address(gold), 4000e30);
        priceFeed.setPrice(address(silver), 50e30);

        vaultAccounting.closePosition(vaultA, GOLD_ID, true, size, 0);

        uint256 poolAfterFirstClose = gmxVault.poolAmounts(address(usdc));
        uint256 reservedAfterFirstClose = gmxVault.reservedAmounts(address(usdc));

        emit log_named_uint("metric.shared_pool.pool_before_close_usdc", poolBeforeClose);
        emit log_named_uint("metric.shared_pool.reserved_before_close_usdc", reservedBeforeClose);
        emit log_named_uint("metric.shared_pool.pool_after_first_close_usdc", poolAfterFirstClose);
        emit log_named_uint("metric.shared_pool.reserved_after_first_close_usdc", reservedAfterFirstClose);
        emit log_named_uint(
            "metric.shared_pool.pool_consumed_by_first_close_usdc", poolBeforeClose - poolAfterFirstClose
        );

        vm.expectRevert(bytes("Vault: poolAmount exceeded"));
        vaultAccounting.closePosition(vaultB, SILVER_ID, true, size, 0);

        assertEq(
            poolBeforeClose,
            250_000e6,
            "Pool before close should include the 150k seed plus 100k of long collateral already transferred in"
        );
        assertEq(reservedBeforeClose, 160_000e6, "Two 80k longs should reserve 160k against the shared pool");
        assertTrue(poolAfterFirstClose < poolBeforeClose, "Profitable first close should consume shared liquidity");
        assertEq(reservedAfterFirstClose, 80_000e6, "One leg should remain reserved after the first close");
    }
}
