// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {DeploySpoke} from "../script/DeploySpoke.s.sol";
import {MockUSDC} from "../src/vault/MockUSDC.sol";
import {BasketFactory} from "../src/vault/BasketFactory.sol";
import {BasketVault} from "../src/vault/BasketVault.sol";
import {StateRelay} from "../src/coordination/StateRelay.sol";

contract DeploySpokeHarness is DeploySpoke {
    function exposeBuildJson(SpokeDeployed memory d) external pure returns (string memory) {
        return _buildJson(d);
    }

    function exposeLoadBootstrapConfig(string memory chainsJson, string memory chainKey)
        external
        view
        returns (BootstrapConfig memory)
    {
        return _loadBootstrapConfig(chainsJson, chainKey);
    }

    function exposeMaybeBootstrapSpokeBasket(SpokeBootstrapContext memory ctx, BootstrapConfig memory cfg, bool mockUsdc)
        external
        returns (address)
    {
        return _maybeBootstrapSpokeBasket(ctx, cfg, mockUsdc);
    }
}

contract DeploySpokeScriptsTest is Test {
    DeploySpokeHarness internal harness;

    function setUp() public {
        harness = new DeploySpokeHarness();
    }

    function test_buildJson_includes_bootstrap_basket_when_present() public view {
        DeploySpoke.SpokeDeployed memory d = DeploySpoke.SpokeDeployed({
            basketFactory: address(0x1111),
            stateRelay: address(0x2222),
            redemptionReceiver: address(0x3333),
            bootstrapBasket: address(0x4444),
            usdc: address(0x5555)
        });

        string memory json = harness.exposeBuildJson(d);
        assertTrue(_contains(json, '"bootstrapBasket"'));
        assertTrue(_contains(json, vm.toString(address(0x4444))));
    }

    function test_loadBootstrapConfig_defaults_when_absent() public view {
        string memory json = '{"x":{"mockUsdc":true}}';
        DeploySpoke.BootstrapConfig memory cfg = harness.exposeLoadBootstrapConfig(json, ".x");
        assertEq(cfg.enabled, false);
        assertEq(cfg.basketName, "Bootstrap Basket");
        assertEq(cfg.assetSymbol, "USDC");
        assertEq(cfg.reserveAmount, 0);
        assertEq(cfg.depositFeeBps, 0);
        assertEq(cfg.redeemFeeBps, 0);
        assertEq(cfg.minReserveBps, 0);
    }

    function test_loadBootstrapConfig_reads_fields() public view {
        string memory json =
            '{"spoke":{"bootstrap":{"enabled":true,"basketName":"Seed Basket","assetSymbol":"USDC","reserveAmount":2500000000,"depositFeeBps":10,"redeemFeeBps":20,"minReserveBps":1500}}}';
        DeploySpoke.BootstrapConfig memory cfg = harness.exposeLoadBootstrapConfig(json, ".spoke");
        assertEq(cfg.enabled, true);
        assertEq(cfg.basketName, "Seed Basket");
        assertEq(cfg.assetSymbol, "USDC");
        assertEq(cfg.reserveAmount, 2_500_000_000);
        assertEq(cfg.depositFeeBps, 10);
        assertEq(cfg.redeemFeeBps, 20);
        assertEq(cfg.minReserveBps, 1500);
    }

    function test_bootstrap_creates_and_funds_spoke_basket_and_allows_deposit() public {
        MockUSDC usdc = new MockUSDC();
        BasketFactory factory = new BasketFactory(address(usdc), address(0), address(this));
        StateRelay relay = new StateRelay(1, 300, address(this), address(this));

        DeploySpoke.SpokeBootstrapContext memory ctx = DeploySpoke.SpokeBootstrapContext({
            basketFactory: address(factory),
            usdc: address(usdc),
            deployer: address(this),
            stateRelay: address(relay),
            keeperAddr: address(this)
        });

        DeploySpoke.BootstrapConfig memory cfg = DeploySpoke.BootstrapConfig({
            enabled: true,
            basketName: "Bootstrap",
            assetSymbol: "USDC",
            reserveAmount: 100_000e6,
            depositFeeBps: 0,
            redeemFeeBps: 0,
            minReserveBps: 1000
        });

        address vault = harness.exposeMaybeBootstrapSpokeBasket(ctx, cfg, true);
        assertTrue(vault != address(0));
        assertEq(factory.getBasketCount(), 1);
        assertEq(usdc.balanceOf(vault), cfg.reserveAmount);
        assertEq(BasketVault(vault).getAssetCount(), 1);

        address user = address(0xBEEF);
        uint256 depositAmount = 10_000e6;
        usdc.mint(user, depositAmount);

        vm.startPrank(user);
        usdc.approve(vault, depositAmount);
        uint256 mintedShares = BasketVault(vault).deposit(depositAmount);
        vm.stopPrank();

        assertGt(mintedShares, 0);
        assertEq(BasketVault(vault).shareToken().balanceOf(user), mintedShares);
    }

    function test_bootstrap_reverts_on_non_mock_with_reserve_amount() public {
        MockUSDC usdc = new MockUSDC();
        BasketFactory factory = new BasketFactory(address(usdc), address(0), address(this));
        StateRelay relay = new StateRelay(1, 300, address(this), address(this));

        DeploySpoke.SpokeBootstrapContext memory ctx = DeploySpoke.SpokeBootstrapContext({
            basketFactory: address(factory),
            usdc: address(usdc),
            deployer: address(this),
            stateRelay: address(relay),
            keeperAddr: address(this)
        });

        DeploySpoke.BootstrapConfig memory cfg = DeploySpoke.BootstrapConfig({
            enabled: true,
            basketName: "Bootstrap",
            assetSymbol: "USDC",
            reserveAmount: 1e6,
            depositFeeBps: 0,
            redeemFeeBps: 0,
            minReserveBps: 0
        });

        vm.expectRevert(bytes("DeploySpoke: bootstrap reserve requires mockUsdc or external funding"));
        harness.exposeMaybeBootstrapSpokeBasket(ctx, cfg, false);
    }

    function test_bootstrap_disabled_is_noop() public {
        MockUSDC usdc = new MockUSDC();
        BasketFactory factory = new BasketFactory(address(usdc), address(0), address(this));
        StateRelay relay = new StateRelay(1, 300, address(this), address(this));

        DeploySpoke.SpokeBootstrapContext memory ctx = DeploySpoke.SpokeBootstrapContext({
            basketFactory: address(factory),
            usdc: address(usdc),
            deployer: address(this),
            stateRelay: address(relay),
            keeperAddr: address(this)
        });

        DeploySpoke.BootstrapConfig memory cfg = DeploySpoke.BootstrapConfig({
            enabled: false,
            basketName: "",
            assetSymbol: "",
            reserveAmount: 0,
            depositFeeBps: 0,
            redeemFeeBps: 0,
            minReserveBps: 0
        });

        address vault = harness.exposeMaybeBootstrapSpokeBasket(ctx, cfg, true);
        assertEq(vault, address(0));
        assertEq(factory.getBasketCount(), 0);
    }

    function _contains(string memory text, string memory needle) internal pure returns (bool) {
        bytes memory hay = bytes(text);
        bytes memory ndl = bytes(needle);
        if (ndl.length == 0) return true;
        if (ndl.length > hay.length) return false;

        for (uint256 i = 0; i <= hay.length - ndl.length; i++) {
            bool ok = true;
            for (uint256 j = 0; j < ndl.length; j++) {
                if (hay[i + j] != ndl[j]) {
                    ok = false;
                    break;
                }
            }
            if (ok) return true;
        }
        return false;
    }
}
