// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {PriceSync, ISimplePriceFeed} from "../src/perp/PriceSync.sol";
import {OracleAdapter} from "../src/perp/OracleAdapter.sol";
import {IOracleAdapter} from "../src/perp/interfaces/IOracleAdapter.sol";

contract MockSimplePriceFeed {
    mapping(address => uint256) public prices;

    function setPrice(address _token, uint256 _price) external {
        prices[_token] = _price;
    }

    function setPrices(address[] calldata _tokens, uint256[] calldata _prices) external {
        for (uint256 i = 0; i < _tokens.length; i++) {
            prices[_tokens[i]] = _prices[i];
        }
    }
}

contract PriceSyncTest is Test {
    PriceSync public priceSync;
    OracleAdapter public oracle;
    MockSimplePriceFeed public feed;

    bytes32 constant XAU = keccak256("XAU");
    bytes32 constant XAG = keccak256("XAG");

    address goldToken = address(0xAA01);
    address silverToken = address(0xAA02);

    function setUp() public {
        oracle = new OracleAdapter(address(this));
        oracle.setKeeper(address(this), true);

        oracle.configureAsset(XAU, address(0), IOracleAdapter.FeedType.CustomRelayer, 3600, 5000, 8);
        oracle.configureAsset(XAG, address(0), IOracleAdapter.FeedType.CustomRelayer, 3600, 5000, 8);
        oracle.submitPrice(XAU, 200_000_000_000); // $2000
        oracle.submitPrice(XAG, 2_500_000_000);   // $25

        feed = new MockSimplePriceFeed();

        priceSync = new PriceSync(address(oracle), address(feed), address(this));
        priceSync.addMapping(XAU, goldToken);
        priceSync.addMapping(XAG, silverToken);

        // PriceSync needs to be allowed to call feed.setPrice -- mock has no auth
    }

    function test_syncAll() public {
        priceSync.syncAll();

        // OracleAdapter normalizes to 1e30: $2000 at 8 dec = 200_000_000_000 * 1e22 = 2000e30
        assertEq(feed.prices(goldToken), 2000e30, "Gold price should sync");
        assertEq(feed.prices(silverToken), 25e30, "Silver price should sync");
    }

    function test_syncPrices_selective() public {
        bytes32[] memory ids = new bytes32[](1);
        ids[0] = XAU;
        priceSync.syncPrices(ids);

        assertEq(feed.prices(goldToken), 2000e30, "Gold should be synced");
        assertEq(feed.prices(silverToken), 0, "Silver should NOT be synced");
    }

    function test_syncAfterPriceUpdate() public {
        priceSync.syncAll();
        assertEq(feed.prices(goldToken), 2000e30);

        oracle.submitPrice(XAU, 220_000_000_000); // $2200 (10% move, within 50% deviation)
        priceSync.syncAll();

        assertEq(feed.prices(goldToken), 2200e30, "Price should update after sync");
    }

    function test_addMapping() public {
        bytes32 newId = keccak256("BHP");
        address newToken = address(0xAA03);
        oracle.configureAsset(newId, address(0), IOracleAdapter.FeedType.CustomRelayer, 3600, 5000, 8);
        oracle.submitPrice(newId, 5_000_000_000); // $50

        priceSync.addMapping(newId, newToken);
        assertEq(priceSync.getMappingCount(), 3);
        assertTrue(priceSync.isMapped(newId));

        priceSync.syncAll();
        assertEq(feed.prices(newToken), 50e30);
    }

    function test_addMapping_duplicate_reverts() public {
        vm.expectRevert(abi.encodeWithSelector(PriceSync.MappingAlreadyExists.selector, XAU));
        priceSync.addMapping(XAU, address(0xDEAD));
    }

    function test_removeMapping() public {
        priceSync.removeMapping(XAU);
        assertEq(priceSync.getMappingCount(), 1);
        assertFalse(priceSync.isMapped(XAU));
    }

    function test_removeMapping_notFound_reverts() public {
        bytes32 unknown = keccak256("UNKNOWN");
        vm.expectRevert(abi.encodeWithSelector(PriceSync.MappingNotFound.selector, unknown));
        priceSync.removeMapping(unknown);
    }

    function test_syncPrices_unmapped_reverts() public {
        bytes32[] memory ids = new bytes32[](1);
        ids[0] = keccak256("NOPE");
        vm.expectRevert(abi.encodeWithSelector(PriceSync.MappingNotFound.selector, ids[0]));
        priceSync.syncPrices(ids);
    }

    function test_onlyOwner_addMapping() public {
        vm.prank(address(0xBEEF));
        vm.expectRevert();
        priceSync.addMapping(keccak256("X"), address(0x1));
    }

    function test_getMapping() public view {
        (bytes32 id, address token) = priceSync.getMapping(0);
        assertEq(id, XAU);
        assertEq(token, goldToken);
    }
}
