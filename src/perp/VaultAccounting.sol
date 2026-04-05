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
/// @dev Tracks capital allocation, PnL attribution, and position management per registered basket vault.
/// All GMX positions are opened in this contract's name; `assetTokens` must map each logical `bytes32` asset id
/// to the GMX index token address. USDC precision (6) for token amounts; GMX position size/delta in USD (~1e30).
/// Unrealised PnL from `getVaultPnL` uses GMX `getPositionDelta` and excludes funding accrual.
contract VaultAccounting is IPerp, ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;
    uint256 private constant FUNDING_RATE_PRECISION = 1_000_000;

    /// @notice Collateral ERC20 (USDC) pulled from callers and forwarded to the GMX vault.
    IERC20 public immutable usdc;
    /// @notice Forked GMX core vault used for `increasePosition` / `decreasePosition`.
    IGMXVault public gmxVault;
    /// @notice Oracle adapter (not used for GMX execution prices; kept for future use / consistency).
    IOracleAdapter public oracleAdapter;

    mapping(address => VaultState) internal _vaultStates;
    /// @notice Append-only list of vault addresses that were ever registered (includes deregistered).
    address[] public registeredVaults;

    /// @dev Maps position key keccak256(vault, asset, isLong) -> bookkeeping mirror of GMX state.
    mapping(bytes32 => PositionTracking) internal _positions;

    /// @dev Per-vault list of open position keys; `_openKeyIndex` is 1-based for swap-remove.
    mapping(address => bytes32[]) internal _openPositionKeys;
    mapping(bytes32 => uint256) internal _openKeyIndex;

    /// @notice Local mirror of one GMX leg for a basket vault.
    /// @dev `collateralUsdc` tracks USDC this module sent for this leg; GMX `collateral` may differ in encoding.
    struct PositionTracking {
        /// @notice Basket vault that owns this leg.
        address vault;
        /// @notice Logical asset id (same namespace as OracleAdapter).
        bytes32 asset;
        /// @notice True if long index token against USDC collateral.
        bool isLong;
        /// @notice Position size from GMX after the last sync (USD units).
        uint256 size;
        /// @notice Collateral as reported by GMX.
        uint256 collateral;
        /// @notice USDC amount allocated from this contract into the position (tracking).
        uint256 collateralUsdc;
        /// @notice Average entry price from GMX.
        uint256 averagePrice;
        /// @notice Entry cumulative funding rate snapshot from GMX.
        uint256 entryFundingRate;
        /// @notice Whether this key currently has an open position.
        bool exists;
    }

    /// @notice Maps oracle `assetId` to GMX pool index token address.
    mapping(bytes32 => address) public assetTokens;

    /// @notice ERC20 passed to GMX as `_collateralToken` (typically same as `usdc`).
    address public collateralToken;

    /// @notice Sum of `depositedCapital` across all vaults (aggregate bookkeeping).
    uint256 public totalDeposited;

    /// @notice Per-vault cap on sum of open interest; 0 means unset (no cap).
    mapping(address => uint256) public maxOpenInterest;
    /// @notice Per-vault cap on a single `openPosition` size; 0 means unset (no cap).
    mapping(address => uint256) public maxPositionSize;
    /// @notice When true, capital and position functions revert.
    bool public paused;

    /// @notice Emitted when an asset id is bound to a GMX index token.
    event AssetTokenMapped(bytes32 indexed assetId, address indexed token);
    /// @notice Emitted when `maxOpenInterest[vault]` is set.
    event MaxOpenInterestSet(address vault, uint256 cap);
    /// @notice Emitted when `maxPositionSize[vault]` is set.
    event MaxPositionSizeSet(address vault, uint256 cap);
    /// @notice Emitted when pause flag changes.
    event PauseToggled(bool paused);

    /// @notice `vault` is not registered.
    error VaultNotRegistered(address vault);
    /// @notice `registerVault` called for an already registered vault.
    error VaultAlreadyRegistered(address vault);
    /// @notice `withdrawCapital` requested more than post-PnL, post-lock available balance.
    error InsufficientCapital(address vault, uint256 requested, uint256 available);
    /// @notice `assetTokens[assetId]` is zero when opening a position.
    error AssetTokenNotMapped(bytes32 assetId);
    /// @notice No open position for the derived key.
    error PositionNotFound(bytes32 key);

    modifier onlyRegisteredVault(address vault) {
        if (!_vaultStates[vault].registered) revert VaultNotRegistered(vault);
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "Paused");
        _;
    }

    /// @notice Deploy accounting module wired to USDC, GMX vault, and oracle adapter.
    /// @param _usdc USDC (or test collateral) ERC20 address.
    /// @param _gmxVault GMX core `Vault` contract.
    /// @param _oracleAdapter Oracle adapter (informational hook).
    /// @param _owner Ownable admin.
    constructor(address _usdc, address _gmxVault, address _oracleAdapter, address _owner) Ownable(_owner) {
        usdc = IERC20(_usdc);
        gmxVault = IGMXVault(_gmxVault);
        oracleAdapter = IOracleAdapter(_oracleAdapter);
        collateralToken = _usdc;
    }

    // ─── Vault Registration ──────────────────────────────────────

    /// @notice Register a basket vault so it may deposit capital and trade via this module.
    /// @param vault BasketVault address.
    /// @dev Reverts `VaultAlreadyRegistered` if already registered.
    function registerVault(address vault) external onlyOwner {
        if (_vaultStates[vault].registered) revert VaultAlreadyRegistered(vault);

        _vaultStates[vault] = VaultState({
            depositedCapital: 0,
            realisedPnL: 0,
            openInterest: 0,
            collateralLocked: 0,
            positionCount: 0,
            registered: true
        });

        registeredVaults.push(vault);
        emit VaultRegistered(vault);
    }

    /// @notice Mark a vault as no longer registered (does not remove from `registeredVaults` array).
    /// @param vault Basket vault address.
    /// @dev Requires zero open interest. Emits `VaultDeregistered`.
    function deregisterVault(address vault) external onlyOwner onlyRegisteredVault(vault) {
        require(_vaultStates[vault].openInterest == 0, "Close positions first");

        _vaultStates[vault].registered = false;
        emit VaultDeregistered(vault);
    }

    // ─── Asset Mapping ───────────────────────────────────────────

    /// @notice Map a logical asset id to the GMX index token address for that market.
    /// @param assetId Oracle / basket asset identifier.
    /// @param token GMX index token (ERC20) address.
    function mapAssetToken(bytes32 assetId, address token) external onlyOwner {
        require(token != address(0), "Invalid token");
        assetTokens[assetId] = token;
        emit AssetTokenMapped(assetId, token);
    }

    // ─── Risk Limits ─────────────────────────────────────────────

    /// @notice Set maximum total open interest (sum of sizes) allowed for `vault`. Zero clears the cap.
    /// @param vault Basket vault address.
    /// @param cap Maximum open interest in GMX USD units, or 0 for no limit.
    function setMaxOpenInterest(address vault, uint256 cap) external onlyOwner {
        maxOpenInterest[vault] = cap;
        emit MaxOpenInterestSet(vault, cap);
    }

    /// @notice Set maximum size for a single `openPosition` call for `vault`. Zero clears the cap.
    /// @param vault Basket vault address.
    /// @param cap Maximum position size in GMX USD units, or 0 for no limit.
    function setMaxPositionSize(address vault, uint256 cap) external onlyOwner {
        maxPositionSize[vault] = cap;
        emit MaxPositionSizeSet(vault, cap);
    }

    /// @notice Pause or unpause capital and position operations.
    /// @param _paused When true, `depositCapital`, `withdrawCapital`, `openPosition`, and `closePosition` revert.
    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit PauseToggled(_paused);
    }

    // ─── Capital Management ──────────────────────────────────────

    /// @notice Pull USDC from `msg.sender` and credit `vault` deposited capital.
    /// @param vault Registered basket vault whose accounting bucket receives the deposit.
    /// @param amount USDC amount (token decimals).
    /// @dev Caller must have approved this contract. Typically the basket vault calls after pulling from users.
    function depositCapital(address vault, uint256 amount)
        external
        override
        nonReentrant
        onlyRegisteredVault(vault)
        whenNotPaused
    {
        require(amount > 0, "Amount required");

        usdc.safeTransferFrom(msg.sender, address(this), amount);

        _vaultStates[vault].depositedCapital += amount;
        totalDeposited += amount;

        emit CapitalDeposited(vault, amount);
    }

    /// @notice Send USDC back to `vault` up to available capital (deposits + realised PnL - locked collateral).
    /// @param vault Registered basket vault.
    /// @param amount USDC amount to withdraw.
    /// @dev Reverts `InsufficientCapital` if `amount` exceeds `_availableCapital`.
    function withdrawCapital(address vault, uint256 amount)
        external
        override
        nonReentrant
        onlyRegisteredVault(vault)
        whenNotPaused
    {
        VaultState storage vs = _vaultStates[vault];
        uint256 available = _availableCapital(vault);
        if (amount > available) {
            revert InsufficientCapital(vault, amount, available);
        }

        uint256 principalToWithdraw = amount > vs.depositedCapital ? vs.depositedCapital : amount;
        if (principalToWithdraw > 0) {
            vs.depositedCapital -= principalToWithdraw;
            totalDeposited -= principalToWithdraw;
        }
        uint256 pnlToWithdraw = amount - principalToWithdraw;
        if (pnlToWithdraw > 0) {
            vs.realisedPnL -= int256(pnlToWithdraw);
        }

        usdc.safeTransfer(vault, amount);

        emit CapitalWithdrawn(vault, amount);
    }

    // ─── Position Management ─────────────────────────────────────

    /// @notice Open or add to a GMX perp leg on behalf of `vault` using this contract as the trader.
    /// @param vault Registered basket vault (must be `msg.sender` or owner).
    /// @param asset Logical asset id; must be mapped in `assetTokens`.
    /// @param isLong True for long index token.
    /// @param size Position size in GMX USD units.
    /// @param collateral USDC collateral to send to GMX for this increase.
    /// @dev Enforces optional `maxOpenInterest` / `maxPositionSize`. Reverts `AssetTokenNotMapped` if unmapped.
    function openPosition(address vault, bytes32 asset, bool isLong, uint256 size, uint256 collateral)
        external
        override
        nonReentrant
        onlyRegisteredVault(vault)
        whenNotPaused
    {
        _checkCaller(vault);

        address indexToken = assetTokens[asset];
        if (indexToken == address(0)) revert AssetTokenNotMapped(asset);

        VaultState storage vs = _vaultStates[vault];
        uint256 available = _availableCapital(vault);
        require(collateral <= available, "Insufficient capital for collateral");

        if (maxOpenInterest[vault] > 0) {
            require(vs.openInterest + size <= maxOpenInterest[vault], "Exceeds max open interest");
        }
        if (maxPositionSize[vault] > 0) {
            require(size <= maxPositionSize[vault], "Exceeds max position size");
        }

        // Transfer collateral to GMX vault
        usdc.safeIncreaseAllowance(address(gmxVault), collateral);
        IERC20(collateralToken).safeTransfer(address(gmxVault), collateral);

        gmxVault.increasePosition(address(this), collateralToken, indexToken, size, isLong);

        bytes32 posKey = _positionKey(vault, asset, isLong);

        bool wasOpen = _positions[posKey].exists;

        (uint256 posSize, uint256 posCollateral, uint256 avgPrice, uint256 entryFunding,,,,) =
            gmxVault.getPosition(address(this), collateralToken, indexToken, isLong);

        _positions[posKey] = PositionTracking({
            vault: vault,
            asset: asset,
            isLong: isLong,
            size: posSize,
            collateral: posCollateral,
            collateralUsdc: collateral,
            averagePrice: avgPrice,
            entryFundingRate: entryFunding,
            exists: true
        });

        if (!wasOpen) {
            _pushOpenPositionKey(vault, posKey);
        }

        vs.openInterest += size;
        vs.collateralLocked += collateral;
        vs.positionCount++;

        emit PositionOpened(vault, asset, isLong, size, collateral);
    }

    /// @notice Reduce or close a GMX leg; realised PnL is attributed to `vault`.
    /// @param vault Registered basket vault (must be `msg.sender` or owner).
    /// @param asset Logical asset id for the leg.
    /// @param isLong Side of the leg to decrease.
    /// @param sizeDelta GMX size reduction (USD units).
    /// @param collateralDelta Collateral to withdraw per GMX semantics.
    /// @dev Reverts `PositionNotFound` if no tracked position. Updates `realisedPnL` from returned USDC vs collateral at risk.
    function closePosition(address vault, bytes32 asset, bool isLong, uint256 sizeDelta, uint256 collateralDelta)
        external
        override
        nonReentrant
        onlyRegisteredVault(vault)
        whenNotPaused
    {
        _checkCaller(vault);

        bytes32 posKey = _positionKey(vault, asset, isLong);
        PositionTracking storage pos = _positions[posKey];
        if (!pos.exists) revert PositionNotFound(posKey);

        address indexToken = assetTokens[asset];

        uint256 balBefore = usdc.balanceOf(address(this));

        gmxVault.decreasePosition(
            address(this), collateralToken, indexToken, collateralDelta, sizeDelta, isLong, address(this)
        );

        uint256 balAfter = usdc.balanceOf(address(this));
        uint256 returned = balAfter - balBefore;

        VaultState storage vs = _vaultStates[vault];
        vs.openInterest -= sizeDelta;

        // Update or remove position tracking
        (uint256 remaining,,,,,,,) = gmxVault.getPosition(address(this), collateralToken, indexToken, isLong);

        // PnL = returned USDC - proportional collateral that was at risk
        uint256 collateralAtRisk;
        if (remaining == 0) {
            collateralAtRisk = pos.collateralUsdc;
            pos.exists = false;
            _removeOpenPositionKey(vault, posKey);
            vs.positionCount--;
            vs.collateralLocked -= pos.collateralUsdc;
        } else {
            collateralAtRisk = (pos.collateralUsdc * sizeDelta) / pos.size;
            pos.size = remaining;
            pos.collateralUsdc -= collateralAtRisk;
            pos.collateral -= collateralDelta;
            vs.collateralLocked -= collateralAtRisk;
        }

        int256 pnl = int256(returned) - int256(collateralAtRisk);
        vs.realisedPnL += pnl;

        emit PositionClosed(vault, asset, isLong, pnl);
        emit PnLRealized(vault, pnl);
    }

    // ─── Views ───────────────────────────────────────────────────

    /// @notice Return stored accounting state for `vault`.
    /// @param vault Basket vault address.
    /// @return state Deposited capital, realised PnL, open interest, locked collateral, position count, registered flag.
    function getVaultState(address vault) external view override returns (VaultState memory) {
        return _vaultStates[vault];
    }

    /// @notice Aggregate mark-to-market unrealised PnL for all open legs of `vault` (GMX USD precision, ~1e30).
    /// @param vault Basket vault address.
    /// @return unrealised Sum of signed `getPositionDelta` across open legs.
    /// @return realised Cumulative realised PnL stored on the vault state.
    /// @dev Unrealised includes price delta and accrued funding estimate from cumulative funding rates.
    /// Skips legs with unmapped `assetTokens`.
    function getVaultPnL(address vault) external view override returns (int256 unrealised, int256 realised) {
        realised = _vaultStates[vault].realisedPnL;

        bytes32[] storage keys = _openPositionKeys[vault];
        uint256 len = keys.length;
        for (uint256 i = 0; i < len; i++) {
            PositionTracking memory p = _positions[keys[i]];
            if (!p.exists) continue;

            address indexToken = assetTokens[p.asset];
            if (indexToken == address(0)) continue;

            (bool hasProfit, uint256 delta) =
                gmxVault.getPositionDelta(address(this), collateralToken, indexToken, p.isLong);

            if (hasProfit) {
                unrealised += int256(delta);
            } else {
                unrealised -= int256(delta);
            }

            uint256 cumulativeFundingRate = _safeCumulativeFundingRate(collateralToken);
            if (cumulativeFundingRate > p.entryFundingRate && p.size > 0) {
                uint256 fundingRateDelta = cumulativeFundingRate - p.entryFundingRate;
                uint256 fundingFee = (p.size * fundingRateDelta) / FUNDING_RATE_PRECISION;
                unrealised -= int256(fundingFee);
            }
        }
    }

    /// @notice Whether `vault` is currently registered.
    /// @param vault Address to query.
    /// @return True if `registered` flag is set in internal state.
    function isVaultRegistered(address vault) external view override returns (bool) {
        return _vaultStates[vault].registered;
    }

    /// @notice Length of `registeredVaults` (historical registrations included).
    /// @return Number of addresses pushed via `registerVault`.
    function getRegisteredVaultCount() external view returns (uint256) {
        return registeredVaults.length;
    }

    /// @notice Public accessor for the internal position key derivation.
    /// @param vault Basket vault address.
    /// @param asset Logical asset id.
    /// @param isLong Long vs short.
    /// @return keccak256(abi.encodePacked(vault, asset, isLong)).
    function getPositionKey(address vault, bytes32 asset, bool isLong) external pure returns (bytes32) {
        return _positionKey(vault, asset, isLong);
    }

    /// @notice Snapshot of local position tracking for `posKey`.
    /// @param posKey Output of `getPositionKey`.
    /// @return Local `PositionTracking` struct (empty if never opened).
    function getPositionTracking(bytes32 posKey) external view returns (PositionTracking memory) {
        return _positions[posKey];
    }

    // ─── Internal ────────────────────────────────────────────────

    /// @dev Free USDC for withdrawal: deposited + realised PnL - collateral locked in open legs (floored at 0).
    function _availableCapital(address vault) internal view returns (uint256) {
        VaultState memory vs = _vaultStates[vault];
        int256 total = int256(vs.depositedCapital) + vs.realisedPnL - int256(vs.collateralLocked);
        return total > 0 ? uint256(total) : 0;
    }

    /// @dev Deterministic key for `(vault, asset, isLong)` position book.
    function _positionKey(address vault, bytes32 asset, bool isLong) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(vault, asset, isLong));
    }

    /// @dev Append `posKey` to vault's open list and set 1-based index for O(1) removal.
    function _pushOpenPositionKey(address vault, bytes32 posKey) internal {
        _openPositionKeys[vault].push(posKey);
        _openKeyIndex[posKey] = _openPositionKeys[vault].length;
    }

    /// @dev Swap-remove `posKey` from vault's open list.
    function _removeOpenPositionKey(address vault, bytes32 posKey) internal {
        uint256 idx = _openKeyIndex[posKey];
        if (idx == 0) return;

        bytes32[] storage keys = _openPositionKeys[vault];
        uint256 last = keys.length;
        if (idx != last) {
            bytes32 moved = keys[last - 1];
            keys[idx - 1] = moved;
            _openKeyIndex[moved] = idx;
        }
        keys.pop();
        _openKeyIndex[posKey] = 0;
    }

    /// @dev Position-changing calls must come from the basket vault or the owner.
    function _checkCaller(address vault) internal view {
        require(msg.sender == vault || msg.sender == owner(), "Not authorized");
    }

    /// @dev Best-effort cumulative funding read; returns zero if GMX implementation does not expose the view.
    function _safeCumulativeFundingRate(address token) internal view returns (uint256 rate) {
        (bool ok, bytes memory data) =
            address(gmxVault).staticcall(abi.encodeWithSelector(gmxVault.cumulativeFundingRates.selector, token));
        if (ok && data.length >= 32) {
            rate = abi.decode(data, (uint256));
        }
    }
}
