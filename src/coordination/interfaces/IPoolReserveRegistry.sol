// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IPoolReserveRegistry
/// @notice Tracks GMX pool depth on the local chain via TWAP, stores remote chain states
/// received from CCIP, and exposes proportional routing weights for the IntentRouter.
interface IPoolReserveRegistry {
    /// @notice Snapshot of a chain's GMX pool state, broadcast via CCIP.
    /// @param chainSelector CCIP chain selector identifying the source chain.
    /// @param twapPoolAmount TWAP-smoothed pool depth (anti-manipulation).
    /// @param instantPoolAmount Live `poolAmounts(usdc)` at snapshot time.
    /// @param reservedAmount USDC locked for open perp positions.
    /// @param availableLiquidity `twapPoolAmount - reservedAmount`, floored at 0.
    /// @param utilizationBps `reservedAmount * 10_000 / poolAmount`, or 10_000 if pool is 0.
    /// @param oracleConfigHash Incremental XOR hash of OracleAdapter config (excl. feedAddress).
    /// @param hasBrokenFeeds True if any active oracle asset has `feedAddress == address(0)`.
    /// @param timestamp Block timestamp when the snapshot was taken.
    struct PoolState {
        uint64 chainSelector;
        uint256 twapPoolAmount;
        uint256 instantPoolAmount;
        uint256 reservedAmount;
        uint256 availableLiquidity;
        uint256 utilizationBps;
        bytes32 oracleConfigHash;
        bool hasBrokenFeeds;
        uint48 timestamp;
    }

    /// @notice Internal TWAP accumulator state.
    /// @param cumulativePoolAmount Running sum of (poolAmount * elapsed seconds).
    /// @param lastPoolAmount Last observed `poolAmounts(usdc)`.
    /// @param lastObservationTime Timestamp of the most recent `observe()` call.
    /// @param twapPoolAmount Computed TWAP over the configured window.
    struct TWAPState {
        uint256 cumulativePoolAmount;
        uint256 lastPoolAmount;
        uint48 lastObservationTime;
        uint256 twapPoolAmount;
    }

    event PoolSnapshot(PoolState state);
    event RemoteStateUpdated(uint64 indexed chainSelector, uint256 twapPoolAmount, uint256 availableLiquidity);
    event TWAPStale(uint48 lastObservationTime);
    event RemoteChainAdded(uint64 indexed chainSelector);
    event RemoteChainRemoved(uint64 indexed chainSelector);

    /// @notice Advance the TWAP accumulator by reading the current `poolAmounts(usdc)`.
    /// No-op if called within the same block as a previous observation.
    function observe() external;

    /// @notice Store a local snapshot and return it. Calls `observe()` internally.
    /// @return state The freshly computed local pool state.
    function snapshot() external returns (PoolState memory state);

    /// @notice Write a remote chain's pool state (messenger-only).
    /// Rejects messages with a timestamp older than the currently stored state.
    /// @param state The remote pool state received via CCIP.
    function updateRemoteState(PoolState calldata state) external;

    /// @notice Live local pool state using current TWAP (or instantaneous fallback).
    function getLocalPoolState() external view returns (PoolState memory);

    /// @notice Stored remote pool state for a given chain selector.
    function getRemotePoolState(uint64 chainSelector) external view returns (PoolState memory);

    /// @notice Local (live) + all stored remote pool states.
    function getAllPoolStates() external view returns (PoolState[] memory);

    /// @notice Proportional routing weights based on available liquidity across all chains.
    /// @return chainSelectors Ordered chain selectors (local first).
    /// @return weights Basis-point weights summing to 10_000.
    /// @return amounts Available liquidity per chain (for informational use).
    function getRoutingWeights()
        external
        view
        returns (uint64[] memory chainSelectors, uint256[] memory weights, uint256[] memory amounts);
}
