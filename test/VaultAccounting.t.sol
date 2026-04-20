// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/perp/VaultAccounting.sol";
import "../src/perp/OracleAdapter.sol";
import "../src/perp/interfaces/IOracleAdapter.sol";
import "../src/perp/interfaces/IPerp.sol";
import "../src/vault/MockUSDC.sol";

contract MockGMXVault {
    mapping(bytes32 => uint256) internal _sizeByKey;
    mapping(address => uint256) internal _prices;

    bool public mockHasProfit = true;
    uint256 public mockDelta;

    function _posKey(address indexToken, bool isLong) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(indexToken, isLong));
    }

    function setMockPositionDelta(bool hasProfit, uint256 delta) external {
        mockHasProfit = hasProfit;
        mockDelta = delta;
    }

    function setPrice(address token, uint256 price) external {
        _prices[token] = price;
    }

    function getMaxPrice(address token) external view returns (uint256) {
        return _prices[token] > 0 ? _prices[token] : 2000e30;
    }

    function getMinPrice(address token) external view returns (uint256) {
        return _prices[token] > 0 ? _prices[token] : 2000e30;
    }

    function increasePosition(address, address, address indexToken, uint256 sizeDelta, bool isLong) external {
        _sizeByKey[_posKey(indexToken, isLong)] += sizeDelta;
    }

    function decreasePosition(address, address, address indexToken, uint256, uint256 sizeDelta, bool isLong, address)
        external
        returns (uint256)
    {
        bytes32 k = _posKey(indexToken, isLong);
        uint256 sz = _sizeByKey[k];
        _sizeByKey[k] = sz > sizeDelta ? sz - sizeDelta : 0;
        return 0;
    }

    function getPosition(address, address, address indexToken, bool isLong)
        external
        view
        returns (
            uint256 size,
            uint256 collateral,
            uint256 averagePrice,
            uint256 entryFundingRate,
            uint256 reserveAmount,
            uint256 realisedPnl,
            bool hasRealisedProfit,
            uint256 lastIncreasedTime
        )
    {
        size = _sizeByKey[_posKey(indexToken, isLong)];
        if (size == 0) {
            return (0, 0, 0, 0, 0, 0, false, 0);
        }
        return (size, 5_000e30, 2000e30, 0, 0, 0, false, 0);
    }

    function getPositionDelta(address, address, address, bool) external view returns (bool, uint256) {
        return (mockHasProfit, mockDelta);
    }
}

