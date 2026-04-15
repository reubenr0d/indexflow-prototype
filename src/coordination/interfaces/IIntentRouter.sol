// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IIntentRouter
/// @notice Handles deposit/redeem intents with escrow, proportional routing, and keeper execution.
interface IIntentRouter {
    enum IntentType { DEPOSIT, REDEEM }
    enum IntentStatus { PENDING, IN_FLIGHT, EXECUTED, REFUNDED, EXPIRED }

    struct Intent {
        uint256 id;
        address user;
        uint256 amount;
        IntentType intentType;
        uint64 targetChain;
        address targetBasket;
        uint48 deadline;
        uint48 createdAt;
        IntentStatus status;
        bytes32 ccipMessageId;
    }

    event IntentSubmitted(uint256 indexed id, address indexed user, uint256 amount, IntentType intentType);
    event IntentExecuted(uint256 indexed id, address indexed basketVault, uint256 sharesOrUsdc);
    event IntentRefunded(uint256 indexed id, address indexed user, uint256 amount);
    event IntentSplit(uint256 indexed id, uint64[] chainSelectors, uint256[] amounts, uint256[] weights);

    /// @notice Submit a deposit intent, pulling USDC into escrow.
    function submitIntent(
        uint256 amount,
        uint64 targetChain,
        address targetBasket,
        uint48 deadline
    ) external returns (uint256 intentId);

    /// @notice Submit and immediately execute a same-chain deposit (no escrow window).
    function submitAndExecute(address basketVault, uint256 amount) external returns (uint256 sharesReceived);

    /// @notice Execute a pending intent by depositing into a basket (keeper-only).
    function executeIntent(uint256 intentId, address basketVault) external returns (uint256 sharesOrUsdc);

    /// @notice Refund a timed-out pending intent (anyone can call after maxEscrowDuration).
    function refundIntent(uint256 intentId) external;
}
