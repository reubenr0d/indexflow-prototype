// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/coordination/IntentRouter.sol";
import "../src/coordination/PoolReserveRegistry.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract MockUSDCForRouter {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    string public name = "USDC";
    uint8 public decimals = 6;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (allowance[from][msg.sender] != type(uint256).max) {
            allowance[from][msg.sender] -= amount;
        }
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
}

contract MockShareToken {
    mapping(address => uint256) public balanceOf;
    uint256 public totalSupply;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
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

    function approve(address, uint256) external pure returns (bool) {
        return true;
    }
}

contract MockBasketVault {
    MockUSDCForRouter public usdc;
    MockShareToken public shareToken;

    constructor(address _usdc) {
        usdc = MockUSDCForRouter(_usdc);
        shareToken = new MockShareToken();
    }

    function deposit(uint256 usdcAmount) external returns (uint256 sharesMinted) {
        usdc.transferFrom(msg.sender, address(this), usdcAmount);
        sharesMinted = usdcAmount; // 1:1 for simplicity
        shareToken.mint(msg.sender, sharesMinted);
    }
}

contract MockBasketFactory {
    address[] public baskets;

    function addBasket(address basket) external {
        baskets.push(basket);
    }

    function getAllBaskets() external view returns (address[] memory) {
        return baskets;
    }

    function getBasketCount() external view returns (uint256) {
        return baskets.length;
    }
}

contract MockGMXVaultForRouter {
    mapping(address => uint256) public poolAmounts;
    mapping(address => uint256) public reservedAmounts;

    function setPoolAmount(address token, uint256 amount) external {
        poolAmounts[token] = amount;
    }

    function setReservedAmount(address token, uint256 amount) external {
        reservedAmounts[token] = amount;
    }
}