contract VaultAccountingTest is Test {
    VaultAccounting public accounting;
    MockUSDC public usdc;
    OracleAdapter public oracle;
    MockGMXVault public gmxVault;

    address owner = address(this);
    address vault1 = address(0x1111);
    address vault2 = address(0x2222);

    function setUp() public {
        usdc = new MockUSDC();
        oracle = new OracleAdapter(owner);
        gmxVault = new MockGMXVault();

        accounting = new VaultAccounting(address(usdc), address(gmxVault), address(oracle), owner);

        accounting.registerVault(vault1);
        accounting.registerVault(vault2);

        // Mint USDC to vaults for testing
        usdc.mint(vault1, 1_000_000e6);
        usdc.mint(vault2, 500_000e6);
    }

    function test_registerVault() public view {
        assertTrue(accounting.isVaultRegistered(vault1));
        assertTrue(accounting.isVaultRegistered(vault2));
    }

    function test_registerVault_duplicate() public {
        vm.expectRevert(abi.encodeWithSelector(VaultAccounting.VaultAlreadyRegistered.selector, vault1));
        accounting.registerVault(vault1);
    }

    function test_depositCapital() public {
        vm.startPrank(vault1);
        usdc.approve(address(accounting), 100_000e6);
        accounting.depositCapital(vault1, 100_000e6);
        vm.stopPrank();

        IPerp.VaultState memory state = accounting.getVaultState(vault1);
        assertEq(state.depositedCapital, 100_000e6);
        assertEq(accounting.totalDeposited(), 100_000e6);
    }

    function test_withdrawCapital() public {
        vm.startPrank(vault1);
        usdc.approve(address(accounting), 100_000e6);
        accounting.depositCapital(vault1, 100_000e6);

        accounting.withdrawCapital(vault1, 50_000e6);
        vm.stopPrank();

        IPerp.VaultState memory state = accounting.getVaultState(vault1);
        assertEq(state.depositedCapital, 50_000e6);
        assertEq(usdc.balanceOf(vault1), 950_000e6); // 1M - 100k + 50k
    }

    function test_withdrawCapital_insufficient() public {
        vm.startPrank(vault1);
        usdc.approve(address(accounting), 100_000e6);
        accounting.depositCapital(vault1, 100_000e6);

        vm.expectRevert(
            abi.encodeWithSelector(VaultAccounting.InsufficientCapital.selector, vault1, 200_000e6, 100_000e6)
        );
        accounting.withdrawCapital(vault1, 200_000e6);
        vm.stopPrank();
    }

    function test_unregisteredVault_reverts() public {
        address unregistered = address(0xDEAD);

        vm.expectRevert(abi.encodeWithSelector(VaultAccounting.VaultNotRegistered.selector, unregistered));
        vm.prank(unregistered);
        accounting.depositCapital(unregistered, 100e6);
    }

    function test_deregisterVault() public {
        accounting.deregisterVault(vault1);
        assertFalse(accounting.isVaultRegistered(vault1));
    }

    function test_multipleVaults_isolation() public {
        vm.startPrank(vault1);
        usdc.approve(address(accounting), 100_000e6);
        accounting.depositCapital(vault1, 100_000e6);
        vm.stopPrank();

        vm.startPrank(vault2);
        usdc.approve(address(accounting), 50_000e6);
        accounting.depositCapital(vault2, 50_000e6);
        vm.stopPrank();

        IPerp.VaultState memory state1 = accounting.getVaultState(vault1);
        IPerp.VaultState memory state2 = accounting.getVaultState(vault2);

        assertEq(state1.depositedCapital, 100_000e6);
        assertEq(state2.depositedCapital, 50_000e6);
        assertEq(accounting.totalDeposited(), 150_000e6);
    }

    function test_getVaultPnL() public view {
        (int256 unrealised, int256 realised) = accounting.getVaultPnL(vault1);
        assertEq(unrealised, 0);
        assertEq(realised, 0);
    }

    function test_getVaultPnL_openOneLeg() public {
        _depositAndPrepare(vault1, 100_000e6);
        bytes32 xau = keccak256("XAU");
        address xauToken = address(0xAA);

        // Entry price $2000
        gmxVault.setPrice(xauToken, 2000e30);

        vm.prank(vault1);
        accounting.openPosition(vault1, xau, true, 10_000e30, 5_000e6);

        // Price rises to $2200 (10% gain)
        gmxVault.setPrice(xauToken, 2200e30);

        (int256 unrealised,) = accounting.getVaultPnL(vault1);
        // 10_000e30 * (2200-2000)/2000 = 10_000e30 * 0.1 = 1000e30
        assertEq(unrealised, 1000e30);
    }

    function test_getVaultPnL_twoLegs_sameVault() public {
        _depositAndPrepare(vault1, 200_000e6);
        bytes32 xau = keccak256("XAU");
        bytes32 eth = keccak256("ETH");
        address xauToken = address(0xAA);
        address ethToken = address(0xBEEF);
        accounting.mapAssetToken(eth, ethToken);

        // Entry prices
        gmxVault.setPrice(xauToken, 2000e30);
        gmxVault.setPrice(ethToken, 2000e30);

        vm.startPrank(vault1);
        accounting.openPosition(vault1, xau, true, 5_000e30, 3_000e6);
        accounting.openPosition(vault1, eth, true, 5_000e30, 3_000e6);
        vm.stopPrank();

        // Price rises 10% for both
        gmxVault.setPrice(xauToken, 2200e30);
        gmxVault.setPrice(ethToken, 2200e30);

        (int256 unrealised,) = accounting.getVaultPnL(vault1);
        // Each leg: 5_000e30 * 0.1 = 500e30, total = 1000e30
        assertEq(unrealised, 1000e30);
    }

    function test_getVaultPnL_lossSign() public {
        _depositAndPrepare(vault1, 100_000e6);
        bytes32 xau = keccak256("XAU");
        address xauToken = address(0xAA);

        // Entry price $2000
        gmxVault.setPrice(xauToken, 2000e30);

        vm.prank(vault1);
        accounting.openPosition(vault1, xau, true, 10_000e30, 5_000e6);

        // Price drops to $1900 (5% loss)
        gmxVault.setPrice(xauToken, 1900e30);

        (int256 unrealised,) = accounting.getVaultPnL(vault1);
        // 10_000e30 * (2000-1900)/2000 = 10_000e30 * 0.05 = 500e30 loss
        assertEq(unrealised, -500e30);
    }

    function test_getVaultPnL_afterFullClose() public {
        _depositAndPrepare(vault1, 100_000e6);
        bytes32 xau = keccak256("XAU");
        address xauToken = address(0xAA);

        // Entry price $2000
        gmxVault.setPrice(xauToken, 2000e30);

        vm.prank(vault1);
        accounting.openPosition(vault1, xau, true, 10_000e30, 5_000e6);

        // Price rises to $2200
        gmxVault.setPrice(xauToken, 2200e30);

        (int256 unrealised,) = accounting.getVaultPnL(vault1);
        assertEq(unrealised, 1000e30);

        vm.prank(vault1);
        accounting.closePosition(vault1, xau, true, 10_000e30, 0);

        (unrealised,) = accounting.getVaultPnL(vault1);
        assertEq(unrealised, 0);
    }

    function test_positionKey_deterministic() public view {
        bytes32 key1 = accounting.getPositionKey(vault1, keccak256("XAU"), true);
        bytes32 key2 = accounting.getPositionKey(vault1, keccak256("XAU"), true);
        assertEq(key1, key2);

        bytes32 key3 = accounting.getPositionKey(vault1, keccak256("XAU"), false);
        assertTrue(key1 != key3);
    }

    function testFuzz_depositWithdraw(uint256 depositAmt, uint256 withdrawAmt) public {
        depositAmt = bound(depositAmt, 1e6, 500_000e6);
        withdrawAmt = bound(withdrawAmt, 1e6, depositAmt);

        vm.startPrank(vault1);
        usdc.approve(address(accounting), depositAmt);
        accounting.depositCapital(vault1, depositAmt);
        accounting.withdrawCapital(vault1, withdrawAmt);
        vm.stopPrank();

        IPerp.VaultState memory state = accounting.getVaultState(vault1);
        assertEq(state.depositedCapital, depositAmt - withdrawAmt);
    }

    // ─── Risk Limit Tests ────────────────────────────────────────

    function _depositAndPrepare(address vault, uint256 amount) internal {
        vm.startPrank(vault);
        usdc.approve(address(accounting), amount);
        accounting.depositCapital(vault, amount);
        vm.stopPrank();

        bytes32 xau = keccak256("XAU");
        address xauToken = address(0xAA);
        accounting.mapAssetToken(xau, xauToken);
    }

    function test_maxOpenInterest_enforced() public {
        _depositAndPrepare(vault1, 100_000e6);

        bytes32 xau = keccak256("XAU");
        accounting.setMaxOpenInterest(vault1, 5_000e6);

        vm.prank(vault1);
        vm.expectRevert("Exceeds max open interest");
        accounting.openPosition(vault1, xau, true, 10_000e6, 1_000e6);
    }

    function test_maxPositionSize_enforced() public {
        _depositAndPrepare(vault1, 100_000e6);

        bytes32 xau = keccak256("XAU");
        accounting.setMaxPositionSize(vault1, 500e6);

        vm.prank(vault1);
        vm.expectRevert("Exceeds max position size");
        accounting.openPosition(vault1, xau, true, 1_000e6, 100e6);
    }

    function test_pause_blocks_operations() public {
        accounting.setPaused(true);

        vm.startPrank(vault1);
        usdc.approve(address(accounting), 100_000e6);

        vm.expectRevert("Paused");
        accounting.depositCapital(vault1, 100_000e6);
        vm.stopPrank();
    }

    function test_unpause_resumes_operations() public {
        accounting.setPaused(true);
        accounting.setPaused(false);

        vm.startPrank(vault1);
        usdc.approve(address(accounting), 100_000e6);
        accounting.depositCapital(vault1, 100_000e6);
        vm.stopPrank();

        IPerp.VaultState memory state = accounting.getVaultState(vault1);
        assertEq(state.depositedCapital, 100_000e6);
    }

    // ─── Multi-Vault Same-Direction Position Tests ────────────────────────────

    function test_multiVault_sameLongPosition_independentTracking() public {
        // Setup: both vaults deposit and open LONG positions on the same asset
        _depositAndPrepare(vault1, 100_000e6);
        vm.startPrank(vault2);
        usdc.approve(address(accounting), 50_000e6);
        accounting.depositCapital(vault2, 50_000e6);
        vm.stopPrank();

        bytes32 xau = keccak256("XAU");
        address xauToken = address(0xAA);
        gmxVault.setPrice(xauToken, 2000e30);

        // Vault1 opens 100k size with 10k collateral
        vm.prank(vault1);
        accounting.openPosition(vault1, xau, true, 100_000e30, 10_000e6);

        // Vault2 opens 50k size with 5k collateral (same direction!)
        vm.prank(vault2);
        accounting.openPosition(vault2, xau, true, 50_000e30, 5_000e6);

        // Verify each vault tracks its own size independently
        bytes32 key1 = accounting.getPositionKey(vault1, xau, true);
        bytes32 key2 = accounting.getPositionKey(vault2, xau, true);

        VaultAccounting.PositionTracking memory pos1 = accounting.getPositionTracking(key1);
        VaultAccounting.PositionTracking memory pos2 = accounting.getPositionTracking(key2);

        assertEq(pos1.size, 100_000e30, "Vault1 should track its own size");
        assertEq(pos2.size, 50_000e30, "Vault2 should track its own size");
        assertEq(pos1.collateralUsdc, 10_000e6, "Vault1 collateral");
        assertEq(pos2.collateralUsdc, 5_000e6, "Vault2 collateral");
    }

    function test_multiVault_sameLongPosition_correctPnLAttribution() public {
        // Setup both vaults with long positions at same entry price
        _depositAndPrepare(vault1, 100_000e6);
        vm.startPrank(vault2);
        usdc.approve(address(accounting), 50_000e6);
        accounting.depositCapital(vault2, 50_000e6);
        vm.stopPrank();

        bytes32 xau = keccak256("XAU");
        address xauToken = address(0xAA);
        gmxVault.setPrice(xauToken, 2000e30);

        // Both open at $2000
        vm.prank(vault1);
        accounting.openPosition(vault1, xau, true, 100_000e30, 10_000e6);
        vm.prank(vault2);
        accounting.openPosition(vault2, xau, true, 50_000e30, 5_000e6);

        // Price rises 10% to $2200
        gmxVault.setPrice(xauToken, 2200e30);

        // Each vault should see PnL proportional to their own size
        // Vault1: 100k * (2200-2000)/2000 = 100k * 0.1 = 10k profit
        // Vault2: 50k * (2200-2000)/2000 = 50k * 0.1 = 5k profit
        (int256 unrealised1,) = accounting.getVaultPnL(vault1);
        (int256 unrealised2,) = accounting.getVaultPnL(vault2);

        assertEq(unrealised1, 10_000e30, "Vault1 should have 10k unrealised profit");
        assertEq(unrealised2, 5_000e30, "Vault2 should have 5k unrealised profit");
    }

    function test_multiVault_repeatedIncrease_blendedAveragePrice() public {
        _depositAndPrepare(vault1, 100_000e6);

        bytes32 xau = keccak256("XAU");
        address xauToken = address(0xAA);

        // First open at $2000
        gmxVault.setPrice(xauToken, 2000e30);
        vm.prank(vault1);
        accounting.openPosition(vault1, xau, true, 50_000e30, 5_000e6);

        // Second increase at $2200
        gmxVault.setPrice(xauToken, 2200e30);
        vm.prank(vault1);
        accounting.openPosition(vault1, xau, true, 50_000e30, 5_000e6);

        // Check blended average price: (50k * 2000 + 50k * 2200) / 100k = 2100
        bytes32 key = accounting.getPositionKey(vault1, xau, true);
        VaultAccounting.PositionTracking memory pos = accounting.getPositionTracking(key);

        assertEq(pos.size, 100_000e30, "Size should be accumulated");
        assertEq(pos.collateralUsdc, 10_000e6, "Collateral should be accumulated");
        assertEq(pos.averagePrice, 2100e30, "Average price should be blended");

        // Now at $2200, PnL should be: 100k * (2200-2100)/2100 = ~4761.9
        (int256 unrealised,) = accounting.getVaultPnL(vault1);
        // 100_000e30 * 100e30 / 2100e30 = ~4761.9e30 = ~4.762e33
        // Expected: 100000 * 100 / 2100 = 4761.904... USD = 4761904761904761904761904761904761 wei (1e30 precision)
        assertApproxEqRel(unrealised, 4761904761904761904761904761904761, 1e16, "PnL based on blended avg");
    }

    function test_multiVault_partialClose_correctProportionalMath() public {
        // Setup both vaults with long positions
        _depositAndPrepare(vault1, 100_000e6);
        vm.startPrank(vault2);
        usdc.approve(address(accounting), 50_000e6);
        accounting.depositCapital(vault2, 50_000e6);
        vm.stopPrank();

        bytes32 xau = keccak256("XAU");
        address xauToken = address(0xAA);
        gmxVault.setPrice(xauToken, 2000e30);

        vm.prank(vault1);
        accounting.openPosition(vault1, xau, true, 100_000e30, 10_000e6);
        vm.prank(vault2);
        accounting.openPosition(vault2, xau, true, 50_000e30, 5_000e6);

        // Vault1 partially closes 50% of their position
        vm.prank(vault1);
        accounting.closePosition(vault1, xau, true, 50_000e30, 0);

        // Vault1 should have 50k remaining
        bytes32 key1 = accounting.getPositionKey(vault1, xau, true);
        VaultAccounting.PositionTracking memory pos1 = accounting.getPositionTracking(key1);
        assertEq(pos1.size, 50_000e30, "Vault1 should have 50k remaining");
        assertEq(pos1.collateralUsdc, 5_000e6, "Vault1 collateral should be halved");

        // Vault2 should be completely unaffected
        bytes32 key2 = accounting.getPositionKey(vault2, xau, true);
        VaultAccounting.PositionTracking memory pos2 = accounting.getPositionTracking(key2);
        assertEq(pos2.size, 50_000e30, "Vault2 should be unchanged");
        assertEq(pos2.collateralUsdc, 5_000e6, "Vault2 collateral unchanged");
    }

    function test_multiVault_positionCountOnlyIncrementsOnNewPosition() public {
        _depositAndPrepare(vault1, 100_000e6);
        bytes32 xau = keccak256("XAU");
        address xauToken = address(0xAA);
        gmxVault.setPrice(xauToken, 2000e30);

        // First open
        vm.prank(vault1);
        accounting.openPosition(vault1, xau, true, 50_000e30, 5_000e6);

        IPerp.VaultState memory state1 = accounting.getVaultState(vault1);
        assertEq(state1.positionCount, 1, "Position count should be 1");

        // Add to same position
        vm.prank(vault1);
        accounting.openPosition(vault1, xau, true, 50_000e30, 5_000e6);

        IPerp.VaultState memory state2 = accounting.getVaultState(vault1);
        assertEq(state2.positionCount, 1, "Position count should still be 1 (same position)");
    }

    function test_closePosition_revertsIfSizeExceedsPosition() public {
        _depositAndPrepare(vault1, 100_000e6);
        bytes32 xau = keccak256("XAU");
        address xauToken = address(0xAA);
        gmxVault.setPrice(xauToken, 2000e30);

        vm.prank(vault1);
        accounting.openPosition(vault1, xau, true, 50_000e30, 5_000e6);

        vm.prank(vault1);
        vm.expectRevert("Size exceeds position");
        accounting.closePosition(vault1, xau, true, 100_000e30, 0);
    }
}
