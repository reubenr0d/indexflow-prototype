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

    bool public mockHasProfit = true;
    uint256 public mockDelta;

    function _posKey(address indexToken, bool isLong) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(indexToken, isLong));
    }

    function setMockPositionDelta(bool hasProfit, uint256 delta) external {
        mockHasProfit = hasProfit;
        mockDelta = delta;
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

        gmxVault.setMockPositionDelta(true, 123e30);

        vm.prank(vault1);
        accounting.openPosition(vault1, xau, true, 10_000e30, 5_000e6);

        (int256 unrealised,) = accounting.getVaultPnL(vault1);
        assertEq(unrealised, 123e30);
    }

    function test_getVaultPnL_twoLegs_sameVault() public {
        _depositAndPrepare(vault1, 200_000e6);
        bytes32 xau = keccak256("XAU");
        bytes32 eth = keccak256("ETH");
        address ethToken = address(0xBEEF);
        accounting.mapAssetToken(eth, ethToken);

        gmxVault.setMockPositionDelta(true, 40e30);

        vm.startPrank(vault1);
        accounting.openPosition(vault1, xau, true, 5_000e30, 3_000e6);
        accounting.openPosition(vault1, eth, true, 5_000e30, 3_000e6);
        vm.stopPrank();

        (int256 unrealised,) = accounting.getVaultPnL(vault1);
        assertEq(unrealised, 80e30);
    }

    function test_getVaultPnL_lossSign() public {
        _depositAndPrepare(vault1, 100_000e6);
        bytes32 xau = keccak256("XAU");

        gmxVault.setMockPositionDelta(false, 50e30);

        vm.prank(vault1);
        accounting.openPosition(vault1, xau, true, 10_000e30, 5_000e6);

        (int256 unrealised,) = accounting.getVaultPnL(vault1);
        assertEq(unrealised, -50e30);
    }

    function test_getVaultPnL_afterFullClose() public {
        _depositAndPrepare(vault1, 100_000e6);
        bytes32 xau = keccak256("XAU");

        gmxVault.setMockPositionDelta(true, 77e30);

        vm.prank(vault1);
        accounting.openPosition(vault1, xau, true, 10_000e30, 5_000e6);

        (int256 unrealised,) = accounting.getVaultPnL(vault1);
        assertEq(unrealised, 77e30);

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
}
