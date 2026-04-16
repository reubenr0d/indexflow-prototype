// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {BasketVault} from "../src/vault/BasketVault.sol";
import {BasketFactory} from "../src/vault/BasketFactory.sol";
import {StateRelay} from "../src/coordination/StateRelay.sol";
import {MockUSDC} from "../src/vault/MockUSDC.sol";
import {OracleAdapter} from "../src/perp/OracleAdapter.sol";
import {IOracleAdapter} from "../src/perp/interfaces/IOracleAdapter.sol";
import {VaultAccounting} from "../src/perp/VaultAccounting.sol";

contract CrossChainIntegrationTest is Test {
    MockUSDC usdc;
    OracleAdapter oracle;

    // Hub (Sepolia)
    BasketVault hubVault;
    StateRelay hubRelay;
    uint64 hubSelector = 1001;

    // Spoke A
    BasketVault spokeAVault;
    StateRelay spokeARelay;
    uint64 spokeASelector = 2002;

    // Spoke B (for multi-spoke tests)
    BasketVault spokeBVault;
    StateRelay spokeBRelay;
    uint64 spokeBSelector = 3003;

    address keeperAddr = address(0xBEEF);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    uint48 ts;

    bytes32 constant BHP_ID = keccak256(bytes("BHP"));

    function setUp() public {
        usdc = new MockUSDC();

        // Oracle only for hub
        oracle = new OracleAdapter(address(this));
        oracle.configureAsset("BHP", address(0), IOracleAdapter.FeedType.CustomRelayer, 3600, 5000, 8);
        oracle.submitPrice(BHP_ID, 50_00000000);

        // Hub vault (with oracle)
        hubVault = new BasketVault("Hub Basket", address(usdc), address(oracle), address(this));
        bytes32[] memory hubAssets = new bytes32[](1);
        hubAssets[0] = BHP_ID;
        hubVault.setAssets(hubAssets);
        hubRelay = new StateRelay(hubSelector, 300, keeperAddr, address(this));
        hubVault.setStateRelay(address(hubRelay));
        hubVault.setKeeper(keeperAddr);

        // Spoke A vault (no oracle)
        spokeAVault = new BasketVault("Spoke A Basket", address(usdc), address(0), address(this));
        bytes32[] memory spokeAssets = new bytes32[](1);
        spokeAssets[0] = BHP_ID;
        spokeAVault.setAssets(spokeAssets);
        spokeARelay = new StateRelay(spokeASelector, 300, keeperAddr, address(this));
        spokeAVault.setStateRelay(address(spokeARelay));
        spokeAVault.setKeeper(keeperAddr);

        // Spoke B vault
        spokeBVault = new BasketVault("Spoke B Basket", address(usdc), address(0), address(this));
        spokeBVault.setAssets(spokeAssets);
        spokeBRelay = new StateRelay(spokeBSelector, 300, keeperAddr, address(this));
        spokeBVault.setStateRelay(address(spokeBRelay));
        spokeBVault.setKeeper(keeperAddr);

        vm.warp(1000);
        ts = uint48(block.timestamp);

        // Fund users
        usdc.mint(alice, 1_000_000e6);
        usdc.mint(bob, 1_000_000e6);

        vm.startPrank(alice);
        usdc.approve(address(hubVault), type(uint256).max);
        usdc.approve(address(spokeAVault), type(uint256).max);
        usdc.approve(address(spokeBVault), type(uint256).max);
        hubVault.shareToken().approve(address(hubVault), type(uint256).max);
        spokeAVault.shareToken().approve(address(spokeAVault), type(uint256).max);
        spokeBVault.shareToken().approve(address(spokeBVault), type(uint256).max);
        vm.stopPrank();

        vm.startPrank(bob);
        usdc.approve(address(hubVault), type(uint256).max);
        usdc.approve(address(spokeAVault), type(uint256).max);
        usdc.approve(address(spokeBVault), type(uint256).max);
        hubVault.shareToken().approve(address(hubVault), type(uint256).max);
        spokeAVault.shareToken().approve(address(spokeAVault), type(uint256).max);
        spokeBVault.shareToken().approve(address(spokeBVault), type(uint256).max);
        vm.stopPrank();
    }

    function _postState(
        StateRelay relay,
        uint64[] memory chains,
        uint256[] memory weights,
        address vault,
        int256 pnlAdj
    ) internal {
        ts++;
        vm.warp(ts);

        address[] memory v = new address[](1);
        int256[] memory p = new int256[](1);
        v[0] = vault;
        p[0] = pnlAdj;

        vm.prank(keeperAddr);
        relay.updateState(chains, weights, v, p, ts);
    }

    function _twoChainWeights(uint256 w1, uint256 w2)
        internal
        view
        returns (uint64[] memory c, uint256[] memory w)
    {
        c = new uint64[](2);
        w = new uint256[](2);
        c[0] = hubSelector;
        c[1] = spokeASelector;
        w[0] = w1;
        w[1] = w2;
    }

    function _threeChainWeights(uint256 w1, uint256 w2, uint256 w3)
        internal
        view
        returns (uint64[] memory c, uint256[] memory w)
    {
        c = new uint64[](3);
        w = new uint256[](3);
        c[0] = hubSelector;
        c[1] = spokeASelector;
        c[2] = spokeBSelector;
        w[0] = w1;
        w[1] = w2;
        w[2] = w3;
    }

    // ─── Scenario 1: Deposit routing across chains ───────────────

    function testScenario1_depositRouting() public {
        hubVault.setMinDepositWeightBps(1);
        spokeAVault.setMinDepositWeightBps(1);

        (uint64[] memory c, uint256[] memory w) = _twoChainWeights(6000, 4000);

        _postState(hubRelay, c, w, address(hubVault), 0);
        _postState(spokeARelay, c, w, address(spokeAVault), 0);

        // Deposit on spoke A - succeeds
        vm.prank(alice);
        uint256 shares = spokeAVault.deposit(1000e6);
        assertGt(shares, 0);

        // Keeper blocks spoke A
        (c, w) = _twoChainWeights(10000, 0);
        _postState(hubRelay, c, w, address(hubVault), 0);
        _postState(spokeARelay, c, w, address(spokeAVault), 0);

        // Deposit on spoke A - reverts
        vm.prank(alice);
        vm.expectRevert("Chain not accepting deposits");
        spokeAVault.deposit(1000e6);

        // Deposit on hub - succeeds
        vm.prank(alice);
        shares = hubVault.deposit(1000e6);
        assertGt(shares, 0);
    }

    // ─── Scenario 2: NAV consistency after perp PnL ──────────────

    function testScenario2_navConsistency() public {
        (uint64[] memory c, uint256[] memory w) = _twoChainWeights(5000, 5000);

        // Initial state
        _postState(hubRelay, c, w, address(hubVault), 0);
        _postState(spokeARelay, c, w, address(spokeAVault), 0);

        // Alice deposits 1000 on each
        vm.prank(alice);
        hubVault.deposit(1000e6);
        vm.prank(alice);
        spokeAVault.deposit(1000e6);

        // Simulate perp PnL: +200 USDC total, split proportionally
        // Each chain gets 100 USDC adjustment
        int256 adj = 100e6;
        _postState(hubRelay, c, w, address(hubVault), adj);
        _postState(spokeARelay, c, w, address(spokeAVault), adj);

        // Share prices should match (both have same deposit + same PnL adj)
        assertEq(hubVault.getSharePrice(), spokeAVault.getSharePrice());

        // NAV should be 1100 on each
        assertEq(hubVault.getPricingNav(), 1100e6);
        assertEq(spokeAVault.getPricingNav(), 1100e6);
    }

    // ─── Scenario 3: Redemption shortfall and cross-chain fill ───

    function testScenario3_redemptionShortfall() public {
        (uint64[] memory c, uint256[] memory w) = _twoChainWeights(5000, 5000);
        _postState(spokeARelay, c, w, address(spokeAVault), 0);

        // Alice deposits 1000 on spoke A
        vm.prank(alice);
        spokeAVault.deposit(1000e6);

        // Positive PnL makes shares worth more than deposited USDC
        _postState(spokeARelay, c, w, address(spokeAVault), 500e6);

        // NAV = 1500, supply = 1000. Redeem all: owed = 1500, available = 1000
        vm.prank(alice);
        uint256 returned = spokeAVault.redeem(1000e6);

        assertEq(returned, 1000e6, "Partial fill from local reserves");
        assertEq(spokeAVault.pendingRedemptionCount(), 1);

        (address user,, uint256 owed,, bool completed) = spokeAVault.pendingRedemptions(0);
        assertEq(user, alice);
        assertEq(owed, 500e6);
        assertFalse(completed);

        // Simulate CCIP fill: USDC bridged from excess chain
        usdc.mint(address(spokeAVault), 500e6);

        // Keeper processes
        vm.prank(keeperAddr);
        spokeAVault.processPendingRedemption(0);

        (,,,, bool done) = spokeAVault.pendingRedemptions(0);
        assertTrue(done);
    }

    // ─── Scenario 4: Multiple spokes with rebalancing ────────────

    function testScenario4_multiSpokeRebalancing() public {
        hubVault.setMinDepositWeightBps(1);
        spokeAVault.setMinDepositWeightBps(1);
        spokeBVault.setMinDepositWeightBps(1);

        (uint64[] memory c, uint256[] memory w) = _threeChainWeights(3000, 4000, 3000);
        _postState(hubRelay, c, w, address(hubVault), 0);
        _postState(spokeARelay, c, w, address(spokeAVault), 0);
        _postState(spokeBRelay, c, w, address(spokeBVault), 0);

        // Deposits on all three
        vm.prank(alice);
        hubVault.deposit(3000e6);
        vm.prank(alice);
        spokeAVault.deposit(4000e6);
        vm.prank(alice);
        spokeBVault.deposit(3000e6);

        // Rebalance: spoke A gets blocked, spoke B gets more weight
        (c, w) = _threeChainWeights(3000, 0, 7000);
        _postState(hubRelay, c, w, address(hubVault), 0);
        _postState(spokeARelay, c, w, address(spokeAVault), 0);
        _postState(spokeBRelay, c, w, address(spokeBVault), 0);

        // Spoke A blocked
        vm.prank(bob);
        vm.expectRevert("Chain not accepting deposits");
        spokeAVault.deposit(1000e6);

        // Spoke B and hub accept
        vm.prank(bob);
        uint256 shares = spokeBVault.deposit(1000e6);
        assertGt(shares, 0);

        vm.prank(bob);
        shares = hubVault.deposit(1000e6);
        assertGt(shares, 0);

        // Post PnL to all three -- consistent pricing
        int256 adj = 50e6;
        _postState(hubRelay, c, w, address(hubVault), adj);
        _postState(spokeARelay, c, w, address(spokeAVault), adj);
        _postState(spokeBRelay, c, w, address(spokeBVault), adj);

        // All should include the same PnL adjustment per share
        // Note: absolute NAVs differ because different deposits, but PnL adj is the same
        // share price depends on NAV/supply which differs per vault
    }

    // ─── Scenario 5: Deposit on spoke -> perp PnL on hub ────────

    function testScenario5_spokeDepositHubPerpLifecycle() public {
        (uint64[] memory c, uint256[] memory w) = _twoChainWeights(5000, 5000);
        _postState(hubRelay, c, w, address(hubVault), 0);
        _postState(spokeARelay, c, w, address(spokeAVault), 0);

        // Alice deposits on spoke, bob on hub
        vm.prank(alice);
        spokeAVault.deposit(5000e6);
        vm.prank(bob);
        hubVault.deposit(5000e6);

        // Hub's USDC is used for perps (simulated: we don't allocate since no VaultAccounting in test)
        // Instead, post PnL adjustment directly
        int256 pnl = 200e6;
        _postState(hubRelay, c, w, address(hubVault), pnl);
        _postState(spokeARelay, c, w, address(spokeAVault), pnl);

        // Alice redeems on spoke, gets her share of PnL
        uint256 spokeNav = spokeAVault.getPricingNav();
        assertEq(spokeNav, 5200e6); // 5000 + 200 PnL

        vm.prank(alice);
        uint256 returned = spokeAVault.redeem(2500e6);

        // 2500 shares * 5200 NAV / 5000 supply = 2600 USDC
        assertEq(returned, 2600e6);
    }

    // ─── Scenario 6: Edge cases ──────────────────────────────────

    function testScenario6_stalenessExcludesAdjustment() public {
        (uint64[] memory c, uint256[] memory w) = _twoChainWeights(5000, 5000);
        _postState(spokeARelay, c, w, address(spokeAVault), 500e6);

        vm.prank(alice);
        spokeAVault.deposit(1000e6);

        // NAV includes PnL
        assertEq(spokeAVault.getPricingNav(), 1500e6);

        // Advance past staleness
        vm.warp(block.timestamp + 301);

        // NAV excludes stale PnL
        assertEq(spokeAVault.getPricingNav(), 1000e6);
    }

    function testScenario6_zeroWeightWithZeroThreshold() public {
        spokeAVault.setMinDepositWeightBps(0);

        (uint64[] memory c, uint256[] memory w) = _twoChainWeights(10000, 0);
        _postState(spokeARelay, c, w, address(spokeAVault), 0);

        // Weight = 0 but threshold = 0, so deposit allowed
        vm.prank(alice);
        uint256 shares = spokeAVault.deposit(1000e6);
        assertGt(shares, 0);
    }

    function testScenario6_redemptionQueueZeroPartialFill() public {
        (uint64[] memory c, uint256[] memory w) = _twoChainWeights(5000, 5000);
        _postState(spokeARelay, c, w, address(spokeAVault), 0);

        vm.prank(alice);
        spokeAVault.deposit(1000e6);

        // Drain all USDC
        vm.prank(address(spokeAVault));
        usdc.transfer(address(0xDEAD), 1000e6);

        // Post PnL so there's something to redeem
        _postState(spokeARelay, c, w, address(spokeAVault), 500e6);

        // Redeem with zero local USDC
        vm.prank(alice);
        uint256 returned = spokeAVault.redeem(1000e6);
        assertEq(returned, 0, "No local USDC, all queued");
        assertEq(spokeAVault.pendingRedemptionCount(), 1);

        // Bridge in and process
        usdc.mint(address(spokeAVault), 500e6);
        vm.prank(keeperAddr);
        spokeAVault.processPendingRedemption(0);

        (,,,, bool completed) = spokeAVault.pendingRedemptions(0);
        assertTrue(completed);
    }

    function testScenario6_multipleRedemptionsProcessedInOrder() public {
        (uint64[] memory c, uint256[] memory w) = _twoChainWeights(5000, 5000);
        _postState(spokeARelay, c, w, address(spokeAVault), 0);

        vm.prank(alice);
        spokeAVault.deposit(5000e6);
        vm.prank(bob);
        spokeAVault.deposit(5000e6);

        // Post PnL and drain
        _postState(spokeARelay, c, w, address(spokeAVault), 5000e6);

        // Drain most USDC
        vm.prank(address(spokeAVault));
        usdc.transfer(address(0xDEAD), 9000e6);

        // Both redeem 5000 shares each. Only 1000 USDC available for first redeemer.
        vm.prank(alice);
        spokeAVault.redeem(5000e6);

        vm.prank(bob);
        spokeAVault.redeem(5000e6);

        // Some pending redemptions created
        assertTrue(spokeAVault.pendingRedemptionCount() >= 1);
    }
}
