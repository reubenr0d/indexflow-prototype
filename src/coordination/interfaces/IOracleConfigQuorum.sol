// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IOracleAdapter} from "../../perp/interfaces/IOracleAdapter.sol";

/// @title IOracleConfigQuorum
/// @notice Symmetric cross-chain oracle config consensus. Deployed on every chain;
/// config changes require N-of-M matching proposals before being applied.
interface IOracleConfigQuorum {
    /// @notice Payload broadcast via CCIP between peers. Identical to the legacy
    /// CanonicalAssetConfig but owned by the quorum interface now.
    struct AssetConfigProposal {
        bytes32 assetId;
        string symbol;
        IOracleAdapter.FeedType feedType;
        uint256 stalenessThreshold;
        uint256 deviationBps;
        uint8 decimals;
    }

    /// @notice Vote stored per (assetId, sourceChain).
    struct Vote {
        bytes32 configHash;
        uint48 timestamp;
    }

    // ─── Events ──────────────────────────────────────────────────

    event ConfigProposed(bytes32 indexed assetId, bytes32 configHash, uint64 indexed sourceChain);
    event ConfigBroadcast(bytes32 indexed assetId, uint64 indexed destChainSelector, bytes32 ccipMessageId);
    event QuorumReached(bytes32 indexed assetId, bytes32 configHash, uint8 voteCount);
    event ConfigApplied(bytes32 indexed assetId, string symbol);
    event ForceApplied(bytes32 indexed assetId, string symbol);
    event PeerAdded(uint64 indexed chainSelector, address quorumContract);
    event PeerRemoved(uint64 indexed chainSelector);

    // ─── Propose / broadcast ─────────────────────────────────────

    /// @notice Propose an oracle config change and broadcast to all peers via CCIP.
    /// The local chain's vote is recorded immediately. If quorum is reached the
    /// config is auto-applied to the local OracleAdapter (preserving feedAddress).
    function proposeConfig(
        string calldata symbol,
        IOracleAdapter.FeedType feedType,
        uint256 stalenessThreshold,
        uint256 deviationBps,
        uint8 decimals
    ) external;

    /// @notice Owner-only emergency / bootstrap: apply config locally without quorum.
    function forceApplyConfig(
        string calldata symbol,
        IOracleAdapter.FeedType feedType,
        uint256 stalenessThreshold,
        uint256 deviationBps,
        uint8 decimals
    ) external;

    // ─── Peer management ─────────────────────────────────────────

    function addPeer(uint64 chainSelector, address quorumAddress) external;
    function removePeer(uint64 chainSelector) external;

    // ─── Views ───────────────────────────────────────────────────

    function getVote(bytes32 assetId, uint64 chainSelector) external view returns (Vote memory);
    function getVoteCount(bytes32 assetId, bytes32 configHash) external view returns (uint8);
    function quorumThreshold() external view returns (uint8);
    function proposalTtl() external view returns (uint32);
}
