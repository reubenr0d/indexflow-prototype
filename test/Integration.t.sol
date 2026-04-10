// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IGMXVault} from "../src/perp/interfaces/IGMXVault.sol";
import {VaultAccounting} from "../src/perp/VaultAccounting.sol";
import {OracleAdapter} from "../src/perp/OracleAdapter.sol";
import {IOracleAdapter} from "../src/perp/interfaces/IOracleAdapter.sol";
import {IPerp} from "../src/perp/interfaces/IPerp.sol";
import {PriceSync} from "../src/perp/PriceSync.sol";
import {BasketVault} from "../src/vault/BasketVault.sol";
import {BasketShareToken} from "../src/vault/BasketShareToken.sol";
import {BasketFactory} from "../src/vault/BasketFactory.sol";
import {MockUSDC} from "../src/vault/MockUSDC.sol";

/// @dev Mock ERC20 with configurable decimals for index tokens (GOLD, SILVER, etc.)
contract MockToken is IERC20 {
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

/// @dev 0.8.24 interface to call SimplePriceFeed (0.6.12) functions
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

/// @dev 0.8.24 interface to call VaultErrorController (0.6.12)
interface IVaultErrorController {
    function setErrors(address _vault, string[] calldata _errors) external;
}

/// @title IntegrationTest
/// @notice End-to-end integration test deploying the full stack:
///   GMX Vault (0.6.12) + SimplePriceFeed (0.6.12) + VaultAccounting (0.8.24) + OracleAdapter (0.8.24)
///   Tests: USDC-collateral longs, shorts, position PnL, VaultAccounting pipeline
contract IntegrationTest is Test {
    uint256 constant PRICE_PRECISION = 1e30;
    uint256 constant USDC_PRECISION = 1e6;

    // Tokens
    MockUSDC usdc;
    MockToken gold;

    // GMX stack (0.6.12, deployed via deployCode)
    IGMXVault gmxVault;
    ISimplePriceFeed priceFeed;
    address usdgAddr;
    address routerAddr;
    address vaultUtilsAddr;

    // Perp stack (0.8.24)
    OracleAdapter oracleAdapter;
    VaultAccounting vaultAccounting;
    PriceSync priceSync;

    // Test addresses
    address deployer;
    address trader = address(0xCAFE);
    address liquidityProvider = address(0xBEEF);

    bytes32 constant GOLD_ID = keccak256("XAU");

    function setUp() public {
        deployer = address(this);

        // ─── Deploy tokens (0.8.24) ──────────────────────────────
        usdc = new MockUSDC();
        gold = new MockToken("Gold Token", "GOLD", 18);

        // ─── Deploy GMX stack (0.6.12 via deployCode) ────────────

        // 1. SimplePriceFeed
        address pfAddr = deployCode("SimplePriceFeed.sol:SimplePriceFeed");
        priceFeed = ISimplePriceFeed(pfAddr);

        // Set prices BEFORE vault token config (vault validates price on whitelist)
        priceFeed.setPrice(address(usdc), 1e30); // $1
        priceFeed.setPrice(address(gold), 2000e30); // $2000

        // 2. Vault
        address vaultAddr = deployCode("Vault.sol:Vault");
        gmxVault = IGMXVault(vaultAddr);

        // 3. USDG (needs vault address)
        usdgAddr = deployCode("USDG.sol:USDG", abi.encode(vaultAddr));

        // 4. Router (needs vault, usdg, weth -- use usdc as dummy weth)
        routerAddr = deployCode("Router.sol:Router", abi.encode(vaultAddr, usdgAddr, address(usdc)));

        // 5. VaultUtils (needs vault)
        vaultUtilsAddr = deployCode("VaultUtils.sol:VaultUtils", abi.encode(vaultAddr));

        // ─── Initialize GMX Vault ─────────────────────────────────
        gmxVault.initialize(
            routerAddr,
            usdgAddr,
            pfAddr,
            5e30, // liquidationFeeUsd = $5
            600, // fundingRateFactor
            600 // stableFundingRateFactor
        );

        // Attach VaultUtils (cast address to the expected interface type via setVaultUtils)
        gmxVault.setVaultUtils(vaultUtilsAddr);

        // 6. VaultErrorController + error strings
        address errCtrl = deployCode("VaultErrorController.sol:VaultErrorController");
        gmxVault.setErrorController(errCtrl);
        _setVaultErrors(errCtrl, vaultAddr);

        // Zero out all fees for clean test math
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

        // ─── Whitelist tokens ─────────────────────────────────────
        // USDC: stable, not shortable
        gmxVault.setTokenConfig(
            address(usdc),
            6, // decimals
            10000, // weight
            0, // minProfitBps
            0, // maxUsdgAmount (unlimited)
            true, // isStable
            false // isShortable
        );

        // GOLD: non-stable, shortable
        gmxVault.setTokenConfig(
            address(gold),
            18, // decimals
            10000, // weight
            0, // minProfitBps
            0, // maxUsdgAmount (unlimited)
            false, // isStable
            true // isShortable
        );

        // ─── Seed USDC liquidity into the GMX pool ───────────────
        usdc.mint(deployer, 10_000_000e6); // $10M
        usdc.transfer(address(gmxVault), 1_000_000e6); // $1M to pool
        gmxVault.directPoolDeposit(address(usdc));

        // ─── Deploy perp stack (0.8.24) ──────────────────────────
        oracleAdapter = new OracleAdapter(deployer);
        oracleAdapter.setKeeper(deployer, true);

        // Configure GOLD in OracleAdapter as custom relayer feed
        oracleAdapter.configureAsset(
            "XAU",
            address(0),
            IOracleAdapter.FeedType.CustomRelayer,
            3600, // stalenessThreshold (1h)
            5000, // deviationBps (50% -- wide for testing)
            8 // decimals
        );
        oracleAdapter.submitPrice(GOLD_ID, 200_000_000_000); // $2000 in 8 decimals

        vaultAccounting = new VaultAccounting(address(usdc), address(gmxVault), address(oracleAdapter), deployer);

        // Map GOLD asset ID to the GOLD token address for VaultAccounting
        vaultAccounting.mapAssetToken(GOLD_ID, address(gold));

        // ─── Deploy PriceSync (oracle → SimplePriceFeed bridge) ──
        priceSync = new PriceSync(address(oracleAdapter), address(priceFeed), deployer);
        priceFeed.setKeeper(address(priceSync), true);
        priceSync.addMapping(GOLD_ID, address(gold));

        // ─── Mint tokens to test addresses ───────────────────────
        usdc.mint(trader, 100_000e6);
        usdc.mint(liquidityProvider, 500_000e6);
    }

    // ═════════════════════════════════════════════════════════════════
    //  Test: GMX Vault direct — USDC-collateral long (profitable)
    // ═════════════════════════════════════════════════════════════════

    function test_directLong_profitable() public {
        uint256 collateral = 5_000e6; // $5,000 USDC
        uint256 sizeDelta = 10_000e30; // $10,000 position

        // Transfer USDC to vault as collateral
        vm.prank(trader);
        usdc.transfer(address(gmxVault), collateral);

        // Open long: USDC collateral, GOLD index
        vm.prank(trader);
        gmxVault.increasePosition(
            trader,
            address(usdc),
            address(gold),
            sizeDelta,
            true // isLong
        );

        // Verify position opened
        (uint256 size, uint256 posCollateral, uint256 avgPrice,,,,,) =
            gmxVault.getPosition(trader, address(usdc), address(gold), true);
        assertEq(size, sizeDelta, "Position size should match");
        assertEq(posCollateral, 5_000e30, "Collateral should be $5000 (0 fees)");
        assertEq(avgPrice, 2000e30, "Average price should be $2000");

        // Price goes up 10%: GOLD $2000 → $2200
        priceFeed.setPrice(address(gold), 2200e30);

        // Verify PnL
        (bool hasProfit, uint256 delta) = gmxVault.getPositionDelta(trader, address(usdc), address(gold), true);
        assertTrue(hasProfit, "Should be profitable");
        // delta = $10,000 * ($2200-$2000)/$2000 = $1000
        assertApproxEqAbs(delta, 1000e30, 1e25, "Profit should be ~$1000");

        // Close position
        uint256 traderBalBefore = usdc.balanceOf(trader);
        vm.prank(trader);
        gmxVault.decreasePosition(
            trader,
            address(usdc),
            address(gold),
            0, // collateralDelta
            sizeDelta, // close full position
            true,
            trader // receiver
        );

        uint256 traderBalAfter = usdc.balanceOf(trader);
        uint256 payout = traderBalAfter - traderBalBefore;

        // Should get back collateral + profit = $5000 + $1000 = $6000
        assertApproxEqAbs(payout, 6_000e6, 1e3, "Payout should be ~$6000 USDC");

        // Position should be deleted
        (size,,,,,,,) = gmxVault.getPosition(trader, address(usdc), address(gold), true);
        assertEq(size, 0, "Position should be closed");
    }

    // ═════════════════════════════════════════════════════════════════
    //  Test: GMX Vault direct — USDC-collateral long (loss)
    // ═════════════════════════════════════════════════════════════════

    function test_directLong_loss() public {
        uint256 collateral = 5_000e6;
        uint256 sizeDelta = 10_000e30;

        vm.prank(trader);
        usdc.transfer(address(gmxVault), collateral);

        vm.prank(trader);
        gmxVault.increasePosition(trader, address(usdc), address(gold), sizeDelta, true);

        // Price drops 10%: GOLD $2000 → $1800
        priceFeed.setPrice(address(gold), 1800e30);

        (bool hasProfit, uint256 delta) = gmxVault.getPositionDelta(trader, address(usdc), address(gold), true);
        assertFalse(hasProfit, "Should be a loss");
        assertApproxEqAbs(delta, 1000e30, 1e25, "Loss should be ~$1000");

        uint256 traderBalBefore = usdc.balanceOf(trader);
        vm.prank(trader);
        gmxVault.decreasePosition(trader, address(usdc), address(gold), 0, sizeDelta, true, trader);

        uint256 payout = usdc.balanceOf(trader) - traderBalBefore;
        // collateral - loss = $5000 - $1000 = $4000
        assertApproxEqAbs(payout, 4_000e6, 1e3, "Payout should be ~$4000 USDC");
    }

    // ═════════════════════════════════════════════════════════════════
    //  Test: GMX Vault direct — Short position (profitable)
    // ═════════════════════════════════════════════════════════════════

    function test_directShort_profitable() public {
        uint256 collateral = 5_000e6;
        uint256 sizeDelta = 10_000e30;

        vm.prank(trader);
        usdc.transfer(address(gmxVault), collateral);

        vm.prank(trader);
        gmxVault.increasePosition(trader, address(usdc), address(gold), sizeDelta, false);

        // Verify position
        (uint256 size,,,,,,,) = gmxVault.getPosition(trader, address(usdc), address(gold), false);
        assertEq(size, sizeDelta, "Short position size should match");

        // Price drops 10%: GOLD $2000 → $1800 (good for shorts)
        priceFeed.setPrice(address(gold), 1800e30);

        (bool hasProfit, uint256 delta) = gmxVault.getPositionDelta(trader, address(usdc), address(gold), false);
        assertTrue(hasProfit, "Short should be profitable on price drop");
        assertApproxEqAbs(delta, 1000e30, 1e25, "Profit should be ~$1000");

        uint256 traderBalBefore = usdc.balanceOf(trader);
        vm.prank(trader);
        gmxVault.decreasePosition(trader, address(usdc), address(gold), 0, sizeDelta, false, trader);

        uint256 payout = usdc.balanceOf(trader) - traderBalBefore;
        assertApproxEqAbs(payout, 6_000e6, 1e3, "Short payout should be ~$6000 USDC");
    }

    // ═════════════════════════════════════════════════════════════════
    //  Test: VaultAccounting pipeline — deposit, open, close
    // ═════════════════════════════════════════════════════════════════

    function test_vaultAccounting_fullPipeline() public {
        // Register a mock basket vault address
        address basketVault = address(0xBA5E7);
        vaultAccounting.registerVault(basketVault);

        // Fund the basket vault with USDC
        usdc.mint(basketVault, 50_000e6);

        // Basket vault deposits capital into VaultAccounting
        vm.startPrank(basketVault);
        usdc.approve(address(vaultAccounting), 50_000e6);
        vaultAccounting.depositCapital(basketVault, 50_000e6);
        vm.stopPrank();

        // Verify vault state
        IPerp.VaultState memory state = vaultAccounting.getVaultState(basketVault);
        assertEq(state.depositedCapital, 50_000e6, "Deposited capital should be 50K");
        assertTrue(state.registered, "Vault should be registered");

        // Withdraw some capital back
        vm.prank(basketVault);
        vaultAccounting.withdrawCapital(basketVault, 10_000e6);

        state = vaultAccounting.getVaultState(basketVault);
        assertEq(state.depositedCapital, 40_000e6, "Should have 40K after withdrawal");

        // Check USDC returned to basket vault
        assertEq(usdc.balanceOf(basketVault), 10_000e6, "Basket vault should receive withdrawn USDC");
    }

    // ═════════════════════════════════════════════════════════════════
    //  Test: Pool liquidity tracking
    // ═════════════════════════════════════════════════════════════════

    function test_poolLiquidity_tracking() public {
        uint256 poolBefore = gmxVault.poolAmounts(address(usdc));
        assertEq(poolBefore, 1_000_000e6, "Pool should start with $1M");

        // Add more liquidity
        usdc.mint(deployer, 500_000e6);
        usdc.transfer(address(gmxVault), 500_000e6);
        gmxVault.directPoolDeposit(address(usdc));

        uint256 poolAfter = gmxVault.poolAmounts(address(usdc));
        assertEq(poolAfter, 1_500_000e6, "Pool should have $1.5M after deposit");
    }

    // ═════════════════════════════════════════════════════════════════
    //  Test: Leveraged position (5x)
    // ═════════════════════════════════════════════════════════════════

    function test_leveragedLong_5x() public {
        uint256 collateral = 2_000e6; // $2,000 USDC
        uint256 sizeDelta = 10_000e30; // $10,000 position (5x leverage)

        vm.prank(trader);
        usdc.transfer(address(gmxVault), collateral);

        vm.prank(trader);
        gmxVault.increasePosition(trader, address(usdc), address(gold), sizeDelta, true);

        // Check leverage
        uint256 leverage = gmxVault.getPositionLeverage(trader, address(usdc), address(gold), true);
        // leverage = size * 10000 / collateral = 10000 * 10000 / 2000 = 50000 (5x)
        assertEq(leverage, 50000, "Leverage should be 5x (50000 bps)");

        // GOLD goes up 5%: $2000 → $2100
        priceFeed.setPrice(address(gold), 2100e30);

        (bool hasProfit, uint256 delta) = gmxVault.getPositionDelta(trader, address(usdc), address(gold), true);
        assertTrue(hasProfit, "5x long should profit on 5% move");
        // profit = $10000 * 5% = $500
        assertApproxEqAbs(delta, 500e30, 1e25, "Profit should be ~$500");

        // Close and verify 25% return on collateral
        uint256 balBefore = usdc.balanceOf(trader);
        vm.prank(trader);
        gmxVault.decreasePosition(trader, address(usdc), address(gold), 0, sizeDelta, true, trader);

        uint256 payout = usdc.balanceOf(trader) - balBefore;
        // $2000 collateral + $500 profit = $2500
        assertApproxEqAbs(payout, 2_500e6, 1e3, "Payout should be ~$2500");
    }

    // ═════════════════════════════════════════════════════════════════
    //  Test: Original GMX-style long (collateral == indexToken)
    // ═════════════════════════════════════════════════════════════════

    function test_originalStyle_long() public {
        // Seed GOLD liquidity into pool
        gold.mint(deployer, 1000e18);
        IERC20(address(gold)).transfer(address(gmxVault), 500e18);
        gmxVault.directPoolDeposit(address(gold));

        // Trader gets GOLD
        gold.mint(trader, 10e18);

        // Transfer GOLD as collateral (original GMX pattern: collateral == index)
        vm.prank(trader);
        IERC20(address(gold)).transfer(address(gmxVault), 1e18); // 1 GOLD = $2000

        vm.prank(trader);
        gmxVault.increasePosition(
            trader,
            address(gold), // collateral = GOLD
            address(gold), // index = GOLD
            4000e30, // $4000 position (2x leverage)
            true
        );

        (uint256 size,, uint256 avgPrice,,,,,) = gmxVault.getPosition(trader, address(gold), address(gold), true);
        assertEq(size, 4000e30, "Original-style long should work");
        assertEq(avgPrice, 2000e30, "Average price should be $2000");
    }

    // ═════════════════════════════════════════════════════════════════
    //  Test: Multiple positions from same account
    // ═════════════════════════════════════════════════════════════════

    function test_multiplePositions() public {
        // Long GOLD with USDC collateral
        vm.prank(trader);
        usdc.transfer(address(gmxVault), 3_000e6);
        vm.prank(trader);
        gmxVault.increasePosition(trader, address(usdc), address(gold), 6_000e30, true);

        // Short GOLD with USDC collateral
        vm.prank(trader);
        usdc.transfer(address(gmxVault), 3_000e6);
        vm.prank(trader);
        gmxVault.increasePosition(trader, address(usdc), address(gold), 6_000e30, false);

        // Both positions should exist
        (uint256 longSize,,,,,,,) = gmxVault.getPosition(trader, address(usdc), address(gold), true);
        (uint256 shortSize,,,,,,,) = gmxVault.getPosition(trader, address(usdc), address(gold), false);

        assertEq(longSize, 6_000e30, "Long position should exist");
        assertEq(shortSize, 6_000e30, "Short position should exist");

        // Price goes up -- long profits, short loses
        priceFeed.setPrice(address(gold), 2200e30);

        (bool longProfit,) = gmxVault.getPositionDelta(trader, address(usdc), address(gold), true);
        (bool shortProfit,) = gmxVault.getPositionDelta(trader, address(usdc), address(gold), false);
        assertTrue(longProfit, "Long should profit");
        assertFalse(shortProfit, "Short should lose");
    }

    // ═════════════════════════════════════════════════════════════════
    //  Test: SimplePriceFeed price updates
    // ═════════════════════════════════════════════════════════════════

    function test_priceFeedUpdates() public {
        assertEq(priceFeed.prices(address(gold)), 2000e30, "Initial GOLD price");

        priceFeed.setPrice(address(gold), 2500e30);
        assertEq(priceFeed.prices(address(gold)), 2500e30, "Updated GOLD price");

        assertEq(gmxVault.getMaxPrice(address(gold)), 2500e30, "Vault should read updated price");
        assertEq(gmxVault.getMinPrice(address(gold)), 2500e30, "Min price should match");
    }

    // ═════════════════════════════════════════════════════════════════
    //  Test: Partial close
    // ═════════════════════════════════════════════════════════════════

    function test_partialClose() public {
        vm.prank(trader);
        usdc.transfer(address(gmxVault), 5_000e6);
        vm.prank(trader);
        gmxVault.increasePosition(trader, address(usdc), address(gold), 10_000e30, true);

        // Close half
        vm.prank(trader);
        gmxVault.decreasePosition(trader, address(usdc), address(gold), 0, 5_000e30, true, trader);

        (uint256 remaining,,,,,,,) = gmxVault.getPosition(trader, address(usdc), address(gold), true);
        assertEq(remaining, 5_000e30, "Half the position should remain");
    }

    // ═════════════════════════════════════════════════════════════════
    //  Test: VaultAccounting openPosition — long via real GMX Vault
    // ═════════════════════════════════════════════════════════════════

    function test_vaultAccounting_openLong_profitable() public {
        address basketVault = address(0xBA5E7);
        vaultAccounting.registerVault(basketVault);

        usdc.mint(basketVault, 50_000e6);
        vm.startPrank(basketVault);
        usdc.approve(address(vaultAccounting), 50_000e6);
        vaultAccounting.depositCapital(basketVault, 50_000e6);
        vm.stopPrank();

        uint256 collateral = 10_000e6;
        uint256 sizeDelta = 20_000e30;

        // Owner opens a long position on behalf of the basket vault
        vaultAccounting.openPosition(basketVault, GOLD_ID, true, sizeDelta, collateral);

        // Verify position exists in GMX Vault under VaultAccounting's address
        (uint256 posSize, uint256 posColl, uint256 avgPrice,,,,,) =
            gmxVault.getPosition(address(vaultAccounting), address(usdc), address(gold), true);
        assertEq(posSize, sizeDelta, "GMX position size");
        assertEq(posColl, 10_000e30, "GMX position collateral ($10K)");
        assertEq(avgPrice, 2000e30, "Average price $2000");

        // Verify VaultAccounting tracking
        IPerp.VaultState memory state = vaultAccounting.getVaultState(basketVault);
        assertEq(state.openInterest, sizeDelta, "OI should match size");
        assertEq(state.positionCount, 1, "One position");

        // Price goes up 10%: GOLD $2000 → $2200
        priceFeed.setPrice(address(gold), 2200e30);

        (int256 unrealisedBefore,) = vaultAccounting.getVaultPnL(basketVault);
        (bool deltaProfit, uint256 deltaUsd) =
            gmxVault.getPositionDelta(address(vaultAccounting), address(usdc), address(gold), true);
        assertTrue(deltaProfit, "GMX delta should show profit");
        assertApproxEqAbs(uint256(unrealisedBefore), deltaUsd, 1e25, "Aggregate unrealised matches GMX");

        // Close full position
        uint256 vaBefore = usdc.balanceOf(address(vaultAccounting));
        vaultAccounting.closePosition(basketVault, GOLD_ID, true, sizeDelta, 0);
        uint256 vaAfter = usdc.balanceOf(address(vaultAccounting));

        // VaultAccounting should have received collateral + profit
        uint256 returned = vaAfter - vaBefore;
        // profit = $20K * 10% = $2K → payout = $10K + $2K = $12K
        assertApproxEqAbs(returned, 12_000e6, 1e3, "Returned should be ~$12K");

        // Verify PnL tracked
        state = vaultAccounting.getVaultState(basketVault);
        assertEq(state.openInterest, 0, "OI should be zero");
        assertEq(state.positionCount, 0, "No positions");
        // pnl = returned - collateralDelta(0) - balBefore => profit tracked as realised
        assertTrue(state.realisedPnL > 0, "Realised PnL should be positive");
    }

    // ═════════════════════════════════════════════════════════════════
    //  Test: VaultAccounting openPosition — short with loss
    // ═════════════════════════════════════════════════════════════════

    function test_vaultAccounting_openShort_loss() public {
        address basketVault = address(0xBA5E7);
        vaultAccounting.registerVault(basketVault);

        usdc.mint(basketVault, 50_000e6);
        vm.startPrank(basketVault);
        usdc.approve(address(vaultAccounting), 50_000e6);
        vaultAccounting.depositCapital(basketVault, 50_000e6);
        vm.stopPrank();

        uint256 collateral = 10_000e6;
        uint256 sizeDelta = 20_000e30;

        vaultAccounting.openPosition(basketVault, GOLD_ID, false, sizeDelta, collateral);

        // Verify short position in GMX
        (uint256 posSize,,,,,,,) = gmxVault.getPosition(address(vaultAccounting), address(usdc), address(gold), false);
        assertEq(posSize, sizeDelta, "Short position size");

        // Price goes UP 10%: bad for shorts
        priceFeed.setPrice(address(gold), 2200e30);

        (int256 unrealisedShort,) = vaultAccounting.getVaultPnL(basketVault);
        assertTrue(unrealisedShort < 0, "Short should have negative aggregate unrealised");

        uint256 vaBefore = usdc.balanceOf(address(vaultAccounting));
        vaultAccounting.closePosition(basketVault, GOLD_ID, false, sizeDelta, 0);
        uint256 vaAfter = usdc.balanceOf(address(vaultAccounting));

        // loss = $20K * 10% = $2K → payout = $10K - $2K = $8K
        uint256 returned = vaAfter - vaBefore;
        assertApproxEqAbs(returned, 8_000e6, 1e3, "Should get ~$8K back (loss)");

        IPerp.VaultState memory state = vaultAccounting.getVaultState(basketVault);
        assertTrue(state.realisedPnL < 0, "Realised PnL should be negative");
    }

    // ═════════════════════════════════════════════════════════════════
    //  Test: VaultAccounting partial close
    // ═════════════════════════════════════════════════════════════════

    function test_vaultAccounting_partialClose() public {
        address basketVault = address(0xBA5E7);
        vaultAccounting.registerVault(basketVault);

        usdc.mint(basketVault, 50_000e6);
        vm.startPrank(basketVault);
        usdc.approve(address(vaultAccounting), 50_000e6);
        vaultAccounting.depositCapital(basketVault, 50_000e6);
        vm.stopPrank();

        uint256 collateral = 10_000e6;
        uint256 sizeDelta = 20_000e30;

        vaultAccounting.openPosition(basketVault, GOLD_ID, true, sizeDelta, collateral);

        // Close half the position
        vaultAccounting.closePosition(basketVault, GOLD_ID, true, 10_000e30, 0);

        // Remaining position in GMX
        (uint256 remaining,,,,,,,) = gmxVault.getPosition(address(vaultAccounting), address(usdc), address(gold), true);
        assertEq(remaining, 10_000e30, "Half should remain");

        IPerp.VaultState memory state = vaultAccounting.getVaultState(basketVault);
        assertEq(state.openInterest, 10_000e30, "OI should be halved");
        assertEq(state.positionCount, 1, "Position still exists");

        // Close the rest
        vaultAccounting.closePosition(basketVault, GOLD_ID, true, 10_000e30, 0);

        (remaining,,,,,,,) = gmxVault.getPosition(address(vaultAccounting), address(usdc), address(gold), true);
        assertEq(remaining, 0, "Position fully closed");

        state = vaultAccounting.getVaultState(basketVault);
        assertEq(state.openInterest, 0, "OI should be zero");
        assertEq(state.positionCount, 0, "No positions");
    }

    // ═════════════════════════════════════════════════════════════════
    //  Test: VaultAccounting — multiple vaults, independent PnL
    // ═════════════════════════════════════════════════════════════════

    function test_vaultAccounting_multiVault_independentPnL() public {
        address vault1 = address(0xBA5E1);
        address vault2 = address(0xBA5E2);
        vaultAccounting.registerVault(vault1);
        vaultAccounting.registerVault(vault2);

        usdc.mint(vault1, 30_000e6);
        usdc.mint(vault2, 30_000e6);

        vm.startPrank(vault1);
        usdc.approve(address(vaultAccounting), 30_000e6);
        vaultAccounting.depositCapital(vault1, 30_000e6);
        vm.stopPrank();

        vm.startPrank(vault2);
        usdc.approve(address(vaultAccounting), 30_000e6);
        vaultAccounting.depositCapital(vault2, 30_000e6);
        vm.stopPrank();

        // Vault1: long $10K
        vaultAccounting.openPosition(vault1, GOLD_ID, true, 10_000e30, 5_000e6);
        // Vault2: short $10K
        vaultAccounting.openPosition(vault2, GOLD_ID, false, 10_000e30, 5_000e6);

        // Price rises 10%: vault1 profits, vault2 loses
        priceFeed.setPrice(address(gold), 2200e30);

        (int256 u1,) = vaultAccounting.getVaultPnL(vault1);
        (int256 u2,) = vaultAccounting.getVaultPnL(vault2);
        assertTrue(u1 > 0, "Vault1 long aggregate unrealised positive");
        assertTrue(u2 < 0, "Vault2 short aggregate unrealised negative");

        vaultAccounting.closePosition(vault1, GOLD_ID, true, 10_000e30, 0);
        vaultAccounting.closePosition(vault2, GOLD_ID, false, 10_000e30, 0);

        IPerp.VaultState memory s1 = vaultAccounting.getVaultState(vault1);
        IPerp.VaultState memory s2 = vaultAccounting.getVaultState(vault2);

        assertTrue(s1.realisedPnL > 0, "Vault1 (long) should profit");
        assertTrue(s2.realisedPnL < 0, "Vault2 (short) should lose");
    }

    // ═════════════════════════════════════════════════════════════════
    //  Test: PriceSync — oracle to SimplePriceFeed sync
    // ═════════════════════════════════════════════════════════════════

    function test_priceSync_oracleToGmx() public {
        // Update oracle price
        oracleAdapter.submitPrice(GOLD_ID, 210_000_000_000); // $2100

        // Before sync, GMX still has old price
        assertEq(priceFeed.prices(address(gold)), 2000e30, "GMX price not yet synced");

        // Sync prices
        priceSync.syncAll();

        // After sync, GMX reads new price
        assertEq(priceFeed.prices(address(gold)), 2100e30, "GMX price should be synced");
        assertEq(gmxVault.getMaxPrice(address(gold)), 2100e30, "Vault reads synced price");
    }

    // ═════════════════════════════════════════════════════════════════
    //  Test: Oracle-driven position — full flow via OracleAdapter → PriceSync → GMX
    // ═════════════════════════════════════════════════════════════════

    function test_oracleDrivenPosition_longProfitable() public {
        address basketVault = address(0xBA5E7);
        vaultAccounting.registerVault(basketVault);

        usdc.mint(basketVault, 50_000e6);
        vm.startPrank(basketVault);
        usdc.approve(address(vaultAccounting), 50_000e6);
        vaultAccounting.depositCapital(basketVault, 50_000e6);
        vm.stopPrank();

        uint256 collateral = 10_000e6;
        uint256 sizeDelta = 20_000e30;

        vaultAccounting.openPosition(basketVault, GOLD_ID, true, sizeDelta, collateral);

        // ── Oracle price goes up 10%: $2000 → $2200 ──────────────
        oracleAdapter.submitPrice(GOLD_ID, 220_000_000_000); // $2200

        // GMX Vault still sees old price before sync
        assertEq(priceFeed.prices(address(gold)), 2000e30, "GMX price unchanged before sync");

        // Sync oracle → SimplePriceFeed
        priceSync.syncAll();

        // GMX Vault now sees $2200
        assertEq(priceFeed.prices(address(gold)), 2200e30, "GMX price updated via oracle sync");

        // Close — profit should be calculated at the synced price
        uint256 vaBefore = usdc.balanceOf(address(vaultAccounting));
        vaultAccounting.closePosition(basketVault, GOLD_ID, true, sizeDelta, 0);
        uint256 vaAfter = usdc.balanceOf(address(vaultAccounting));

        uint256 returned = vaAfter - vaBefore;
        // profit = $20K * 10% = $2K → payout = $10K + $2K = $12K
        assertApproxEqAbs(returned, 12_000e6, 1e3, "Oracle-driven: returned ~$12K");

        IPerp.VaultState memory state = vaultAccounting.getVaultState(basketVault);
        assertTrue(state.realisedPnL > 0, "Oracle-driven: positive PnL");
        assertEq(state.openInterest, 0, "OI cleared");
    }

    function test_oracleDrivenPosition_shortLoss() public {
        address basketVault = address(0xBA5E7);
        vaultAccounting.registerVault(basketVault);

        usdc.mint(basketVault, 50_000e6);
        vm.startPrank(basketVault);
        usdc.approve(address(vaultAccounting), 50_000e6);
        vaultAccounting.depositCapital(basketVault, 50_000e6);
        vm.stopPrank();

        uint256 collateral = 10_000e6;
        uint256 sizeDelta = 20_000e30;

        vaultAccounting.openPosition(basketVault, GOLD_ID, false, sizeDelta, collateral);

        // ── Oracle price goes up 10%: bad for shorts ─────────────
        oracleAdapter.submitPrice(GOLD_ID, 220_000_000_000); // $2200
        priceSync.syncAll();

        assertEq(priceFeed.prices(address(gold)), 2200e30, "GMX price synced from oracle");

        uint256 vaBefore = usdc.balanceOf(address(vaultAccounting));
        vaultAccounting.closePosition(basketVault, GOLD_ID, false, sizeDelta, 0);
        uint256 vaAfter = usdc.balanceOf(address(vaultAccounting));

        uint256 returned = vaAfter - vaBefore;
        // loss = $20K * 10% = $2K → payout = $10K - $2K = $8K
        assertApproxEqAbs(returned, 8_000e6, 1e3, "Oracle-driven short: returned ~$8K");

        IPerp.VaultState memory state = vaultAccounting.getVaultState(basketVault);
        assertTrue(state.realisedPnL < 0, "Oracle-driven short: negative PnL");
    }

    // ═════════════════════════════════════════════════════════════════
    //  Test: Full Basket E2E — deposit → allocate → perp → withdraw → redeem
    // ═════════════════════════════════════════════════════════════════

    function test_basketE2E_fullRoundTrip() public {
        // ── Setup basket vault ──────────────────────────────────────
        BasketVault basket = new BasketVault("Gold Basket", address(usdc), address(oracleAdapter), deployer);

        bytes32[] memory assetIds = new bytes32[](1);
        assetIds[0] = GOLD_ID;
        basket.setAssets(assetIds);
        basket.setMinReserveBps(2_000); // keep 20% idle reserve
        basket.setVaultAccounting(address(vaultAccounting));

        vaultAccounting.registerVault(address(basket));

        // ── Investor deposits USDC ──────────────────────────────────
        address investor = address(0x1A2B3C);
        usdc.mint(investor, 100_000e6);

        vm.startPrank(investor);
        usdc.approve(address(basket), 100_000e6);
        uint256 shares = basket.deposit(100_000e6);
        vm.stopPrank();

        assertTrue(shares > 0, "Should receive shares");
        assertEq(usdc.balanceOf(address(basket)), 100_000e6, "Basket holds USDC");

        // ── Owner allocates to perp pool ────────────────────────────
        basket.allocateToPerp(50_000e6);
        assertEq(basket.perpAllocated(), 50_000e6, "50K allocated to perp");

        IPerp.VaultState memory perpState = vaultAccounting.getVaultState(address(basket));
        assertEq(perpState.depositedCapital, 50_000e6, "VaultAccounting has 50K from basket");

        // ── Owner opens a long position through VaultAccounting ─────
        vaultAccounting.openPosition(address(basket), GOLD_ID, true, 20_000e30, 10_000e6);

        perpState = vaultAccounting.getVaultState(address(basket));
        assertEq(perpState.openInterest, 20_000e30, "OI = $20K");

        // ── GMX price goes up 10% (only price feed, not oracle) ─────
        // Keep oracle price at $2000 so basket share price stays stable.
        // Only the GMX price feed changes, affecting position PnL.
        priceFeed.setPrice(address(gold), 2200e30);

        // ── Close the position ──────────────────────────────────────
        vaultAccounting.closePosition(address(basket), GOLD_ID, true, 20_000e30, 0);

        perpState = vaultAccounting.getVaultState(address(basket));
        assertEq(perpState.openInterest, 0, "OI cleared");
        assertTrue(perpState.realisedPnL > 0, "Profitable trade");

        // ── Withdraw from perp back to basket (principal + realised PnL headroom) ─────────────
        IPerp.VaultState memory withdrawState = vaultAccounting.getVaultState(address(basket));
        int256 available = int256(withdrawState.depositedCapital) + withdrawState.realisedPnL;
        if (available > 0) {
            basket.withdrawFromPerp(uint256(available));
        }
        assertEq(basket.perpAllocated(), 0, "perpAllocated cleared");

        // ── Investor redeems shares ─────────────────────────────────
        uint256 investorShares = basket.shareToken().balanceOf(investor);
        uint256 investorUsdcBefore = usdc.balanceOf(investor);

        vm.startPrank(investor);
        basket.shareToken().approve(address(basket), investorShares);
        basket.redeem(investorShares);
        vm.stopPrank();

        uint256 investorUsdcAfter = usdc.balanceOf(investor);
        uint256 redeemed = investorUsdcAfter - investorUsdcBefore;

        // Investor captures perp PnL via NAV-based redemption.
        assertTrue(redeemed > 100_000e6, "Investor should receive deposit plus realised perp gains");
    }

    // ═════════════════════════════════════════════════════════════════
    //  Test: Basket E2E — deposit → allocate → perp loss → withdraw → redeem
    // ═════════════════════════════════════════════════════════════════

    function test_basketE2E_perpLoss() public {
        BasketVault basket = new BasketVault("Gold Basket", address(usdc), address(oracleAdapter), deployer);

        bytes32[] memory assetIds = new bytes32[](1);
        assetIds[0] = GOLD_ID;
        basket.setAssets(assetIds);
        basket.setMinReserveBps(2_000); // keep 20% idle reserve
        basket.setVaultAccounting(address(vaultAccounting));

        vaultAccounting.registerVault(address(basket));

        address investor = address(0x1A2B3C);
        usdc.mint(investor, 100_000e6);

        vm.startPrank(investor);
        usdc.approve(address(basket), 100_000e6);
        basket.deposit(100_000e6);
        vm.stopPrank();

        // Allocate and open a long
        basket.allocateToPerp(50_000e6);
        vaultAccounting.openPosition(address(basket), GOLD_ID, true, 20_000e30, 10_000e6);

        // GMX price drops 10% (keep oracle stable)
        priceFeed.setPrice(address(gold), 1800e30);

        // Close — realize loss
        vaultAccounting.closePosition(address(basket), GOLD_ID, true, 20_000e30, 0);

        IPerp.VaultState memory perpState = vaultAccounting.getVaultState(address(basket));
        assertTrue(perpState.realisedPnL < 0, "Should have loss");

        // Withdraw remaining from perp
        // The deposited capital is 50K, but some was used as collateral.
        // After the loss, VaultAccounting's USDC balance includes remaining capital.
        // withdrawCapital checks available = deposited + realised - OI
        // deposited=50K, realisedPnL=negative, OI=0
        // The basket can withdraw whatever is available
        IPerp.VaultState memory vs = vaultAccounting.getVaultState(address(basket));
        int256 available = int256(vs.depositedCapital) + vs.realisedPnL;
        if (available > 0) {
            basket.withdrawFromPerp(uint256(available));
        }
    }

    function test_basketE2E_reserveBlocks_thenTopUp_allowsAllocation() public {
        BasketVault basket = new BasketVault("Gold Basket", address(usdc), address(oracleAdapter), deployer);

        bytes32[] memory assetIds = new bytes32[](1);
        assetIds[0] = GOLD_ID;
        basket.setAssets(assetIds);
        basket.setMinReserveBps(8_000); // keep 80% reserve
        basket.setVaultAccounting(address(vaultAccounting));
        vaultAccounting.registerVault(address(basket));

        address investor = address(0x1A2B3C);
        usdc.mint(investor, 100_000e6);

        vm.startPrank(investor);
        usdc.approve(address(basket), 100_000e6);
        basket.deposit(100_000e6);
        vm.stopPrank();

        assertEq(basket.getRequiredReserveUsdc(), 80_000e6);
        assertEq(basket.getAvailableForPerpUsdc(), 20_000e6);

        vm.expectRevert("Insufficient balance");
        basket.allocateToPerp(30_000e6);

        // Top up reserve without minting shares, then allocation headroom should increase.
        usdc.approve(address(basket), 50_000e6);
        basket.topUpReserve(50_000e6);

        assertEq(basket.getRequiredReserveUsdc(), 120_000e6);
        assertEq(basket.getAvailableForPerpUsdc(), 30_000e6);

        basket.allocateToPerp(30_000e6);
        assertEq(basket.perpAllocated(), 30_000e6);
    }

    // ═════════════════════════════════════════════════════════════════
    //  Test: Risk limits — OI cap blocks excessive positions
    // ═════════════════════════════════════════════════════════════════

    function test_riskLimits_oiCap() public {
        address basketVault = address(0xBA5E7);
        vaultAccounting.registerVault(basketVault);

        usdc.mint(basketVault, 100_000e6);
        vm.startPrank(basketVault);
        usdc.approve(address(vaultAccounting), 100_000e6);
        vaultAccounting.depositCapital(basketVault, 100_000e6);
        vm.stopPrank();

        // Set OI cap at $15K
        vaultAccounting.setMaxOpenInterest(basketVault, 15_000e30);

        // First position within cap: OK
        vaultAccounting.openPosition(basketVault, GOLD_ID, true, 10_000e30, 5_000e6);

        // Second position would exceed cap ($10K + $10K > $15K)
        vm.expectRevert("Exceeds max open interest");
        vaultAccounting.openPosition(basketVault, GOLD_ID, false, 10_000e30, 5_000e6);

        // Smaller position within remaining cap: OK ($10K + $5K = $15K)
        vaultAccounting.openPosition(basketVault, GOLD_ID, false, 5_000e30, 3_000e6);
    }

    // ═════════════════════════════════════════════════════════════════
    //  Test: Risk limits — position size cap
    // ═════════════════════════════════════════════════════════════════

    function test_riskLimits_positionSizeCap() public {
        address basketVault = address(0xBA5E7);
        vaultAccounting.registerVault(basketVault);

        usdc.mint(basketVault, 100_000e6);
        vm.startPrank(basketVault);
        usdc.approve(address(vaultAccounting), 100_000e6);
        vaultAccounting.depositCapital(basketVault, 100_000e6);
        vm.stopPrank();

        // Set single-position size cap at $15K
        vaultAccounting.setMaxPositionSize(basketVault, 15_000e30);

        // Position exceeding cap
        vm.expectRevert("Exceeds max position size");
        vaultAccounting.openPosition(basketVault, GOLD_ID, true, 20_000e30, 10_000e6);

        // Position within cap: OK
        vaultAccounting.openPosition(basketVault, GOLD_ID, true, 15_000e30, 8_000e6);
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
