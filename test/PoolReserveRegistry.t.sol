// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/coordination/PoolReserveRegistry.sol";
import "../src/coordination/interfaces/IPoolReserveRegistry.sol";

contract MockGMXVaultForRegistry {
    mapping(address => uint256) public poolAmounts;
    mapping(address => uint256) public reservedAmounts;

    function setPoolAmount(address token, uint256 amount) external {
        poolAmounts[token] = amount;
    }

    function setReservedAmount(address token, uint256 amount) external {
        reservedAmounts[token] = amount;
    }
}

contract PoolReserveRegistryTest is Test {
    PoolReserveRegistry public registry;
    MockGMXVaultForRegistry public gmxVault;
    address public usdc = makeAddr("USDC");
    uint64 public localSelector = 1;
    address public owner = address(this);
    address public messenger = address(0xBEEF);

    function setUp() public {
        gmxVault = new MockGMXVaultForRegistry();
        gmxVault.setPoolAmount(usdc, 5_000_000e6);
        gmxVault.setReservedAmount(usdc, 1_000_000e6);

        registry = new PoolReserveRegistry(
            address(gmxVault),
            usdc,
            localSelector,
            1800,   // twapWindow: 30 min
            300,    // minSnapshotInterval: 5 min
            3600,   // maxStaleness: 1 hour
            3600,   // maxObservationAge: 1 hour
            2000,   // maxDeltaPerUpdate: 20%
            owner
        );
        registry.setMessenger(messenger);
    }

    function test_initialState() public view {
        IPoolReserveRegistry.PoolState memory state = registry.getLocalPoolState();
        assertEq(state.chainSelector, localSelector);
        assertEq(state.twapPoolAmount, 5_000_000e6);
        assertEq(state.instantPoolAmount, 5_000_000e6);
        assertEq(state.reservedAmount, 1_000_000e6);
        assertEq(state.availableLiquidity, 4_000_000e6);
        assertGt(state.utilizationBps, 0);
        assertEq(state.timestamp, uint48(block.timestamp));
    }

    function test_observe_advancesTWAP() public {
        vm.warp(block.timestamp + 60);
        registry.observe();

        (uint256 cumulative, uint256 lastPool, uint48 lastTime, uint256 twapPool) = registry.twap();
        assertEq(lastPool, 5_000_000e6);
        assertEq(lastTime, uint48(block.timestamp));
        assertGt(cumulative, 0);
        assertGt(twapPool, 0);
    }

    function test_observe_noOpSameBlock() public {
        registry.observe();
        (, , uint48 time1, ) = registry.twap();

        registry.observe();
        (, , uint48 time2, ) = registry.twap();
        assertEq(time1, time2);
    }

    function test_observe_twapReflectsPoolChange() public {
        // Observe at t=1000 with original 5M pool
        vm.warp(1000);
        registry.observe();

        // Change pool to 10M and observe at t=1001 so the new value is recorded
        gmxVault.setPoolAmount(usdc, 10_000_000e6);
        vm.warp(1001);
        registry.observe();

        // Now let the 10M value accumulate for a long time
        vm.warp(3000);
        registry.observe();

        (, , , uint256 twapPool) = registry.twap();
        // Cumulative: 999s @ 5M + 1s @ 5M + 1999s @ 10M
        // Average should be > 5M and < 10M
        assertGt(twapPool, 5_000_000e6, "TWAP should be above old pool amount");
        assertLt(twapPool, 10_000_000e6, "TWAP should be below new pool amount");
    }

    function test_snapshot_emitsEvent() public {
        vm.warp(block.timestamp + 300);
        vm.expectEmit();
        IPoolReserveRegistry.PoolState memory expected = registry.getLocalPoolState();
        emit IPoolReserveRegistry.PoolSnapshot(expected);
        registry.snapshot();
    }

    function test_snapshot_revertsTooSoon() public {
        vm.warp(block.timestamp + 300);
        registry.snapshot();

        vm.expectRevert(PoolReserveRegistry.SnapshotTooSoon.selector);
        registry.snapshot();
    }

    function test_updateRemoteState_works() public {
        uint64 remoteSelector = 2;
        registry.addRemoteChain(remoteSelector);

        IPoolReserveRegistry.PoolState memory remoteState = IPoolReserveRegistry.PoolState({
            chainSelector: remoteSelector,
            twapPoolAmount: 3_000_000e6,
            instantPoolAmount: 3_000_000e6,
            reservedAmount: 500_000e6,
            availableLiquidity: 2_500_000e6,
            utilizationBps: 1667,
            oracleConfigHash: bytes32(0),
            hasBrokenFeeds: false,
            timestamp: uint48(block.timestamp)
        });

        vm.prank(messenger);
        registry.updateRemoteState(remoteState);

        IPoolReserveRegistry.PoolState memory stored = registry.getRemotePoolState(remoteSelector);
        assertEq(stored.twapPoolAmount, 3_000_000e6);
        assertEq(stored.availableLiquidity, 2_500_000e6);
    }

    function test_updateRemoteState_revertsStale() public {
        uint64 remoteSelector = 2;
        registry.addRemoteChain(remoteSelector);

        IPoolReserveRegistry.PoolState memory state1 = _makeRemoteState(remoteSelector, 100);
        vm.prank(messenger);
        registry.updateRemoteState(state1);

        IPoolReserveRegistry.PoolState memory state2 = _makeRemoteState(remoteSelector, 50);
        vm.prank(messenger);
        vm.expectRevert(PoolReserveRegistry.StaleRemoteState.selector);
        registry.updateRemoteState(state2);
    }

    function test_updateRemoteState_revertsDeltaTooLarge() public {
        uint64 remoteSelector = 2;
        registry.addRemoteChain(remoteSelector);

        IPoolReserveRegistry.PoolState memory state1 = IPoolReserveRegistry.PoolState({
            chainSelector: remoteSelector,
            twapPoolAmount: 1_000_000e6,
            instantPoolAmount: 1_000_000e6,
            reservedAmount: 0,
            availableLiquidity: 1_000_000e6,
            utilizationBps: 0,
            oracleConfigHash: bytes32(0),
            hasBrokenFeeds: false,
            timestamp: uint48(100)
        });
        vm.prank(messenger);
        registry.updateRemoteState(state1);

        IPoolReserveRegistry.PoolState memory state2 = IPoolReserveRegistry.PoolState({
            chainSelector: remoteSelector,
            twapPoolAmount: 5_000_000e6, // 400% increase > 20% maxDelta
            instantPoolAmount: 5_000_000e6,
            reservedAmount: 0,
            availableLiquidity: 5_000_000e6,
            utilizationBps: 0,
            oracleConfigHash: bytes32(0),
            hasBrokenFeeds: false,
            timestamp: uint48(200)
        });
        vm.prank(messenger);
        vm.expectRevert();
        registry.updateRemoteState(state2);
    }

    function test_updateRemoteState_revertsNotMessenger() public {
        uint64 remoteSelector = 2;
        registry.addRemoteChain(remoteSelector);

        IPoolReserveRegistry.PoolState memory state = _makeRemoteState(remoteSelector, 100);
        vm.expectRevert(PoolReserveRegistry.OnlyMessenger.selector);
        registry.updateRemoteState(state);
    }

    function test_getRoutingWeights_localOnly() public view {
        (uint64[] memory selectors, uint256[] memory weights, uint256[] memory amounts) =
            registry.getRoutingWeights();
        assertEq(selectors.length, 1);
        assertEq(selectors[0], localSelector);
        assertEq(weights[0], 10_000);
        assertEq(amounts[0], 4_000_000e6);
    }

    function test_getRoutingWeights_proportional() public {
        uint64 remoteSelector = 2;
        registry.addRemoteChain(remoteSelector);

        IPoolReserveRegistry.PoolState memory remoteState = IPoolReserveRegistry.PoolState({
            chainSelector: remoteSelector,
            twapPoolAmount: 2_000_000e6,
            instantPoolAmount: 2_000_000e6,
            reservedAmount: 0,
            availableLiquidity: 2_000_000e6,
            utilizationBps: 0,
            oracleConfigHash: bytes32(0),
            hasBrokenFeeds: false,
            timestamp: uint48(block.timestamp)
        });
        vm.prank(messenger);
        registry.updateRemoteState(remoteState);

        (uint64[] memory selectors, uint256[] memory weights,) = registry.getRoutingWeights();
        assertEq(selectors.length, 2);
        assertEq(selectors[0], localSelector);
        assertEq(selectors[1], remoteSelector);

        uint256 totalWeight = weights[0] + weights[1];
        assertEq(totalWeight, 10_000);

        // local: 4M available, remote: 2M => ~6667 and ~3333
        assertGt(weights[0], weights[1]);
        assertApproxEqAbs(weights[0], 6667, 2);
        assertApproxEqAbs(weights[1], 3333, 2);
    }

    function test_getRoutingWeights_excludesStaleChainsAndBrokenFeeds() public {
        uint64 remote1 = 2;
        uint64 remote2 = 3;
        registry.addRemoteChain(remote1);
        registry.addRemoteChain(remote2);

        // remote1: fresh, healthy
        IPoolReserveRegistry.PoolState memory state1 = IPoolReserveRegistry.PoolState({
            chainSelector: remote1,
            twapPoolAmount: 2_000_000e6,
            instantPoolAmount: 2_000_000e6,
            reservedAmount: 0,
            availableLiquidity: 2_000_000e6,
            utilizationBps: 0,
            oracleConfigHash: bytes32(0),
            hasBrokenFeeds: false,
            timestamp: uint48(block.timestamp)
        });
        vm.prank(messenger);
        registry.updateRemoteState(state1);

        // remote2: broken feeds
        IPoolReserveRegistry.PoolState memory state2 = IPoolReserveRegistry.PoolState({
            chainSelector: remote2,
            twapPoolAmount: 10_000_000e6,
            instantPoolAmount: 10_000_000e6,
            reservedAmount: 0,
            availableLiquidity: 10_000_000e6,
            utilizationBps: 0,
            oracleConfigHash: bytes32(0),
            hasBrokenFeeds: true,
            timestamp: uint48(block.timestamp)
        });
        vm.prank(messenger);
        registry.updateRemoteState(state2);

        (, uint256[] memory weights,) = registry.getRoutingWeights();

        // remote2 (broken) should have 0 weight
        assertEq(weights[2], 0);
        // remaining weight split between local and remote1
        assertEq(weights[0] + weights[1], 10_000);
    }

    function test_getRoutingWeights_zeroLiquidityFallback() public {
        gmxVault.setPoolAmount(usdc, 0);
        gmxVault.setReservedAmount(usdc, 0);

        // Re-observe so TWAP picks up zero
        vm.warp(block.timestamp + 7200);
        registry.observe();

        (, uint256[] memory weights,) = registry.getRoutingWeights();
        assertEq(weights[0], 10_000);
    }

    function test_getAllPoolStates() public {
        uint64 remoteSelector = 2;
        registry.addRemoteChain(remoteSelector);

        IPoolReserveRegistry.PoolState memory remoteState = _makeRemoteState(remoteSelector, uint48(block.timestamp));
        vm.prank(messenger);
        registry.updateRemoteState(remoteState);

        IPoolReserveRegistry.PoolState[] memory all = registry.getAllPoolStates();
        assertEq(all.length, 2);
        assertEq(all[0].chainSelector, localSelector);
        assertEq(all[1].chainSelector, remoteSelector);
    }

    function test_addRemoveRemoteChain() public {
        uint64 sel = 42;
        registry.addRemoteChain(sel);
        assertEq(registry.getRemoteChainCount(), 1);
        assertTrue(registry.isRemoteChain(sel));

        registry.removeRemoteChain(sel);
        assertEq(registry.getRemoteChainCount(), 0);
        assertFalse(registry.isRemoteChain(sel));
    }

    function test_addRemoteChain_revertsDuplicate() public {
        uint64 sel = 42;
        registry.addRemoteChain(sel);
        vm.expectRevert(abi.encodeWithSelector(PoolReserveRegistry.ChainAlreadyRegistered.selector, sel));
        registry.addRemoteChain(sel);
    }

    function test_emergencyPause_wipesRemoteStates() public {
        uint64 sel = 2;
        registry.addRemoteChain(sel);

        IPoolReserveRegistry.PoolState memory state = _makeRemoteState(sel, uint48(block.timestamp));
        vm.prank(messenger);
        registry.updateRemoteState(state);

        registry.emergencyPause();
        IPoolReserveRegistry.PoolState memory after_ = registry.getRemotePoolState(sel);
        assertEq(after_.timestamp, 0);

        // routing weights should be local-only now
        (, uint256[] memory weights,) = registry.getRoutingWeights();
        assertEq(weights[0], 10_000);
    }

    function test_twapFallbackOnStaleObservation() public {
        gmxVault.setPoolAmount(usdc, 5_000_000e6);
        vm.warp(block.timestamp + 60);
        registry.observe();

        gmxVault.setPoolAmount(usdc, 8_000_000e6);
        // Warp beyond maxObservationAge without calling observe
        vm.warp(block.timestamp + 7200);

        IPoolReserveRegistry.PoolState memory state = registry.getLocalPoolState();
        // Should fall back to instantaneous since TWAP is stale
        assertEq(state.twapPoolAmount, 8_000_000e6);
    }

    // ─── Invariant checks ─────────────────────────────────────────

    function test_invariant_weightsSumTo10000() public {
        uint64 r1 = 2;
        uint64 r2 = 3;
        uint64 r3 = 4;
        registry.addRemoteChain(r1);
        registry.addRemoteChain(r2);
        registry.addRemoteChain(r3);

        vm.startPrank(messenger);
        registry.updateRemoteState(_makeRemoteState(r1, uint48(block.timestamp)));
        registry.updateRemoteState(IPoolReserveRegistry.PoolState({
            chainSelector: r2,
            twapPoolAmount: 7_777_777e6,
            instantPoolAmount: 7_777_777e6,
            reservedAmount: 1_111_111e6,
            availableLiquidity: 6_666_666e6,
            utilizationBps: 1428,
            oracleConfigHash: bytes32(0),
            hasBrokenFeeds: false,
            timestamp: uint48(block.timestamp)
        }));
        registry.updateRemoteState(_makeRemoteState(r3, uint48(block.timestamp)));
        vm.stopPrank();

        (, uint256[] memory weights,) = registry.getRoutingWeights();
        uint256 sum;
        for (uint256 i = 0; i < weights.length; i++) {
            sum += weights[i];
        }
        assertEq(sum, 10_000);
    }

    // ─── Helpers ──────────────────────────────────────────────────

    function _makeRemoteState(uint64 sel, uint48 ts) internal pure returns (IPoolReserveRegistry.PoolState memory) {
        return IPoolReserveRegistry.PoolState({
            chainSelector: sel,
            twapPoolAmount: 3_000_000e6,
            instantPoolAmount: 3_000_000e6,
            reservedAmount: 500_000e6,
            availableLiquidity: 2_500_000e6,
            utilizationBps: 1667,
            oracleConfigHash: bytes32(0),
            hasBrokenFeeds: false,
            timestamp: ts
        });
    }
}
