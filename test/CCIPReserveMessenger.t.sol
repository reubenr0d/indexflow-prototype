// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/coordination/CCIPReserveMessenger.sol";
import "../src/coordination/PoolReserveRegistry.sol";
import "../src/coordination/interfaces/IPoolReserveRegistry.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";

contract MockGMXVaultForMessenger {
    mapping(address => uint256) public poolAmounts;
    mapping(address => uint256) public reservedAmounts;

    function setPoolAmount(address token, uint256 amount) external {
        poolAmounts[token] = amount;
    }

    function setReservedAmount(address token, uint256 amount) external {
        reservedAmounts[token] = amount;
    }
}

contract MockCCIPRouter {
    uint256 public lastFee;
    bytes32 public lastMessageId;
    uint256 public messageCounter;

    function setFee(uint256 _fee) external {
        lastFee = _fee;
    }

    function getFee(uint64, Client.EVM2AnyMessage memory) external view returns (uint256) {
        return lastFee;
    }

    function ccipSend(uint64, Client.EVM2AnyMessage calldata) external payable returns (bytes32) {
        messageCounter++;
        lastMessageId = keccak256(abi.encode(messageCounter));
        return lastMessageId;
    }

    function isChainSupported(uint64) external pure returns (bool) {
        return true;
    }
}

