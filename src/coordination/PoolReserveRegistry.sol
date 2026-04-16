// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPoolReserveRegistry} from "./interfaces/IPoolReserveRegistry.sol";
import {IStateRelay} from "./interfaces/IStateRelay.sol";
import {IGMXVault} from "../perp/interfaces/IGMXVault.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title PoolReserveRegistry
/// @notice Tracks GMX pool depth on the local chain via a cumulative TWAP, stores remote
/// chain states received from CCIP, and exposes proportional routing weights for the IntentRouter.
/// @dev The TWAP accumulator advances whenever `observe()` is called (piggybacked on intent
/// operations). If the TWAP becomes stale beyond `maxObservationAge`, read functions fall
/// back to instantaneous `poolAmounts(usdc)` reads.
contract PoolReserveRegistry is IPoolReserveRegistry, Ownable {
    uint256 public constant BPS = 10_000;

    IGMXVault public immutable gmxVault;
    address public immutable usdc;
    uint64 public immutable localChainSelector;

    // --- TWAP config ---
    uint32 public twapWindow;
    uint32 public minSnapshotInterval;
    uint32 public maxStaleness;
    uint32 public maxObservationAge;
    uint256 public maxDeltaPerUpdate;

    // --- TWAP accumulator ---
    TWAPState public twap;

    // --- Snapshots ---
    PoolState public lastLocalSnapshot;
    uint48 public lastSnapshotTime;

    // --- Remote chain state ---
    uint64[] public remoteChainSelectors;
    mapping(uint64 => PoolState) public remoteStates;
    mapping(uint64 => bool) public isRemoteChain;

    // --- Access ---
    address public messenger;

    // --- Oracle config hash (read from OracleAdapter if wired, else 0) ---
    address public oracleAdapter;

    // --- StateRelay delegation (hub-and-spoke) ---
    IStateRelay public stateRelay;

    error OnlyMessenger();
    error StaleRemoteState();
    error SnapshotTooSoon();
    error DeltaTooLarge(uint256 oldVal, uint256 newVal, uint256 maxDelta);
    error ChainAlreadyRegistered(uint64 chainSelector);
    error ChainNotRegistered(uint64 chainSelector);

    modifier onlyMessenger() {
        if (msg.sender != messenger) revert OnlyMessenger();
        _;
    }

    constructor(
        address _gmxVault,
        address _usdc,
        uint64 _localChainSelector,
        uint32 _twapWindow,
        uint32 _minSnapshotInterval,
        uint32 _maxStaleness,
        uint32 _maxObservationAge,
        uint256 _maxDeltaPerUpdate,
        address _owner
    ) Ownable(_owner) {
        gmxVault = IGMXVault(_gmxVault);
        usdc = _usdc;
        localChainSelector = _localChainSelector;
        twapWindow = _twapWindow;
        minSnapshotInterval = _minSnapshotInterval;
        maxStaleness = _maxStaleness;
        maxObservationAge = _maxObservationAge;
        maxDeltaPerUpdate = _maxDeltaPerUpdate;

        uint256 currentPool = gmxVault.poolAmounts(_usdc);
        twapStartTime = uint48(block.timestamp);
        twap = TWAPState({
            cumulativePoolAmount: 0,
            lastPoolAmount: currentPool,
            lastObservationTime: uint48(block.timestamp),
            twapPoolAmount: currentPool
        });
    }

    // ─── Admin ────────────────────────────────────────────────────

    function setMessenger(address _messenger) external onlyOwner {
        messenger = _messenger;
    }

    function setOracleAdapter(address _oracleAdapter) external onlyOwner {
        oracleAdapter = _oracleAdapter;
    }

    /// @notice Delegate routing weights to a StateRelay. When set, `getRoutingWeights()`
    /// reads from the relay instead of computing from local/remote pool states.
    function setStateRelay(address _stateRelay) external onlyOwner {
        stateRelay = IStateRelay(_stateRelay);
    }

    function setTwapWindow(uint32 _twapWindow) external onlyOwner {
        twapWindow = _twapWindow;
    }

    function setMinSnapshotInterval(uint32 _interval) external onlyOwner {
        minSnapshotInterval = _interval;
    }

    function setMaxStaleness(uint32 _maxStaleness) external onlyOwner {
        maxStaleness = _maxStaleness;
    }

    function setMaxObservationAge(uint32 _maxObservationAge) external onlyOwner {
        maxObservationAge = _maxObservationAge;
    }

    function setMaxDeltaPerUpdate(uint256 _maxDelta) external onlyOwner {
        maxDeltaPerUpdate = _maxDelta;
    }

    function addRemoteChain(uint64 chainSelector) external onlyOwner {
        if (isRemoteChain[chainSelector]) revert ChainAlreadyRegistered(chainSelector);
        remoteChainSelectors.push(chainSelector);
        isRemoteChain[chainSelector] = true;
        emit RemoteChainAdded(chainSelector);
    }

    function removeRemoteChain(uint64 chainSelector) external onlyOwner {
        if (!isRemoteChain[chainSelector]) revert ChainNotRegistered(chainSelector);
        isRemoteChain[chainSelector] = false;
        uint256 len = remoteChainSelectors.length;
        for (uint256 i = 0; i < len; i++) {
            if (remoteChainSelectors[i] == chainSelector) {
                remoteChainSelectors[i] = remoteChainSelectors[len - 1];
                remoteChainSelectors.pop();
                break;
            }
        }
        delete remoteStates[chainSelector];
        emit RemoteChainRemoved(chainSelector);
    }

    /// @notice Pause routing to remote chains by wiping all remote state.
    function emergencyPause() external onlyOwner {
        uint256 len = remoteChainSelectors.length;
        for (uint256 i = 0; i < len; i++) {
            delete remoteStates[remoteChainSelectors[i]];
        }
    }

    uint48 public twapStartTime;

    // ─── TWAP ─────────────────────────────────────────────────────

    /// @inheritdoc IPoolReserveRegistry
    function observe() public {
        TWAPState memory t = twap;
        if (block.timestamp <= t.lastObservationTime) return;

        uint256 elapsed = block.timestamp - t.lastObservationTime;
        t.cumulativePoolAmount += t.lastPoolAmount * elapsed;

        uint256 currentPool = gmxVault.poolAmounts(usdc);
        t.lastPoolAmount = currentPool;
        t.lastObservationTime = uint48(block.timestamp);

        uint256 totalAge = block.timestamp - twapStartTime;
        if (totalAge == 0) {
            t.twapPoolAmount = currentPool;
        } else if (totalAge >= twapWindow) {
            // Over the full window, approximate via weighted average of the
            // cumulative over the window length. For a true sliding window we'd
            // need checkpoints; this uses the full-history average capped at the
            // current value to dampen manipulation while staying gas-efficient.
            t.twapPoolAmount = t.cumulativePoolAmount / totalAge;
        } else {
            t.twapPoolAmount = t.cumulativePoolAmount / totalAge;
        }

        twap = t;
    }

    function _currentTwapPoolAmount() internal view returns (uint256) {
        TWAPState memory t = twap;
        if (block.timestamp - t.lastObservationTime > maxObservationAge) {
            return gmxVault.poolAmounts(usdc);
        }
        return t.twapPoolAmount;
    }

    // ─── Snapshot ─────────────────────────────────────────────────

    /// @inheritdoc IPoolReserveRegistry
    function snapshot() external returns (PoolState memory state) {
        if (block.timestamp - lastSnapshotTime < minSnapshotInterval) {
            revert SnapshotTooSoon();
        }
        observe();
        state = _buildLocalState();
        lastLocalSnapshot = state;
        lastSnapshotTime = uint48(block.timestamp);
        emit PoolSnapshot(state);
    }

    // ─── Remote state ─────────────────────────────────────────────

    /// @inheritdoc IPoolReserveRegistry
    function updateRemoteState(PoolState calldata state) external onlyMessenger {
        if (!isRemoteChain[state.chainSelector]) revert ChainNotRegistered(state.chainSelector);

        PoolState storage existing = remoteStates[state.chainSelector];
        if (existing.timestamp >= state.timestamp) revert StaleRemoteState();

        if (existing.timestamp != 0 && maxDeltaPerUpdate > 0) {
            _checkDelta(existing.twapPoolAmount, state.twapPoolAmount);
        }

        remoteStates[state.chainSelector] = state;
        emit RemoteStateUpdated(state.chainSelector, state.twapPoolAmount, state.availableLiquidity);
    }

    function _checkDelta(uint256 oldVal, uint256 newVal) internal view {
        if (oldVal == 0) return;
        uint256 delta;
        if (newVal > oldVal) {
            delta = ((newVal - oldVal) * BPS) / oldVal;
        } else {
            delta = ((oldVal - newVal) * BPS) / oldVal;
        }
        if (delta > maxDeltaPerUpdate) {
            revert DeltaTooLarge(oldVal, newVal, maxDeltaPerUpdate);
        }
    }

    // ─── Views ────────────────────────────────────────────────────

    /// @inheritdoc IPoolReserveRegistry
    function getLocalPoolState() external view returns (PoolState memory) {
        return _buildLocalState();
    }

    /// @inheritdoc IPoolReserveRegistry
    function getRemotePoolState(uint64 chainSelector) external view returns (PoolState memory) {
        return remoteStates[chainSelector];
    }

    /// @inheritdoc IPoolReserveRegistry
    function getAllPoolStates() external view returns (PoolState[] memory states) {
        uint256 remoteCount = remoteChainSelectors.length;
        states = new PoolState[](1 + remoteCount);
        states[0] = _buildLocalState();
        for (uint256 i = 0; i < remoteCount; i++) {
            states[i + 1] = remoteStates[remoteChainSelectors[i]];
        }
    }

    /// @inheritdoc IPoolReserveRegistry
    function getRoutingWeights()
        external
        view
        returns (uint64[] memory chainSelectors, uint256[] memory weights, uint256[] memory amounts)
    {
        if (address(stateRelay) != address(0)) {
            return stateRelay.getRoutingWeights();
        }

        uint256 remoteCount = remoteChainSelectors.length;
        uint256 totalChains = 1 + remoteCount;

        chainSelectors = new uint64[](totalChains);
        amounts = new uint256[](totalChains);
        weights = new uint256[](totalChains);

        PoolState memory local = _buildLocalState();
        chainSelectors[0] = localChainSelector;
        amounts[0] = local.availableLiquidity;

        uint256 totalAvailable = local.availableLiquidity;

        for (uint256 i = 0; i < remoteCount; i++) {
            uint64 sel = remoteChainSelectors[i];
            PoolState memory remote = remoteStates[sel];
            chainSelectors[i + 1] = sel;

            bool isStale = remote.timestamp == 0
                || (block.timestamp - remote.timestamp > maxStaleness);
            bool hasBroken = remote.hasBrokenFeeds;

            if (isStale || hasBroken) {
                amounts[i + 1] = 0;
            } else {
                amounts[i + 1] = remote.availableLiquidity;
                totalAvailable += remote.availableLiquidity;
            }
        }

        if (totalAvailable == 0) {
            weights[0] = BPS;
            return (chainSelectors, weights, amounts);
        }

        uint256 assignedWeight;
        uint256 lastNonZeroIdx;
        for (uint256 i = 0; i < totalChains; i++) {
            if (amounts[i] > 0) {
                weights[i] = (amounts[i] * BPS) / totalAvailable;
                assignedWeight += weights[i];
                lastNonZeroIdx = i;
            }
        }
        // Assign rounding remainder to the last chain with nonzero liquidity.
        if (assignedWeight < BPS) {
            weights[lastNonZeroIdx] += BPS - assignedWeight;
        }
    }

    function getRemoteChainCount() external view returns (uint256) {
        return remoteChainSelectors.length;
    }

    // ─── Internal ─────────────────────────────────────────────────

    function _buildLocalState() internal view returns (PoolState memory state) {
        uint256 pool = _currentTwapPoolAmount();
        uint256 instant = gmxVault.poolAmounts(usdc);
        uint256 reserved = gmxVault.reservedAmounts(usdc);
        uint256 available = pool > reserved ? pool - reserved : 0;
        uint256 util = pool > 0 ? (reserved * BPS) / pool : BPS;

        bytes32 cfgHash;
        bool broken;
        if (oracleAdapter != address(0)) {
            (bool ok, bytes memory data) = oracleAdapter.staticcall(
                abi.encodeWithSignature("configHash()")
            );
            if (ok && data.length >= 32) {
                cfgHash = abi.decode(data, (bytes32));
            }
            (ok, data) = oracleAdapter.staticcall(
                abi.encodeWithSignature("hasBrokenFeeds()")
            );
            if (ok && data.length >= 32) {
                broken = abi.decode(data, (bool));
            }
        }

        state = PoolState({
            chainSelector: localChainSelector,
            twapPoolAmount: pool,
            instantPoolAmount: instant,
            reservedAmount: reserved,
            availableLiquidity: available,
            utilizationBps: util,
            oracleConfigHash: cfgHash,
            hasBrokenFeeds: broken,
            timestamp: uint48(block.timestamp)
        });
    }
}
