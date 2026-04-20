// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {StateRelay} from "../src/coordination/StateRelay.sol";

contract StateRelayTest is Test {
    StateRelay relay;
    address keeper = address(0xBEEF);
    address owner = address(this);
    uint64 localSelector = 1001;
    uint48 maxStaleness = 300;

    function setUp() public {
        relay = new StateRelay(localSelector, maxStaleness, keeper, owner);
    }

    function _makeChains2() internal pure returns (uint64[] memory c, uint256[] memory w, uint256[] memory a) {
        c = new uint64[](2);
        w = new uint256[](2);
        a = new uint256[](2);
        c[0] = 1001;
        c[1] = 2002;
        w[0] = 6000;
        w[1] = 4000;
        a[0] = 100_000e6;
        a[1] = 50_000e6;
    }

    function _makeVaults1(address vault, int256 adj) internal pure returns (address[] memory v, int256[] memory p) {
        v = new address[](1);
        p = new int256[](1);
        v[0] = vault;
        p[0] = adj;
    }

    function testUpdateState_setsWeightsAndPnL() public {
        (uint64[] memory c, uint256[] memory w, uint256[] memory a) = _makeChains2();
        address vault = address(0xCAFE);
        (address[] memory v, int256[] memory p) = _makeVaults1(vault, 500e6);

        vm.prank(keeper);
        relay.updateState(c, w, a, v, p, 100);

        assertEq(relay.lastUpdateTime(), 100);
        assertEq(relay.globalPnLAdjustment(vault), 500e6);

        (uint64[] memory rc, uint256[] memory rw,) = relay.getRoutingWeights();
        assertEq(rc.length, 2);
        assertEq(rc[0], 1001);
        assertEq(rw[0], 6000);
        assertEq(rw[1], 4000);
    }

    function testUpdateState_cachesLocalWeight() public {
        (uint64[] memory c, uint256[] memory w, uint256[] memory a) = _makeChains2();
        (address[] memory v, int256[] memory p) = _makeVaults1(address(0xCAFE), 0);

        vm.prank(keeper);
        relay.updateState(c, w, a, v, p, 100);

        assertEq(relay.getLocalWeight(), 6000);
    }

    function testUpdateState_localWeightZeroWhenNotInTable() public {
        uint64[] memory c = new uint64[](1);
        uint256[] memory w = new uint256[](1);
        uint256[] memory a = new uint256[](1);
        c[0] = 9999;
        w[0] = 10000;
        a[0] = 100_000e6;
        (address[] memory v, int256[] memory p) = _makeVaults1(address(0xCAFE), 0);

        vm.prank(keeper);
        relay.updateState(c, w, a, v, p, 100);

        assertEq(relay.getLocalWeight(), 0);
    }

    function testUpdateState_revertsIfStaleTimestamp() public {
        (uint64[] memory c, uint256[] memory w, uint256[] memory a) = _makeChains2();
        (address[] memory v, int256[] memory p) = _makeVaults1(address(0xCAFE), 0);

        vm.prank(keeper);
        relay.updateState(c, w, a, v, p, 100);

        vm.prank(keeper);
        vm.expectRevert(StateRelay.StaleTimestamp.selector);
        relay.updateState(c, w, a, v, p, 100);

        vm.prank(keeper);
        vm.expectRevert(StateRelay.StaleTimestamp.selector);
        relay.updateState(c, w, a, v, p, 50);
    }

    function testUpdateState_revertsIfWeightSumNot10000() public {
        uint64[] memory c = new uint64[](2);
        uint256[] memory w = new uint256[](2);
        uint256[] memory a = new uint256[](2);
        c[0] = 1001;
        c[1] = 2002;
        w[0] = 5000;
        w[1] = 5001;
        a[0] = 100_000e6;
        a[1] = 50_000e6;
        (address[] memory v, int256[] memory p) = _makeVaults1(address(0xCAFE), 0);

        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(StateRelay.WeightSumInvalid.selector, 10001));
        relay.updateState(c, w, a, v, p, 100);
    }

    function testUpdateState_onlyKeeper() public {
        (uint64[] memory c, uint256[] memory w, uint256[] memory a) = _makeChains2();
        (address[] memory v, int256[] memory p) = _makeVaults1(address(0xCAFE), 0);

        vm.prank(address(0xBAD));
        vm.expectRevert(StateRelay.OnlyKeeper.selector);
        relay.updateState(c, w, a, v, p, 100);
    }

    function testGetGlobalPnLAdjustment_returnsStaleFlag() public {
        address vault = address(0xCAFE);
        (uint64[] memory c, uint256[] memory w, uint256[] memory a) = _makeChains2();
        (address[] memory v, int256[] memory p) = _makeVaults1(vault, 100e6);

        vm.prank(keeper);
        relay.updateState(c, w, a, v, p, uint48(block.timestamp));

        (int256 pnl, bool stale) = relay.getGlobalPnLAdjustment(vault);
        assertEq(pnl, 100e6);
        assertFalse(stale);

        vm.warp(block.timestamp + maxStaleness + 1);

        (, bool staleAfter) = relay.getGlobalPnLAdjustment(vault);
        assertTrue(staleAfter);
    }

    function testGetRoutingWeights_returnsFullTable() public {
        (uint64[] memory c, uint256[] memory w, uint256[] memory a) = _makeChains2();
        (address[] memory v, int256[] memory p) = _makeVaults1(address(0xCAFE), 0);

        vm.prank(keeper);
        relay.updateState(c, w, a, v, p, 100);

        (uint64[] memory rc, uint256[] memory rw, uint256[] memory ra) = relay.getRoutingWeights();
        assertEq(rc.length, 2);
        assertEq(rw[0] + rw[1], 10000);
        assertEq(ra[0], 100_000e6);
        assertEq(ra[1], 50_000e6);
    }

    function testSetKeeper() public {
        address newKeeper = address(0x1234);
        relay.setKeeper(newKeeper);
        assertEq(relay.keeper(), newKeeper);
    }

    function testSetMaxStaleness() public {
        relay.setMaxStaleness(600);
        assertEq(relay.maxStaleness(), 600);
    }
}
