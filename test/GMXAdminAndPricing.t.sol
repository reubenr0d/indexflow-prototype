// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {MockUSDC} from "../src/vault/MockUSDC.sol";

interface ISimplePriceFeedLike {
    function setPrice(address token, uint256 price) external;
}

interface IVaultLike {
    function initialize(
        address _router,
        address _usdg,
        address _priceFeed,
        uint256 _liquidationFeeUsd,
        uint256 _fundingRateFactor,
        uint256 _stableFundingRateFactor
    ) external;
    function setVaultUtils(address _vaultUtils) external;
    function setTokenConfig(address, uint256, uint256, uint256, uint256, bool, bool) external;
    function setIsSwapEnabled(bool) external;
    function setIsLeverageEnabled(bool) external;
    function setMaxGasPrice(uint256) external;
    function setInManagerMode(bool) external;
    function setManager(address, bool) external;
    function setInPrivateLiquidationMode(bool) external;
    function setLiquidator(address, bool) external;
    function setBufferAmount(address, uint256) external;
    function setMaxGlobalShortSize(address, uint256) external;
    function setFundingRate(uint256, uint256, uint256) external;
    function setGov(address) external;
    function setPriceFeed(address) external;
    function setMaxLeverage(uint256) external;

    function isSwapEnabled() external view returns (bool);
    function isLeverageEnabled() external view returns (bool);
    function inManagerMode() external view returns (bool);
    function inPrivateLiquidationMode() external view returns (bool);
    function maxGasPrice() external view returns (uint256);
    function isManager(address) external view returns (bool);
    function isLiquidator(address) external view returns (bool);
    function bufferAmounts(address) external view returns (uint256);
    function maxGlobalShortSizes(address) external view returns (uint256);
    function fundingInterval() external view returns (uint256);
    function fundingRateFactor() external view returns (uint256);
    function stableFundingRateFactor() external view returns (uint256);
    function gov() external view returns (address);
    function priceFeed() external view returns (address);

    function tokenToUsdMin(address, uint256) external view returns (uint256);
    function getRedemptionAmount(address, uint256) external view returns (uint256);
    function getUtilisation(address) external view returns (uint256);
    function getNextFundingRate(address) external view returns (uint256);
    function adjustForDecimals(uint256, address, address) external view returns (uint256);
    function usdToTokenMin(address, uint256) external view returns (uint256);
    function usdToTokenMax(address, uint256) external view returns (uint256);

    function usdg() external view returns (address);
}

contract MockTokenGMX {
    string public name;
    string public symbol;
    uint8 public immutable decimals;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory n, string memory s, uint8 d) {
        name = n;
        symbol = s;
        decimals = d;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        if (a != type(uint256).max) {
            allowance[from][msg.sender] = a - amount;
        }
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract GMXAdminAndPricingTest is Test {
    MockUSDC internal usdc;
    MockTokenGMX internal gold;

    IVaultLike internal vault;
    address internal vaultAddr;

    function setUp() public {
        usdc = new MockUSDC();
        gold = new MockTokenGMX("Gold", "GLD", 18);

        address priceFeedAddr = deployCode("SimplePriceFeed.sol:SimplePriceFeed");
        ISimplePriceFeedLike(priceFeedAddr).setPrice(address(usdc), 1e30);
        ISimplePriceFeedLike(priceFeedAddr).setPrice(address(gold), 2000e30);

        vaultAddr = deployCode("Vault.sol:Vault");
        vault = IVaultLike(vaultAddr);

        address usdgAddr = deployCode("USDG.sol:USDG", abi.encode(vaultAddr));
        address routerAddr = deployCode("Router.sol:Router", abi.encode(vaultAddr, usdgAddr, address(usdc)));
        address vaultUtilsAddr = deployCode("VaultUtils.sol:VaultUtils", abi.encode(vaultAddr));

        vault.initialize(routerAddr, usdgAddr, priceFeedAddr, 5e30, 600, 600);
        vault.setVaultUtils(vaultUtilsAddr);

        vault.setTokenConfig(address(usdc), 6, 10000, 0, 0, true, false);
        vault.setTokenConfig(address(gold), 18, 10000, 0, 0, false, true);
    }

    function test_admin_setters_update_state() public {
        vault.setIsSwapEnabled(false);
        vault.setIsLeverageEnabled(false);
        vault.setMaxGasPrice(1234);
        vault.setInManagerMode(true);
        vault.setManager(address(0xA1), true);
        vault.setInPrivateLiquidationMode(true);
        vault.setLiquidator(address(0xB2), true);
        vault.setBufferAmount(address(usdc), 111e6);
        vault.setMaxGlobalShortSize(address(gold), 222e30);
        vault.setFundingRate(2 hours, 321, 654);

        assertFalse(vault.isSwapEnabled());
        assertFalse(vault.isLeverageEnabled());
        assertEq(vault.maxGasPrice(), 1234);
        assertTrue(vault.inManagerMode());
        assertTrue(vault.isManager(address(0xA1)));
        assertTrue(vault.inPrivateLiquidationMode());
        assertTrue(vault.isLiquidator(address(0xB2)));
        assertEq(vault.bufferAmounts(address(usdc)), 111e6);
        assertEq(vault.maxGlobalShortSizes(address(gold)), 222e30);
        assertEq(vault.fundingInterval(), 2 hours);
        assertEq(vault.fundingRateFactor(), 321);
        assertEq(vault.stableFundingRateFactor(), 654);
    }

    function test_pricing_views_and_conversions() public view {
        assertEq(vault.tokenToUsdMin(address(usdc), 1e6), 1e30);
        assertEq(vault.adjustForDecimals(1e18, address(gold), address(usdc)), 1e6);
        assertEq(vault.usdToTokenMin(address(gold), 2000e30), 1e18);
        assertEq(vault.usdToTokenMax(address(gold), 2000e30), 1e18);

        // Reserved is zero at setup -> zero utilization and next funding.
        assertEq(vault.getUtilisation(address(usdc)), 0);
        assertEq(vault.getNextFundingRate(address(usdc)), 0);

        // Redemption amount should be non-zero for whitelisted stable token.
        assertEq(vault.getRedemptionAmount(address(usdc), 1e18), 1e6);
    }

    function test_admin_guardrails_setMaxLeverage() public {
        vm.expectRevert();
        vault.setMaxLeverage(10000);

        vault.setMaxLeverage(10001);
    }

    function test_setGov_and_setPriceFeed() public {
        address newGov = address(0xCAFE);
        vault.setGov(newGov);
        assertEq(vault.gov(), newGov);

        address newFeed = deployCode("SimplePriceFeed.sol:SimplePriceFeed");
        vm.prank(newGov);
        vault.setPriceFeed(newFeed);
        assertEq(vault.priceFeed(), newFeed);
    }
}
