// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/coordination/OracleConfigQuorum.sol";
import "../src/perp/OracleAdapter.sol";
import "../src/perp/interfaces/IOracleAdapter.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";

/// @dev Minimal mock CCIP router that records sent messages.
contract MockCCIPRouter {
    struct SentMessage {
        uint64 destChainSelector;
        Client.EVM2AnyMessage message;
    }

    SentMessage[] public sent;
    uint256 public constant FIXED_FEE = 0.01 ether;

    function getFee(uint64, Client.EVM2AnyMessage memory) external pure returns (uint256) {
        return FIXED_FEE;
    }

    function ccipSend(uint64 destChainSelector, Client.EVM2AnyMessage calldata message)
        external
        payable
        returns (bytes32)
    {
        sent.push(SentMessage({destChainSelector: destChainSelector, message: message}));
        return keccak256(abi.encode(destChainSelector, sent.length));
    }

    function getSentCount() external view returns (uint256) {
        return sent.length;
    }
}

contract OracleConfigQuorumTest is Test {
    OracleAdapter public oracleA;
    OracleAdapter public oracleB;

    OracleConfigQuorum public quorumA;
    OracleConfigQuorum public quorumB;
    OracleConfigQuorum public quorumC;

    MockCCIPRouter public routerA;
    MockCCIPRouter public routerB;

    uint64 constant CHAIN_A = 1;
    uint64 constant CHAIN_B = 2;
    uint64 constant CHAIN_C = 3;

    address owner = address(this);

    function setUp() public {
        routerA = new MockCCIPRouter();
        routerB = new MockCCIPRouter();

        oracleA = new OracleAdapter(address(this));
        oracleB = new OracleAdapter(address(this));

        // Quorum A: threshold 2, TTL 1 day
        quorumA = new OracleConfigQuorum(
            address(routerA), address(oracleA), CHAIN_A, 2, 86_400, address(0), owner
        );

        // Quorum B: threshold 2, TTL 1 day
        quorumB = new OracleConfigQuorum(
            address(routerB), address(oracleB), CHAIN_B, 2, 86_400, address(0), owner
        );

        // Wire as peers
        quorumA.addPeer(CHAIN_B, address(quorumB));
        quorumB.addPeer(CHAIN_A, address(quorumA));

        // Set quorum contracts as config controllers on their respective OracleAdapters
        oracleA.setCanonicalMode(address(quorumA));
        oracleB.setCanonicalMode(address(quorumB));

        // Fund quorum contracts for native-fee CCIP
        vm.deal(address(quorumA), 1 ether);
        vm.deal(address(quorumB), 1 ether);
    }

    // ─── Single-chain propose: no apply (below quorum) ───────────

    function test_proposeConfig_singleChain_noApply() public {
        quorumA.proposeConfig("XAU", IOracleAdapter.FeedType.CustomRelayer, 3600, 2000, 8);

        // Vote is recorded
        IOracleConfigQuorum.Vote memory v = quorumA.getVote(keccak256("XAU"), CHAIN_A);
        assertGt(v.timestamp, 0);

        // Config NOT applied to oracle (quorum = 2, only 1 vote)
        assertFalse(oracleA.isAssetActive(keccak256("XAU")));

        // CCIP message was sent to peer
        assertEq(routerA.getSentCount(), 1);
    }

    // ─── Two-chain quorum: apply ─────────────────────────────────

    function test_quorumReached_appliesConfig() public {
        // Chain A proposes
        quorumA.proposeConfig("XAU", IOracleAdapter.FeedType.CustomRelayer, 3600, 2000, 8);
        assertFalse(oracleA.isAssetActive(keccak256("XAU")));

        // Simulate Chain B's proposal arriving at Chain A via CCIP
        _deliverProposal(quorumB, quorumA, CHAIN_B, "XAU", IOracleAdapter.FeedType.CustomRelayer, 3600, 2000, 8);

        // Now quorum is reached (2 of 2) — config should be applied
        assertTrue(oracleA.isAssetActive(keccak256("XAU")));

        IOracleAdapter.AssetConfig memory cfg = oracleA.getAssetConfig(keccak256("XAU"));
        assertEq(uint8(cfg.feedType), uint8(IOracleAdapter.FeedType.CustomRelayer));
        assertEq(cfg.stalenessThreshold, 3600);
        assertEq(cfg.deviationBps, 2000);
        assertEq(cfg.decimals, 8);
    }

    // ─── Mismatched proposals: no quorum ─────────────────────────

    function test_mismatchedProposals_noQuorum() public {
        quorumA.proposeConfig("XAU", IOracleAdapter.FeedType.CustomRelayer, 3600, 2000, 8);

        // Chain B proposes different staleness threshold
        _deliverProposal(quorumB, quorumA, CHAIN_B, "XAU", IOracleAdapter.FeedType.CustomRelayer, 7200, 2000, 8);

        // No quorum — hashes don't match
        assertFalse(oracleA.isAssetActive(keccak256("XAU")));
    }

    // ─── Proposal expiry ─────────────────────────────────────────

    function test_expiredVote_doesNotCountTowardQuorum() public {
        quorumA.proposeConfig("XAU", IOracleAdapter.FeedType.CustomRelayer, 3600, 2000, 8);

        // Fast forward past TTL
        vm.warp(block.timestamp + 86_401);

        // Chain B proposes (same config) — but chain A's vote is expired
        _deliverProposal(quorumB, quorumA, CHAIN_B, "XAU", IOracleAdapter.FeedType.CustomRelayer, 3600, 2000, 8);

        assertFalse(oracleA.isAssetActive(keccak256("XAU")));
    }

    function test_freshVoteAfterExpiry_reachesQuorum() public {
        quorumA.proposeConfig("XAU", IOracleAdapter.FeedType.CustomRelayer, 3600, 2000, 8);

        vm.warp(block.timestamp + 86_401);

        // Re-propose locally (refreshes timestamp)
        quorumA.proposeConfig("XAU", IOracleAdapter.FeedType.CustomRelayer, 3600, 2000, 8);

        // Chain B votes
        _deliverProposal(quorumB, quorumA, CHAIN_B, "XAU", IOracleAdapter.FeedType.CustomRelayer, 3600, 2000, 8);

        assertTrue(oracleA.isAssetActive(keccak256("XAU")));
    }

    // ─── Emergency bypass ────────────────────────────────────────

    function test_forceApplyConfig_bypassesQuorum() public {
        quorumA.forceApplyConfig("XAU", IOracleAdapter.FeedType.CustomRelayer, 3600, 2000, 8);

        assertTrue(oracleA.isAssetActive(keccak256("XAU")));
    }

    function test_forceApplyConfig_onlyOwner() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert();
        quorumA.forceApplyConfig("XAU", IOracleAdapter.FeedType.CustomRelayer, 3600, 2000, 8);
    }

    // ─── Peer management ─────────────────────────────────────────

    function test_addPeer_duplicate_reverts() public {
        vm.expectRevert(abi.encodeWithSelector(OracleConfigQuorum.PeerAlreadyRegistered.selector, CHAIN_B));
        quorumA.addPeer(CHAIN_B, address(quorumB));
    }

    function test_removePeer() public {
        quorumA.removePeer(CHAIN_B);
        assertEq(quorumA.getPeerCount(), 0);
    }

    function test_removePeer_nonexistent_reverts() public {
        vm.expectRevert(abi.encodeWithSelector(OracleConfigQuorum.PeerNotRegistered.selector, CHAIN_C));
        quorumA.removePeer(CHAIN_C);
    }

    // ─── Quorum threshold management ─────────────────────────────

    function test_setQuorumThreshold() public {
        quorumA.setQuorumThreshold(1);
        assertEq(quorumA.quorumThreshold(), 1);
    }

    function test_setQuorumThreshold_tooHigh_reverts() public {
        // 1 peer + self = max 2
        vm.expectRevert(abi.encodeWithSelector(OracleConfigQuorum.InvalidQuorumThreshold.selector, 3, 2));
        quorumA.setQuorumThreshold(3);
    }

    function test_setQuorumThreshold_zero_reverts() public {
        vm.expectRevert(abi.encodeWithSelector(OracleConfigQuorum.InvalidQuorumThreshold.selector, 0, 2));
        quorumA.setQuorumThreshold(0);
    }

    // ─── Threshold-1 allows single-chain apply ───────────────────

    function test_threshold1_singlePropose_applies() public {
        quorumA.setQuorumThreshold(1);
        quorumA.proposeConfig("XAU", IOracleAdapter.FeedType.CustomRelayer, 3600, 2000, 8);

        assertTrue(oracleA.isAssetActive(keccak256("XAU")));
    }

    // ─── Preserves local feedAddress ─────────────────────────────

    function test_quorum_preservesLocalFeedAddress() public {
        // Pre-configure asset with a local feed address via forceApply
        oracleA.disableCanonicalMode();
        oracleA.configureAsset("XAU", address(0xFEED), IOracleAdapter.FeedType.Chainlink, 3600, 2000, 8);
        oracleA.setCanonicalMode(address(quorumA));

        // Quorum updates config params (different staleness) — feedAddress should be preserved
        quorumA.proposeConfig("XAU", IOracleAdapter.FeedType.Chainlink, 7200, 2000, 8);
        _deliverProposal(quorumB, quorumA, CHAIN_B, "XAU", IOracleAdapter.FeedType.Chainlink, 7200, 2000, 8);

        IOracleAdapter.AssetConfig memory cfg = oracleA.getAssetConfig(keccak256("XAU"));
        assertEq(cfg.feedAddress, address(0xFEED));
        assertEq(cfg.stalenessThreshold, 7200);
    }

    // ─── Invalid CCIP sender ─────────────────────────────────────

    function test_ccipReceive_invalidPeer_reverts() public {
        Client.EVMTokenAmount[] memory tokens = new Client.EVMTokenAmount[](0);
        Client.Any2EVMMessage memory msg_ = Client.Any2EVMMessage({
            messageId: bytes32(0),
            sourceChainSelector: CHAIN_C, // not a registered peer
            sender: abi.encode(address(0xBAD)),
            data: "",
            destTokenAmounts: tokens
        });

        vm.prank(address(routerA));
        vm.expectRevert(abi.encodeWithSelector(OracleConfigQuorum.InvalidPeer.selector, CHAIN_C, address(0xBAD)));
        quorumA.ccipReceive(msg_);
    }

    // ─── Helpers ─────────────────────────────────────────────────

    /// @dev Simulate a CCIP delivery: encode a proposal as if `source` sent it and deliver to `dest`.
    function _deliverProposal(
        OracleConfigQuorum source,
        OracleConfigQuorum dest,
        uint64 sourceChain,
        string memory symbol,
        IOracleAdapter.FeedType feedType,
        uint256 staleness,
        uint256 deviationBps,
        uint8 decimals
    ) internal {
        bytes32 assetId = keccak256(bytes(symbol));
        IOracleConfigQuorum.AssetConfigProposal memory proposal = IOracleConfigQuorum.AssetConfigProposal({
            assetId: assetId,
            symbol: symbol,
            feedType: feedType,
            stalenessThreshold: staleness,
            deviationBps: deviationBps,
            decimals: decimals
        });

        Client.EVMTokenAmount[] memory tokens = new Client.EVMTokenAmount[](0);
        Client.Any2EVMMessage memory ccipMsg = Client.Any2EVMMessage({
            messageId: keccak256(abi.encode(sourceChain, symbol, block.timestamp)),
            sourceChainSelector: sourceChain,
            sender: abi.encode(address(source)),
            data: abi.encode(proposal),
            destTokenAmounts: tokens
        });

        // Must come from the CCIP router
        address router = address(dest) == address(quorumA) ? address(routerA) : address(routerB);
        vm.prank(router);
        dest.ccipReceive(ccipMsg);
    }
}
