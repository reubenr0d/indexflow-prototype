// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IStateRelay} from "./interfaces/IStateRelay.sol";

/// @title StateRelay
/// @notice Stores keeper-posted routing weights and per-vault global NAV adjustments.
/// Deployed on every chain (hub and spokes). The keeper posts the same weight table to all
/// instances each epoch; each instance caches its own chain's weight in `localWeight` for
/// O(1) reads by `BasketVault.deposit()`.
contract StateRelay is IStateRelay, Ownable {
    uint256 public constant BPS = 10_000;

    address public keeper;
    uint48 public lastUpdateTime;
    uint48 public maxStaleness;

    /// @notice CCIP chain selector for this deployment (set at construction).
    uint64 public localChainSelector;

    uint64[] internal _chainSelectors;
    uint256[] internal _weights;
    uint256[] internal _amounts;

    /// @notice Cached weight for this chain, updated on each `updateState` call.
    uint256 public localWeight;

    mapping(address => int256) public globalPnLAdjustment;
    mapping(address => uint48) public pnlUpdateTime;

    error OnlyKeeper();
    error StaleTimestamp();
    error LengthMismatch();
    error WeightSumInvalid(uint256 actual);

    modifier onlyKeeper() {
        if (msg.sender != keeper) revert OnlyKeeper();
        _;
    }

    /// @param _localChainSelector CCIP chain selector for the chain this instance is deployed on.
    /// @param _maxStaleness Seconds after which PnL adjustments are considered stale.
    /// @param _keeper Address authorised to call `updateState`.
    /// @param _owner Ownable admin.
    constructor(uint64 _localChainSelector, uint48 _maxStaleness, address _keeper, address _owner) Ownable(_owner) {
        localChainSelector = _localChainSelector;
        maxStaleness = _maxStaleness;
        keeper = _keeper;
    }

    // ─── Admin ────────────────────────────────────────────────────

    function setKeeper(address _keeper) external onlyOwner {
        emit KeeperUpdated(keeper, _keeper);
        keeper = _keeper;
    }

    function setMaxStaleness(uint48 _maxStaleness) external onlyOwner {
        emit MaxStalenessUpdated(maxStaleness, _maxStaleness);
        maxStaleness = _maxStaleness;
    }

    // ─── Keeper writes ────────────────────────────────────────────

    /// @inheritdoc IStateRelay
    function updateState(
        uint64[] calldata chains,
        uint256[] calldata weights,
        uint256[] calldata amounts,
        address[] calldata vaults,
        int256[] calldata pnlAdjustments,
        uint48 ts
    ) external onlyKeeper {
        if (ts <= lastUpdateTime) revert StaleTimestamp();
        if (chains.length != weights.length) revert LengthMismatch();
        if (chains.length != amounts.length) revert LengthMismatch();
        if (vaults.length != pnlAdjustments.length) revert LengthMismatch();

        _validateWeights(weights);

        _chainSelectors = chains;
        _weights = weights;
        _amounts = amounts;

        // Cache this chain's weight for O(1) deposit guard
        uint256 cached;
        for (uint256 i = 0; i < chains.length; i++) {
            if (chains[i] == localChainSelector) {
                cached = weights[i];
                break;
            }
        }
        localWeight = cached;

        for (uint256 i = 0; i < vaults.length; i++) {
            globalPnLAdjustment[vaults[i]] = pnlAdjustments[i];
            pnlUpdateTime[vaults[i]] = ts;
        }
        lastUpdateTime = ts;

        emit StateUpdated(ts, chains.length, vaults.length);
    }

    // ─── Views ────────────────────────────────────────────────────

    /// @inheritdoc IStateRelay
    function getLocalWeight() external view returns (uint256) {
        return localWeight;
    }

    /// @inheritdoc IStateRelay
    function getRoutingWeights()
        external
        view
        returns (uint64[] memory chainSelectors, uint256[] memory weights, uint256[] memory amounts)
    {
        uint256 len = _chainSelectors.length;
        chainSelectors = new uint64[](len);
        weights = new uint256[](len);
        amounts = new uint256[](len);

        for (uint256 i = 0; i < len; i++) {
            chainSelectors[i] = _chainSelectors[i];
            weights[i] = _weights[i];
            amounts[i] = i < _amounts.length ? _amounts[i] : 0;
        }
    }

    /// @inheritdoc IStateRelay
    function getGlobalPnLAdjustment(address vault) external view returns (int256 pnl, bool isStale) {
        pnl = globalPnLAdjustment[vault];
        uint48 updateTime = pnlUpdateTime[vault];
        isStale = updateTime == 0 || (block.timestamp - updateTime) > maxStaleness;
    }

    // ─── Internal ─────────────────────────────────────────────────

    function _validateWeights(uint256[] calldata weights) internal pure {
        uint256 sum;
        for (uint256 i = 0; i < weights.length; i++) {
            sum += weights[i];
        }
        if (sum != BPS) revert WeightSumInvalid(sum);
    }
}
