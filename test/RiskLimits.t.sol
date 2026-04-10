// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {VaultAccounting} from "../src/perp/VaultAccounting.sol";
import {OracleAdapter} from "../src/perp/OracleAdapter.sol";
import {IOracleAdapter} from "../src/perp/interfaces/IOracleAdapter.sol";
import {IPerp} from "../src/perp/interfaces/IPerp.sol";
import {BasketVault} from "../src/vault/BasketVault.sol";
import {MockUSDC} from "../src/vault/MockUSDC.sol";

contract RiskLimitsTest is Test {
    MockUSDC usdc;
    OracleAdapter oracle;
    VaultAccounting accounting;
    BasketVault basket;

    address owner = address(this);
    address nonOwner = address(0xBEEF);
    address mockGmxVault = address(0x1);

    bytes32 constant GOLD = keccak256("GOLD");
    uint256 constant PRICE_PRECISION = 1e30;

    function setUp() public {
        usdc = new MockUSDC();
        oracle = new OracleAdapter(owner);
        accounting = new VaultAccounting(address(usdc), mockGmxVault, address(oracle), owner);
        basket = new BasketVault("TestBasket", address(usdc), address(oracle), owner);

        // Configure oracle with a CustomRelayer asset so BasketVault can price
        oracle.configureAsset(
            "GOLD",
            address(0), // no feed address needed for CustomRelayer
            IOracleAdapter.FeedType.CustomRelayer,
            3600, // staleness threshold
            5000, // deviation bps (50% – generous for tests)
            8 // decimals
        );
        oracle.submitPrice(GOLD, 2000e8); // $2000

        // Set basket assets (100% GOLD)
        bytes32[] memory ids = new bytes32[](1);
        ids[0] = GOLD;
        basket.setAssets(ids);

        // Wire BasketVault -> VaultAccounting and register
        basket.setVaultAccounting(address(accounting));
        accounting.registerVault(address(basket));
    }

    // ─── VaultAccounting: owner-gated setters ────────────────────

    function test_setMaxOpenInterest_onlyOwner() public {
        vm.prank(nonOwner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, nonOwner));
        accounting.setMaxOpenInterest(address(basket), 1000e6);
    }

    function test_setMaxPositionSize_onlyOwner() public {
        vm.prank(nonOwner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, nonOwner));
        accounting.setMaxPositionSize(address(basket), 500e6);
    }

    function test_setPaused_onlyOwner() public {
        vm.prank(nonOwner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, nonOwner));
        accounting.setPaused(true);
    }

    // ─── VaultAccounting: pause / unpause ────────────────────────

    function test_paused_blocksDeposit() public {
        accounting.setPaused(true);

        usdc.mint(owner, 100e6);
        usdc.approve(address(accounting), 100e6);

        vm.expectRevert("Paused");
        accounting.depositCapital(address(basket), 100e6);
    }

    function test_paused_blocksWithdraw() public {
        // Deposit first while unpaused
        usdc.mint(owner, 100e6);
        usdc.approve(address(accounting), 100e6);
        accounting.depositCapital(address(basket), 100e6);

        // Now pause
        accounting.setPaused(true);

        vm.expectRevert("Paused");
        accounting.withdrawCapital(address(basket), 50e6);
    }

    function test_unpause_allowsDeposit() public {
        // Pause then unpause
        accounting.setPaused(true);
        accounting.setPaused(false);

        usdc.mint(owner, 100e6);
        usdc.approve(address(accounting), 100e6);
        accounting.depositCapital(address(basket), 100e6);

        IPerp.VaultState memory vs = accounting.getVaultState(address(basket));
        assertEq(vs.depositedCapital, 100e6, "deposit should succeed after unpause");
    }

    // ─── BasketVault: maxPerpAllocation ──────────────────────────

    function _fundBasket(uint256 amount) internal {
        usdc.mint(owner, amount);
        usdc.approve(address(basket), amount);
        basket.deposit(amount);
    }

    function test_maxPerpAllocation_blocks() public {
        basket.setMaxPerpAllocation(50e6);
        _fundBasket(200e6);

        // Allocate up to the cap – should succeed
        basket.allocateToPerp(50e6);

        // Exceeding the cap by 1 wei – should revert
        vm.expectRevert("Exceeds max perp allocation");
        basket.allocateToPerp(1);
    }

    function test_maxPerpAllocation_allows() public {
        basket.setMaxPerpAllocation(100e6);
        _fundBasket(200e6);

        basket.allocateToPerp(80e6);
        assertEq(basket.perpAllocated(), 80e6, "perpAllocated should track");
    }

    function test_maxPerpAllocation_zero_unlimited() public {
        // maxPerpAllocation defaults to 0 (unlimited)
        assertEq(basket.maxPerpAllocation(), 0);

        _fundBasket(500e6);
        basket.allocateToPerp(500e6);
        assertEq(basket.perpAllocated(), 500e6, "unlimited allocation should work");
    }

    function test_reserveFloor_blocks_thenTopUp_enablesAllocation() public {
        basket.setFees(0, 0);
        basket.setMinReserveBps(8_000); // 80%
        _fundBasket(100e6);

        // Available for perp = 20e6
        assertEq(basket.getRequiredReserveUsdc(), 80e6);
        assertEq(basket.getAvailableForPerpUsdc(), 20e6);

        vm.expectRevert("Insufficient balance");
        basket.allocateToPerp(30e6);

        // Top up reserve pool without minting shares; increases allocatable headroom
        usdc.mint(owner, 50e6);
        usdc.approve(address(basket), 50e6);
        basket.topUpReserve(50e6);

        assertEq(basket.getRequiredReserveUsdc(), 120e6);
        assertEq(basket.getAvailableForPerpUsdc(), 30e6);

        basket.allocateToPerp(30e6);
        assertEq(basket.perpAllocated(), 30e6);
    }
}
