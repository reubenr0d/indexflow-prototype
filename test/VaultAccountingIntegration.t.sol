// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IGMXVault} from "../src/perp/interfaces/IGMXVault.sol";
import {VaultAccounting} from "../src/perp/VaultAccounting.sol";
import {OracleAdapter} from "../src/perp/OracleAdapter.sol";
import {IOracleAdapter} from "../src/perp/interfaces/IOracleAdapter.sol";
import {IPerp} from "../src/perp/interfaces/IPerp.sol";
import {MockUSDC} from "../src/vault/MockUSDC.sol";

/// @dev Mock ERC20 with configurable decimals for index tokens
contract MockIndexToken is IERC20 {
    string public name;
    string public symbol;
    uint8 public immutable tokenDecimals;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory _name, string memory _symbol, uint8 _decimals) {
        name = _name;
        symbol = _symbol;
        tokenDecimals = _decimals;
    }

    function decimals() external view returns (uint8) {
        return tokenDecimals;
    }

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (allowance[from][msg.sender] != type(uint256).max) {
            allowance[from][msg.sender] -= amount;
        }
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}

interface ISimplePriceFeed {
    function setPrice(address token, uint256 price) external;
    function setGov(address _gov) external;
    function setKeeper(address _keeper, bool _active) external;
    function prices(address token) external view returns (uint256);
    function getPrice(address token, bool maximise, bool includeAmmPrice, bool useSwapPricing)
        external
        view
        returns (uint256);
}

interface IVaultErrorController {
    function setErrors(address _vault, string[] calldata _errors) external;
}

