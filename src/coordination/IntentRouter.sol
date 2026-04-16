// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {IIntentRouter} from "./interfaces/IIntentRouter.sol";
import {IPoolReserveRegistry} from "./interfaces/IPoolReserveRegistry.sol";
import {ICrossChainIntentBridge} from "./interfaces/ICrossChainIntentBridge.sol";

interface IBasketVault {
    function deposit(uint256 usdcAmount) external returns (uint256 sharesMinted);
    function redeem(uint256 sharesToBurn) external returns (uint256 usdcReturned);
}

interface IBasketShareToken {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IBasketFactory {
    function getAllBaskets() external view returns (address[] memory);
}

interface IBasketVaultShareToken {
    function shareToken() external view returns (address);
}

/// @title IntentRouter
/// @notice UUPS-upgradeable contract handling deposit/redeem intents with escrow,
/// proportional routing via PoolReserveRegistry weights, and keeper execution.
/// Holds user USDC in escrow — upgrade path is critical for fund safety.
contract IntentRouter is IIntentRouter, OwnableUpgradeable, UUPSUpgradeable, ReentrancyGuardUpgradeable {
    using SafeERC20 for IERC20;

    IERC20 public usdc;
    IPoolReserveRegistry public registry;
    IBasketFactory public basketFactory;
    uint64 public localChainSelector;

    uint48 public maxEscrowDuration;
    uint256 public minIntentAmount;
    uint256 public minSplitAmount;
    uint256 public intentFee;
    address public treasury;
    uint8 public maxActiveIntentsPerUser;

    mapping(address => bool) public approvedKeepers;
    address public bridge;

    uint256 public nextIntentId;
    mapping(uint256 => Intent) public intents;
    mapping(address => uint256) public activeIntentCount;

    error NotKeeper();
    error IntentNotPending(uint256 id);
    error IntentNotExpired(uint256 id);
    error DeadlineExceeded();
    error AmountTooSmall(uint256 amount, uint256 min);
    error TooManyActiveIntents(address user);
    error InvalidBasket(address basket);
    error BasketMismatch(address expected, address provided);
    error NotLocalChain(uint64 target, uint64 local);
    error NotRemoteChain(uint64 target);
    error BridgeNotSet();

    modifier onlyKeeper() {
        if (!approvedKeepers[msg.sender]) revert NotKeeper();
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _usdc,
        address _registry,
        address _basketFactory,
        uint64 _localChainSelector,
        uint48 _maxEscrowDuration,
        uint256 _minIntentAmount,
        uint256 _minSplitAmount,
        address _treasury,
        address _owner
    ) external initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        _transferOwnership(_owner);

        usdc = IERC20(_usdc);
        registry = IPoolReserveRegistry(_registry);
        basketFactory = IBasketFactory(_basketFactory);
        localChainSelector = _localChainSelector;
        maxEscrowDuration = _maxEscrowDuration;
        minIntentAmount = _minIntentAmount;
        minSplitAmount = _minSplitAmount;
        treasury = _treasury;
        maxActiveIntentsPerUser = 10;
        nextIntentId = 1;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    // ─── Submit ───────────────────────────────────────────────────

    /// @inheritdoc IIntentRouter
    function submitIntent(
        uint256 amount,
        uint64 targetChain,
        address targetBasket,
        uint48 deadline
    ) external nonReentrant returns (uint256 intentId) {
        if (amount < minIntentAmount) revert AmountTooSmall(amount, minIntentAmount);
        if (deadline > 0 && block.timestamp > deadline) revert DeadlineExceeded();
        if (activeIntentCount[msg.sender] >= maxActiveIntentsPerUser) {
            revert TooManyActiveIntents(msg.sender);
        }

        registry.observe();

        uint256 fee = intentFee;
        uint256 netAmount = amount;
        if (fee > 0 && treasury != address(0)) {
            usdc.safeTransferFrom(msg.sender, treasury, fee);
            netAmount = amount - fee;
        }

        usdc.safeTransferFrom(msg.sender, address(this), netAmount);

        intentId = nextIntentId++;
        intents[intentId] = Intent({
            id: intentId,
            user: msg.sender,
            amount: netAmount,
            intentType: IntentType.DEPOSIT,
            targetChain: targetChain,
            targetBasket: targetBasket,
            deadline: deadline,
            createdAt: uint48(block.timestamp),
            status: IntentStatus.PENDING,
            ccipMessageId: bytes32(0)
        });

        activeIntentCount[msg.sender]++;
        emit IntentSubmitted(intentId, msg.sender, netAmount, IntentType.DEPOSIT);
    }

    /// @inheritdoc IIntentRouter
    function submitAndExecute(
        address basketVault,
        uint256 amount
    ) external nonReentrant returns (uint256 sharesReceived) {
        if (amount < minIntentAmount) revert AmountTooSmall(amount, minIntentAmount);
        _validateBasket(basketVault);

        registry.observe();

        uint256 fee = intentFee;
        uint256 netAmount = amount;
        if (fee > 0 && treasury != address(0)) {
            usdc.safeTransferFrom(msg.sender, treasury, fee);
            netAmount = amount - fee;
        }

        usdc.safeTransferFrom(msg.sender, address(this), netAmount);
        usdc.approve(basketVault, netAmount);

        sharesReceived = IBasketVault(basketVault).deposit(netAmount);

        address shareToken = IBasketVaultShareToken(basketVault).shareToken();
        IERC20(shareToken).safeTransfer(msg.sender, sharesReceived);

        uint256 intentId = nextIntentId++;
        intents[intentId] = Intent({
            id: intentId,
            user: msg.sender,
            amount: netAmount,
            intentType: IntentType.DEPOSIT,
            targetChain: localChainSelector,
            targetBasket: basketVault,
            deadline: 0,
            createdAt: uint48(block.timestamp),
            status: IntentStatus.EXECUTED,
            ccipMessageId: bytes32(0)
        });

        emit IntentSubmitted(intentId, msg.sender, netAmount, IntentType.DEPOSIT);
        emit IntentExecuted(intentId, basketVault, sharesReceived);
    }

    // ─── Execute (keeper) ─────────────────────────────────────────

    /// @inheritdoc IIntentRouter
    function executeIntent(
        uint256 intentId,
        address basketVault
    ) external nonReentrant onlyKeeper returns (uint256 sharesOrUsdc) {
        Intent storage intent = intents[intentId];
        if (intent.status != IntentStatus.PENDING) revert IntentNotPending(intentId);
        if (intent.deadline > 0 && block.timestamp > intent.deadline) revert DeadlineExceeded();

        _validateBasket(basketVault);
        if (intent.targetBasket != address(0) && intent.targetBasket != basketVault) {
            revert BasketMismatch(intent.targetBasket, basketVault);
        }

        uint64 target = intent.targetChain;
        if (target != 0 && target != localChainSelector) {
            revert NotLocalChain(target, localChainSelector);
        }

        registry.observe();

        usdc.approve(basketVault, intent.amount);
        sharesOrUsdc = IBasketVault(basketVault).deposit(intent.amount);

        address shareToken = IBasketVaultShareToken(basketVault).shareToken();
        IERC20(shareToken).safeTransfer(intent.user, sharesOrUsdc);

        intent.status = IntentStatus.EXECUTED;
        activeIntentCount[intent.user]--;

        emit IntentExecuted(intentId, basketVault, sharesOrUsdc);
    }

    // ─── Execute cross-chain (keeper) ─────────────────────────────

    /// @inheritdoc IIntentRouter
    function executeIntentCrossChain(
        uint256 intentId,
        address targetBasket,
        string calldata basketName,
        uint256 depositFeeBps,
        uint256 redeemFeeBps
    ) external nonReentrant onlyKeeper returns (bytes32 ccipMessageId) {
        Intent storage intent = intents[intentId];
        if (intent.status != IntentStatus.PENDING) revert IntentNotPending(intentId);
        if (intent.deadline > 0 && block.timestamp > intent.deadline) revert DeadlineExceeded();

        uint64 target = intent.targetChain;
        if (target == 0 || target == localChainSelector) revert NotRemoteChain(target);
        if (bridge == address(0)) revert BridgeNotSet();

        if (intent.targetBasket != address(0) && intent.targetBasket != targetBasket) {
            revert BasketMismatch(intent.targetBasket, targetBasket);
        }

        registry.observe();

        usdc.approve(bridge, intent.amount);
        ccipMessageId = ICrossChainIntentBridge(bridge).routeCrossChain(
            intentId, target, intent.amount, intent.user, targetBasket,
            basketName, depositFeeBps, redeemFeeBps
        );

        intent.status = IntentStatus.IN_FLIGHT;
        intent.ccipMessageId = ccipMessageId;
        activeIntentCount[intent.user]--;

        emit IntentRoutedCrossChain(intentId, target, intent.amount);
    }

    // ─── Refund ───────────────────────────────────────────────────

    /// @inheritdoc IIntentRouter
    function refundIntent(uint256 intentId) external nonReentrant {
        Intent storage intent = intents[intentId];
        if (intent.status != IntentStatus.PENDING) revert IntentNotPending(intentId);
        if (block.timestamp < intent.createdAt + maxEscrowDuration) {
            revert IntentNotExpired(intentId);
        }

        intent.status = IntentStatus.REFUNDED;
        activeIntentCount[intent.user]--;
        usdc.safeTransfer(intent.user, intent.amount);

        emit IntentRefunded(intentId, intent.user, intent.amount);
    }

    // ─── Admin ────────────────────────────────────────────────────

    function addApprovedKeeper(address keeper) external onlyOwner {
        approvedKeepers[keeper] = true;
    }

    function removeApprovedKeeper(address keeper) external onlyOwner {
        approvedKeepers[keeper] = false;
    }

    function setBridge(address _bridge) external onlyOwner {
        bridge = _bridge;
    }

    function setMaxEscrowDuration(uint48 _duration) external onlyOwner {
        maxEscrowDuration = _duration;
    }

    function setMinIntentAmount(uint256 _min) external onlyOwner {
        minIntentAmount = _min;
    }

    function setMinSplitAmount(uint256 _min) external onlyOwner {
        minSplitAmount = _min;
    }

    function setIntentFee(uint256 _fee) external onlyOwner {
        intentFee = _fee;
    }

    function setTreasury(address _treasury) external onlyOwner {
        treasury = _treasury;
    }

    function setMaxActiveIntentsPerUser(uint8 _max) external onlyOwner {
        maxActiveIntentsPerUser = _max;
    }

    // ─── Views ────────────────────────────────────────────────────

    function getIntent(uint256 intentId) external view returns (Intent memory) {
        return intents[intentId];
    }

    // ─── Internal ─────────────────────────────────────────────────

    function _validateBasket(address basketVault) internal view {
        address[] memory baskets = basketFactory.getAllBaskets();
        bool found;
        for (uint256 i = 0; i < baskets.length; i++) {
            if (baskets[i] == basketVault) {
                found = true;
                break;
            }
        }
        if (!found) revert InvalidBasket(basketVault);
    }
}
