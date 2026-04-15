// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {CCIPReceiver} from "@chainlink/contracts-ccip/contracts/applications/CCIPReceiver.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import {IRouterClient} from "@chainlink/contracts-ccip/contracts/interfaces/IRouterClient.sol";
import {IPoolReserveRegistry} from "./interfaces/IPoolReserveRegistry.sol";
import {ICCIPReserveMessenger} from "./interfaces/ICCIPReserveMessenger.sol";

/// @title CCIPReserveMessenger
/// @notice Sends and receives PoolState snapshots across chains via Chainlink CCIP.
/// Outbound broadcasts are delta-triggered: only fires when the pool state changes
/// by more than `broadcastThresholdBps` or `maxBroadcastInterval` has elapsed.
contract CCIPReserveMessenger is ICCIPReserveMessenger, CCIPReceiver, Ownable {
    uint256 public constant BPS = 10_000;

    IPoolReserveRegistry public immutable registry;

    // --- Broadcast config ---
    uint256 public broadcastThresholdBps;
    uint48 public minBroadcastInterval;
    uint48 public maxBroadcastInterval;
    address public feeToken; // LINK address, or address(0) for native
    uint256 public lowFeeThreshold;

    // --- Broadcast state ---
    uint256 public lastBroadcastedPoolAmount;
    uint48 public lastBroadcastTime;

    // --- Rate limiting (inbound) ---
    uint8 public maxUpdatesPerHour;
    mapping(uint64 => uint256) internal _updateCountThisHour;
    mapping(uint64 => uint48) internal _hourStart;

    // --- Peers ---
    uint64[] public peerChainSelectors;
    mapping(uint64 => address) public peers;
    mapping(uint64 => bool) public isPeer;

    // --- CCIP gas config ---
    uint256 public ccipGasLimit;

    error PoolStateUnchanged();
    error BroadcastTooSoon();
    error UnknownPeer(uint64 chainSelector, address sender);
    error RateLimited(uint64 chainSelector);
    error PeerAlreadyRegistered(uint64 chainSelector);
    error PeerNotRegistered(uint64 chainSelector);

    constructor(
        address _ccipRouter,
        address _registry,
        uint256 _broadcastThresholdBps,
        uint48 _minBroadcastInterval,
        uint48 _maxBroadcastInterval,
        address _feeToken,
        address _owner
    ) CCIPReceiver(_ccipRouter) Ownable(_owner) {
        registry = IPoolReserveRegistry(_registry);
        broadcastThresholdBps = _broadcastThresholdBps;
        minBroadcastInterval = _minBroadcastInterval;
        maxBroadcastInterval = _maxBroadcastInterval;
        feeToken = _feeToken;
        maxUpdatesPerHour = 10;
        ccipGasLimit = 200_000;
    }

    // ─── Broadcast ────────────────────────────────────────────────

    /// @inheritdoc ICCIPReserveMessenger
    function broadcastPoolState() external {
        _requireBroadcastInterval();

        IPoolReserveRegistry.PoolState memory state = registry.snapshot();

        bool deltaExceeded = _isDeltaExceeded(state.twapPoolAmount);
        bool intervalExceeded = (block.timestamp - lastBroadcastTime) >= maxBroadcastInterval;

        if (!deltaExceeded && !intervalExceeded) revert PoolStateUnchanged();

        _broadcast(state);
    }

    /// @inheritdoc ICCIPReserveMessenger
    function forceBroadcast() external onlyOwner {
        IPoolReserveRegistry.PoolState memory state = registry.snapshot();
        _broadcast(state);
    }

    function _broadcast(IPoolReserveRegistry.PoolState memory state) internal {
        bytes memory payload = abi.encode(state);

        for (uint256 i = 0; i < peerChainSelectors.length; i++) {
            uint64 dest = peerChainSelectors[i];
            address peerAddr = peers[dest];

            Client.EVM2AnyMessage memory message = Client.EVM2AnyMessage({
                receiver: abi.encode(peerAddr),
                data: payload,
                tokenAmounts: new Client.EVMTokenAmount[](0),
                feeToken: feeToken,
                extraArgs: Client._argsToBytes(Client.EVMExtraArgsV1({gasLimit: ccipGasLimit}))
            });

            uint256 fee = IRouterClient(getRouter()).getFee(dest, message);

            bytes32 messageId;
            if (feeToken == address(0)) {
                messageId = IRouterClient(getRouter()).ccipSend{value: fee}(dest, message);
            } else {
                IERC20(feeToken).approve(getRouter(), fee);
                messageId = IRouterClient(getRouter()).ccipSend(dest, message);
            }

            emit PoolStateBroadcast(dest, messageId);
        }

        lastBroadcastedPoolAmount = state.twapPoolAmount;
        lastBroadcastTime = uint48(block.timestamp);

        _checkFeeBalance();
    }

    function _isDeltaExceeded(uint256 newPoolAmount) internal view returns (bool) {
        uint256 last = lastBroadcastedPoolAmount;
        if (last == 0) return true;
        uint256 delta;
        if (newPoolAmount > last) {
            delta = ((newPoolAmount - last) * BPS) / last;
        } else {
            delta = ((last - newPoolAmount) * BPS) / last;
        }
        return delta >= broadcastThresholdBps;
    }

    function _requireBroadcastInterval() internal view {
        if (lastBroadcastTime > 0 && block.timestamp - lastBroadcastTime < minBroadcastInterval) {
            revert BroadcastTooSoon();
        }
    }

    function _checkFeeBalance() internal {
        uint256 bal = _feeBalance();
        if (lowFeeThreshold > 0 && bal < lowFeeThreshold) {
            emit LowFeeBalance(bal, lowFeeThreshold);
        }
    }

    function _feeBalance() internal view returns (uint256) {
        if (feeToken == address(0)) {
            return address(this).balance;
        }
        return IERC20(feeToken).balanceOf(address(this));
    }

    // ─── Receive ──────────────────────────────────────────────────

    function _ccipReceive(Client.Any2EVMMessage memory message) internal override {
        uint64 sourceChain = message.sourceChainSelector;
        address sender = abi.decode(message.sender, (address));

        if (!isPeer[sourceChain] || peers[sourceChain] != sender) {
            revert UnknownPeer(sourceChain, sender);
        }

        _enforceRateLimit(sourceChain);

        IPoolReserveRegistry.PoolState memory state = abi.decode(message.data, (IPoolReserveRegistry.PoolState));
        registry.updateRemoteState(state);

        emit PoolStateReceived(sourceChain, state.twapPoolAmount);
    }

    function _enforceRateLimit(uint64 chainSelector) internal {
        uint48 now_ = uint48(block.timestamp);
        uint48 hourStart = _hourStart[chainSelector];

        if (now_ - hourStart >= 3600) {
            _hourStart[chainSelector] = now_;
            _updateCountThisHour[chainSelector] = 1;
        } else {
            _updateCountThisHour[chainSelector]++;
            if (_updateCountThisHour[chainSelector] > maxUpdatesPerHour) {
                revert RateLimited(chainSelector);
            }
        }
    }

    // ─── Views ────────────────────────────────────────────────────

    /// @inheritdoc ICCIPReserveMessenger
    function getLinkBalance() external view returns (uint256) {
        return _feeBalance();
    }

    function getPeerCount() external view returns (uint256) {
        return peerChainSelectors.length;
    }

    // ─── Admin ────────────────────────────────────────────────────

    /// @inheritdoc ICCIPReserveMessenger
    function addPeer(uint64 chainSelector, address _messenger) external onlyOwner {
        if (isPeer[chainSelector]) revert PeerAlreadyRegistered(chainSelector);
        peerChainSelectors.push(chainSelector);
        peers[chainSelector] = _messenger;
        isPeer[chainSelector] = true;
        emit PeerAdded(chainSelector, _messenger);
    }

    /// @inheritdoc ICCIPReserveMessenger
    function removePeer(uint64 chainSelector) external onlyOwner {
        if (!isPeer[chainSelector]) revert PeerNotRegistered(chainSelector);
        isPeer[chainSelector] = false;
        delete peers[chainSelector];
        uint256 len = peerChainSelectors.length;
        for (uint256 i = 0; i < len; i++) {
            if (peerChainSelectors[i] == chainSelector) {
                peerChainSelectors[i] = peerChainSelectors[len - 1];
                peerChainSelectors.pop();
                break;
            }
        }
        emit PeerRemoved(chainSelector);
    }

    function setBroadcastThreshold(uint256 bps) external onlyOwner {
        broadcastThresholdBps = bps;
    }

    function setMinBroadcastInterval(uint48 seconds_) external onlyOwner {
        minBroadcastInterval = seconds_;
    }

    function setMaxBroadcastInterval(uint48 seconds_) external onlyOwner {
        maxBroadcastInterval = seconds_;
    }

    function setLowFeeThreshold(uint256 amount) external onlyOwner {
        lowFeeThreshold = amount;
    }

    function setFeeToken(address token) external onlyOwner {
        feeToken = token;
    }

    function setMaxUpdatesPerHour(uint8 max) external onlyOwner {
        maxUpdatesPerHour = max;
    }

    function setCcipGasLimit(uint256 gasLimit) external onlyOwner {
        ccipGasLimit = gasLimit;
    }

    receive() external payable {}
}
