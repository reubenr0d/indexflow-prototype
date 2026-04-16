// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ICrossChainIntentBridge
/// @notice Stateless relay that sends intents cross-chain via CCIP and receives
/// them on the destination, depositing USDC into a basket on behalf of the user.
interface ICrossChainIntentBridge {
    event IntentRoutedCrossChain(
        uint256 indexed intentId, uint64 indexed destChainSelector, bytes32 ccipMessageId, uint256 amount
    );
    event IntentReceivedCrossChain(uint64 indexed sourceChainSelector, address indexed user, uint256 amount);

    /// @notice Route an intent's escrowed USDC cross-chain via CCIP.
    /// @param intentId The intent id on the source IntentRouter.
    /// @param destChainSelector CCIP destination chain selector.
    /// @param amount USDC amount to transfer.
    /// @param user The user address to receive shares on the destination chain.
    /// @param targetBasket The basket on the destination chain (address(0) for any).
    /// @param basketName Vault name for auto-deploy on destination (empty to skip).
    /// @param depositFeeBps Deposit fee for auto-deployed vault.
    /// @param redeemFeeBps Redeem fee for auto-deployed vault.
    function routeCrossChain(
        uint256 intentId,
        uint64 destChainSelector,
        uint256 amount,
        address user,
        address targetBasket,
        string calldata basketName,
        uint256 depositFeeBps,
        uint256 redeemFeeBps
    ) external returns (bytes32 ccipMessageId);

    /// @notice Add a supported destination chain with its USDC token and bridge address.
    function addSupportedChain(uint64 chainSelector, address usdcOnChain, address bridgeOnChain) external;

    /// @notice Remove a supported chain.
    function removeSupportedChain(uint64 chainSelector) external;
}
