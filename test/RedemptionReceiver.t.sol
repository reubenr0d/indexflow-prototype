// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {RedemptionReceiver} from "../src/coordination/RedemptionReceiver.sol";
import {BasketVault} from "../src/vault/BasketVault.sol";
import {StateRelay} from "../src/coordination/StateRelay.sol";
import {MockUSDC} from "../src/vault/MockUSDC.sol";
import {OracleAdapter} from "../src/perp/OracleAdapter.sol";
import {IOracleAdapter} from "../src/perp/interfaces/IOracleAdapter.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";

contract MockRouter {
    function getRouter() external view returns (address) {
        return address(this);
    }
}

contract RedemptionReceiverTest is Test {
    RedemptionReceiver receiver;
    MockUSDC usdc;
    BasketVault vault;
    StateRelay relay;
    OracleAdapter oracle;
    MockRouter router;

    address keeperAddr = address(0xBEEF);
    address trustedSender = address(0xFEED);
    uint64 sourceChain = 1001;
    uint64 localSelector = 2002;
    bytes32 constant BHP_ID = keccak256(bytes("BHP"));

    function setUp() public {
        usdc = new MockUSDC();
        router = new MockRouter();
        oracle = new OracleAdapter(address(this));
        oracle.configureAsset("BHP", address(0), IOracleAdapter.FeedType.CustomRelayer, 3600, 5000, 8);
        oracle.submitPrice(BHP_ID, 50_00000000);

        vault = new BasketVault("Test", address(usdc), address(oracle), address(this));
        bytes32[] memory assets = new bytes32[](1);
        assets[0] = BHP_ID;
        vault.setAssets(assets);

        relay = new StateRelay(localSelector, 300, keeperAddr, address(this));
        vault.setStateRelay(address(relay));
        vault.setKeeper(keeperAddr);

        receiver = new RedemptionReceiver(address(router), address(usdc), address(this));
        receiver.setTrustedSender(sourceChain, trustedSender);

        // RedemptionReceiver calls processPendingRedemption, so it needs keeper role
        vault.setKeeper(address(receiver));
    }

    function _buildMessage(address targetVault, uint256 redemptionId, uint256 usdcAmount)
        internal
        view
        returns (Client.Any2EVMMessage memory)
    {
        RedemptionReceiver.RedemptionFillPayload memory payload =
            RedemptionReceiver.RedemptionFillPayload({targetVault: targetVault, redemptionId: redemptionId});

        Client.EVMTokenAmount[] memory tokens = new Client.EVMTokenAmount[](1);
        tokens[0] = Client.EVMTokenAmount({token: address(usdc), amount: usdcAmount});

        return Client.Any2EVMMessage({
            messageId: bytes32(uint256(1)),
            sourceChainSelector: sourceChain,
            sender: abi.encode(trustedSender),
            data: abi.encode(payload),
            destTokenAmounts: tokens
        });
    }

    function testReceive_forwardsUsdcToVault() public {
        vm.warp(1000);
        address alice = address(0xA11CE);
        usdc.mint(alice, 10_000e6);

        vm.startPrank(alice);
        usdc.approve(address(vault), type(uint256).max);
        vault.deposit(10_000e6);
        vault.shareToken().approve(address(vault), type(uint256).max);
        vm.stopPrank();

        // Post PnL to create shortfall
        uint64[] memory c = new uint64[](1);
        uint256[] memory w = new uint256[](1);
        uint256[] memory a = new uint256[](1);
        c[0] = localSelector;
        w[0] = 10000;
        a[0] = 100_000e6;
        address[] memory v = new address[](1);
        int256[] memory p = new int256[](1);
        v[0] = address(vault);
        p[0] = 5_000e6;
        vm.prank(keeperAddr);
        relay.updateState(c, w, a, v, p, uint48(block.timestamp));

        // Redeem to create pending
        vm.prank(alice);
        vault.redeem(10_000e6);
        assertEq(vault.pendingRedemptionCount(), 1);

        // CCIP delivers USDC to receiver
        usdc.mint(address(receiver), 5_000e6);

        Client.Any2EVMMessage memory msg_ = _buildMessage(address(vault), 0, 5_000e6);

        // Call as if the CCIP router calls ccipReceive
        vm.prank(address(router));
        receiver.ccipReceive(msg_);

        // Verify the pending redemption was processed
        (,,,, bool completed) = vault.pendingRedemptions(0);
        assertTrue(completed);
    }

    function testReceive_rejectsUnauthorizedSender() public {
        address untrusted = address(0xBAD);
        usdc.mint(address(receiver), 1_000e6);

        Client.EVMTokenAmount[] memory tokens = new Client.EVMTokenAmount[](1);
        tokens[0] = Client.EVMTokenAmount({token: address(usdc), amount: 1_000e6});

        Client.Any2EVMMessage memory msg_ = Client.Any2EVMMessage({
            messageId: bytes32(uint256(2)),
            sourceChainSelector: sourceChain,
            sender: abi.encode(untrusted),
            data: abi.encode(RedemptionReceiver.RedemptionFillPayload({targetVault: address(vault), redemptionId: 0})),
            destTokenAmounts: tokens
        });

        vm.prank(address(router));
        vm.expectRevert(abi.encodeWithSelector(RedemptionReceiver.UntrustedSender.selector, sourceChain, untrusted));
        receiver.ccipReceive(msg_);
    }

    function testReceive_rejectsNonUsdcToken() public {
        MockUSDC fakeToken = new MockUSDC();
        fakeToken.mint(address(receiver), 1_000e6);

        Client.EVMTokenAmount[] memory tokens = new Client.EVMTokenAmount[](1);
        tokens[0] = Client.EVMTokenAmount({token: address(fakeToken), amount: 1_000e6});

        Client.Any2EVMMessage memory msg_ = Client.Any2EVMMessage({
            messageId: bytes32(uint256(3)),
            sourceChainSelector: sourceChain,
            sender: abi.encode(trustedSender),
            data: abi.encode(RedemptionReceiver.RedemptionFillPayload({targetVault: address(vault), redemptionId: 0})),
            destTokenAmounts: tokens
        });

        vm.prank(address(router));
        vm.expectRevert(RedemptionReceiver.NoUsdcReceived.selector);
        receiver.ccipReceive(msg_);
    }
}
