// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IStateRelay
/// @notice Lightweight relay for keeper-posted routing weights and per-vault global NAV
/// adjustments in a hub-and-spoke cross-chain architecture.
interface IStateRelay {
    event StateUpdated(uint48 indexed timestamp, uint256 chainCount, uint256 vaultCount);
    event KeeperUpdated(address indexed oldKeeper, address indexed newKeeper);
    event MaxStalenessUpdated(uint48 oldValue, uint48 newValue);

    /// @notice Post routing weights and per-vault PnL adjustments.
    /// @param chains CCIP chain selectors in the weight table.
    /// @param weights Basis-point weights (must sum to 10_000).
    /// @param vaults Vault addresses receiving PnL adjustments.
    /// @param pnlAdjustments Signed per-vault NAV adjustment (6 decimals, USDC scale).
    /// @param ts Keeper-sourced epoch timestamp; must be strictly greater than the last.
    function updateState(
        uint64[] calldata chains,
        uint256[] calldata weights,
        address[] calldata vaults,
        int256[] calldata pnlAdjustments,
        uint48 ts
    ) external;

    /// @notice This chain's cached routing weight (set during `updateState`).
    /// @return weight Basis points (0..10_000); 0 means chain is not accepting deposits.
    function getLocalWeight() external view returns (uint256 weight);

    /// @notice Full routing weight table posted by the keeper.
    /// @return chainSelectors Ordered chain selectors.
    /// @return weights Corresponding basis-point weights.
    /// @return amounts Always zeros (compatibility shim for PoolReserveRegistry consumers).
    function getRoutingWeights()
        external
        view
        returns (uint64[] memory chainSelectors, uint256[] memory weights, uint256[] memory amounts);

    /// @notice Per-vault global PnL adjustment used by `BasketVault._pricingNav()`.
    /// @param vault Vault address.
    /// @return pnl Signed adjustment in USDC units (6 decimals).
    /// @return isStale True if the adjustment is older than `maxStaleness`.
    function getGlobalPnLAdjustment(address vault) external view returns (int256 pnl, bool isStale);
}
