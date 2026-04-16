// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {BasketVault} from "../src/vault/BasketVault.sol";
import {StateRelay} from "../src/coordination/StateRelay.sol";
import {MockUSDC} from "../src/vault/MockUSDC.sol";
import {OracleAdapter} from "../src/perp/OracleAdapter.sol";
import {IOracleAdapter} from "../src/perp/interfaces/IOracleAdapter.sol";

contract PendingRedemptionTest is Test {
    BasketVault vault;
    StateRelay relay;
    MockUSDC usdc;
    OracleAdapter oracle;
    address keeperAddr = address(0xBEEF);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    uint64 localSelector = 2002;

    bytes32 constant BHP_ID = keccak256(bytes("BHP"));

    function setUp() public {
        usdc = new MockUSDC();
        oracle = new OracleAdapter(address(this));
        oracle.configureAsset("BHP", address(0), IOracleAdapter.FeedType.CustomRelayer, 3600, 5000, 8);
        oracle.submitPrice(BHP_ID, 50_00000000);

        vault = new BasketVault("Test", address(usdc), address(oracle), address(this));

        bytes32[] memory assets = new bytes32[](1);
        assets[0] = BHP_ID;
        vault.setAssets(assets);

        relay = new StateRelay(localSelector, 300, keeperAddr, address(this));
        vault.setStateRelay(address(relay));
        vault.setKeeper(keeperAddr);

        usdc.mint(alice, 100_000e6);
        usdc.mint(bob, 100_000e6);
    }

    function _depositAs(address user, uint256 amount) internal {
        vm.startPrank(user);
        usdc.approve(address(vault), amount);
        vault.deposit(amount);
        vault.shareToken().approve(address(vault), type(uint256).max);
        vm.stopPrank();
    }

    function _postPnL(int256 adj) internal {
        uint64[] memory c = new uint64[](1);
        uint256[] memory w = new uint256[](1);
        c[0] = localSelector;
        w[0] = 10000;
        address[] memory v = new address[](1);
        int256[] memory p = new int256[](1);
        v[0] = address(vault);
        p[0] = adj;

        vm.prank(keeperAddr);
        relay.updateState(c, w, v, p, uint48(block.timestamp));
    }

    function testRedeem_instantWhenSufficientLocal() public {
        _depositAs(alice, 10_000e6);

        uint256 balBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        uint256 returned = vault.redeem(5_000e6);
        uint256 balAfter = usdc.balanceOf(alice);

        assertEq(returned, 5_000e6);
        assertEq(balAfter - balBefore, 5_000e6);
        assertEq(vault.pendingRedemptionCount(), 0);
    }

    function testRedeem_partialFillAndQueue() public {
        _depositAs(alice, 10_000e6);

        // Post positive PnL: shares now worth more than deposited USDC
        _postPnL(5_000e6);

        // NAV = 15_000e6, supply = 10_000e6
        // Redeem all: owed = 10_000e6 * 15_000e6 / 10_000e6 = 15_000e6
        // Available USDC = 10_000e6, so partial fill
        vm.prank(alice);
        uint256 returned = vault.redeem(10_000e6);

        assertEq(returned, 10_000e6, "Should return all available USDC");
        assertEq(vault.pendingRedemptionCount(), 1);

        (address user, uint256 sharesLocked, uint256 usdcOwed,, bool completed) = vault.pendingRedemptions(0);
        assertEq(user, alice);
        assertGt(sharesLocked, 0);
        assertEq(usdcOwed, 5_000e6);
        assertFalse(completed);
    }

    function testRedeem_fullQueueWhenNoLocalReserves() public {
        _depositAs(alice, 10_000e6);
        _postPnL(5_000e6);

        // Drain all USDC by depositing a huge PnL and having someone redeem first
        // Actually, let's test by manipulating: transfer USDC out
        vm.prank(address(vault));
        usdc.transfer(address(0xDEAD), 10_000e6);

        // Now vault has 0 USDC. NAV = 0 + 5_000e6 (PnL only, base = 0)
        // Redeem shares: owed = shares * 5_000e6 / 10_000e6 = half of shares value
        vm.prank(alice);
        uint256 returned = vault.redeem(10_000e6);

        assertEq(returned, 0, "No local USDC, all queued");
        assertEq(vault.pendingRedemptionCount(), 1);
    }

    function testProcessPendingRedemption_releasesUsdc() public {
        _depositAs(alice, 10_000e6);
        _postPnL(2_000e6);

        // NAV = 12_000e6, supply = 10_000e6
        // Redeem all: owed = 12_000e6. Available = 10_000e6. Queue = 2_000e6
        vm.prank(alice);
        vault.redeem(10_000e6);

        assertEq(vault.pendingRedemptionCount(), 1);

        // Simulate USDC bridged in
        usdc.mint(address(vault), 2_000e6);

        uint256 aliceBefore = usdc.balanceOf(alice);
        vm.prank(keeperAddr);
        vault.processPendingRedemption(0);

        uint256 aliceAfter = usdc.balanceOf(alice);
        assertEq(aliceAfter - aliceBefore, 2_000e6);

        (,,,, bool completed) = vault.pendingRedemptions(0);
        assertTrue(completed);
    }

    function testProcessPendingRedemption_revertsIfInsufficientUsdc() public {
        _depositAs(alice, 10_000e6);
        _postPnL(2_000e6);

        vm.prank(alice);
        vault.redeem(10_000e6);

        vm.prank(keeperAddr);
        vm.expectRevert("Insufficient bridged USDC");
        vault.processPendingRedemption(0);
    }

    function testProcessPendingRedemption_onlyKeeper() public {
        _depositAs(alice, 10_000e6);
        _postPnL(2_000e6);

        vm.prank(alice);
        vault.redeem(10_000e6);

        usdc.mint(address(vault), 2_000e6);

        vm.prank(alice);
        vm.expectRevert("Only keeper");
        vault.processPendingRedemption(0);
    }

    function testProcessPendingRedemption_revertsIfAlreadyCompleted() public {
        _depositAs(alice, 10_000e6);
        _postPnL(2_000e6);

        vm.prank(alice);
        vault.redeem(10_000e6);

        usdc.mint(address(vault), 4_000e6);

        vm.prank(keeperAddr);
        vault.processPendingRedemption(0);

        vm.prank(keeperAddr);
        vm.expectRevert("Already completed");
        vault.processPendingRedemption(0);
    }

    function testRedeem_queueEmitsEvent() public {
        _depositAs(alice, 10_000e6);
        _postPnL(5_000e6);

        vm.prank(alice);
        vm.expectEmit(true, true, false, false);
        emit BasketVault.RedemptionQueued(0, alice, 0, 0);
        vault.redeem(10_000e6);
    }

    function testRedeem_multipleQueuedRedemptions() public {
        _depositAs(alice, 10_000e6);
        _depositAs(bob, 10_000e6);
        _postPnL(10_000e6);

        // NAV = 30_000e6, supply = 20_000e6
        // Alice redeems 10_000e6 shares: owed = 15_000e6, available = 20_000e6 -> instant
        vm.prank(alice);
        vault.redeem(10_000e6);

        // After Alice: vault has 5_000e6 USDC, supply = 10_000e6, NAV = 15_000e6
        // Bob redeems 10_000e6 shares: owed = 15_000e6, available = 5_000e6 -> partial + queue
        vm.prank(bob);
        vault.redeem(10_000e6);

        assertEq(vault.pendingRedemptionCount(), 1);

        // Process Bob's queued redemption
        (address user,,uint256 usdcOwed,,) = vault.pendingRedemptions(0);
        assertEq(user, bob);

        usdc.mint(address(vault), usdcOwed);
        vm.prank(keeperAddr);
        vault.processPendingRedemption(0);

        (,,,, bool completed) = vault.pendingRedemptions(0);
        assertTrue(completed);
    }
}
