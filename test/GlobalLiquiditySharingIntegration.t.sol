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
import {MockUSDC} from "../src/vault/MockUSDC.sol";

contract MockTokenGL is IERC20 {
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

interface ISimplePriceFeedGL {
    function setPrice(address token, uint256 price) external;
    function setKeeper(address _keeper, bool _active) external;
}

interface IVaultErrorControllerGL {
    function setErrors(address _vault, string[] calldata _errors) external;
}

contract GlobalLiquiditySharingIntegrationTest is Test {
    MockUSDC usdc;
    MockTokenGL gold;
    MockTokenGL silver;

    IGMXVault gmxVault;
    ISimplePriceFeedGL priceFeed;
    address usdgAddr;
    address routerAddr;
    address vaultUtilsAddr;

    OracleAdapter oracleAdapter;
    VaultAccounting vaultAccounting;
    PriceSync priceSync;

    address deployer;

    bytes32 constant GOLD_ID = keccak256("XAU");
    bytes32 constant SILVER_ID = keccak256("XAG");

    function setUp() public {
        deployer = address(this);
        _deployStack(1_000_000e6);
    }

    function test_globalLiquidity_multiVault_happyPath_sharesPoolState() public {
        address vaultA = address(0xA11CE);
        address vaultB = address(0xB0B);
        uint256 capital = 30_000e6;
        uint256 collateral = 5_000e6;
        uint256 size = 10_000e30;
        uint256 poolBeforeOpen = gmxVault.poolAmounts(address(usdc));

        _registerAndFundVault(vaultA, capital);
        _registerAndFundVault(vaultB, capital);

        vaultAccounting.openPosition(vaultA, GOLD_ID, true, size, collateral);
        vaultAccounting.openPosition(vaultB, GOLD_ID, false, size, collateral);

        uint256 reservedBeforeClose = gmxVault.reservedAmounts(address(usdc));
        assertEq(reservedBeforeClose, 20_000e6, "Long + short reserve should reflect combined size");

        priceFeed.setPrice(address(gold), 2200e30);

        (int256 unrealisedA,) = vaultAccounting.getVaultPnL(vaultA);
        (int256 unrealisedB,) = vaultAccounting.getVaultPnL(vaultB);
        assertTrue(unrealisedA > 0, "VaultA long should be in profit");
        assertTrue(unrealisedB < 0, "VaultB short should be in loss");

        vaultAccounting.closePosition(vaultA, GOLD_ID, true, size, 0);
        vaultAccounting.closePosition(vaultB, GOLD_ID, false, size, 0);

        IPerp.VaultState memory stateA = vaultAccounting.getVaultState(vaultA);
        IPerp.VaultState memory stateB = vaultAccounting.getVaultState(vaultB);
        assertEq(stateA.openInterest, 0, "VaultA OI should be settled");
        assertEq(stateB.openInterest, 0, "VaultB OI should be settled");
        assertEq(stateA.positionCount, 0, "VaultA should have no open legs");
        assertEq(stateB.positionCount, 0, "VaultB should have no open legs");
        assertTrue(stateA.realisedPnL > 0, "VaultA should realize profit");
        assertTrue(stateB.realisedPnL < 0, "VaultB should realize loss");

        uint256 poolAfterClose = gmxVault.poolAmounts(address(usdc));
        assertTrue(poolAfterClose >= poolBeforeOpen, "Offsetting PnL should not drain global pool");
        assertEq(gmxVault.reservedAmounts(address(usdc)), 0, "No reserve should remain after all closes");
    }

    function test_globalLiquidity_offsettingPnl_preservesGlobalPoolAmount() public {
        address vaultProfit = address(0xAA01);
        address vaultLoss = address(0xBB01);
        uint256 poolBeforeOpen = gmxVault.poolAmounts(address(usdc));

        _registerAndFundVault(vaultProfit, 40_000e6);
        _registerAndFundVault(vaultLoss, 40_000e6);

        uint256 collateral = 8_000e6;
        uint256 size = 20_000e30;
        vaultAccounting.openPosition(vaultProfit, GOLD_ID, true, size, collateral);
        vaultAccounting.openPosition(vaultLoss, GOLD_ID, false, size, collateral);

        priceFeed.setPrice(address(gold), 2200e30);

        vaultAccounting.closePosition(vaultProfit, GOLD_ID, true, size, 0);
        vaultAccounting.closePosition(vaultLoss, GOLD_ID, false, size, 0);

        IPerp.VaultState memory stateProfit = vaultAccounting.getVaultState(vaultProfit);
        IPerp.VaultState memory stateLoss = vaultAccounting.getVaultState(vaultLoss);

        assertApproxEqAbs(
            uint256(stateProfit.realisedPnL),
            uint256(-stateLoss.realisedPnL),
            1e3,
            "Profit and loss magnitudes should match"
        );

        uint256 poolAfterAllCloses = gmxVault.poolAmounts(address(usdc));
        assertTrue(
            poolAfterAllCloses >= poolBeforeOpen,
            "If one vault gains X and another loses X, global pool should not be drained"
        );
    }

    function test_globalLiquidity_multiVault_stress_secondCloseReverts_whenPoolDrained() public {
        _deployStack(150_000e6);

        address vaultA = address(0xA101);
        address vaultB = address(0xB202);

        _registerAndFundVault(vaultA, 80_000e6);
        _registerAndFundVault(vaultB, 80_000e6);

        uint256 collateral = 50_000e6;
        uint256 size = 80_000e30;

        vaultAccounting.openPosition(vaultA, GOLD_ID, true, size, collateral);
        vaultAccounting.openPosition(vaultB, SILVER_ID, true, size, collateral);

        priceFeed.setPrice(address(gold), 4000e30);
        priceFeed.setPrice(address(silver), 50e30);

        uint256 poolBeforeFirstClose = gmxVault.poolAmounts(address(usdc));
        vaultAccounting.closePosition(vaultA, GOLD_ID, true, size, 0);
        uint256 poolAfterFirstClose = gmxVault.poolAmounts(address(usdc));
        assertTrue(poolAfterFirstClose < poolBeforeFirstClose, "First profitable close should consume shared pool");

        vm.expectRevert(bytes("Vault: poolAmount exceeded"));
        vaultAccounting.closePosition(vaultB, SILVER_ID, true, size, 0);
    }

    function test_globalLiquidity_twoBaskets_e2e_sharingAndCoupling() public {
        _deployStack(150_000e6);

        BasketVault basketA = new BasketVault("Basket A", address(usdc), address(oracleAdapter), deployer);
        BasketVault basketB = new BasketVault("Basket B", address(usdc), address(oracleAdapter), deployer);

        bytes32[] memory assets = new bytes32[](1);
        assets[0] = GOLD_ID;
        basketA.setAssets(assets);
        assets[0] = SILVER_ID;
        basketB.setAssets(assets);
        basketA.setVaultAccounting(address(vaultAccounting));
        basketB.setVaultAccounting(address(vaultAccounting));

        vaultAccounting.registerVault(address(basketA));
        vaultAccounting.registerVault(address(basketB));

        address investorA = address(0xCA01);
        address investorB = address(0xCA02);

        usdc.mint(investorA, 100_000e6);
        usdc.mint(investorB, 100_000e6);

        vm.startPrank(investorA);
        usdc.approve(address(basketA), 100_000e6);
        basketA.deposit(100_000e6);
        vm.stopPrank();

        vm.startPrank(investorB);
        usdc.approve(address(basketB), 100_000e6);
        basketB.deposit(100_000e6);
        vm.stopPrank();

        basketA.allocateToPerp(60_000e6);
        basketB.allocateToPerp(60_000e6);

        assertEq(basketA.perpAllocated(), 60_000e6, "BasketA allocated capital");
        assertEq(basketB.perpAllocated(), 60_000e6, "BasketB allocated capital");

        vaultAccounting.openPosition(address(basketA), GOLD_ID, true, 80_000e30, 50_000e6);
        vaultAccounting.openPosition(address(basketB), SILVER_ID, true, 80_000e30, 50_000e6);

        priceFeed.setPrice(address(gold), 4000e30);
        priceFeed.setPrice(address(silver), 50e30);

        uint256 poolBeforeFirstClose = gmxVault.poolAmounts(address(usdc));
        vaultAccounting.closePosition(address(basketA), GOLD_ID, true, 80_000e30, 0);
        uint256 poolAfterFirstClose = gmxVault.poolAmounts(address(usdc));
        assertTrue(poolAfterFirstClose < poolBeforeFirstClose, "BasketA close should consume shared pool");

        IPerp.VaultState memory stateA = vaultAccounting.getVaultState(address(basketA));
        int256 withdrawableA = int256(stateA.depositedCapital) + stateA.realisedPnL;
        uint256 basketABalBefore = usdc.balanceOf(address(basketA));

        if (withdrawableA > 0) {
            basketA.withdrawFromPerp(uint256(withdrawableA));
        }

        uint256 basketABalAfter = usdc.balanceOf(address(basketA));
        assertTrue(basketABalAfter > basketABalBefore, "BasketA should recover capital/profit from perp");
        assertEq(basketA.perpAllocated(), 0, "BasketA perp allocation should be cleared");

        vm.expectRevert(bytes("Vault: poolAmount exceeded"));
        vaultAccounting.closePosition(address(basketB), SILVER_ID, true, 80_000e30, 0);
    }

    function _deployStack(uint256 initialPoolLiquidityUsdc) internal {
        usdc = new MockUSDC();
        gold = new MockTokenGL("Gold Token", "GOLD", 18);
        silver = new MockTokenGL("Silver Token", "SILVER", 18);

        address pfAddr = deployCode("SimplePriceFeed.sol:SimplePriceFeed");
        priceFeed = ISimplePriceFeedGL(pfAddr);
        priceFeed.setPrice(address(usdc), 1e30);
        priceFeed.setPrice(address(gold), 2000e30);
        priceFeed.setPrice(address(silver), 25e30);

        address vaultAddr = deployCode("Vault.sol:Vault");
        gmxVault = IGMXVault(vaultAddr);

        usdgAddr = deployCode("USDG.sol:USDG", abi.encode(vaultAddr));
        routerAddr = deployCode("Router.sol:Router", abi.encode(vaultAddr, usdgAddr, address(usdc)));
        vaultUtilsAddr = deployCode("VaultUtils.sol:VaultUtils", abi.encode(vaultAddr));

        gmxVault.initialize(routerAddr, usdgAddr, pfAddr, 5e30, 600, 600);
        gmxVault.setVaultUtils(vaultUtilsAddr);

        address errCtrl = deployCode("VaultErrorController.sol:VaultErrorController");
        gmxVault.setErrorController(errCtrl);
        _setVaultErrors(errCtrl, vaultAddr);

        gmxVault.setFees(0, 0, 0, 0, 0, 0, 5e30, 0, false);

        gmxVault.setTokenConfig(address(usdc), 6, 10000, 0, 0, true, false);
        gmxVault.setTokenConfig(address(gold), 18, 10000, 0, 0, false, true);
        gmxVault.setTokenConfig(address(silver), 18, 10000, 0, 0, false, true);

        usdc.mint(deployer, 10_000_000e6);
        usdc.transfer(address(gmxVault), initialPoolLiquidityUsdc);
        gmxVault.directPoolDeposit(address(usdc));

        oracleAdapter = new OracleAdapter(deployer);
        oracleAdapter.setKeeper(deployer, true);
        oracleAdapter.configureAsset("XAU", address(0), IOracleAdapter.FeedType.CustomRelayer, 3600, 5000, 8);
        oracleAdapter.configureAsset("XAG", address(0), IOracleAdapter.FeedType.CustomRelayer, 3600, 5000, 8);
        oracleAdapter.submitPrice(GOLD_ID, 200_000_000_000);
        oracleAdapter.submitPrice(SILVER_ID, 2_500_000_000);

        vaultAccounting = new VaultAccounting(address(usdc), address(gmxVault), address(oracleAdapter), deployer);
        vaultAccounting.mapAssetToken(GOLD_ID, address(gold));
        vaultAccounting.mapAssetToken(SILVER_ID, address(silver));

        priceSync = new PriceSync(address(oracleAdapter), address(priceFeed), deployer);
        priceFeed.setKeeper(address(priceSync), true);
        priceSync.addMapping(GOLD_ID, address(gold));
        priceSync.addMapping(SILVER_ID, address(silver));
    }

    function _registerAndFundVault(address vault, uint256 amount) internal {
        vaultAccounting.registerVault(vault);

        usdc.mint(vault, amount);
        vm.startPrank(vault);
        usdc.approve(address(vaultAccounting), amount);
        vaultAccounting.depositCapital(vault, amount);
        vm.stopPrank();
    }

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

        IVaultErrorControllerGL(errCtrl).setErrors(vault, errors);
    }
}
