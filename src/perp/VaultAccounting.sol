// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPerp} from "./interfaces/IPerp.sol";
import {IGMXVault} from "./interfaces/IGMXVault.sol";
import {IOracleAdapter} from "./interfaces/IOracleAdapter.sol";

/// @title VaultAccounting
/// @notice Bridge between BasketVault and the GMX-derived perp pool.
/// Tracks capital allocation, PnL attribution, and position management per vault.
contract VaultAccounting is IPerp, ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    IGMXVault public gmxVault;
    IOracleAdapter public oracleAdapter;

    mapping(address => VaultState) internal _vaultStates;
    address[] public registeredVaults;

    /// @dev Maps (vault, asset, isLong) -> position tracking data
    mapping(bytes32 => PositionTracking) internal _positions;

    struct PositionTracking {
        address vault;
        bytes32 asset;
        bool isLong;
        uint256 size;
        uint256 collateral;
        uint256 averagePrice;
        uint256 entryFundingRate;
        bool exists;
    }

    /// @dev Maps asset bytes32 ID to the ERC20 token address used in GMX Vault
    mapping(bytes32 => address) public assetTokens;

    /// @dev Collateral token for the GMX vault (USDC address used as collateral)
    address public collateralToken;

    uint256 public totalDeposited;

    event AssetTokenMapped(bytes32 indexed assetId, address indexed token);

    error VaultNotRegistered(address vault);
    error VaultAlreadyRegistered(address vault);
    error InsufficientCapital(address vault, uint256 requested, uint256 available);
    error AssetTokenNotMapped(bytes32 assetId);
    error PositionNotFound(bytes32 key);

    modifier onlyRegisteredVault(address vault) {
        if (!_vaultStates[vault].registered) revert VaultNotRegistered(vault);
        _;
    }

    constructor(
        address _usdc,
        address _gmxVault,
        address _oracleAdapter,
        address _owner
    ) Ownable(_owner) {
        usdc = IERC20(_usdc);
        gmxVault = IGMXVault(_gmxVault);
        oracleAdapter = IOracleAdapter(_oracleAdapter);
        collateralToken = _usdc;
    }

    // ─── Vault Registration ──────────────────────────────────────

    function registerVault(address vault) external onlyOwner {
        if (_vaultStates[vault].registered) revert VaultAlreadyRegistered(vault);

        _vaultStates[vault] = VaultState({
            depositedCapital: 0,
            realisedPnL: 0,
            openInterest: 0,
            positionCount: 0,
            registered: true
        });

        registeredVaults.push(vault);
        emit VaultRegistered(vault);
    }

    function deregisterVault(address vault) external onlyOwner onlyRegisteredVault(vault) {
        require(
            _vaultStates[vault].openInterest == 0,
            "Close positions first"
        );

        _vaultStates[vault].registered = false;
        emit VaultDeregistered(vault);
    }

    // ─── Asset Mapping ───────────────────────────────────────────

    /// @notice Map a bytes32 asset ID to its ERC20 token address in the GMX vault.
    function mapAssetToken(bytes32 assetId, address token) external onlyOwner {
        require(token != address(0), "Invalid token");
        assetTokens[assetId] = token;
        emit AssetTokenMapped(assetId, token);
    }

    // ─── Capital Management ──────────────────────────────────────

    function depositCapital(
        address vault,
        uint256 amount
    ) external override nonReentrant onlyRegisteredVault(vault) {
        require(amount > 0, "Amount required");

        usdc.safeTransferFrom(msg.sender, address(this), amount);

        _vaultStates[vault].depositedCapital += amount;
        totalDeposited += amount;

        emit CapitalDeposited(vault, amount);
    }

    function withdrawCapital(
        address vault,
        uint256 amount
    ) external override nonReentrant onlyRegisteredVault(vault) {
        VaultState storage vs = _vaultStates[vault];
        uint256 available = _availableCapital(vault);
        if (amount > available) {
            revert InsufficientCapital(vault, amount, available);
        }

        vs.depositedCapital -= amount;
        totalDeposited -= amount;

        usdc.safeTransfer(vault, amount);

        emit CapitalWithdrawn(vault, amount);
    }

    // ─── Position Management ─────────────────────────────────────

    function openPosition(
        address vault,
        bytes32 asset,
        bool isLong,
        uint256 size,
        uint256 collateral
    ) external override nonReentrant onlyRegisteredVault(vault) {
        _checkCaller(vault);

        address indexToken = assetTokens[asset];
        if (indexToken == address(0)) revert AssetTokenNotMapped(asset);

        VaultState storage vs = _vaultStates[vault];
        uint256 available = _availableCapital(vault);
        require(collateral <= available, "Insufficient capital for collateral");

        // Transfer collateral to GMX vault
        usdc.safeIncreaseAllowance(address(gmxVault), collateral);
        IERC20(collateralToken).safeTransfer(address(gmxVault), collateral);

        gmxVault.increasePosition(
            address(this),
            collateralToken,
            indexToken,
            size,
            isLong
        );

        bytes32 posKey = _positionKey(vault, asset, isLong);

        (uint256 posSize, uint256 posCollateral, uint256 avgPrice, uint256 entryFunding,,,,) =
            gmxVault.getPosition(address(this), collateralToken, indexToken, isLong);

        _positions[posKey] = PositionTracking({
            vault: vault,
            asset: asset,
            isLong: isLong,
            size: posSize,
            collateral: posCollateral,
            averagePrice: avgPrice,
            entryFundingRate: entryFunding,
            exists: true
        });

        vs.openInterest += size;
        vs.positionCount++;

        emit PositionOpened(vault, asset, isLong, size, collateral);
    }

    function closePosition(
        address vault,
        bytes32 asset,
        bool isLong,
        uint256 sizeDelta,
        uint256 collateralDelta
    ) external override nonReentrant onlyRegisteredVault(vault) {
        _checkCaller(vault);

        bytes32 posKey = _positionKey(vault, asset, isLong);
        PositionTracking storage pos = _positions[posKey];
        if (!pos.exists) revert PositionNotFound(posKey);

        address indexToken = assetTokens[asset];

        uint256 balBefore = usdc.balanceOf(address(this));

        gmxVault.decreasePosition(
            address(this),
            collateralToken,
            indexToken,
            collateralDelta,
            sizeDelta,
            isLong,
            address(this)
        );

        uint256 balAfter = usdc.balanceOf(address(this));
        int256 pnl = int256(balAfter) - int256(balBefore) - int256(collateralDelta);

        VaultState storage vs = _vaultStates[vault];
        vs.realisedPnL += pnl;
        vs.openInterest -= sizeDelta;

        // Update or remove position tracking
        (uint256 remaining,,,,,,,) =
            gmxVault.getPosition(address(this), collateralToken, indexToken, isLong);

        if (remaining == 0) {
            pos.exists = false;
            vs.positionCount--;
        } else {
            pos.size = remaining;
            pos.collateral -= collateralDelta;
        }

        emit PositionClosed(vault, asset, isLong, pnl);
        emit PnLRealized(vault, pnl);
    }

    // ─── Views ───────────────────────────────────────────────────

    function getVaultState(address vault) external view override returns (VaultState memory) {
        return _vaultStates[vault];
    }

    function getVaultPnL(address vault) external view override returns (int256 unrealised, int256 realised) {
        realised = _vaultStates[vault].realisedPnL;
        // Unrealised PnL would require iterating positions and reading GMX vault
        // For now return 0; PerpReader provides detailed views
        unrealised = 0;
    }

    function isVaultRegistered(address vault) external view override returns (bool) {
        return _vaultStates[vault].registered;
    }

    function getRegisteredVaultCount() external view returns (uint256) {
        return registeredVaults.length;
    }

    function getPositionKey(address vault, bytes32 asset, bool isLong) external pure returns (bytes32) {
        return _positionKey(vault, asset, isLong);
    }

    function getPositionTracking(bytes32 posKey) external view returns (PositionTracking memory) {
        return _positions[posKey];
    }

    // ─── Internal ────────────────────────────────────────────────

    function _availableCapital(address vault) internal view returns (uint256) {
        VaultState memory vs = _vaultStates[vault];
        int256 total = int256(vs.depositedCapital) + vs.realisedPnL - int256(vs.openInterest);
        return total > 0 ? uint256(total) : 0;
    }

    function _positionKey(address vault, bytes32 asset, bool isLong) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(vault, asset, isLong));
    }

    function _checkCaller(address vault) internal view {
        require(
            msg.sender == vault || msg.sender == owner(),
            "Not authorized"
        );
    }
}