/// @title VaultAccountingIntegrationTest
/// @notice Integration tests for VaultAccounting.openPosition / closePosition
///   against the real GMX Vault (0.6.12 deployed via deployCode).
contract VaultAccountingIntegrationTest is Test {
    uint256 constant PRICE_PRECISION = 1e30;
    uint256 constant USDC_PRECISION = 1e6;

    MockUSDC usdc;
    MockIndexToken gold;

    IGMXVault gmxVault;
    ISimplePriceFeed priceFeed;
    address usdgAddr;
    address routerAddr;
    address vaultUtilsAddr;

    OracleAdapter oracleAdapter;
    VaultAccounting vaultAccounting;

    address deployer;
    address basketVault = address(0xBA5E7);

    bytes32 constant GOLD_ID = keccak256("XAU");

    uint256 constant DEPOSIT_AMOUNT = 50_000e6;
    uint256 constant COLLATERAL = 5_000e6;
    uint256 constant SIZE_DELTA = 10_000e30;

    function setUp() public {
        deployer = address(this);

        // ─── Deploy tokens (0.8.24) ──────────────────────────────
        usdc = new MockUSDC();
        gold = new MockIndexToken("Gold Token", "GOLD", 18);

        // ─── Deploy GMX stack (0.6.12 via deployCode) ────────────

        address pfAddr = deployCode("SimplePriceFeed.sol:SimplePriceFeed");
        priceFeed = ISimplePriceFeed(pfAddr);

        priceFeed.setPrice(address(usdc), 1e30);
        priceFeed.setPrice(address(gold), 2000e30);

        address vaultAddr = deployCode("Vault.sol:Vault");
        gmxVault = IGMXVault(vaultAddr);

        usdgAddr = deployCode("USDG.sol:USDG", abi.encode(vaultAddr));
        routerAddr = deployCode("Router.sol:Router", abi.encode(vaultAddr, usdgAddr, address(usdc)));
        vaultUtilsAddr = deployCode("VaultUtils.sol:VaultUtils", abi.encode(vaultAddr));

        gmxVault.initialize(
            routerAddr,
            usdgAddr,
            pfAddr,
            5e30, // liquidationFeeUsd = $5
            600, // fundingRateFactor
            600 // stableFundingRateFactor
        );

        gmxVault.setVaultUtils(vaultUtilsAddr);

        address errCtrl = deployCode("VaultErrorController.sol:VaultErrorController");
        gmxVault.setErrorController(errCtrl);
        _setVaultErrors(errCtrl, vaultAddr);

        gmxVault.setFees(
            0, // taxBasisPoints
            0, // stableTaxBasisPoints
            0, // mintBurnFeeBasisPoints
            0, // swapFeeBasisPoints
            0, // stableSwapFeeBasisPoints
            0, // marginFeeBasisPoints
            5e30, // liquidationFeeUsd ($5)
            0, // minProfitTime
            false // hasDynamicFees
        );

        gmxVault.setTokenConfig(address(usdc), 6, 10000, 0, 0, true, false);
        gmxVault.setTokenConfig(address(gold), 18, 10000, 0, 0, false, true);

        // ─── Seed pool liquidity ─────────────────────────────────
        usdc.mint(deployer, 10_000_000e6);
        usdc.transfer(address(gmxVault), 1_000_000e6);
        gmxVault.directPoolDeposit(address(usdc));

        // ─── Deploy perp stack (0.8.24) ──────────────────────────
        oracleAdapter = new OracleAdapter(deployer);
        oracleAdapter.setKeeper(deployer, true);
        oracleAdapter.configureAsset(GOLD_ID, address(0), IOracleAdapter.FeedType.CustomRelayer, 3600, 5000, 8);
        oracleAdapter.submitPrice(GOLD_ID, 200_000_000_000);

        vaultAccounting = new VaultAccounting(address(usdc), address(gmxVault), address(oracleAdapter), deployer);
        vaultAccounting.mapAssetToken(GOLD_ID, address(gold));

        // ─── Register basket vault & deposit capital ─────────────
        vaultAccounting.registerVault(basketVault);

        usdc.mint(basketVault, DEPOSIT_AMOUNT);
        vm.startPrank(basketVault);
        usdc.approve(address(vaultAccounting), DEPOSIT_AMOUNT);
        vaultAccounting.depositCapital(basketVault, DEPOSIT_AMOUNT);
        vm.stopPrank();
    }

    // ═════════════════════════════════════════════════════════════════
    //  Test: Long position — profitable
    // ═════════════════════════════════════════════════════════════════

    function test_openPosition_long_profitable() public {
        // Open USDC-collateral long on GOLD at $2000
        vaultAccounting.openPosition(basketVault, GOLD_ID, true, SIZE_DELTA, COLLATERAL);

        // Verify GMX Vault position state
        (uint256 size, uint256 posCollateral, uint256 avgPrice,,,,,) =
            gmxVault.getPosition(address(vaultAccounting), address(usdc), address(gold), true);
        assertEq(size, SIZE_DELTA, "GMX position size");
        assertEq(posCollateral, 5_000e30, "GMX position collateral ($5000)");
        assertEq(avgPrice, 2000e30, "GMX position avgPrice ($2000)");

        // Verify VaultAccounting tracking
        IPerp.VaultState memory state = vaultAccounting.getVaultState(basketVault);
        assertEq(state.openInterest, SIZE_DELTA, "Open interest tracks size");
        assertEq(state.positionCount, 1, "One position open");

        // Price goes up 10%: GOLD $2000 → $2200
        priceFeed.setPrice(address(gold), 2200e30);

        // Verify GMX reports profit
        (bool hasProfit, uint256 delta) =
            gmxVault.getPositionDelta(address(vaultAccounting), address(usdc), address(gold), true);
        assertTrue(hasProfit, "Long should profit on price increase");
        assertApproxEqAbs(delta, 1000e30, 1e25, "Profit delta ~$1000");

        (int256 aggUnrealised,) = vaultAccounting.getVaultPnL(basketVault);
        assertApproxEqAbs(uint256(aggUnrealised), 1000e30, 1e25, "Aggregate unrealised matches GMX delta");

        // Close the position
        uint256 vaBefore = usdc.balanceOf(address(vaultAccounting));
        vaultAccounting.closePosition(basketVault, GOLD_ID, true, SIZE_DELTA, 0);
        uint256 received = usdc.balanceOf(address(vaultAccounting)) - vaBefore;

        // Should receive ~$6000 (collateral + profit)
        assertApproxEqAbs(received, 6_000e6, 1e3, "Received ~$6000 USDC");

        // realisedPnL = returned - original collateral = $6000 - $5000 = $1000 profit
        state = vaultAccounting.getVaultState(basketVault);
        assertApproxEqAbs(uint256(state.realisedPnL), 1_000e6, 1e3, "realisedPnL ~$1000 profit");
        assertEq(state.openInterest, 0, "Open interest cleared");
        assertEq(state.positionCount, 0, "Position count cleared");

        // GMX position should be deleted
        (size,,,,,,,) = gmxVault.getPosition(address(vaultAccounting), address(usdc), address(gold), true);
        assertEq(size, 0, "GMX position fully closed");
    }

    // ═════════════════════════════════════════════════════════════════
    //  Test: Long position — loss
    // ═════════════════════════════════════════════════════════════════

    function test_openPosition_long_loss() public {
        vaultAccounting.openPosition(basketVault, GOLD_ID, true, SIZE_DELTA, COLLATERAL);

        // Price drops 10%: GOLD $2000 → $1800
        priceFeed.setPrice(address(gold), 1800e30);

        (bool hasProfit, uint256 delta) =
            gmxVault.getPositionDelta(address(vaultAccounting), address(usdc), address(gold), true);
        assertFalse(hasProfit, "Long should lose on price drop");
        assertApproxEqAbs(delta, 1000e30, 1e25, "Loss delta ~$1000");

        uint256 vaBefore = usdc.balanceOf(address(vaultAccounting));
        vaultAccounting.closePosition(basketVault, GOLD_ID, true, SIZE_DELTA, 0);
        uint256 received = usdc.balanceOf(address(vaultAccounting)) - vaBefore;

        // Should receive ~$4000 (collateral - loss)
        assertApproxEqAbs(received, 4_000e6, 1e3, "Received ~$4000 USDC");

        // realisedPnL = returned - original collateral = $4000 - $5000 = -$1000 loss
        IPerp.VaultState memory state = vaultAccounting.getVaultState(basketVault);
        assertApproxEqAbs(uint256(-state.realisedPnL), 1_000e6, 1e3, "realisedPnL ~-$1000 loss");
        assertTrue(state.realisedPnL < 0, "PnL should be negative");
        assertEq(state.openInterest, 0, "Open interest cleared");
        assertEq(state.positionCount, 0, "Position count cleared");
    }

    // ═════════════════════════════════════════════════════════════════
    //  Test: Short position — profitable (price drops)
    // ═════════════════════════════════════════════════════════════════

    function test_openPosition_short() public {
        // Open USDC-collateral short on GOLD at $2000
        vaultAccounting.openPosition(basketVault, GOLD_ID, false, SIZE_DELTA, COLLATERAL);

        // Verify GMX short position
        (uint256 size, uint256 posCollateral, uint256 avgPrice,,,,,) =
            gmxVault.getPosition(address(vaultAccounting), address(usdc), address(gold), false);
        assertEq(size, SIZE_DELTA, "Short position size");
        assertEq(posCollateral, 5_000e30, "Short position collateral ($5000)");
        assertEq(avgPrice, 2000e30, "Short position avgPrice ($2000)");

        // Price drops 10%: GOLD $2000 → $1800 (good for shorts)
        priceFeed.setPrice(address(gold), 1800e30);

        (bool hasProfit, uint256 delta) =
            gmxVault.getPositionDelta(address(vaultAccounting), address(usdc), address(gold), false);
        assertTrue(hasProfit, "Short should profit on price drop");
        assertApproxEqAbs(delta, 1000e30, 1e25, "Profit delta ~$1000");

        uint256 vaBefore = usdc.balanceOf(address(vaultAccounting));
        vaultAccounting.closePosition(basketVault, GOLD_ID, false, SIZE_DELTA, 0);
        uint256 received = usdc.balanceOf(address(vaultAccounting)) - vaBefore;

        // Should receive ~$6000 (collateral + profit)
        assertApproxEqAbs(received, 6_000e6, 1e3, "Short payout ~$6000 USDC");

        // realisedPnL = returned - original collateral = $6000 - $5000 = $1000 profit
        IPerp.VaultState memory state = vaultAccounting.getVaultState(basketVault);
        assertApproxEqAbs(uint256(state.realisedPnL), 1_000e6, 1e3, "realisedPnL ~$1000 profit");
        assertEq(state.openInterest, 0, "Open interest cleared");
        assertEq(state.positionCount, 0, "Position count cleared");
    }

    // ═════════════════════════════════════════════════════════════════
    //  Test: Full pipeline — deposit, open, close profitable, verify capital
    // ═════════════════════════════════════════════════════════════════

    function test_depositAndWithdrawCapital_withPnL() public {
        uint256 vaBalStart = usdc.balanceOf(address(vaultAccounting));
        assertEq(vaBalStart, DEPOSIT_AMOUNT, "VA starts with deposited capital");

        // Open long
        vaultAccounting.openPosition(basketVault, GOLD_ID, true, SIZE_DELTA, COLLATERAL);

        uint256 vaBalAfterOpen = usdc.balanceOf(address(vaultAccounting));
        assertEq(vaBalAfterOpen, DEPOSIT_AMOUNT - COLLATERAL, "VA balance decreased by collateral");

        // Price goes up 10%: GOLD $2000 → $2200
        priceFeed.setPrice(address(gold), 2200e30);

        // Close position
        vaultAccounting.closePosition(basketVault, GOLD_ID, true, SIZE_DELTA, 0);

        // VA should now hold more USDC than original deposit (profit accrued)
        uint256 vaBalAfterClose = usdc.balanceOf(address(vaultAccounting));
        uint256 expectedBal = DEPOSIT_AMOUNT - COLLATERAL + 6_000e6;
        assertApproxEqAbs(vaBalAfterClose, expectedBal, 1e3, "VA balance reflects profit");
        assertTrue(vaBalAfterClose > DEPOSIT_AMOUNT, "VA USDC increased by profit");

        // Verify vault state shows positive realisedPnL
        IPerp.VaultState memory state = vaultAccounting.getVaultState(basketVault);
        assertTrue(state.realisedPnL > 0, "Positive realisedPnL");
        assertEq(state.depositedCapital, DEPOSIT_AMOUNT, "Deposited capital unchanged");

        // Basket vault withdraws original deposit
        vm.prank(basketVault);
        vaultAccounting.withdrawCapital(basketVault, DEPOSIT_AMOUNT);

        assertApproxEqAbs(usdc.balanceOf(basketVault), DEPOSIT_AMOUNT, 1e3, "Basket vault recovered original deposit");

        // VaultAccounting still holds the $1000 profit
        uint256 profitRemaining = usdc.balanceOf(address(vaultAccounting));
        assertApproxEqAbs(profitRemaining, 1_000e6, 1e3, "VA retains ~$1000 profit");
    }

    // ═════════════════════════════════════════════════════════════════
    //  Helpers
    // ═════════════════════════════════════════════════════════════════

    function _setVaultErrors(address errCtrl, address vault) internal {
        string[] memory errors = new string[](56);
        errors[0] = "Vault: zero error";
        errors[1] = "Vault: already initialized";
        errors[2] = "Vault: invalid _maxLeverage";
        errors[3] = "Vault: invalid _taxBasisPoints";
        errors[4] = "Vault: invalid _stableTaxBasisPoints";
        errors[5] = "Vault: invalid _mintBurnFeeBasisPoints";
        errors[6] = "Vault: invalid _swapFeeBasisPoints";
        errors[7] = "Vault: invalid _stableSwapFeeBasisPoints";
        errors[8] = "Vault: invalid _marginFeeBasisPoints";
        errors[9] = "Vault: invalid _liquidationFeeUsd";
        errors[10] = "Vault: invalid _fundingInterval";
        errors[11] = "Vault: invalid _fundingRateFactor";
        errors[12] = "Vault: invalid _stableFundingRateFactor";
        errors[13] = "Vault: invalid _tokenWeight";
        errors[14] = "Vault: invalid _token";
        errors[15] = "Vault: _token not whitelisted";
        errors[16] = "Vault: _token not whitelisted";
        errors[17] = "Vault: invalid tokenAmount";
        errors[18] = "Vault: invalid usdgAmount";
        errors[19] = "Vault: _token not whitelisted";
        errors[20] = "Vault: invalid usdgAmount";
        errors[21] = "Vault: invalid redemptionAmount";
        errors[22] = "Vault: invalid amountOut";
        errors[23] = "Vault: swaps not enabled";
        errors[24] = "Vault: _tokenIn not whitelisted";
        errors[25] = "Vault: _tokenOut not whitelisted";
        errors[26] = "Vault: invalid tokens";
        errors[27] = "Vault: invalid tokenAmount";
        errors[28] = "Vault: leverage not enabled";
        errors[29] = "Vault: insufficient collateral for fees";
        errors[30] = "Vault: invalid position.size";
        errors[31] = "Vault: empty position";
        errors[32] = "Vault: position size exceeded";
        errors[33] = "Vault: position collateral exceeded";
        errors[34] = "Vault: invalid liquidator";
        errors[35] = "Vault: empty position";
        errors[36] = "Vault: position cannot be liquidated";
        errors[37] = "Vault: invalid position";
        errors[38] = "Vault: invalid _averagePrice";
        errors[39] = "Vault: collateral should be withdrawn";
        errors[40] = "Vault: _size must be more than _collateral";
        errors[41] = "Vault: invalid msg.sender";
        errors[42] = "Vault: mismatched tokens";
        errors[43] = "Vault: _collateralToken not whitelisted";
        errors[44] = "Vault: _collateralToken must not be a stableToken";
        errors[45] = "Vault: _collateralToken not whitelisted";
        errors[46] = "Vault: _collateralToken must be a stableToken";
        errors[47] = "Vault: _indexToken must not be a stableToken";
        errors[48] = "Vault: _indexToken not shortable";
        errors[49] = "Vault: invalid increase";
        errors[50] = "Vault: reserve exceeds pool";
        errors[51] = "Vault: max USDG exceeded";
        errors[52] = "Vault: reserve exceeds pool";
        errors[53] = "Vault: forbidden";
        errors[54] = "Vault: forbidden";
        errors[55] = "Vault: maxGasPrice exceeded";

        IVaultErrorController(errCtrl).setErrors(vault, errors);
    }
}
