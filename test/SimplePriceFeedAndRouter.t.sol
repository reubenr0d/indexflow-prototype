// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {MockUSDC} from "../src/vault/MockUSDC.sol";

interface ISimplePriceFeedLike {
    function setGov(address _gov) external;
    function setKeeper(address _keeper, bool _active) external;
    function setPrice(address _token, uint256 _price) external;
    function setPrices(address[] calldata _tokens, uint256[] calldata _prices) external;
    function setSpreadBasisPoints(address _token, uint256 _spreadBps) external;
    function getPrice(address _token, bool _maximise, bool _includeAmmPrice, bool _useSwapPricing)
        external
        view
        returns (uint256);
    function prices(address) external view returns (uint256);
}

interface IRouterLike {
    function addPlugin(address _plugin) external;
    function removePlugin(address _plugin) external;
    function approvePlugin(address _plugin) external;
    function denyPlugin(address _plugin) external;
    function plugins(address) external view returns (bool);
    function approvedPlugins(address, address) external view returns (bool);
    function pluginTransfer(address _token, address _account, address _receiver, uint256 _amount) external;
    function swap(address[] memory _path, uint256 _amountIn, uint256 _minOut, address _receiver) external;
}

contract MockERC20Simple {
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

contract MockWETH {
    mapping(address => uint256) public balanceOf;

    receive() external payable {}

    function deposit() external payable {
        balanceOf[msg.sender] += msg.value;
    }

    function withdraw(uint256 amount) external {
        balanceOf[msg.sender] -= amount;
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        require(ok, "withdraw failed");
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function sendToRouter(address router, uint256 amount) external {
        (bool ok,) = router.call{value: amount}("");
        require(ok, "send failed");
    }
}

contract MockRouterVault {
    uint256 public nextSwapOut = 1e6;
    uint256 public nextBuyOut = 2e6;
    uint256 public nextSellOut = 3e6;

    uint256 public minPrice = 1e30;
    uint256 public maxPrice = 1e30;

    function setSwapOutputs(uint256 swapOut, uint256 buyOut, uint256 sellOut) external {
        nextSwapOut = swapOut;
        nextBuyOut = buyOut;
        nextSellOut = sellOut;
    }

    function setPrices(uint256 minP, uint256 maxP) external {
        minPrice = minP;
        maxPrice = maxP;
    }

    function increasePosition(address, address, address, uint256, bool) external {}

    function decreasePosition(address, address, address, uint256, uint256, bool, address) external returns (uint256) {
        return 0;
    }

    function directPoolDeposit(address) external {}

    function buyUSDG(address, address) external view returns (uint256) {
        return nextBuyOut;
    }

    function sellUSDG(address, address) external view returns (uint256) {
        return nextSellOut;
    }

    function swap(address, address, address) external view returns (uint256) {
        return nextSwapOut;
    }

    function getMinPrice(address) external view returns (uint256) {
        return minPrice;
    }

    function getMaxPrice(address) external view returns (uint256) {
        return maxPrice;
    }
}

contract RouterPluginCaller {
    function doTransfer(IRouterLike r, address token, address account, address receiver, uint256 amount) external {
        r.pluginTransfer(token, account, receiver, amount);
    }
}

contract SimplePriceFeedAndRouterTest is Test {
    address internal simplePriceFeed;
    ISimplePriceFeedLike internal priceFeed;

    address internal routerAddr;
    IRouterLike internal router;

    MockERC20Simple internal usdg;
    MockUSDC internal tokenA;
    MockUSDC internal tokenB;
    MockWETH internal weth;
    MockRouterVault internal mockVault;

    address internal user = address(0xBEEF);
    address internal receiver = address(0xABCD);

    function setUp() public {
        simplePriceFeed = deployCode("SimplePriceFeed.sol:SimplePriceFeed");
        priceFeed = ISimplePriceFeedLike(simplePriceFeed);

        usdg = new MockERC20Simple("USDG", "USDG", 18);
        tokenA = new MockUSDC();
        tokenB = new MockUSDC();
        weth = new MockWETH();
        mockVault = new MockRouterVault();

        routerAddr = deployCode("Router.sol:Router", abi.encode(address(mockVault), address(usdg), address(weth)));
        router = IRouterLike(routerAddr);

        tokenA.mint(user, 1_000_000e6);
        vm.prank(user);
        tokenA.approve(routerAddr, type(uint256).max);
    }

    function test_simplePriceFeed_auth_and_spread() public {
        vm.prank(user);
        vm.expectRevert("SimplePriceFeed: forbidden");
        priceFeed.setPrice(address(tokenA), 1e30);

        priceFeed.setKeeper(user, true);
        vm.prank(user);
        priceFeed.setPrice(address(tokenA), 1e30);
        assertEq(priceFeed.prices(address(tokenA)), 1e30);

        priceFeed.setSpreadBasisPoints(address(tokenA), 100);
        assertEq(priceFeed.getPrice(address(tokenA), true, false, false), 101e28);
        assertEq(priceFeed.getPrice(address(tokenA), false, false, false), 99e28);

        address[] memory toks = new address[](1);
        toks[0] = address(tokenA);
        uint256[] memory vals = new uint256[](2);
        vals[0] = 1e30;
        vals[1] = 2e30;

        vm.prank(user);
        vm.expectRevert("SimplePriceFeed: length mismatch");
        priceFeed.setPrices(toks, vals);
    }

    function test_router_plugin_permissions_and_transfer() public {
        RouterPluginCaller plugin = new RouterPluginCaller();

        vm.prank(user);
        router.approvePlugin(address(plugin));
        router.addPlugin(address(plugin));

        vm.prank(address(plugin));
        router.pluginTransfer(address(tokenA), user, receiver, 10e6);
        assertEq(tokenA.balanceOf(receiver), 10e6);

        router.removePlugin(address(plugin));
        vm.prank(address(plugin));
        vm.expectRevert("Router: invalid plugin");
        router.pluginTransfer(address(tokenA), user, receiver, 1e6);

        vm.prank(user);
        router.denyPlugin(address(plugin));
    }

    function test_router_swap_paths_and_reverts() public {
        address[] memory path2 = new address[](2);
        path2[0] = address(tokenA);
        path2[1] = address(tokenB);

        vm.prank(user);
        router.swap(path2, 5e6, 1e6, receiver);

        mockVault.setSwapOutputs(100, 100, 100);
        vm.prank(user);
        vm.expectRevert("Router: insufficient amountOut");
        router.swap(path2, 1e6, 101, receiver);

        address[] memory badPath = new address[](1);
        badPath[0] = address(tokenA);
        vm.prank(user);
        vm.expectRevert("Router: invalid _path.length");
        router.swap(badPath, 1e6, 0, receiver);
    }

    function test_router_receive_only_weth() public {
        vm.deal(address(this), 1 ether);
        vm.expectRevert("Router: invalid sender");
        (bool ok,) = routerAddr.call{value: 1}("");
        ok;

        vm.deal(address(weth), 1 ether);
        weth.sendToRouter(routerAddr, 1);
        assertEq(address(routerAddr).balance, 1);
    }
}
