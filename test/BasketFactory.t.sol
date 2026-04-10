// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {BasketFactory} from "../src/vault/BasketFactory.sol";
import {BasketVault} from "../src/vault/BasketVault.sol";
import {MockUSDC} from "../src/vault/MockUSDC.sol";

contract MockPerpRegistry {
    address public lastRegistered;
    uint256 public registerCalls;

    function registerVault(address vault) external {
        lastRegistered = vault;
        registerCalls++;
    }
}

contract BasketFactoryTest is Test {
    BasketFactory internal factory;
    MockUSDC internal usdc;
    MockPerpRegistry internal perp;

    address internal owner = address(this);
    address internal creator = address(0xBEEF);
    address internal oracle = address(0x1234);

    function setUp() public {
        usdc = new MockUSDC();
        perp = new MockPerpRegistry();
        factory = new BasketFactory(address(usdc), oracle, owner);
    }

    function test_constructor_reverts_on_zero_addresses() public {
        vm.expectRevert("USDC required");
        new BasketFactory(address(0), oracle, owner);

        vm.expectRevert("Oracle required");
        new BasketFactory(address(usdc), address(0), owner);
    }

    function test_setters_are_owner_gated() public {
        vm.prank(creator);
        vm.expectRevert();
        factory.setVaultAccounting(address(perp));

        vm.prank(creator);
        vm.expectRevert();
        factory.setOracleAdapter(address(0x999));

        factory.setVaultAccounting(address(perp));
        assertEq(factory.vaultAccounting(), address(perp));

        factory.setOracleAdapter(address(0x999));
        assertEq(factory.oracleAdapter(), address(0x999));
    }

    function test_setOracleAdapter_reverts_on_zero() public {
        vm.expectRevert("Oracle required");
        factory.setOracleAdapter(address(0));
    }

    function test_createBasket_withoutPerpWiring() public {
        vm.prank(creator);
        address basketAddr = factory.createBasket("Alpha", 125, 250);

        BasketVault basket = BasketVault(basketAddr);
        assertEq(basket.owner(), creator);
        assertEq(address(basket.usdc()), address(usdc));
        assertEq(address(basket.oracleAdapter()), oracle);
        assertEq(basket.depositFeeBps(), 125);
        assertEq(basket.redeemFeeBps(), 250);

        assertEq(factory.getBasketCount(), 1);
        address[] memory all = factory.getAllBaskets();
        assertEq(all.length, 1);
        assertEq(all[0], basketAddr);
    }

    function test_createBasket_withPerpWiring_registersVault() public {
        factory.setVaultAccounting(address(perp));

        vm.prank(creator);
        address basketAddr = factory.createBasket("Beta", 50, 75);

        assertEq(perp.registerCalls(), 1);
        assertEq(perp.lastRegistered(), basketAddr);
        assertEq(BasketVault(basketAddr).owner(), creator);
    }
}
