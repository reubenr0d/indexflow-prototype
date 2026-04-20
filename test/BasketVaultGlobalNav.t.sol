// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {BasketVault} from "../src/vault/BasketVault.sol";
import {StateRelay} from "../src/coordination/StateRelay.sol";
import {MockUSDC} from "../src/vault/MockUSDC.sol";
import {OracleAdapter} from "../src/perp/OracleAdapter.sol";
import {IOracleAdapter} from "../src/perp/interfaces/IOracleAdapter.sol";

contract BasketVaultGlobalNavTest is Test {
    MockUSDC usdc;
    OracleAdapter oracle;
    address keeper = address(0xBEEF);
    address alice = address(0xA11CE);
    uint64 hubSelector = 1001;
    uint64 spokeSelector = 2002;
    bytes32 constant BHP_ID = keccak256(bytes("BHP"));

    function setUp() public {
        usdc = new MockUSDC();
        oracle = new OracleAdapter(address(this));
        oracle.configureAsset("BHP", address(0), IOracleAdapter.FeedType.CustomRelayer, 3600, 5000, 8);
        oracle.submitPrice(BHP_ID, 50_00000000);
    }

    function _setupVault(uint64 selector, bool withOracle)
        internal
        returns (BasketVault vault, StateRelay relay)
    {
        address oracleAddr = withOracle ? address(oracle) : address(0);
        vault = new BasketVault("Test", address(usdc), oracleAddr, address(this));

        bytes32[] memory assets = new bytes32[](1);
        assets[0] = BHP_ID;
        vault.setAssets(assets);

        relay = new StateRelay(selector, 300, keeper, address(this));
        vault.setStateRelay(address(relay));
    }

    function _postPnL(StateRelay relay, address vault, int256 adj) internal {
        uint64[] memory c = new uint64[](1);
        uint256[] memory w = new uint256[](1);
        c[0] = relay.localChainSelector();
        w[0] = 10000;

        uint256[] memory a = new uint256[](1);
        a[0] = 100_000e6;

        address[] memory v = new address[](1);
        int256[] memory p = new int256[](1);
        v[0] = vault;
        p[0] = adj;

        vm.prank(keeper);
        relay.updateState(c, w, a, v, p, uint48(block.timestamp));
    }

    function testPricingNav_spokeMode() public {
        (BasketVault spokeVault, StateRelay spokeRelay) = _setupVault(spokeSelector, false);

        usdc.mint(alice, 10_000e6);
        vm.startPrank(alice);
        usdc.approve(address(spokeVault), type(uint256).max);
        spokeVault.deposit(10_000e6);
        vm.stopPrank();

        assertEq(spokeVault.getPricingNav(), 10_000e6);

        // Post positive PnL adjustment
        _postPnL(spokeRelay, address(spokeVault), 500e6);

        assertEq(spokeVault.getPricingNav(), 10_500e6);
    }

    function testPricingNav_staleRelayIgnored() public {
        (BasketVault spokeVault, StateRelay spokeRelay) = _setupVault(spokeSelector, false);

        usdc.mint(alice, 10_000e6);
        vm.startPrank(alice);
        usdc.approve(address(spokeVault), type(uint256).max);
        spokeVault.deposit(10_000e6);
        vm.stopPrank();

        _postPnL(spokeRelay, address(spokeVault), 500e6);
        assertEq(spokeVault.getPricingNav(), 10_500e6);

        // Advance past staleness
        vm.warp(block.timestamp + 301);

        // Stale PnL is excluded
        assertEq(spokeVault.getPricingNav(), 10_000e6);
    }

    function testPricingNav_negativePnlClampsToZero() public {
        (BasketVault spokeVault, StateRelay spokeRelay) = _setupVault(spokeSelector, false);

        usdc.mint(alice, 1_000e6);
        vm.startPrank(alice);
        usdc.approve(address(spokeVault), type(uint256).max);
        spokeVault.deposit(1_000e6);
        vm.stopPrank();

        // Loss exceeds total vault value
        _postPnL(spokeRelay, address(spokeVault), -2_000e6);

        assertEq(spokeVault.getPricingNav(), 0);
    }

    function testSharePrice_consistentAcrossHubAndSpoke() public {
        // Hub vault (with oracle, no vaultAccounting for simplicity)
        (BasketVault hubVault, StateRelay hubRelay) = _setupVault(hubSelector, true);

        // Spoke vault (no oracle)
        (BasketVault spokeVault, StateRelay spokeRelay) = _setupVault(spokeSelector, false);

        // Deposit same amount on both
        usdc.mint(alice, 20_000e6);
        vm.startPrank(alice);
        usdc.approve(address(hubVault), type(uint256).max);
        usdc.approve(address(spokeVault), type(uint256).max);
        hubVault.deposit(10_000e6);
        spokeVault.deposit(10_000e6);
        vm.stopPrank();

        // Post same PnL adjustment to both
        int256 adj = 200e6;
        _postPnL(hubRelay, address(hubVault), adj);

        vm.warp(block.timestamp + 1);
        _postPnL(spokeRelay, address(spokeVault), adj);

        assertEq(hubVault.getSharePrice(), spokeVault.getSharePrice());
    }

    function testDeposit_sharesMintedAtCorrectNav() public {
        (BasketVault spokeVault, StateRelay spokeRelay) = _setupVault(spokeSelector, false);

        usdc.mint(alice, 20_000e6);
        vm.startPrank(alice);
        usdc.approve(address(spokeVault), type(uint256).max);

        // First deposit: NAV = 0, bootstrap 1:1
        uint256 shares1 = spokeVault.deposit(10_000e6);
        assertEq(shares1, 10_000e6);
        vm.stopPrank();

        // Post positive PnL
        _postPnL(spokeRelay, address(spokeVault), 2_000e6);

        // NAV is now 12_000e6 with 10_000e6 supply -> shares are more expensive
        vm.prank(alice);
        uint256 shares2 = spokeVault.deposit(6_000e6);

        // shares2 = 6_000e6 * 10_000e6 / 12_000e6 = 5_000e6
        assertEq(shares2, 5_000e6);
    }

    function testRedeem_usdcReturnedAtCorrectNav() public {
        (BasketVault spokeVault, StateRelay spokeRelay) = _setupVault(spokeSelector, false);

        usdc.mint(alice, 10_000e6);
        vm.startPrank(alice);
        usdc.approve(address(spokeVault), type(uint256).max);
        uint256 shares = spokeVault.deposit(10_000e6);
        vm.stopPrank();

        // Positive PnL: NAV = 11_000e6, supply = 10_000e6
        _postPnL(spokeRelay, address(spokeVault), 1_000e6);

        // Redeem half of shares: 5_000e6 * 11_000e6 / 10_000e6 = 5_500e6
        // But vault only has 10_000e6 USDC, so it can cover
        vm.startPrank(alice);
        spokeVault.shareToken().approve(address(spokeVault), type(uint256).max);
        uint256 returned = spokeVault.redeem(5_000e6);
        vm.stopPrank();

        assertEq(returned, 5_500e6);
    }
}
