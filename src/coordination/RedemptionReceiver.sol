// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {CCIPReceiver} from "@chainlink/contracts-ccip/contracts/applications/CCIPReceiver.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";

interface IBasketVaultForRedemption {
    function processPendingRedemption(uint256 id) external;
}

/// @title RedemptionReceiver
/// @notice Minimal CCIP receiver deployed on spoke chains. Accepts keeper-initiated USDC
/// transfers for redemption shortfall fills. On receive, forwards USDC to the target
/// BasketVault and optionally auto-calls `processPendingRedemption`.
contract RedemptionReceiver is CCIPReceiver, Ownable {
    using SafeERC20 for IERC20;

    struct RedemptionFillPayload {
        address targetVault;
        uint256 redemptionId;
    }

    IERC20 public immutable usdc;

    mapping(uint64 => address) public trustedSenders;

    event RedemptionFillReceived(
        bytes32 indexed messageId, uint64 indexed sourceChainSelector, address targetVault, uint256 redemptionId
    );
    event TrustedSenderSet(uint64 indexed chainSelector, address sender);

    error UntrustedSender(uint64 chainSelector, address sender);
    error NoUsdcReceived();

    constructor(address _router, address _usdc, address _owner) CCIPReceiver(_router) Ownable(_owner) {
        usdc = IERC20(_usdc);
    }

    /// @notice Register a trusted sender for a source chain (typically the hub's RedemptionReceiver
    /// or a keeper relay contract).
    function setTrustedSender(uint64 chainSelector, address sender) external onlyOwner {
        trustedSenders[chainSelector] = sender;
        emit TrustedSenderSet(chainSelector, sender);
    }

    function _ccipReceive(Client.Any2EVMMessage memory message) internal override {
        uint64 sourceChain = message.sourceChainSelector;
        address sender = abi.decode(message.sender, (address));

        if (trustedSenders[sourceChain] != sender) {
            revert UntrustedSender(sourceChain, sender);
        }

        uint256 usdcAmount;
        for (uint256 i = 0; i < message.destTokenAmounts.length; i++) {
            if (message.destTokenAmounts[i].token == address(usdc)) {
                usdcAmount += message.destTokenAmounts[i].amount;
            }
        }
        if (usdcAmount == 0) revert NoUsdcReceived();

        RedemptionFillPayload memory payload = abi.decode(message.data, (RedemptionFillPayload));

        usdc.safeTransfer(payload.targetVault, usdcAmount);

        IBasketVaultForRedemption(payload.targetVault).processPendingRedemption(payload.redemptionId);

        emit RedemptionFillReceived(message.messageId, sourceChain, payload.targetVault, payload.redemptionId);
    }
}
