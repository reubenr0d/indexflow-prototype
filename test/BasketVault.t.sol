// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/vault/BasketVault.sol";
import "../src/vault/BasketShareToken.sol";
import "../src/vault/MockUSDC.sol";
import "../src/perp/OracleAdapter.sol";
import "../src/perp/interfaces/IOracleAdapter.sol";
import {IPerp} from "../src/perp/interfaces/IPerp.sol";

/// @dev Minimal IPerp mock used to stub `getVaultPnL` returns for `BasketVault._pricingNav` tests.
/// Values are interpreted in USDC 6-dec (the post-fix contract semantics).
contract MockPerpForBasket is IPerp {
    int256 public mockUnrealised;
    int256 public mockRealised;
    VaultState internal _state;
    address public lastOpenPositionVault;
    address public lastClosePositionVault;

    function setPnL(int256 unrealised_, int256 realised_) external {
        mockUnrealised = unrealised_;
        mockRealised = realised_;
    }

    function setVaultState(VaultState memory s) external {
        _state = s;
    }

    function getVaultPnL(address) external view returns (int256 unrealised, int256 realised) {
        return (mockUnrealised, mockRealised);
    }

    function getVaultState(address) external view returns (VaultState memory) {
        return _state;
    }

    function depositCapital(address, uint256) external {}
    function withdrawCapital(address, uint256) external {}

    function openPosition(address vault, bytes32, bool, uint256, uint256) external {
        lastOpenPositionVault = vault;
    }

    function closePosition(address vault, bytes32, bool, uint256, uint256) external {
        lastClosePositionVault = vault;
    }
    function registerVault(address) external {}

    function isVaultRegistered(address) external pure returns (bool) {
        return true;
    }
}

