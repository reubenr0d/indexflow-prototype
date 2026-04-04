// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/perp/OracleAdapter.sol";
import "../src/perp/interfaces/IOracleAdapter.sol";

contract MockChainlinkFeed {
    int256 public price;
    uint256 public updatedAt;
    uint8 public decimals_ = 8;

    function setPrice(int256 _price) external {
        price = _price;
        updatedAt = block.timestamp;
    }

    function setDecimals(uint8 _decimals) external {
        decimals_ = _decimals;
    }

    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt_,
        uint80 answeredInRound
    ) {
        return (1, price, block.timestamp, updatedAt, 1);
    }
}

contract OracleAdapterTest is Test {
    OracleAdapter public oracle;
    MockChainlinkFeed public goldFeed;
    MockChainlinkFeed public silverFeed;

    bytes32 constant XAU = keccak256("XAU");
    bytes32 constant XAG = keccak256("XAG");
    bytes32 constant BHP = keccak256("BHP");

    address keeper = address(0xBEEF);

    function setUp() public {
        oracle = new OracleAdapter(address(this));
        goldFeed = new MockChainlinkFeed();
        silverFeed = new MockChainlinkFeed();

        oracle.setKeeper(keeper, true);

        // Gold at $2000 (8 decimals)
        goldFeed.setPrice(200_000_000_000); // $2000 * 1e8
        // Silver at $25 (8 decimals)
        silverFeed.setPrice(2_500_000_000); // $25 * 1e8

        // Configure Chainlink feeds
        oracle.configureAsset(XAU, address(goldFeed), IOracleAdapter.FeedType.Chainlink, 300, 500, 8);
        oracle.configureAsset(XAG, address(silverFeed), IOracleAdapter.FeedType.Chainlink, 300, 500, 8);

        // Configure custom relayer feed
        oracle.configureAsset(BHP, address(0), IOracleAdapter.FeedType.CustomRelayer, 300, 1000, 8);
    }

    function test_getPrice_chainlink() public view {
        (uint256 price,) = oracle.getPrice(XAU);
        // $2000 normalized to 1e30: 2000 * 1e8 * 1e22 = 2e33
        assertEq(price, 200_000_000_000 * 1e22);
    }

    function test_getPrice_customRelayer() public {
        vm.prank(keeper);
        oracle.submitPrice(BHP, 4_500_000_000); // $45 * 1e8

        (uint256 price,) = oracle.getPrice(BHP);
        assertEq(price, 4_500_000_000 * 1e22);
    }

    function test_submitPrice_onlyKeeper() public {
        vm.expectRevert(OracleAdapter.Unauthorized.selector);
        vm.prank(address(0xDEAD));
        oracle.submitPrice(BHP, 4_500_000_000);
    }

    function test_submitPrice_deviationCircuitBreaker() public {
        vm.prank(keeper);
        oracle.submitPrice(BHP, 1_000_000_000); // $10

        // 50% jump should revert (max deviation 1000 bps = 10%)
        vm.expectRevert(abi.encodeWithSelector(
            OracleAdapter.DeviationTooLarge.selector,
            BHP,
            1_000_000_000 * 1e22,
            1_500_000_000,
            1000
        ));
        vm.prank(keeper);
        oracle.submitPrice(BHP, 1_500_000_000); // $15 = 50% jump
    }

    function test_submitPrices_batch() public {
        bytes32[] memory ids = new bytes32[](1);
        uint256[] memory prices = new uint256[](1);
        ids[0] = BHP;
        prices[0] = 4_500_000_000;

        vm.prank(keeper);
        oracle.submitPrices(ids, prices);

        (uint256 price,) = oracle.getPrice(BHP);
        assertEq(price, 4_500_000_000 * 1e22);
    }

    function test_isStale() public {
        vm.prank(keeper);
        oracle.submitPrice(BHP, 4_500_000_000);

        assertFalse(oracle.isStale(BHP));

        vm.warp(block.timestamp + 400);
        assertTrue(oracle.isStale(BHP));
    }

    function test_isAssetActive() public view {
        assertTrue(oracle.isAssetActive(XAU));
        assertFalse(oracle.isAssetActive(keccak256("INVALID")));
    }

    function test_deactivateAsset() public {
        oracle.deactivateAsset(XAU);
        assertFalse(oracle.isAssetActive(XAU));

        vm.expectRevert(abi.encodeWithSelector(OracleAdapter.AssetNotActive.selector, XAU));
        oracle.getPrice(XAU);
    }

    function test_getPrices_batch() public {
        vm.prank(keeper);
        oracle.submitPrice(BHP, 4_500_000_000);

        bytes32[] memory ids = new bytes32[](2);
        ids[0] = XAU;
        ids[1] = BHP;

        IOracleAdapter.PriceData[] memory prices = oracle.getPrices(ids);
        assertEq(prices.length, 2);
        assertEq(prices[0].price, 200_000_000_000 * 1e22);
        assertEq(prices[1].price, 4_500_000_000 * 1e22);
    }

    function testFuzz_submitPrice_normalizedCorrectly(uint256 rawPrice) public {
        rawPrice = bound(rawPrice, 1, 1e18);

        // First submission has no deviation check
        vm.prank(keeper);
        oracle.submitPrice(BHP, rawPrice);

        (uint256 price,) = oracle.getPrice(BHP);
        assertEq(price, rawPrice * 1e22);
    }
}
