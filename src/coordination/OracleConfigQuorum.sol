// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {CCIPReceiver} from "@chainlink/contracts-ccip/contracts/applications/CCIPReceiver.sol";
import {IRouterClient} from "@chainlink/contracts-ccip/contracts/interfaces/IRouterClient.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import {IOracleConfigQuorum} from "./interfaces/IOracleConfigQuorum.sol";
import {IOracleAdapter} from "../perp/interfaces/IOracleAdapter.sol";

interface IOracleAdapterForQuorum {
    function configureAsset(
        string calldata symbol,
        address feedAddress,
        IOracleAdapter.FeedType feedType,
        uint256 stalenessThreshold,
        uint256 deviationBps,
        uint8 decimals_
    ) external;

    function getAssetConfig(bytes32 assetId) external view returns (IOracleAdapter.AssetConfig memory);
    function isAssetActive(bytes32 assetId) external view returns (bool);
}

/// @title OracleConfigQuorum
/// @notice Symmetric cross-chain oracle config consensus via Chainlink CCIP.
/// Deployed identically on every chain — no single canonical chain required.
///
/// @dev Flow:
///  1. Admin calls `proposeConfig` on any chain.
///  2. The proposal is stored locally and broadcast to all registered peers via CCIP.
///  3. Each peer stores the proposal as a vote keyed by (assetId, sourceChain).
///  4. When `quorumThreshold` non-expired votes with matching config hashes exist,
///     the config is auto-applied to the local OracleAdapter (preserving feedAddress).
///  5. Owner may call `forceApplyConfig` to bypass quorum (bootstrap / emergency).
contract OracleConfigQuorum is IOracleConfigQuorum, CCIPReceiver, Ownable {
    // ─── State ───────────────────────────────────────────────────

    IOracleAdapterForQuorum public immutable oracleAdapter;
    uint64 public immutable localChainSelector;

    uint8 public override quorumThreshold;
    uint32 public override proposalTtl;

    address public feeToken;
    uint256 public ccipGasLimit;

    /// @notice Registered peer quorum contracts. peerSelectors[i] → peers[selector].
    uint64[] public peerSelectors;
    mapping(uint64 => address) public peers;
    mapping(uint64 => bool) public isPeer;

    /// @notice Votes indexed by (assetId, sourceChainSelector).
    mapping(bytes32 => mapping(uint64 => Vote)) internal _votes;

    /// @notice Full proposal payloads cached for replay when quorum is reached.
    mapping(bytes32 => mapping(uint64 => bytes)) internal _proposalData;

    // ─── Errors ──────────────────────────────────────────────────

    error InvalidPeer(uint64 chainSelector, address sender);
    error PeerAlreadyRegistered(uint64 chainSelector);
    error PeerNotRegistered(uint64 chainSelector);
    error InvalidQuorumThreshold(uint8 threshold, uint8 maxAllowed);

    // ─── Constructor ─────────────────────────────────────────────

    constructor(
        address _ccipRouter,
        address _oracleAdapter,
        uint64 _localChainSelector,
        uint8 _quorumThreshold,
        uint32 _proposalTtl,
        address _feeToken,
        address _owner
    ) CCIPReceiver(_ccipRouter) Ownable(_owner) {
        oracleAdapter = IOracleAdapterForQuorum(_oracleAdapter);
        localChainSelector = _localChainSelector;
        quorumThreshold = _quorumThreshold;
        proposalTtl = _proposalTtl;
        feeToken = _feeToken;
        ccipGasLimit = 300_000;
    }

    // ─── Propose / broadcast ─────────────────────────────────────

    /// @inheritdoc IOracleConfigQuorum
    function proposeConfig(
        string calldata symbol,
        IOracleAdapter.FeedType feedType,
        uint256 stalenessThreshold,
        uint256 deviationBps,
        uint8 decimals
    ) external onlyOwner {
        bytes32 assetId = keccak256(bytes(symbol));

        AssetConfigProposal memory proposal = AssetConfigProposal({
            assetId: assetId,
            symbol: symbol,
            feedType: feedType,
            stalenessThreshold: stalenessThreshold,
            deviationBps: deviationBps,
            decimals: decimals
        });

        bytes32 cfgHash = _configHash(proposal);
        bytes memory encoded = abi.encode(proposal);

        _votes[assetId][localChainSelector] = Vote({
            configHash: cfgHash,
            timestamp: uint48(block.timestamp)
        });
        _proposalData[assetId][localChainSelector] = encoded;

        emit ConfigProposed(assetId, cfgHash, localChainSelector);

        _broadcastToAllPeers(encoded, assetId);
        _checkAndApplyQuorum(assetId, cfgHash);
    }

    /// @inheritdoc IOracleConfigQuorum
    function forceApplyConfig(
        string calldata symbol,
        IOracleAdapter.FeedType feedType,
        uint256 stalenessThreshold,
        uint256 deviationBps,
        uint8 decimals
    ) external onlyOwner {
        bytes32 assetId = keccak256(bytes(symbol));
        _applyConfig(AssetConfigProposal({
            assetId: assetId,
            symbol: symbol,
            feedType: feedType,
            stalenessThreshold: stalenessThreshold,
            deviationBps: deviationBps,
            decimals: decimals
        }));
        emit ForceApplied(assetId, symbol);
    }

    // ─── CCIP receive ────────────────────────────────────────────

    function _ccipReceive(Client.Any2EVMMessage memory message) internal override {
        uint64 sourceChain = message.sourceChainSelector;
        address sender = abi.decode(message.sender, (address));

        if (!isPeer[sourceChain] || peers[sourceChain] != sender) {
            revert InvalidPeer(sourceChain, sender);
        }

        AssetConfigProposal memory proposal = abi.decode(message.data, (AssetConfigProposal));
        bytes32 cfgHash = _configHash(proposal);

        _votes[proposal.assetId][sourceChain] = Vote({
            configHash: cfgHash,
            timestamp: uint48(block.timestamp)
        });
        _proposalData[proposal.assetId][sourceChain] = message.data;

        emit ConfigProposed(proposal.assetId, cfgHash, sourceChain);

        _checkAndApplyQuorum(proposal.assetId, cfgHash);
    }

    // ─── Quorum logic ────────────────────────────────────────────

    function _checkAndApplyQuorum(bytes32 assetId, bytes32 targetHash) internal {
        uint8 count = _countMatchingVotes(assetId, targetHash);

        if (count >= quorumThreshold) {
            AssetConfigProposal memory proposal = _findProposalWithHash(assetId, targetHash);
            _applyConfig(proposal);
            emit QuorumReached(assetId, targetHash, count);
        }
    }

    function _countMatchingVotes(bytes32 assetId, bytes32 targetHash) internal view returns (uint8 count) {
        uint256 cutoff = block.timestamp > proposalTtl ? block.timestamp - proposalTtl : 0;

        // Check local vote
        Vote memory local = _votes[assetId][localChainSelector];
        if (local.configHash == targetHash && local.timestamp > cutoff) {
            count++;
        }

        // Check peer votes
        uint256 len = peerSelectors.length;
        for (uint256 i = 0; i < len; i++) {
            uint64 sel = peerSelectors[i];
            if (!isPeer[sel]) continue;
            Vote memory v = _votes[assetId][sel];
            if (v.configHash == targetHash && v.timestamp > cutoff) {
                count++;
            }
        }
    }

    function _findProposalWithHash(bytes32 assetId, bytes32 targetHash) internal view returns (AssetConfigProposal memory) {
        // Try local first
        bytes memory data = _proposalData[assetId][localChainSelector];
        if (data.length > 0) {
            AssetConfigProposal memory p = abi.decode(data, (AssetConfigProposal));
            if (_configHash(p) == targetHash) return p;
        }

        // Then peers
        uint256 len = peerSelectors.length;
        for (uint256 i = 0; i < len; i++) {
            data = _proposalData[assetId][peerSelectors[i]];
            if (data.length > 0) {
                AssetConfigProposal memory p = abi.decode(data, (AssetConfigProposal));
                if (_configHash(p) == targetHash) return p;
            }
        }

        revert("Proposal data not found");
    }

    function _applyConfig(AssetConfigProposal memory proposal) internal {
        address localFeed;
        if (oracleAdapter.isAssetActive(proposal.assetId)) {
            IOracleAdapter.AssetConfig memory existing = oracleAdapter.getAssetConfig(proposal.assetId);
            localFeed = existing.feedAddress;
        }

        oracleAdapter.configureAsset(
            proposal.symbol,
            localFeed,
            proposal.feedType,
            proposal.stalenessThreshold,
            proposal.deviationBps,
            proposal.decimals
        );

        emit ConfigApplied(proposal.assetId, proposal.symbol);
    }

    // ─── Broadcast ───────────────────────────────────────────────

    function _broadcastToAllPeers(bytes memory payload, bytes32 assetId) internal {
        uint256 len = peerSelectors.length;
        for (uint256 i = 0; i < len; i++) {
            uint64 dest = peerSelectors[i];
            if (!isPeer[dest]) continue;

            Client.EVM2AnyMessage memory message = Client.EVM2AnyMessage({
                receiver: abi.encode(peers[dest]),
                data: payload,
                tokenAmounts: new Client.EVMTokenAmount[](0),
                feeToken: feeToken,
                extraArgs: Client._argsToBytes(Client.EVMExtraArgsV1({gasLimit: ccipGasLimit}))
            });

            uint256 fee = IRouterClient(getRouter()).getFee(dest, message);

            bytes32 messageId;
            if (feeToken == address(0)) {
                messageId = IRouterClient(getRouter()).ccipSend{value: fee}(dest, message);
            } else {
                IERC20(feeToken).approve(getRouter(), fee);
                messageId = IRouterClient(getRouter()).ccipSend(dest, message);
            }

            emit ConfigBroadcast(assetId, dest, messageId);
        }
    }

    // ─── Peer management ─────────────────────────────────────────

    /// @inheritdoc IOracleConfigQuorum
    function addPeer(uint64 chainSelector, address quorumAddress) external onlyOwner {
        if (isPeer[chainSelector]) revert PeerAlreadyRegistered(chainSelector);
        peers[chainSelector] = quorumAddress;
        isPeer[chainSelector] = true;
        peerSelectors.push(chainSelector);
        emit PeerAdded(chainSelector, quorumAddress);
    }

    /// @inheritdoc IOracleConfigQuorum
    function removePeer(uint64 chainSelector) external onlyOwner {
        if (!isPeer[chainSelector]) revert PeerNotRegistered(chainSelector);
        isPeer[chainSelector] = false;
        delete peers[chainSelector];

        uint256 len = peerSelectors.length;
        for (uint256 i = 0; i < len; i++) {
            if (peerSelectors[i] == chainSelector) {
                peerSelectors[i] = peerSelectors[len - 1];
                peerSelectors.pop();
                break;
            }
        }
        emit PeerRemoved(chainSelector);
    }

    // ─── Admin ───────────────────────────────────────────────────

    function setQuorumThreshold(uint8 _threshold) external onlyOwner {
        uint8 maxAllowed = uint8(peerSelectors.length) + 1; // peers + self
        if (_threshold == 0 || _threshold > maxAllowed) {
            revert InvalidQuorumThreshold(_threshold, maxAllowed);
        }
        quorumThreshold = _threshold;
    }

    function setProposalTtl(uint32 _ttl) external onlyOwner {
        proposalTtl = _ttl;
    }

    function setFeeToken(address _feeToken) external onlyOwner {
        feeToken = _feeToken;
    }

    function setCcipGasLimit(uint256 _gasLimit) external onlyOwner {
        ccipGasLimit = _gasLimit;
    }

    // ─── Views ───────────────────────────────────────────────────

    /// @inheritdoc IOracleConfigQuorum
    function getVote(bytes32 assetId, uint64 chainSelector) external view override returns (Vote memory) {
        return _votes[assetId][chainSelector];
    }

    /// @inheritdoc IOracleConfigQuorum
    function getVoteCount(bytes32 assetId, bytes32 configHash) external view override returns (uint8) {
        return _countMatchingVotes(assetId, configHash);
    }

    function getPeerCount() external view returns (uint256) {
        return peerSelectors.length;
    }

    // ─── Internal ────────────────────────────────────────────────

    /// @dev Matches OracleAdapter._assetHash: excludes feedAddress so chains with
    /// different Chainlink aggregator addresses produce the same hash.
    function _configHash(AssetConfigProposal memory p) internal pure returns (bytes32) {
        return keccak256(abi.encode(p.assetId, p.feedType, p.stalenessThreshold, p.deviationBps, p.decimals));
    }

    receive() external payable {}
}
