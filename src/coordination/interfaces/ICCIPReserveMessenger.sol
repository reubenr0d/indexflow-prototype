// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ICCIPReserveMessenger
/// @notice Sends and receives PoolState snapshots across chains via Chainlink CCIP.
/// Outbound broadcasts are delta-triggered (only when pool state changes >threshold %).
interface ICCIPReserveMessenger {
    event PoolStateBroadcast(uint64 indexed destChainSelector, bytes32 ccipMessageId);
    event PoolStateReceived(uint64 indexed sourceChainSelector, uint256 twapPoolAmount);
    event LowFeeBalance(uint256 balance, uint256 threshold);
    event PeerAdded(uint64 indexed chainSelector, address messenger);
    event PeerRemoved(uint64 indexed chainSelector);

    /// @notice Snapshot local pool state and broadcast to all peers if the delta threshold
    /// is met or `maxBroadcastInterval` has elapsed since the last broadcast.
    function broadcastPoolState() external;

    /// @notice Broadcast regardless of delta threshold (owner/keeper override).
    function forceBroadcast() external;

    /// @notice LINK (or native) balance available for CCIP fees.
    function getLinkBalance() external view returns (uint256);

    /// @notice Register a remote peer messenger.
    function addPeer(uint64 chainSelector, address messenger) external;

    /// @notice Remove a remote peer.
    function removePeer(uint64 chainSelector) external;
}
