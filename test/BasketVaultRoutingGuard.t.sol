// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {BasketVault} from "../src/vault/BasketVault.sol";
import {StateRelay} from "../src/coordination/StateRelay.sol";
import {MockUSDC} from "../src/vault/MockUSDC.sol";
import {OracleAdapter} from "../src/perp/OracleAdapter.sol";
import {IOracleAdapter} from "../src/perp/interfaces/IOracleAdapter.sol";

contract BasketVaultRoutingGuardTest is Test {
    BasketVault vault;
    StateRelay relay;
    MockUSDC usdc;
    OracleAdapter oracle;
    address keeper = address(0xBEEF);
    address alice = address(0xA11CE);
    uint64 localSelector = 1001;

    bytes32 constant BHP_ID = keccak256(bytes("BHP"));

    function setUp() public {
        usdc = new MockUSDC();
        oracle = new OracleAdapter(address(this));
        oracle.configureAsset("BHP", address(0), IOracleAdapter.FeedType.CustomRelayer, 3600, 5000, 8);
        oracle.submitPrice(BHP_ID, 50_00000000);

        vault = new BasketVault("Test Vault", address(usdc), address(oracle), address(this));

        bytes32[] memory assets = new bytes32[](1);
        assets[0] = BHP_ID;
        vault.setAssets(assets);

        relay = new StateRelay(localSelector, 300, keeper, address(this));
        vault.setStateRelay(address(relay));

        usdc.mint(alice, 100_000e6);
        vm.prank(alice);
        usdc.approve(address(vault), type(uint256).max);
    }

    uint48 nextTs = 100;

    function _postWeights(uint256 localWeight) internal {
        uint64[] memory c = new uint64[](1);
        uint256[] memory w = new uint256[](1);
        c[0] = localSelector;
        w[0] = localWeight;

        if (localWeight < 10000) {
            c = new uint64[](2);
            w = new uint256[](2);
            c[0] = localSelector;
            c[1] = 9999;
            w[0] = localWeight;
            w[1] = 10000 - localWeight;
        }

        address[] memory v = new address[](0);
        int256[] memory p = new int256[](0);

        vm.prank(keeper);
        relay.updateState(c, w, v, p, nextTs);
        nextTs++;
    }

    function testDeposit_succeedsWhenLocalWeightAboveThreshold() public {
        _postWeights(5000);
        vault.setMinDepositWeightBps(1000);

        vm.prank(alice);
        uint256 shares = vault.deposit(1000e6);
        assertGt(shares, 0);
    }

    function testDeposit_revertsWhenLocalWeightBelowThreshold() public {
        _postWeights(500);
        vault.setMinDepositWeightBps(1000);

        vm.prank(alice);
        vm.expectRevert("Chain not accepting deposits");
        vault.deposit(1000e6);
    }

    function testDeposit_revertsWhenLocalWeightIsZero() public {
        _postWeights(0);
        vault.setMinDepositWeightBps(0);

        // Weight 0, threshold 0 => 0 >= 0, so this should succeed
        vm.prank(alice);
        uint256 shares = vault.deposit(1000e6);
        assertGt(shares, 0);
    }

    function testDeposit_revertsWhenWeightZeroAndThresholdOne() public {
        _postWeights(0);
        vault.setMinDepositWeightBps(1);

        vm.prank(alice);
        vm.expectRevert("Chain not accepting deposits");
        vault.deposit(1000e6);
    }

    function testDeposit_succeedsWhenNoStateRelaySet() public {
        BasketVault noRelayVault = new BasketVault("No Relay", address(usdc), address(oracle), address(this));
        bytes32[] memory assets = new bytes32[](1);
        assets[0] = BHP_ID;
        noRelayVault.setAssets(assets);
        noRelayVault.setMinDepositWeightBps(5000);

        usdc.mint(alice, 10_000e6);
        vm.prank(alice);
        usdc.approve(address(noRelayVault), type(uint256).max);

        vm.prank(alice);
        uint256 shares = noRelayVault.deposit(1000e6);
        assertGt(shares, 0);
    }

    function testDeposit_succeedsWhenThresholdIsZero() public {
        _postWeights(100);
        vault.setMinDepositWeightBps(0);

        vm.prank(alice);
        uint256 shares = vault.deposit(1000e6);
        assertGt(shares, 0);
    }

    function testSetMinDepositWeightBps_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        vault.setMinDepositWeightBps(500);
    }

    function testDeposit_afterKeeperUpdatesWeight() public {
        _postWeights(0);
        vault.setMinDepositWeightBps(1);

        vm.prank(alice);
        vm.expectRevert("Chain not accepting deposits");
        vault.deposit(1000e6);

        _postWeights(5000);

        vm.prank(alice);
        uint256 shares = vault.deposit(1000e6);
        assertGt(shares, 0);
    }
}