contract CCIPReserveMessengerTest is Test {
    CCIPReserveMessenger public messenger;
    PoolReserveRegistry public registry;
    MockGMXVaultForMessenger public gmxVault;
    MockCCIPRouter public ccipRouter;

    address public usdc = makeAddr("USDC");
    uint64 public localSelector = 1;
    uint64 public remoteSelector = 2;
    address public owner = address(this);

    function setUp() public {
        gmxVault = new MockGMXVaultForMessenger();
        gmxVault.setPoolAmount(usdc, 5_000_000e6);
        gmxVault.setReservedAmount(usdc, 1_000_000e6);

        registry = new PoolReserveRegistry(
            address(gmxVault), usdc, localSelector,
            1800, 0, 3600, 3600, 2000, owner
        );

        ccipRouter = new MockCCIPRouter();

        messenger = new CCIPReserveMessenger(
            address(ccipRouter),
            address(registry),
            500,    // broadcastThresholdBps: 5%
            600,    // minBroadcastInterval: 10 min
            3600,   // maxBroadcastInterval: 1 hour
            address(0), // native fee
            owner
        );

        registry.setMessenger(address(messenger));
        registry.addRemoteChain(remoteSelector);
        messenger.addPeer(remoteSelector, address(0xDEAD));

        // Fund messenger with ETH for native fees
        vm.deal(address(messenger), 10 ether);
    }

    function test_broadcastPoolState_firstBroadcast() public {
        messenger.broadcastPoolState();
        assertGt(messenger.lastBroadcastTime(), 0);
        assertEq(messenger.lastBroadcastedPoolAmount(), 5_000_000e6);
    }

    function test_broadcastPoolState_revertsBelowDelta() public {
        messenger.broadcastPoolState();

        // Wait past min interval but don't change pool
        vm.warp(block.timestamp + 700);

        vm.expectRevert(CCIPReserveMessenger.PoolStateUnchanged.selector);
        messenger.broadcastPoolState();
    }

    function test_broadcastPoolState_triggersOnDelta() public {
        messenger.broadcastPoolState();

        // Change pool significantly and let TWAP accumulate the new value
        gmxVault.setPoolAmount(usdc, 8_000_000e6);
        vm.warp(1000);
        registry.observe();

        // Advance time so the 8M value dominates the TWAP
        vm.warp(10000);
        registry.observe();

        vm.warp(11000);
        messenger.broadcastPoolState();
        assertGt(messenger.lastBroadcastedPoolAmount(), 5_000_000e6);
    }

    function test_broadcastPoolState_triggersOnMaxInterval() public {
        messenger.broadcastPoolState();

        // Wait past maxBroadcastInterval
        vm.warp(block.timestamp + 3700);

        messenger.broadcastPoolState();
    }

    function test_broadcastPoolState_revertsTooSoon() public {
        messenger.broadcastPoolState();

        // Within minBroadcastInterval
        vm.warp(block.timestamp + 100);

        vm.expectRevert(CCIPReserveMessenger.BroadcastTooSoon.selector);
        messenger.broadcastPoolState();
    }

    function test_forceBroadcast() public {
        messenger.forceBroadcast();
        assertGt(messenger.lastBroadcastTime(), 0);
    }

    function test_forceBroadcast_onlyOwner() public {
        vm.prank(address(0xBEEF));
        vm.expectRevert();
        messenger.forceBroadcast();
    }

    function test_ccipReceive_updatesRegistry() public {
        address remotePeer = address(0xDEAD);

        IPoolReserveRegistry.PoolState memory state = IPoolReserveRegistry.PoolState({
            chainSelector: remoteSelector,
            twapPoolAmount: 3_000_000e6,
            instantPoolAmount: 3_000_000e6,
            reservedAmount: 500_000e6,
            availableLiquidity: 2_500_000e6,
            utilizationBps: 1667,
            oracleConfigHash: bytes32(0),
            hasBrokenFeeds: false,
            timestamp: uint48(block.timestamp)
        });

        Client.Any2EVMMessage memory ccipMessage = Client.Any2EVMMessage({
            messageId: keccak256("test"),
            sourceChainSelector: remoteSelector,
            sender: abi.encode(remotePeer),
            data: abi.encode(state),
            destTokenAmounts: new Client.EVMTokenAmount[](0)
        });

        vm.prank(address(ccipRouter));
        messenger.ccipReceive(ccipMessage);

        IPoolReserveRegistry.PoolState memory stored = registry.getRemotePoolState(remoteSelector);
        assertEq(stored.twapPoolAmount, 3_000_000e6);
    }

    function test_ccipReceive_rejectsUnknownPeer() public {
        IPoolReserveRegistry.PoolState memory state = _makeState();

        Client.Any2EVMMessage memory ccipMessage = Client.Any2EVMMessage({
            messageId: keccak256("test"),
            sourceChainSelector: remoteSelector,
            sender: abi.encode(address(0xBAD)),
            data: abi.encode(state),
            destTokenAmounts: new Client.EVMTokenAmount[](0)
        });

        vm.prank(address(ccipRouter));
        vm.expectRevert();
        messenger.ccipReceive(ccipMessage);
    }

    function test_ccipReceive_rateLimiting() public {
        address remotePeer = address(0xDEAD);
        messenger.setMaxUpdatesPerHour(2);

        uint48 baseTs = uint48(block.timestamp);

        for (uint256 i = 0; i < 2; i++) {
            IPoolReserveRegistry.PoolState memory state = IPoolReserveRegistry.PoolState({
                chainSelector: remoteSelector,
                twapPoolAmount: 3_000_000e6,
                instantPoolAmount: 3_000_000e6,
                reservedAmount: 500_000e6,
                availableLiquidity: 2_500_000e6,
                utilizationBps: 1667,
                oracleConfigHash: bytes32(0),
                hasBrokenFeeds: false,
                timestamp: baseTs + uint48(i) + 1
            });

            Client.Any2EVMMessage memory msg_ = Client.Any2EVMMessage({
                messageId: keccak256(abi.encode("test", i)),
                sourceChainSelector: remoteSelector,
                sender: abi.encode(remotePeer),
                data: abi.encode(state),
                destTokenAmounts: new Client.EVMTokenAmount[](0)
            });

            vm.prank(address(ccipRouter));
            messenger.ccipReceive(msg_);
        }

        // Third should fail
        IPoolReserveRegistry.PoolState memory state3 = IPoolReserveRegistry.PoolState({
            chainSelector: remoteSelector,
            twapPoolAmount: 3_000_000e6,
            instantPoolAmount: 3_000_000e6,
            reservedAmount: 500_000e6,
            availableLiquidity: 2_500_000e6,
            utilizationBps: 1667,
            oracleConfigHash: bytes32(0),
            hasBrokenFeeds: false,
            timestamp: baseTs + 10
        });

        Client.Any2EVMMessage memory msg3 = Client.Any2EVMMessage({
            messageId: keccak256("test3"),
            sourceChainSelector: remoteSelector,
            sender: abi.encode(remotePeer),
            data: abi.encode(state3),
            destTokenAmounts: new Client.EVMTokenAmount[](0)
        });

        vm.prank(address(ccipRouter));
        vm.expectRevert(abi.encodeWithSelector(CCIPReserveMessenger.RateLimited.selector, remoteSelector));
        messenger.ccipReceive(msg3);
    }

    function test_addRemovePeer() public {
        uint64 sel = 99;
        messenger.addPeer(sel, address(0x1234));
        assertTrue(messenger.isPeer(sel));
        assertEq(messenger.peers(sel), address(0x1234));

        messenger.removePeer(sel);
        assertFalse(messenger.isPeer(sel));
    }

    function test_getLinkBalance() public view {
        uint256 bal = messenger.getLinkBalance();
        assertEq(bal, 10 ether);
    }

    function _makeState() internal view returns (IPoolReserveRegistry.PoolState memory) {
        return IPoolReserveRegistry.PoolState({
            chainSelector: remoteSelector,
            twapPoolAmount: 3_000_000e6,
            instantPoolAmount: 3_000_000e6,
            reservedAmount: 500_000e6,
            availableLiquidity: 2_500_000e6,
            utilizationBps: 1667,
            oracleConfigHash: bytes32(0),
            hasBrokenFeeds: false,
            timestamp: uint48(block.timestamp)
        });
    }
}
