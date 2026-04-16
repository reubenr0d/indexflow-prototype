// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/coordination/CrossChainIntentBridge.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract MockShareTokenForBridge {
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
}

contract MockUSDCForBridge {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
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

contract MockBasketVaultForBridge is Ownable {
    MockUSDCForBridge public usdc;
    MockShareTokenForBridge public shareToken;
    string public name;
    uint256 public depositFeeBps;
    uint256 public redeemFeeBps;

    constructor(string memory _name, address _usdc, uint256 _depositFee, uint256 _redeemFee, address _owner)
        Ownable(_owner)
    {
        name = _name;
        usdc = MockUSDCForBridge(_usdc);
        shareToken = new MockShareTokenForBridge();
        depositFeeBps = _depositFee;
        redeemFeeBps = _redeemFee;
    }

    function deposit(uint256 usdcAmount) external returns (uint256 sharesMinted) {
        usdc.transferFrom(msg.sender, address(this), usdcAmount);
        sharesMinted = usdcAmount;
        shareToken.mint(msg.sender, sharesMinted);
    }
}

/// @dev Mock factory that creates MockBasketVaultForBridge instances.
contract MockBasketFactoryForBridge {
    address public usdc;
    address[] public baskets;

    constructor(address _usdc) {
        usdc = _usdc;
    }

    function createBasket(string calldata _name, uint256 depositFeeBps, uint256 redeemFeeBps)
        external
        returns (address)
    {
        MockBasketVaultForBridge vault = new MockBasketVaultForBridge(_name, usdc, depositFeeBps, redeemFeeBps, msg.sender);
        baskets.push(address(vault));
        return address(vault);
    }

    function getAllBaskets() external view returns (address[] memory) {
        return baskets;
    }

    function getBasketCount() external view returns (uint256) {
        return baskets.length;
    }

    function addBasket(address basket) external {
        baskets.push(basket);
    }
}

/// @dev Harness that exposes _ccipReceive for direct testing.
contract BridgeHarness is CrossChainIntentBridge {
    constructor(
        address _ccipRouter,
        address _intentRouter,
        address _usdc,
        address _basketFactory,
        address _owner
    ) CrossChainIntentBridge(_ccipRouter, _intentRouter, _usdc, _basketFactory, _owner) {}

    function testReceive(Client.Any2EVMMessage memory message) external {
        _ccipReceive(message);
    }
}

contract CrossChainAutoDeployBridgeTest is Test {
    BridgeHarness public bridge;
    MockUSDCForBridge public usdc;
    MockBasketFactoryForBridge public factory;

    address public owner = address(this);
    address public vaultOwnerAddr = makeAddr("vaultOwner");
    address public ccipRouter = makeAddr("ccipRouter");
    address public intentRouter = makeAddr("intentRouter");
    address public userAddr = makeAddr("user");
    uint64 public sourceChain = 42;
    address public sourceBridge = makeAddr("sourceBridge");

    function setUp() public {
        usdc = new MockUSDCForBridge();
        factory = new MockBasketFactoryForBridge(address(usdc));

        bridge = new BridgeHarness(ccipRouter, intentRouter, address(usdc), address(factory), owner);
        bridge.setVaultOwner(vaultOwnerAddr);
        bridge.addSupportedChain(sourceChain, address(usdc), sourceBridge);
    }

    function _buildMessage(
        address _user,
        address _targetBasket,
        string memory _basketName,
        uint256 _depositFeeBps,
        uint256 _redeemFeeBps,
        uint256 _usdcAmount
    ) internal view returns (Client.Any2EVMMessage memory) {
        CrossChainIntentBridge.CrossChainPayload memory payload = CrossChainIntentBridge.CrossChainPayload({
            intentId: 1,
            user: _user,
            targetBasket: _targetBasket,
            basketName: _basketName,
            depositFeeBps: _depositFeeBps,
            redeemFeeBps: _redeemFeeBps
        });

        Client.EVMTokenAmount[] memory tokenAmounts = new Client.EVMTokenAmount[](1);
        tokenAmounts[0] = Client.EVMTokenAmount({token: address(usdc), amount: _usdcAmount});

        return Client.Any2EVMMessage({
            messageId: keccak256("test-msg"),
            sourceChainSelector: sourceChain,
            sender: abi.encode(sourceBridge),
            data: abi.encode(payload),
            destTokenAmounts: tokenAmounts
        });
    }

    function test_autoDeployWhenNoBaskets() public {
        uint256 depositAmount = 1_000e6;
        usdc.mint(address(bridge), depositAmount);

        Client.Any2EVMMessage memory msg_ = _buildMessage(
            userAddr, address(0), "Auto Vault", 50, 30, depositAmount
        );

        bridge.testReceive(msg_);

        assertEq(factory.getBasketCount(), 1);

        MockBasketVaultForBridge vault = MockBasketVaultForBridge(factory.baskets(0));
        assertEq(vault.name(), "Auto Vault");
        assertEq(vault.depositFeeBps(), 50);
        assertEq(vault.redeemFeeBps(), 30);

        MockShareTokenForBridge shareToken = vault.shareToken();
        assertEq(shareToken.balanceOf(userAddr), depositAmount);
    }

    function test_autoDeployOwnershipTransferred() public {
        uint256 depositAmount = 1_000e6;
        usdc.mint(address(bridge), depositAmount);

        Client.Any2EVMMessage memory msg_ = _buildMessage(
            userAddr, address(0), "Owned Vault", 0, 0, depositAmount
        );

        bridge.testReceive(msg_);

        MockBasketVaultForBridge vault = MockBasketVaultForBridge(factory.baskets(0));
        assertEq(vault.owner(), vaultOwnerAddr);
    }

    function test_noAutoDeployWithoutConfig() public {
        uint256 depositAmount = 1_000e6;
        usdc.mint(address(bridge), depositAmount);

        Client.Any2EVMMessage memory msg_ = _buildMessage(
            userAddr, address(0), "", 0, 0, depositAmount
        );

        vm.expectRevert(CrossChainIntentBridge.NoBasketAvailable.selector);
        bridge.testReceive(msg_);
    }

    function test_existingBasketSkipsAutoDeploy() public {
        MockBasketVaultForBridge existingVault = new MockBasketVaultForBridge("Existing", address(usdc), 10, 10, owner);
        factory.addBasket(address(existingVault));
        uint256 initialCount = factory.getBasketCount();

        uint256 depositAmount = 1_000e6;
        usdc.mint(address(bridge), depositAmount);

        Client.Any2EVMMessage memory msg_ = _buildMessage(
            userAddr, address(0), "Should Not Deploy", 50, 30, depositAmount
        );

        bridge.testReceive(msg_);

        assertEq(factory.getBasketCount(), initialCount);

        MockShareTokenForBridge shareToken = existingVault.shareToken();
        assertEq(shareToken.balanceOf(userAddr), depositAmount);
    }

    function test_autoDeployEmitsEvent() public {
        uint256 depositAmount = 1_000e6;
        usdc.mint(address(bridge), depositAmount);

        Client.Any2EVMMessage memory msg_ = _buildMessage(
            userAddr, address(0), "Event Vault", 25, 15, depositAmount
        );

        vm.recordLogs();
        bridge.testReceive(msg_);

        Vm.Log[] memory entries = vm.getRecordedLogs();
        bool found;
        for (uint256 i = 0; i < entries.length; i++) {
            if (entries[i].topics[0] == keccak256("BasketAutoDeployed(address,string)")) {
                found = true;
                break;
            }
        }
        assertTrue(found, "BasketAutoDeployed event not emitted");
    }
}
