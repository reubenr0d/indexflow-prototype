// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IOracleAdapter} from "../../perp/interfaces/IOracleAdapter.sol";

/// @title IOracleConfigBroadcaster
/// @notice Broadcasts canonical OracleAdapter configs to remote chains via CCIP.
interface IOracleConfigBroadcaster {
    struct CanonicalAssetConfig {
        bytes32 assetId;
        string symbol;
        IOracleAdapter.FeedType feedType;
        uint256 stalenessThreshold;
        uint256 deviationBps;
        uint8 decimals;
    }

    event ConfigBroadcast(bytes32 indexed assetId, uint64 indexed destChainSelector, bytes32 ccipMessageId);
    event RemoteChainRegistered(uint64 indexed chainSelector, address receiver);
    event RemoteChainRemoved(uint64 indexed chainSelector);

    function broadcastConfig(bytes32 assetId) external;
    function broadcastAllConfigs() external;
    function addRemoteChain(uint64 chainSelector, address receiverAddress) external;
    function removeRemoteChain(uint64 chainSelector) external;
}