contract IntentRouterTest is Test {
    IntentRouter public router;
    IntentRouter public routerImpl;
    PoolReserveRegistry public registry;
    MockGMXVaultForRouter public gmxVault;
    MockUSDCForRouter public usdc;
    MockBasketFactory public factory;
    MockBasketVault public basket;

    address public owner = address(this);
    address public user = makeAddr("user");
    address public keeper = makeAddr("keeper");
    address public treasury = makeAddr("treasury");
    uint64 public localSelector = 1;

    function setUp() public {
        usdc = new MockUSDCForRouter();

        gmxVault = new MockGMXVaultForRouter();
        gmxVault.setPoolAmount(address(usdc), 5_000_000e6);

        registry = new PoolReserveRegistry(
            address(gmxVault), address(usdc), localSelector,
            1800, 0, 3600, 3600, 2000, owner
        );

        factory = new MockBasketFactory();
        basket = new MockBasketVault(address(usdc));
        factory.addBasket(address(basket));

        routerImpl = new IntentRouter();
        bytes memory initData = abi.encodeCall(
            IntentRouter.initialize,
            (
                address(usdc), address(registry), address(factory),
                localSelector, 7200, 100e6, 10_000e6, treasury, owner
            )
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(routerImpl), initData);
        router = IntentRouter(address(proxy));

        router.addApprovedKeeper(keeper);

        // Fund user
        usdc.mint(user, 1_000_000e6);

        // Approve router
        vm.prank(user);
        usdc.approve(address(router), type(uint256).max);
    }

    function test_submitIntent() public {
        vm.prank(user);
        uint256 id = router.submitIntent(1_000e6, 0, address(0), 0);

        IIntentRouter.Intent memory intent = router.getIntent(id);
        assertEq(intent.id, 1);
        assertEq(intent.user, user);
        assertEq(intent.amount, 1_000e6);
        assertEq(uint256(intent.status), uint256(IIntentRouter.IntentStatus.PENDING));
        assertEq(usdc.balanceOf(address(router)), 1_000e6);
    }

    function test_submitIntent_revertsBelowMin() public {
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(IntentRouter.AmountTooSmall.selector, 10e6, 100e6));
        router.submitIntent(10e6, 0, address(0), 0);
    }

    function test_submitIntent_revertsTooManyActive() public {
        router.setMaxActiveIntentsPerUser(2);

        vm.startPrank(user);
        router.submitIntent(100e6, 0, address(0), 0);
        router.submitIntent(100e6, 0, address(0), 0);

        vm.expectRevert(abi.encodeWithSelector(IntentRouter.TooManyActiveIntents.selector, user));
        router.submitIntent(100e6, 0, address(0), 0);
        vm.stopPrank();
    }

    function test_submitAndExecute() public {
        vm.prank(user);
        uint256 shares = router.submitAndExecute(address(basket), 1_000e6);

        assertEq(shares, 1_000e6);
        MockShareToken shareToken = basket.shareToken();
        assertEq(shareToken.balanceOf(user), 1_000e6);
        assertEq(usdc.balanceOf(address(router)), 0);
    }

    function test_submitAndExecute_revertsInvalidBasket() public {
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(IntentRouter.InvalidBasket.selector, address(0x1234)));
        router.submitAndExecute(address(0x1234), 1_000e6);
    }

    function test_executeIntent() public {
        vm.prank(user);
        uint256 id = router.submitIntent(1_000e6, localSelector, address(basket), 0);

        vm.prank(keeper);
        uint256 shares = router.executeIntent(id, address(basket));

        assertEq(shares, 1_000e6);
        MockShareToken shareToken = basket.shareToken();
        assertEq(shareToken.balanceOf(user), 1_000e6);

        IIntentRouter.Intent memory intent = router.getIntent(id);
        assertEq(uint256(intent.status), uint256(IIntentRouter.IntentStatus.EXECUTED));
    }

    function test_executeIntent_revertsNotKeeper() public {
        vm.prank(user);
        uint256 id = router.submitIntent(1_000e6, 0, address(0), 0);

        vm.prank(user);
        vm.expectRevert(IntentRouter.NotKeeper.selector);
        router.executeIntent(id, address(basket));
    }

    function test_executeIntent_revertsBasketMismatch() public {
        vm.prank(user);
        uint256 id = router.submitIntent(1_000e6, 0, address(0xDEAD), 0);

        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(IntentRouter.BasketMismatch.selector, address(0xDEAD), address(basket)));
        router.executeIntent(id, address(basket));
    }

    function test_executeIntent_revertsNotLocalChain() public {
        vm.prank(user);
        uint256 id = router.submitIntent(1_000e6, 99, address(0), 0);

        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(IntentRouter.NotLocalChain.selector, 99, localSelector));
        router.executeIntent(id, address(basket));
    }

    function test_refundIntent() public {
        vm.prank(user);
        uint256 id = router.submitIntent(1_000e6, 0, address(0), 0);

        uint256 balBefore = usdc.balanceOf(user);

        vm.warp(block.timestamp + 7201);
        router.refundIntent(id);

        assertEq(usdc.balanceOf(user), balBefore + 1_000e6);

        IIntentRouter.Intent memory intent = router.getIntent(id);
        assertEq(uint256(intent.status), uint256(IIntentRouter.IntentStatus.REFUNDED));
    }

    function test_refundIntent_revertsNotExpired() public {
        vm.prank(user);
        uint256 id = router.submitIntent(1_000e6, 0, address(0), 0);

        vm.expectRevert(abi.encodeWithSelector(IntentRouter.IntentNotExpired.selector, id));
        router.refundIntent(id);
    }

    function test_refundIntent_revertsAlreadyExecuted() public {
        vm.prank(user);
        uint256 id = router.submitIntent(1_000e6, localSelector, address(basket), 0);

        vm.prank(keeper);
        router.executeIntent(id, address(basket));

        vm.warp(block.timestamp + 7201);
        vm.expectRevert(abi.encodeWithSelector(IntentRouter.IntentNotPending.selector, id));
        router.refundIntent(id);
    }

    function test_intentWithFee() public {
        router.setIntentFee(1e6);

        vm.prank(user);
        uint256 id = router.submitIntent(1_000e6, 0, address(0), 0);

        IIntentRouter.Intent memory intent = router.getIntent(id);
        assertEq(intent.amount, 999e6); // 1000 - 1 fee
        assertEq(usdc.balanceOf(treasury), 1e6);
    }

    function test_activeIntentCountDecrementsOnRefund() public {
        vm.prank(user);
        uint256 id = router.submitIntent(100e6, 0, address(0), 0);
        assertEq(router.activeIntentCount(user), 1);

        vm.warp(block.timestamp + 7201);
        router.refundIntent(id);
        assertEq(router.activeIntentCount(user), 0);
    }

    function test_activeIntentCountDecrementsOnExecute() public {
        vm.prank(user);
        uint256 id = router.submitIntent(100e6, localSelector, address(basket), 0);
        assertEq(router.activeIntentCount(user), 1);

        vm.prank(keeper);
        router.executeIntent(id, address(basket));
        assertEq(router.activeIntentCount(user), 0);
    }

    function test_deadlineEnforcement() public {
        uint48 deadline = uint48(block.timestamp + 100);
        vm.prank(user);
        uint256 id = router.submitIntent(1_000e6, 0, address(0), deadline);

        vm.warp(deadline + 1);
        vm.prank(keeper);
        vm.expectRevert(IntentRouter.DeadlineExceeded.selector);
        router.executeIntent(id, address(basket));
    }
}
