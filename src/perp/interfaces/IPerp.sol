// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IPerp
/// @notice Interface for BasketVault to interact with the perp infrastructure.
/// @dev Handles capital allocation, position management, and PnL tracking per registered vault.
interface IPerp {
    /// @notice Accounting snapshot for a basket vault in the perp module.
    /// @param depositedCapital USDC credited to the vault and not yet withdrawn (book value).
    /// @param realisedPnL Cumulative realised PnL from closed partial/full decreases (signed).
    /// @param openInterest Sum of GMX position sizes attributed to the vault (USD units).
    /// @param collateralLocked USDC collateral currently tied up in open legs.
    /// @param positionCount Number of distinct open legs tracked locally.
    /// @param registered True if the vault may use capital and position functions.
    struct VaultState {
        uint256 depositedCapital;
        int256 realisedPnL;
        uint256 openInterest;
        uint256 collateralLocked;
        uint256 positionCount;
        bool registered;
    }

    /// @notice Off-chain friendly view of an open leg (not stored on-chain in this shape).
    /// @param vault Basket vault that owns the leg.
    /// @param asset Logical asset id.
    /// @param isLong Long vs short.
    /// @param size GMX position size.
    /// @param collateral GMX-reported collateral.
    /// @param averagePrice GMX average entry price.
    /// @param entryFundingRate Cumulative funding rate at entry.
    /// @param lastUpdated Block timestamp of last observation (if populated by reader).
    struct PositionInfo {
        address vault;
        bytes32 asset;
        bool isLong;
        uint256 size;
        uint256 collateral;
        uint256 averagePrice;
        uint256 entryFundingRate;
        uint256 lastUpdated;
    }

    /// @notice Emitted when `registerVault` succeeds.
    event VaultRegistered(address indexed vault);
    /// @notice Emitted when `deregisterVault` succeeds.
    event VaultDeregistered(address indexed vault);
    /// @notice Emitted when USDC is credited to a vault's deposited capital.
    event CapitalDeposited(address indexed vault, uint256 amount);
    /// @notice Emitted when USDC is debited from deposited capital to the vault.
    event CapitalWithdrawn(address indexed vault, uint256 amount);
    /// @notice Emitted after GMX `increasePosition` for a vault leg.
    event PositionOpened(address indexed vault, bytes32 indexed asset, bool isLong, uint256 size, uint256 collateral);
    /// @notice Emitted after GMX `decreasePosition` with signed realised PnL for the change.
    event PositionClosed(address indexed vault, bytes32 indexed asset, bool isLong, int256 realisedPnL);
    /// @notice Emitted when realised PnL is applied (same tx as `PositionClosed` in current impl).
    event PnLRealized(address indexed vault, int256 amount);

    /// @notice Pull USDC from caller into `vault`'s deposited capital bucket.
    /// @param vault Registered basket vault address.
    /// @param amount USDC amount (token decimals).
    function depositCapital(address vault, uint256 amount) external;

    /// @notice Send up to available USDC from `vault`'s bucket back to `vault`.
    /// @param vault Registered basket vault.
    /// @param amount USDC amount requested.
    function withdrawCapital(address vault, uint256 amount) external;

    /// @notice Open or increase a perp leg for `vault` via GMX.
    /// @param vault Registered basket vault; typically `msg.sender`.
    /// @param asset Logical asset id mapped to GMX index token.
    /// @param isLong True for long index token.
    /// @param size GMX size delta (USD units).
    /// @param collateral USDC collateral supplied to GMX.
    function openPosition(address vault, bytes32 asset, bool isLong, uint256 size, uint256 collateral) external;

    /// @notice Decrease or close a perp leg; updates realised PnL on the vault state.
    /// @param vault Registered basket vault.
    /// @param asset Logical asset id.
    /// @param isLong Side of the leg.
    /// @param sizeDelta GMX size reduction.
    /// @param collateralDelta Collateral to remove per GMX rules.
    function closePosition(address vault, bytes32 asset, bool isLong, uint256 sizeDelta, uint256 collateralDelta)
        external;

    /// @notice Return stored `VaultState` for `vault`.
    /// @param vault Basket vault address.
    /// @return state Current accounting struct.
    function getVaultState(address vault) external view returns (VaultState memory state);

    /// @notice Aggregate unrealised (mark-to-market) and realised PnL for `vault`.
    /// @param vault Basket vault address.
    /// @return unrealised Sum of GMX `getPositionDelta` across open legs (excludes funding accrual).
    /// @return realised Cumulative realised PnL on the vault state.
    function getVaultPnL(address vault) external view returns (int256 unrealised, int256 realised);

    /// @notice Whether `vault` is registered and allowed to operate.
    /// @param vault Address to query.
    /// @return True if registered flag is set.
    function isVaultRegistered(address vault) external view returns (bool);
}