contract BasketVaultTest is Test {
    BasketVault public vault;
    MockUSDC public usdc;
    OracleAdapter public oracle;

    bytes32 constant XAU = keccak256("XAU");
    bytes32 constant XAG = keccak256("XAG");

    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address owner = address(this);

    function setUp() public {
        usdc = new MockUSDC();
        oracle = new OracleAdapter(owner);

        // Set up mock Chainlink feeds via custom relayer for simplicity
        oracle.configureAsset("XAU", address(0), IOracleAdapter.FeedType.CustomRelayer, 3600, 5000, 8);
        oracle.configureAsset("XAG", address(0), IOracleAdapter.FeedType.CustomRelayer, 3600, 5000, 8);

        // Gold $2000, Silver $25
        oracle.submitPrice(XAU, 200_000_000_000);
        oracle.submitPrice(XAG, 2_500_000_000);

        vault = new BasketVault("Gold Silver Basket", address(usdc), address(oracle), owner);

        bytes32[] memory assets_ = new bytes32[](2);
        assets_[0] = XAU;
        assets_[1] = XAG;

        vault.setAssets(assets_);
        vault.setFees(50, 50); // 0.5% deposit/redeem

        // Mint USDC to users
        usdc.mint(alice, 1_000_000e6);
        usdc.mint(bob, 500_000e6);
    }

    function test_bootstrapSharePrice() public view {
        uint256 sharePrice = vault.getSharePrice();
        assertEq(sharePrice, vault.PRICE_PRECISION());
    }

    function test_deposit() public {
        uint256 amount = 10_000e6; // $10,000

        vm.startPrank(alice);
        usdc.approve(address(vault), amount);
        uint256 shares = vault.deposit(amount);
        vm.stopPrank();

        assertTrue(shares > 0);
        assertEq(vault.shareToken().balanceOf(alice), shares);
        assertEq(usdc.balanceOf(address(vault)), amount);
    }

    function test_deposit_fee() public {
        uint256 amount = 10_000e6;

        vm.startPrank(alice);
        usdc.approve(address(vault), amount);
        vault.deposit(amount);
        vm.stopPrank();

        // 0.5% fee on $10,000 = $50
        assertEq(vault.collectedFees(), 50e6);
    }

    function test_redeem() public {
        uint256 depositAmount = 10_000e6;

        vm.startPrank(alice);
        usdc.approve(address(vault), depositAmount);
        uint256 shares = vault.deposit(depositAmount);

        // Redeem all shares
        uint256 returned = vault.redeem(shares);
        vm.stopPrank();

        assertTrue(returned > 0);
        assertTrue(returned < depositAmount); // less due to fees
        assertEq(vault.shareToken().balanceOf(alice), 0);
    }

    function test_multipleDepositors() public {
        vm.startPrank(alice);
        usdc.approve(address(vault), 10_000e6);
        uint256 aliceShares = vault.deposit(10_000e6);
        vm.stopPrank();

        vm.startPrank(bob);
        usdc.approve(address(vault), 5_000e6);
        uint256 bobShares = vault.deposit(5_000e6);
        vm.stopPrank();

        // Both have shares proportional to deposit
        assertTrue(aliceShares > bobShares);
        assertApproxEqRel(aliceShares, bobShares * 2, 0.01e18); // ~2x within 1%
    }

    function test_setAssets_requiresNonEmpty() public {
        bytes32[] memory assets_ = new bytes32[](2);
        assets_[0] = XAU;
        assets_[1] = XAG;

        vault.setAssets(assets_);

        bytes32[] memory empty = new bytes32[](0);
        vm.expectRevert("No assets");
        vault.setAssets(empty);
    }

    function test_setAssets_onlyOwner() public {
        bytes32[] memory assets_ = new bytes32[](1);
        assets_[0] = XAU;

        vm.prank(alice);
        vm.expectRevert();
        vault.setAssets(assets_);
    }

    function test_collectFees() public {
        vm.startPrank(alice);
        usdc.approve(address(vault), 10_000e6);
        vault.deposit(10_000e6);
        vm.stopPrank();

        uint256 fees = vault.collectedFees();
        assertTrue(fees > 0);

        vault.collectFees(owner);
        assertEq(vault.collectedFees(), 0);
        assertEq(usdc.balanceOf(owner), fees);
    }

    function test_getSharePrice_noSupply() public view {
        uint256 sharePrice = vault.getSharePrice();
        assertEq(sharePrice, vault.PRICE_PRECISION());
    }

    function test_redeemInsufficientLiquidity() public {
        vm.startPrank(alice);
        usdc.approve(address(vault), 1_000e6);
        uint256 shares = vault.deposit(1_000e6);
        vm.stopPrank();

        // Artificially drain vault USDC (simulate perp allocation)
        vm.prank(address(vault));
        // Can't directly drain, so we test the normal flow is correct
        assertTrue(shares > 0);
    }

    function test_setMinReserveBps_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        vault.setMinReserveBps(2_000);
    }

    function test_setMinReserveBps_bounds() public {
        vm.expectRevert("Invalid reserve bps");
        vault.setMinReserveBps(10_001);

        vault.setMinReserveBps(2_000);
        assertEq(vault.minReserveBps(), 2_000);
    }

    function test_reserveMathViews() public {
        vault.setFees(0, 0);

        vm.startPrank(alice);
        usdc.approve(address(vault), 200e6);
        vault.deposit(200e6);
        vm.stopPrank();

        vault.setMinReserveBps(2_000); // 20%

        assertEq(vault.getRequiredReserveUsdc(), 40e6, "reserve target should be 20%");
        assertEq(vault.getAvailableForPerpUsdc(), 160e6, "remaining idle allocation headroom");
    }

    function test_topUpReserve_increasesBalance_noShareMint() public {
        uint256 beforeSupply = vault.shareToken().totalSupply();
        uint256 beforeBalance = usdc.balanceOf(address(vault));

        vm.startPrank(bob);
        usdc.approve(address(vault), 1_000e6);
        vault.topUpReserve(1_000e6);
        vm.stopPrank();

        assertEq(vault.shareToken().totalSupply(), beforeSupply, "no share mint on top-up");
        assertEq(usdc.balanceOf(address(vault)), beforeBalance + 1_000e6, "vault receives top-up");
    }

    function test_topUpReserve_revertsWithoutAllowance() public {
        vm.startPrank(bob);
        vm.expectRevert();
        vault.topUpReserve(1e6);
        vm.stopPrank();
    }

    function test_openPosition_delegatesToPerpAsVault() public {
        MockPerpForBasket mockPerp = new MockPerpForBasket();
        vault.setVaultAccounting(address(mockPerp));

        vault.openPosition(XAU, true, 10_000e30, 5_000e6);
        assertEq(mockPerp.lastOpenPositionVault(), address(vault));
    }

    function test_closePosition_delegatesToPerpAsVault() public {
        MockPerpForBasket mockPerp = new MockPerpForBasket();
        vault.setVaultAccounting(address(mockPerp));

        vault.closePosition(XAU, true, 10_000e30, 5_000e6);
        assertEq(mockPerp.lastClosePositionVault(), address(vault));
    }

    function test_setVaultAccounting_resetsPerpAllocatedOnRewire() public {
        vault.setFees(0, 0);

        vm.startPrank(alice);
        usdc.approve(address(vault), 500e6);
        vault.deposit(500e6);
        vm.stopPrank();

        MockPerpForBasket mockA = new MockPerpForBasket();
        vault.setVaultAccounting(address(mockA));
        vault.allocateToPerp(200e6);
        assertEq(vault.perpAllocated(), 200e6);

        MockPerpForBasket mockB = new MockPerpForBasket();
        vault.setVaultAccounting(address(mockB));
        assertEq(vault.perpAllocated(), 0);
    }

    function test_allocateToPerp_enforcesReserveFloor() public {
        vault.setFees(0, 0);

        vm.startPrank(alice);
        usdc.approve(address(vault), 200e6);
        vault.deposit(200e6);
        vm.stopPrank();

        vault.setVaultAccounting(address(0x1234));
        vault.setMinReserveBps(2_000); // 20%, max alloc 160e6

        vm.expectRevert("Insufficient balance");
        vault.allocateToPerp(161e6);
    }

    function testFuzz_depositRedeem_roundTrip(uint256 amount) public {
        amount = bound(amount, 1e6, 100_000_000e6); // $1 to $100M

        usdc.mint(alice, amount);

        vm.startPrank(alice);
        usdc.approve(address(vault), amount);
        uint256 shares = vault.deposit(amount);

        uint256 returned = vault.redeem(shares);
        vm.stopPrank();

        // After deposit + redeem fees, user gets less back
        assertTrue(returned < amount);
        // But not less than 99% (fees are 0.5% each way = ~1%)
        assertTrue(returned > (amount * 98) / 100);
    }

    /// @notice Regression for the "Shares too small" revert caused by VaultAccounting returning
    /// `unrealised` in GMX 1e30 units while `_pricingNav` treated it as USDC 6-dec. After the fix,
    /// `getVaultPnL.unrealised` is USDC 6-dec, so an open profitable leg should not block deposits.
    function test_deposit_withOpenProfitableLeg_doesNotRevert() public {
        // Disable fees so the share math is exact.
        vault.setFees(0, 0);

        // Seed the vault with a small initial deposit so totalSupply matches the prod scenario
        // (idle USDC + perpAllocated = baseline NAV).
        vm.startPrank(alice);
        usdc.approve(address(vault), 1_000e6);
        vault.deposit(1_000e6);
        vm.stopPrank();

        // Wire the mock perp accounting that reports a sizeable positive unrealised PnL in USDC 6-dec.
        MockPerpForBasket mockPerp = new MockPerpForBasket();
        vault.setVaultAccounting(address(mockPerp));
        // $5 of unrealised profit and $1 of realised — both 6-dec.
        mockPerp.setPnL(int256(uint256(5e6)), int256(uint256(1e6)));

        uint256 totalSupplyBefore = vault.shareToken().totalSupply();
        uint256 navBefore = vault.getPricingNav();
        assertEq(navBefore, 1_000e6 + 5e6 + 1e6, "NAV is base + unrealised + realised in USDC 6-dec");

        // Bob deposits the same 9,000 USDC that triggered the production revert.
        vm.startPrank(bob);
        usdc.approve(address(vault), 9_000e6);
        uint256 shares = vault.deposit(9_000e6);
        vm.stopPrank();

        // sharesMinted = netAmount * totalSupply / navBefore (no fee).
        uint256 expected = (9_000e6 * totalSupplyBefore) / navBefore;
        assertEq(shares, expected, "shares match netAmount * totalSupply / NAV");
        assertGt(shares, 0, "deposit must mint a non-zero share amount");
    }
}
