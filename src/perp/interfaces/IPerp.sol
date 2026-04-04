// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IPerp
/// @notice Interface for BasketVault to interact with the perp infrastructure.
/// Handles capital allocation, position management, and PnL tracking per vault.
interface IPerp {
    struct VaultState {
        uint256 depositedCapital;
        int256 realisedPnL;
        uint256 openInterest;
        uint256 collateralLocked;
        uint256 positionCount;
        bool registered;
    }

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

    event VaultRegistered(address indexed vault);
    event VaultDeregistered(address indexed vault);
    event CapitalDeposited(address indexed vault, uint256 amount);
    event CapitalWithdrawn(address indexed vault, uint256 amount);
    event PositionOpened(
        address indexed vault,
        bytes32 indexed asset,
        bool isLong,
        uint256 size,
        uint256 collateral
    );
    event PositionClosed(
        address indexed vault,
        bytes32 indexed asset,
        bool isLong,
        int256 realisedPnL
    );
    event PnLRealized(address indexed vault, int256 amount);

    function depositCapital(address vault, uint256 amount) external;
    function withdrawCapital(address vault, uint256 amount) external;

    function openPosition(
        address vault,
        bytes32 asset,
        bool isLong,
        uint256 size,
        uint256 collateral
    ) external;

    function closePosition(
        address vault,
        bytes32 asset,
        bool isLong,
        uint256 sizeDelta,
        uint256 collateralDelta
    ) external;

    function getVaultState(address vault) external view returns (VaultState memory);
    function getVaultPnL(address vault) external view returns (int256 unrealised, int256 realised);
    function isVaultRegistered(address vault) external view returns (bool);
}
