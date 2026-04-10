// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/perp/PricingEngine.sol";
import "../src/perp/OracleAdapter.sol";
import "../src/perp/interfaces/IOracleAdapter.sol";
import "../src/mocks/MockChainlinkFeed.sol";

contract PricingEngineTest is Test {
    PricingEngine public engine;
    OracleAdapter public oracle;
    MockChainlinkFeed public xauFeed;

    bytes32 constant XAU = keccak256("XAU");
    bytes32 constant BHP = keccak256("BHP");

    address owner = address(this);

    function setUp() public {
        oracle = new OracleAdapter(owner);
        oracle.setKeeper(owner, true);

        xauFeed = new MockChainlinkFeed(8, "XAU / USD");
        xauFeed.setLatestAnswer(200_000_000_000, block.timestamp); // $2000

        oracle.configureAsset("XAU", address(xauFeed), IOracleAdapter.FeedType.Chainlink, 3600, 5000, 8);
        oracle.configureAsset("BHP", address(0), IOracleAdapter.FeedType.CustomRelayer, 86_400, 2000, 8);
        oracle.submitPrice(BHP, 4_500_000_000); // $45

        engine = new PricingEngine(address(oracle), owner);
    }

    function test_getExecutionPrice_long() public view {
        // Use larger trade relative to liquidity so impact > 0
        uint256 execPrice = engine.getExecutionPrice(
            XAU,
            5_000_000e30, // $5M trade size
            10_000_000e30, // $10M liquidity -> 15 bps impact
            true
        );

        (uint256 oraclePrice,) = oracle.getPrice(XAU);
        assertTrue(execPrice > oraclePrice);
    }

    function test_getExecutionPrice_short() public view {
        uint256 execPrice = engine.getExecutionPrice(XAU, 5_000_000e30, 10_000_000e30, false);

        (uint256 oraclePrice,) = oracle.getPrice(XAU);
        assertTrue(execPrice < oraclePrice);
    }

    function test_getExecutionPrice_zeroSize() public view {
        (uint256 oraclePrice,) = oracle.getPrice(XAU);
        uint256 execPrice = engine.getExecutionPrice(XAU, 0, 10_000_000e30, true);
        assertEq(execPrice, oraclePrice);
    }

    function test_getExecutionPrice_maxImpact() public view {
        // Very large trade relative to liquidity -> capped at max impact
        uint256 execPrice = engine.getExecutionPrice(
            XAU,
            100_000_000e30, // $100M
            1_000_000e30, // $1M liquidity (huge trade)
            true
        );

        (uint256 oraclePrice,) = oracle.getPrice(XAU);
        // Max impact = 500 bps (5%) by default
        uint256 maxPrice = oraclePrice + (oraclePrice * 500) / 10_000;
        assertEq(execPrice, maxPrice);
    }

    function test_configureAssetImpact() public {
        engine.configureAssetImpact(BHP, 100, 300); // 1% factor, 3% max

        uint256 execPrice = engine.getExecutionPrice(
            BHP,
            10_000_000e30,
            1_000_000e30, // Very large relative to liquidity
            true
        );

        (uint256 oraclePrice,) = oracle.getPrice(BHP);
        uint256 maxPrice = oraclePrice + (oraclePrice * 300) / 10_000;
        assertEq(execPrice, maxPrice);
    }

    function test_calculateImpact() public view {
        uint256 impact = engine.calculateImpact(XAU, 100_000e30, 10_000_000e30);
        // impact = (100_000 * 30) / 10_000_000 = 0.3 bps
        assertEq(impact, 0); // rounds to 0 for small trades
    }

    function test_staleOracle_reverts() public {
        vm.warp(block.timestamp + 86_401); // exceed custom-relayer staleness

        vm.expectRevert(abi.encodeWithSelector(PricingEngine.StaleOraclePrice.selector, BHP));
        engine.getExecutionPrice(BHP, 100_000e30, 10_000_000e30, true);
    }

    function test_staleChainlinkOracle_reverts() public {
        vm.warp(block.timestamp + 4000); // exceed chainlink staleness

        vm.expectRevert(abi.encodeWithSelector(PricingEngine.StaleOraclePrice.selector, XAU));
        engine.getExecutionPrice(XAU, 100_000e30, 10_000_000e30, true);
    }

    function testFuzz_symmetricSpread(uint256 sizeDelta) public view {
        sizeDelta = bound(sizeDelta, 1e30, 1_000_000e30);
        uint256 liquidity = 10_000_000e30;

        uint256 longPrice = engine.getExecutionPrice(XAU, sizeDelta, liquidity, true);
        uint256 shortPrice = engine.getExecutionPrice(XAU, sizeDelta, liquidity, false);

        (uint256 oraclePrice,) = oracle.getPrice(XAU);

        // Long price should be above oracle, short below
        assertTrue(longPrice >= oraclePrice);
        assertTrue(shortPrice <= oraclePrice);

        // Spread should be symmetric around oracle
        uint256 longSpread = longPrice - oraclePrice;
        uint256 shortSpread = oraclePrice - shortPrice;
        assertEq(longSpread, shortSpread);
    }
}
