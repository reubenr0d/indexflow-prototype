// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {BasketVault} from "../src/vault/BasketVault.sol";
import {StateRelay} from "../src/coordination/StateRelay.sol";
import {PoolReserveRegistry} from "../src/coordination/PoolReserveRegistry.sol";
import {IPoolReserveRegistry} from "../src/coordination/interfaces/IPoolReserveRegistry.sol";
import {MockUSDC} from "../src/vault/MockUSDC.sol";
import {OracleAdapter} from "../src/perp/OracleAdapter.sol";
import {IOracleAdapter} from "../src/perp/interfaces/IOracleAdapter.sol";

contract MockGMXVaultStress {
    mapping(address => uint256) public poolAmounts;
    mapping(address => uint256) public reservedAmounts;

    function setPoolAmount(address token, uint256 amount) external {
        poolAmounts[token] = amount;
    }

    function setReservedAmount(address token, uint256 amount) external {
        reservedAmounts[token] = amount;
    }
}

/// @dev Simulates a 3-chain deployment in a single Foundry test.
/// Each "chain" gets its own BasketVault, StateRelay, PoolReserveRegistry, and MockGMXVault.
/// PnL is injected via StateRelay (keeper-posted global PnL adjustments).
/// Routing weights are derived from PoolReserveRegistry pool depths.
contract CrossChainE2EStressTest is Test {
    // ─── Chain identifiers ───────────────────────────────────────
    uint64 constant CHAIN_A = 1001; // deep liquidity
    uint64 constant CHAIN_B = 2002; // medium liquidity
    uint64 constant CHAIN_C = 3003; // shallow liquidity

    // ─── Per-chain infrastructure ────────────────────────────────
    struct ChainDeployment {
        BasketVault vault;
        StateRelay relay;
        PoolReserveRegistry registry;
        MockGMXVaultStress gmxVault;
        uint64 selector;
    }

    ChainDeployment chainA;
    ChainDeployment chainB;
    ChainDeployment chainC;

    MockUSDC usdc;
    OracleAdapter oracle;

    address keeper = address(0xBEEF);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address messenger = address(0xCCCC);

    bytes32 constant BHP_ID = keccak256(bytes("BHP"));

    uint256 constant POOL_A = 5_000_000e6;
    uint256 constant POOL_B = 1_000_000e6;
    uint256 constant POOL_C = 200_000e6;
    uint256 constant RESERVED = 0; // no initial reserves

    function setUp() public {
        usdc = new MockUSDC();
        oracle = new OracleAdapter(address(this));
        oracle.configureAsset("BHP", address(0), IOracleAdapter.FeedType.CustomRelayer, 3600, 5000, 8);
        oracle.submitPrice(BHP_ID, 50_00000000);

        chainA = _deployChain(CHAIN_A, POOL_A);
        chainB = _deployChain(CHAIN_B, POOL_B);
        chainC = _deployChain(CHAIN_C, POOL_C);

        // Wire registries as peers of each other
        _wireRemotePeers();

        usdc.mint(alice, 10_000_000e6);
        usdc.mint(bob, 10_000_000e6);
    }

    function _deployChain(uint64 selector, uint256 poolAmount)
        internal
        returns (ChainDeployment memory d)
    {
        d.selector = selector;

        d.gmxVault = new MockGMXVaultStress();
        d.gmxVault.setPoolAmount(address(usdc), poolAmount);
        d.gmxVault.setReservedAmount(address(usdc), RESERVED);

        d.registry = new PoolReserveRegistry(
            address(d.gmxVault),
            address(usdc),
            selector,
            1800,  // twapWindow
            60,    // minSnapshotInterval (short for tests)
            3600,  // maxStaleness
            3600,  // maxObservationAge
            5000,  // maxDeltaPerUpdate: 50% (generous for stress tests)
            address(this)
        );
        d.registry.setMessenger(messenger);

        d.vault = new BasketVault("Vault", address(usdc), address(oracle), address(this));
        bytes32[] memory assets = new bytes32[](1);
        assets[0] = BHP_ID;
        d.vault.setAssets(assets);

        d.relay = new StateRelay(selector, 600, keeper, address(this));
        d.vault.setStateRelay(address(d.relay));
        d.vault.setKeeper(keeper);
    }

    function _wireRemotePeers() internal {
        // Chain A knows about B and C
        chainA.registry.addRemoteChain(CHAIN_B);
        chainA.registry.addRemoteChain(CHAIN_C);
        // Chain B knows about A and C
        chainB.registry.addRemoteChain(CHAIN_A);
        chainB.registry.addRemoteChain(CHAIN_C);
        // Chain C knows about A and B
        chainC.registry.addRemoteChain(CHAIN_A);
        chainC.registry.addRemoteChain(CHAIN_B);

        // Push initial remote states
        _syncAllRemoteStates();
    }

    // ─── Helpers ─────────────────────────────────────────────────

    function _syncAllRemoteStates() internal {
        IPoolReserveRegistry.PoolState memory stateA = chainA.registry.getLocalPoolState();
        IPoolReserveRegistry.PoolState memory stateB = chainB.registry.getLocalPoolState();
        IPoolReserveRegistry.PoolState memory stateC = chainC.registry.getLocalPoolState();

        vm.startPrank(messenger);
        chainA.registry.updateRemoteState(stateB);
        chainA.registry.updateRemoteState(stateC);
        chainB.registry.updateRemoteState(stateA);
        chainB.registry.updateRemoteState(stateC);
        chainC.registry.updateRemoteState(stateA);
        chainC.registry.updateRemoteState(stateB);
        vm.stopPrank();
    }

    function _postPnL(ChainDeployment storage chain, int256 adj) internal {
        uint64[] memory c = new uint64[](1);
        uint256[] memory w = new uint256[](1);
        c[0] = chain.selector;
        w[0] = 10_000;

        address[] memory v = new address[](1);
        int256[] memory p = new int256[](1);
        v[0] = address(chain.vault);
        p[0] = adj;

        vm.prank(keeper);
        chain.relay.updateState(c, w, v, p, uint48(block.timestamp));
    }

    function _depositAs(address user, ChainDeployment storage chain, uint256 amount)
        internal
        returns (uint256 shares)
    {
        vm.startPrank(user);
        usdc.approve(address(chain.vault), amount);
        shares = chain.vault.deposit(amount);
        chain.vault.shareToken().approve(address(chain.vault), type(uint256).max);
        vm.stopPrank();
    }

    function _redeemAs(address user, ChainDeployment storage chain, uint256 shares)
        internal
        returns (uint256 usdcReturned)
    {
        vm.prank(user);
        usdcReturned = chain.vault.redeem(shares);
    }

    function _getWeights(ChainDeployment storage chain)
        internal
        view
        returns (uint64[] memory selectors, uint256[] memory weights, uint256[] memory amounts)
    {
        return chain.registry.getRoutingWeights();
    }

    function _computeExpectedWeight(uint256 pool, uint256 totalPool) internal pure returns (uint256) {
        return (pool * 10_000) / totalPool;
    }

    // ═══════════════════════════════════════════════════════════════
    // 1. Cross-chain deposit flow (happy path)
    // ═══════════════════════════════════════════════════════════════

    function test_crossChainDeposit_routedByLiquidity() public {
        // Verify routing weights are proportional to pool depths
        (uint64[] memory sels, uint256[] memory wts,) = _getWeights(chainA);

        uint256 weightSum;
        for (uint256 i = 0; i < wts.length; i++) {
            weightSum += wts[i];
        }
        assertEq(weightSum, 10_000, "Weights must sum to 10_000 bps");

        // Chain A should get the largest weight (~80%)
        // Find chain A's weight
        uint256 weightA;
        uint256 weightB;
        uint256 weightC;
        for (uint256 i = 0; i < sels.length; i++) {
            if (sels[i] == CHAIN_A) weightA = wts[i];
            if (sels[i] == CHAIN_B) weightB = wts[i];
            if (sels[i] == CHAIN_C) weightC = wts[i];
        }

        assertGt(weightA, weightB, "Chain A should have higher weight than B");
        assertGt(weightB, weightC, "Chain B should have higher weight than C");

        // Simulate proportional deposit: 100K USDC split by weights
        uint256 totalDeposit = 100_000e6;
        uint256 depositA = (totalDeposit * weightA) / 10_000;
        uint256 depositB = (totalDeposit * weightB) / 10_000;
        uint256 depositC = totalDeposit - depositA - depositB;

        uint256 sharesA = _depositAs(alice, chainA, depositA);
        uint256 sharesB = _depositAs(alice, chainB, depositB);
        uint256 sharesC = _depositAs(alice, chainC, depositC);

        // First deposits are 1:1
        assertEq(sharesA, depositA, "Chain A shares 1:1");
        assertEq(sharesB, depositB, "Chain B shares 1:1");
        assertEq(sharesC, depositC, "Chain C shares 1:1");

        // NAV equals deposit on each chain
        assertEq(chainA.vault.getPricingNav(), depositA);
        assertEq(chainB.vault.getPricingNav(), depositB);
        assertEq(chainC.vault.getPricingNav(), depositC);
    }

    // ═══════════════════════════════════════════════════════════════
    // 2. PnL accumulation and share price divergence
    // ═══════════════════════════════════════════════════════════════

    function test_pnl_profitIncreasesSharePrice() public {
        _depositAs(alice, chainA, 10_000e6);
        _depositAs(alice, chainB, 10_000e6);

        uint256 priceBeforeA = chainA.vault.getSharePrice();
        uint256 priceBeforeB = chainB.vault.getSharePrice();

        // +10% PnL on chain A only
        _postPnL(chainA, 1_000e6);

        uint256 priceAfterA = chainA.vault.getSharePrice();
        uint256 priceAfterB = chainB.vault.getSharePrice();

        assertGt(priceAfterA, priceBeforeA, "Chain A share price should increase");
        assertEq(priceAfterB, priceBeforeB, "Chain B share price should be unchanged");

        // Second depositor on chain A gets fewer shares
        uint256 shares2 = _depositAs(bob, chainA, 10_000e6);
        assertLt(shares2, 10_000e6, "Post-profit shares should be diluted");
    }

    function test_pnl_lossDecreasesSharePrice() public {
        _depositAs(alice, chainA, 10_000e6);
        _depositAs(alice, chainB, 10_000e6);

        uint256 priceBeforeB = chainB.vault.getSharePrice();

        // -20% PnL on chain B
        _postPnL(chainB, -2_000e6);

        uint256 priceAfterB = chainB.vault.getSharePrice();

        assertLt(priceAfterB, priceBeforeB, "Chain B share price should decrease");
        // Chain A unaffected (no PnL posted)
        assertEq(chainA.vault.getPricingNav(), 10_000e6, "Chain A NAV unaffected");
        assertEq(chainA.vault.getSharePrice(), 1e30, "Chain A share price unchanged");
    }

    function test_pnl_mixedAcrossChains() public {
        _depositAs(alice, chainA, 100_000e6);
        _depositAs(alice, chainB, 100_000e6);
        _depositAs(alice, chainC, 100_000e6);

        // Chain A: +15% profit
        _postPnL(chainA, 15_000e6);
        // Chain B: -5% loss
        _postPnL(chainB, -5_000e6);
        // Chain C: flat (no PnL posted)

        assertEq(chainA.vault.getPricingNav(), 115_000e6, "Chain A NAV = deposit + profit");
        assertEq(chainB.vault.getPricingNav(), 95_000e6, "Chain B NAV = deposit - loss");
        assertEq(chainC.vault.getPricingNav(), 100_000e6, "Chain C NAV = deposit (flat)");

        // Total protocol NAV
        uint256 totalNav = chainA.vault.getPricingNav() + chainB.vault.getPricingNav() + chainC.vault.getPricingNav();
        assertEq(totalNav, 310_000e6, "Total protocol NAV = 300K + 15K - 5K");
    }

    // ═══════════════════════════════════════════════════════════════
    // 3. Redemption at profit
    // ═══════════════════════════════════════════════════════════════

    function test_redeem_atProfit_returnsMoreThanDeposited() public {
        _depositAs(alice, chainA, 10_000e6);

        // PnL is accounting-only: NAV = 12K but vault USDC = 10K
        _postPnL(chainA, 2_000e6);
        assertEq(chainA.vault.getPricingNav(), 12_000e6);

        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 shares = chainA.vault.shareToken().balanceOf(alice);

        // Redeem: owed 12K, vault has 10K -> 10K immediate + 2K queued
        uint256 returned = _redeemAs(alice, chainA, shares);
        assertEq(returned, 10_000e6, "Immediate payout = available USDC");
        assertEq(chainA.vault.pendingRedemptionCount(), 1, "Excess queued");

        (,, uint256 owed,,) = chainA.vault.pendingRedemptions(0);
        assertEq(owed, 2_000e6, "Queued amount = PnL surplus");

        // Bridge in USDC and settle the queue
        usdc.mint(address(chainA.vault), 2_000e6);
        vm.prank(keeper);
        chainA.vault.processPendingRedemption(0);

        uint256 aliceAfter = usdc.balanceOf(alice);
        assertEq(aliceAfter - aliceBefore, 12_000e6, "Total = deposit + profit after queue settled");
    }

    function test_redeem_atProfit_partialRedeem() public {
        _depositAs(alice, chainA, 10_000e6);

        _postPnL(chainA, 5_000e6);

        // NAV = 15_000e6, supply = 10_000e6
        // Redeem 50% of shares (5_000e6): owed = 5_000e6 * 15_000e6 / 10_000e6 = 7_500e6
        uint256 returned = _redeemAs(alice, chainA, 5_000e6);

        assertEq(returned, 7_500e6, "Half of shares at 1.5x NAV");
        assertEq(chainA.vault.shareToken().balanceOf(alice), 5_000e6, "Remaining shares");
    }

    function test_redeem_atProfit_multipleUsers() public {
        _depositAs(alice, chainA, 10_000e6);
        _depositAs(bob, chainA, 20_000e6);

        // +20% PnL: 6K on 30K deposits. NAV = 36K, supply = 30K, vault USDC = 30K.
        _postPnL(chainA, 6_000e6);

        // Alice: 10K shares -> owed = 10K * 36K / 30K = 12K. Vault has 30K -> fully covered.
        uint256 aliceReturned = _redeemAs(alice, chainA, 10_000e6);
        assertEq(aliceReturned, 12_000e6, "Alice gets proportional share of profit");

        // After Alice: vault USDC = 18K, NAV = 24K, supply = 20K
        // Bob: 20K shares -> owed = 20K * 24K / 20K = 24K. Vault has 18K -> partial + 6K queued.
        uint256 bobBefore = usdc.balanceOf(bob);
        uint256 bobReturned = _redeemAs(bob, chainA, 20_000e6);
        assertEq(bobReturned, 18_000e6, "Bob immediate payout = available USDC");

        assertEq(chainA.vault.pendingRedemptionCount(), 1, "Bob's remainder queued");
        (,, uint256 owed,,) = chainA.vault.pendingRedemptions(0);
        assertEq(owed, 6_000e6, "Queued = 24K owed - 18K paid");

        // Bridge in and settle
        usdc.mint(address(chainA.vault), 6_000e6);
        vm.prank(keeper);
        chainA.vault.processPendingRedemption(0);

        uint256 bobAfter = usdc.balanceOf(bob);
        assertEq(bobAfter - bobBefore, 24_000e6, "Bob total = immediate + queued");
    }

    // ═══════════════════════════════════════════════════════════════
    // 4. Liquidity stress scenarios
    // ═══════════════════════════════════════════════════════════════

    function test_stress_shallowPool_redeemQueued() public {
        // Chain C has shallow pool (200K). Deposit 150K.
        _depositAs(alice, chainC, 150_000e6);

        // Post large PnL: NAV = 250K, but vault only has 150K USDC
        _postPnL(chainC, 100_000e6);

        // Redeem all shares: owed = 250K, available = 150K -> partial fill + queue
        uint256 shares = chainC.vault.shareToken().balanceOf(alice);
        uint256 returned = _redeemAs(alice, chainC, shares);

        assertEq(returned, 150_000e6, "Immediate payout = available USDC");
        assertGt(chainC.vault.pendingRedemptionCount(), 0, "Remaining owed is queued");

        // Process pending after USDC bridged in
        usdc.mint(address(chainC.vault), 100_000e6);
        vm.prank(keeper);
        chainC.vault.processPendingRedemption(0);

        (,,,, bool completed) = chainC.vault.pendingRedemptions(0);
        assertTrue(completed, "Pending redemption completed");
    }

    function test_stress_allPoolsDrained_redeemQueuesCorrectly() public {
        // Minimal deposits on all chains
        _depositAs(alice, chainA, 50_000e6);
        _depositAs(alice, chainB, 50_000e6);
        _depositAs(alice, chainC, 50_000e6);

        // Post large PnL everywhere: NAV >> idle USDC
        _postPnL(chainA, 100_000e6);
        _postPnL(chainB, 100_000e6);
        _postPnL(chainC, 100_000e6);

        // Redeem all on chain A: NAV = 150K, USDC = 50K -> 50K immediate + 100K queued
        uint256 sharesA = chainA.vault.shareToken().balanceOf(alice);
        uint256 returnedA = _redeemAs(alice, chainA, sharesA);
        assertEq(returnedA, 50_000e6, "Chain A: immediate payout = deposit");
        assertGt(chainA.vault.pendingRedemptionCount(), 0, "Chain A: has pending");

        // Same on chain B
        uint256 sharesB = chainB.vault.shareToken().balanceOf(alice);
        uint256 returnedB = _redeemAs(alice, chainB, sharesB);
        assertEq(returnedB, 50_000e6, "Chain B: immediate payout = deposit");
        assertGt(chainB.vault.pendingRedemptionCount(), 0, "Chain B: has pending");

        // Same on chain C
        uint256 sharesC = chainC.vault.shareToken().balanceOf(alice);
        uint256 returnedC = _redeemAs(alice, chainC, sharesC);
        assertEq(returnedC, 50_000e6, "Chain C: immediate payout = deposit");
        assertGt(chainC.vault.pendingRedemptionCount(), 0, "Chain C: has pending");
    }

    function test_stress_routingWeightsUpdateOnPoolDrain() public {
        // Initial weights: A >> B >> C
        (uint64[] memory sels, uint256[] memory wtsBefore,) = _getWeights(chainA);
        uint256 weightBBefore;
        for (uint256 i = 0; i < sels.length; i++) {
            if (sels[i] == CHAIN_B) weightBBefore = wtsBefore[i];
        }
        assertGt(weightBBefore, 0, "Chain B initially has weight");

        // Chain B pool drops from 1M to 50K (high utilization)
        chainB.gmxVault.setPoolAmount(address(usdc), 50_000e6);
        chainB.gmxVault.setReservedAmount(address(usdc), 45_000e6);

        // Advance time so TWAP settles and re-sync
        vm.warp(block.timestamp + 1801);
        chainB.registry.observe();

        // Re-sync remote states
        IPoolReserveRegistry.PoolState memory newStateB = chainB.registry.getLocalPoolState();
        vm.prank(messenger);
        chainA.registry.updateRemoteState(newStateB);

        (uint64[] memory sels2, uint256[] memory wtsAfter,) = _getWeights(chainA);
        uint256 weightBAfter;
        uint256 weightAAfter;
        for (uint256 i = 0; i < sels2.length; i++) {
            if (sels2[i] == CHAIN_B) weightBAfter = wtsAfter[i];
            if (sels2[i] == CHAIN_A) weightAAfter = wtsAfter[i];
        }

        assertLt(weightBAfter, weightBBefore, "Chain B weight should drop after pool drain");
        assertGt(weightAAfter, 8000, "Chain A should absorb most of the routing");
    }

    function test_stress_staleRemoteState_fallsBackToLocal() public {
        // Verify initial state has 3 chains with nonzero weights
        (, uint256[] memory wtsBefore,) = _getWeights(chainA);
        uint256 nonZeroBefore;
        for (uint256 i = 0; i < wtsBefore.length; i++) {
            if (wtsBefore[i] > 0) nonZeroBefore++;
        }
        assertEq(nonZeroBefore, 3, "All 3 chains have weight initially");

        // Warp past maxStaleness (3600s) -- remote states become stale
        vm.warp(block.timestamp + 3601);

        (uint64[] memory selsAfter, uint256[] memory wtsAfter,) = _getWeights(chainA);
        uint256 localWeight;
        uint256 totalNonLocal;
        for (uint256 i = 0; i < selsAfter.length; i++) {
            if (selsAfter[i] == CHAIN_A) {
                localWeight = wtsAfter[i];
            } else {
                totalNonLocal += wtsAfter[i];
            }
        }

        assertEq(localWeight, 10_000, "100% weight to local when remotes are stale");
        assertEq(totalNonLocal, 0, "Stale remote chains get 0 weight");
    }

    function test_stress_brokenFeeds_excludedFromRouting() public {
        // Advance so new state timestamp is strictly newer than initial sync
        vm.warp(block.timestamp + 10);

        IPoolReserveRegistry.PoolState memory brokenState = IPoolReserveRegistry.PoolState({
            chainSelector: CHAIN_B,
            twapPoolAmount: 1_000_000e6,
            instantPoolAmount: 1_000_000e6,
            reservedAmount: 0,
            availableLiquidity: 1_000_000e6,
            utilizationBps: 0,
            oracleConfigHash: bytes32(0),
            hasBrokenFeeds: true,
            timestamp: uint48(block.timestamp)
        });

        vm.prank(messenger);
        chainA.registry.updateRemoteState(brokenState);

        (uint64[] memory sels, uint256[] memory wts,) = _getWeights(chainA);
        uint256 weightB;
        for (uint256 i = 0; i < sels.length; i++) {
            if (sels[i] == CHAIN_B) weightB = wts[i];
        }
        assertEq(weightB, 0, "Broken feed chain gets 0 weight");
    }

    // ═══════════════════════════════════════════════════════════════
    // 5. Full cycle: deposit → route → PnL → redeem across chains
    // ═══════════════════════════════════════════════════════════════

    function test_fullCycle_depositRouteProfit_redeemAcrossChains() public {
        // 1. Read routing weights
        (uint64[] memory sels, uint256[] memory wts,) = _getWeights(chainA);
        uint256 wA; uint256 wB; uint256 wC;
        for (uint256 i = 0; i < sels.length; i++) {
            if (sels[i] == CHAIN_A) wA = wts[i];
            if (sels[i] == CHAIN_B) wB = wts[i];
            if (sels[i] == CHAIN_C) wC = wts[i];
        }

        // 2. Route 300K proportionally
        uint256 total = 300_000e6;
        uint256 depA = (total * wA) / 10_000;
        uint256 depB = (total * wB) / 10_000;
        uint256 depC = total - depA - depB;

        _depositAs(alice, chainA, depA);
        _depositAs(alice, chainB, depB);
        _depositAs(alice, chainC, depC);

        assertEq(depA + depB + depC, total, "All USDC deposited");

        // 3. Post PnL: A +15%, B -5%, C +3% (accounting-only)
        int256 pnlA = int256(depA * 15 / 100);
        int256 pnlB = -int256(depB * 5 / 100);
        int256 pnlC = int256(depC * 3 / 100);
        _postPnL(chainA, pnlA);
        _postPnL(chainB, pnlB);
        _postPnL(chainC, pnlC);

        // 4. Verify NAVs
        uint256 navA = chainA.vault.getPricingNav();
        uint256 navB = chainB.vault.getPricingNav();
        uint256 navC = chainC.vault.getPricingNav();

        assertEq(navA, depA + uint256(pnlA), "Chain A: deposit + 15%");
        assertEq(navB, depB - uint256(-pnlB), "Chain B: deposit - 5%");
        assertEq(navC, depC + uint256(pnlC), "Chain C: deposit + 3%");

        uint256 totalNav = navA + navB + navC;
        assertGt(totalNav, total, "Net profit across all chains");

        // 5. Redeem all on each chain
        //    Vault USDC = deposits only. Chains with PnL > 0 will queue the surplus.
        uint256 aliceBalBefore = usdc.balanceOf(alice);

        _redeemAs(alice, chainA, chainA.vault.shareToken().balanceOf(alice));
        _redeemAs(alice, chainB, chainB.vault.shareToken().balanceOf(alice));
        _redeemAs(alice, chainC, chainC.vault.shareToken().balanceOf(alice));

        // Chain B had loss -> NAV < deposit, so it pays in full with no queue
        assertEq(chainB.vault.pendingRedemptionCount(), 0, "Chain B no queue (loss)");

        // Chains A and C had profit -> NAV > vault USDC, so the PnL surplus is queued
        uint256 totalQueuedOwed;
        for (uint256 i = 0; i < chainA.vault.pendingRedemptionCount(); i++) {
            (,, uint256 owed,,) = chainA.vault.pendingRedemptions(i);
            totalQueuedOwed += owed;
        }
        for (uint256 i = 0; i < chainC.vault.pendingRedemptionCount(); i++) {
            (,, uint256 owed,,) = chainC.vault.pendingRedemptions(i);
            totalQueuedOwed += owed;
        }

        uint256 aliceBalAfter = usdc.balanceOf(alice);
        uint256 immediateReturn = aliceBalAfter - aliceBalBefore;

        assertEq(immediateReturn + totalQueuedOwed, totalNav, "Immediate + queued = total NAV");
        assertGt(immediateReturn + totalQueuedOwed, total, "User made net profit");

        // 6. Settle all queues
        if (chainA.vault.pendingRedemptionCount() > 0) {
            (,, uint256 owed,,) = chainA.vault.pendingRedemptions(0);
            usdc.mint(address(chainA.vault), owed);
            vm.prank(keeper);
            chainA.vault.processPendingRedemption(0);
        }
        if (chainC.vault.pendingRedemptionCount() > 0) {
            (,, uint256 owed,,) = chainC.vault.pendingRedemptions(0);
            usdc.mint(address(chainC.vault), owed);
            vm.prank(keeper);
            chainC.vault.processPendingRedemption(0);
        }

        uint256 aliceFinal = usdc.balanceOf(alice);
        assertEq(aliceFinal - aliceBalBefore, totalNav, "All NAV paid after queue settled");
    }

    // ═══════════════════════════════════════════════════════════════
    // 6. Edge cases
    // ═══════════════════════════════════════════════════════════════

    function _pushRemoteState(
        PoolReserveRegistry registry,
        uint64 chainSel,
        uint256 twap,
        uint256 avail,
        uint256 reserved,
        bool broken,
        uint48 ts
    ) internal {
        vm.prank(messenger);
        registry.updateRemoteState(IPoolReserveRegistry.PoolState({
            chainSelector: chainSel,
            twapPoolAmount: twap,
            instantPoolAmount: twap,
            reservedAmount: reserved,
            availableLiquidity: avail,
            utilizationBps: avail == 0 && twap > 0 ? 10_000 : 0,
            oracleConfigHash: bytes32(0),
            hasBrokenFeeds: broken,
            timestamp: ts
        }));
    }

    function test_edge_zeroLiquidityChain_getsNoRouting() public {
        // Step down chain C liquidity gradually to respect maxDeltaPerUpdate (50%)
        vm.warp(100);
        _pushRemoteState(chainA.registry, CHAIN_C, 100_000e6, 100_000e6, 0, false, 100);

        vm.warp(200);
        _pushRemoteState(chainA.registry, CHAIN_C, 50_000e6, 50_000e6, 0, false, 200);

        vm.warp(300);
        _pushRemoteState(chainA.registry, CHAIN_C, 25_000e6, 0, 25_000e6, false, 300);

        (uint64[] memory sels, uint256[] memory wts,) = _getWeights(chainA);
        uint256 weightC;
        for (uint256 i = 0; i < sels.length; i++) {
            if (sels[i] == CHAIN_C) weightC = wts[i];
        }
        assertEq(weightC, 0, "Fully-utilised chain gets no routing weight");

        uint256 weightSum;
        uint256 nonZeroChains;
        for (uint256 i = 0; i < wts.length; i++) {
            weightSum += wts[i];
            if (wts[i] > 0) nonZeroChains++;
        }
        assertEq(weightSum, 10_000);
        assertEq(nonZeroChains, 2, "Only 2 chains with nonzero weight");
    }

    function test_edge_singleChain_fullCycle() public {
        // Use only chain A: deposit, PnL, redeem
        uint256 deposit = 50_000e6;
        _depositAs(alice, chainA, deposit);

        assertEq(chainA.vault.getPricingNav(), deposit);

        // Post +25% PnL
        _postPnL(chainA, 12_500e6);

        assertEq(chainA.vault.getPricingNav(), 62_500e6);

        // Redeem all: owed = 62_500, vault USDC = 50_000 -> 50K immediate + 12.5K queued
        uint256 shares = chainA.vault.shareToken().balanceOf(alice);
        uint256 returned = _redeemAs(alice, chainA, shares);

        assertEq(returned, 50_000e6, "Immediate payout = deposited USDC");
        assertEq(chainA.vault.pendingRedemptionCount(), 1, "Excess queued");

        // Bridge in USDC and process
        (,, uint256 owed,,) = chainA.vault.pendingRedemptions(0);
        assertEq(owed, 12_500e6);

        usdc.mint(address(chainA.vault), owed);
        vm.prank(keeper);
        chainA.vault.processPendingRedemption(0);

        (,,,, bool completed) = chainA.vault.pendingRedemptions(0);
        assertTrue(completed);
    }
}
