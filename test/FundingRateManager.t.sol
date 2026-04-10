// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {FundingRateManager} from "../src/perp/FundingRateManager.sol";

contract MockFundingGMXVault {
    struct TokenState {
        uint256 pool;
        uint256 reserved;
        uint256 globalShort;
        uint256 cumulativeFunding;
        uint256 nextFunding;
    }

    mapping(address => TokenState) public state;

    uint256 public lastInterval;
    uint256 public lastFundingRateFactor;
    uint256 public lastStableFundingRateFactor;

    function setTokenState(
        address token,
        uint256 pool,
        uint256 reserved,
        uint256 globalShort,
        uint256 cumulativeFunding,
        uint256 nextFunding
    ) external {
        state[token] = TokenState(pool, reserved, globalShort, cumulativeFunding, nextFunding);
    }

    function setFundingRate(uint256 interval, uint256 fundingRateFactor, uint256 stableFundingRateFactor) external {
        lastInterval = interval;
        lastFundingRateFactor = fundingRateFactor;
        lastStableFundingRateFactor = stableFundingRateFactor;
    }

    function poolAmounts(address token) external view returns (uint256) {
        return state[token].pool;
    }

    function reservedAmounts(address token) external view returns (uint256) {
        return state[token].reserved;
    }

    function globalShortSizes(address token) external view returns (uint256) {
        return state[token].globalShort;
    }

    function cumulativeFundingRates(address token) external view returns (uint256) {
        return state[token].cumulativeFunding;
    }

    function getNextFundingRate(address token) external view returns (uint256) {
        return state[token].nextFunding;
    }
}

contract FundingRateManagerTest is Test {
    FundingRateManager internal manager;
    MockFundingGMXVault internal gmx;

    address internal owner = address(this);
    address internal keeper = address(0xA11CE);
    address internal wirer = address(0xB0B);
    bytes32 internal constant ASSET = keccak256("XAU");
    address internal constant TOKEN = address(0x1111);

    function setUp() public {
        gmx = new MockFundingGMXVault();
        manager = new FundingRateManager(address(gmx), address(0x9999), owner);
    }

    function test_setKeeper_and_updateFundingRate() public {
        manager.setKeeper(keeper, true);
        manager.setFundingInterval(7200);

        vm.prank(keeper);
        manager.updateFundingRate(345, 678);

        assertEq(gmx.lastInterval(), 7200);
        assertEq(gmx.lastFundingRateFactor(), 345);
        assertEq(gmx.lastStableFundingRateFactor(), 678);
    }

    function test_updateFundingRate_reverts_for_unauthorized() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert(FundingRateManager.Unauthorized.selector);
        manager.updateFundingRate(1, 1);
    }

    function test_setFundingInterval_reverts_on_zero() public {
        vm.expectRevert("Invalid interval");
        manager.setFundingInterval(0);
    }

    function test_mapAssetToken_owner_or_wirer_only() public {
        vm.prank(address(0xCAFE));
        vm.expectRevert("Not authorized");
        manager.mapAssetToken(ASSET, TOKEN);

        vm.expectRevert("Invalid token");
        manager.mapAssetToken(ASSET, address(0));

        manager.setWirer(wirer, true);
        vm.prank(wirer);
        manager.mapAssetToken(ASSET, TOKEN);

        assertEq(manager.assetTokens(ASSET), TOKEN);
    }

    function test_getLongShortRatio_paths() public {
        assertEq(manager.getLongShortRatio(ASSET), 5000, "unmapped defaults to neutral");

        manager.mapAssetToken(ASSET, TOKEN);
        assertEq(manager.getLongShortRatio(ASSET), 5000, "zero exposure is neutral");

        gmx.setTokenState(TOKEN, 1_000_000, 300_000, 100_000, 0, 0);
        assertEq(manager.getLongShortRatio(ASSET), 7500, "reserved/(reserved+short)");
    }

    function test_calculateFundingRateFactor_default_and_scaled() public {
        assertEq(manager.calculateFundingRateFactor(ASSET), 100, "default base for unmapped asset");

        manager.mapAssetToken(ASSET, TOKEN);
        manager.configureFunding(ASSET, 200, 1000, 2000);

        // Imbalance == threshold (20%) -> base
        gmx.setTokenState(TOKEN, 1_000_000, 60, 40, 11, 22);
        assertEq(manager.calculateFundingRateFactor(ASSET), 200);

        // Imbalance = 80% -> scaled to 800: 200 + (800 * 6000 / 8000)
        gmx.setTokenState(TOKEN, 1_000_000, 90, 10, 11, 22);
        assertEq(manager.calculateFundingRateFactor(ASSET), 800);

        assertEq(manager.getCurrentFundingRate(TOKEN), 11);
        assertEq(manager.getNextFundingRate(TOKEN), 22);
    }

    function test_onlyOwner_setters_revert_for_non_owner() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert();
        manager.setKeeper(keeper, true);

        vm.prank(address(0xDEAD));
        vm.expectRevert();
        manager.setWirer(wirer, true);

        vm.prank(address(0xDEAD));
        vm.expectRevert();
        manager.setDefaultFunding(1, 2);

        vm.prank(address(0xDEAD));
        vm.expectRevert();
        manager.configureFunding(ASSET, 1, 2, 3);
    }
}
