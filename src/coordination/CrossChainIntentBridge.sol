// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {CCIPReceiver} from "@chainlink/contracts-ccip/contracts/applications/CCIPReceiver.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import {IRouterClient} from "@chainlink/contracts-ccip/contracts/interfaces/IRouterClient.sol";
import {ICrossChainIntentBridge} from "./interfaces/ICrossChainIntentBridge.sol";

interface IBasketVaultForBridge {
    function deposit(uint256 usdcAmount) external returns (uint256 sharesMinted);
    function shareToken() external view returns (address);
}

interface IBasketFactoryForBridge {
    function getAllBaskets() external view returns (address[] memory);
}

/// @title CrossChainIntentBridge
/// @notice Stateless relay that sends USDC + intent metadata cross-chain via CCIP.
/// On the destination, it deposits USDC into the target basket and transfers shares
/// to the user's address (same address across chains via Privy smart wallet).
contract CrossChainIntentBridge is ICrossChainIntentBridge, CCIPReceiver, Ownable {
    using SafeERC20 for IERC20;

    struct CrossChainPayload {
        uint256 intentId;
        address user;
        address targetBasket;
    }

    struct SupportedChain {
        address usdcOnChain;
        address bridgeOnChain;
        bool active;
    }

    IERC20 public immutable usdc;
    address public immutable intentRouter;
    IBasketFactoryForBridge public basketFactory;
    address public feeToken;
    uint256 public ccipGasLimit;

    mapping(uint64 => SupportedChain) public supportedChains;
    uint64[] public supportedChainSelectors;

    error UnsupportedChain(uint64 chainSelector);
    error OnlyIntentRouter();
    error UnknownSource(uint64 chainSelector, address sender);
    error NoBasketAvailable();

    modifier onlyIntentRouter() {
        if (msg.sender != intentRouter) revert OnlyIntentRouter();
        _;
    }

    constructor(
        address _ccipRouter,
        address _intentRouter,
        address _usdc,
        address _basketFactory,
        address _owner
    ) CCIPReceiver(_ccipRouter) Ownable(_owner) {
        intentRouter = _intentRouter;
        usdc = IERC20(_usdc);
        basketFactory = IBasketFactoryForBridge(_basketFactory);
        ccipGasLimit = 400_000;
    }

    // ─── Outbound ─────────────────────────────────────────────────

    /// @inheritdoc ICrossChainIntentBridge
    function routeCrossChain(
        uint256 intentId,
        uint64 destChainSelector,
        uint256 amount,
        address user,
        address targetBasket
    ) external onlyIntentRouter {
        SupportedChain memory dest = supportedChains[destChainSelector];
        if (!dest.active) revert UnsupportedChain(destChainSelector);

        usdc.safeTransferFrom(intentRouter, address(this), amount);

        CrossChainPayload memory payload = CrossChainPayload({
            intentId: intentId,
            user: user,
            targetBasket: targetBasket
        });

        Client.EVMTokenAmount[] memory tokenAmounts = new Client.EVMTokenAmount[](1);
        tokenAmounts[0] = Client.EVMTokenAmount({token: address(usdc), amount: amount});

        usdc.approve(getRouter(), amount);

        Client.EVM2AnyMessage memory message = Client.EVM2AnyMessage({
            receiver: abi.encode(dest.bridgeOnChain),
            data: abi.encode(payload),
            tokenAmounts: tokenAmounts,
            feeToken: feeToken,
            extraArgs: Client._argsToBytes(Client.EVMExtraArgsV1({gasLimit: ccipGasLimit}))
        });

        uint256 fee = IRouterClient(getRouter()).getFee(destChainSelector, message);

        bytes32 messageId;
        if (feeToken == address(0)) {
            messageId = IRouterClient(getRouter()).ccipSend{value: fee}(destChainSelector, message);
        } else {
            IERC20(feeToken).approve(getRouter(), fee);
            messageId = IRouterClient(getRouter()).ccipSend(destChainSelector, message);
        }

        emit IntentRoutedCrossChain(intentId, destChainSelector, messageId, amount);
    }

    // ─── Inbound ──────────────────────────────────────────────────

    function _ccipReceive(Client.Any2EVMMessage memory message) internal override {
        uint64 sourceChain = message.sourceChainSelector;
        address sender = abi.decode(message.sender, (address));

        SupportedChain memory src = supportedChains[sourceChain];
        if (!src.active || src.bridgeOnChain != sender) {
            revert UnknownSource(sourceChain, sender);
        }

        CrossChainPayload memory payload = abi.decode(message.data, (CrossChainPayload));

        uint256 usdcReceived = 0;
        if (message.destTokenAmounts.length > 0) {
            usdcReceived = message.destTokenAmounts[0].amount;
        }

        address targetBasket = payload.targetBasket;
        if (targetBasket == address(0)) {
            address[] memory baskets = basketFactory.getAllBaskets();
            if (baskets.length == 0) revert NoBasketAvailable();
            targetBasket = baskets[0];
        }

        usdc.approve(targetBasket, usdcReceived);
        uint256 shares = IBasketVaultForBridge(targetBasket).deposit(usdcReceived);

        address shareToken = IBasketVaultForBridge(targetBasket).shareToken();
        IERC20(shareToken).safeTransfer(payload.user, shares);

        emit IntentReceivedCrossChain(sourceChain, payload.user, usdcReceived);
    }

    // ─── Admin ────────────────────────────────────────────────────

    /// @inheritdoc ICrossChainIntentBridge
    function addSupportedChain(uint64 chainSelector, address usdcOnChain, address bridgeOnChain) external onlyOwner {
        supportedChains[chainSelector] = SupportedChain({
            usdcOnChain: usdcOnChain,
            bridgeOnChain: bridgeOnChain,
            active: true
        });
        supportedChainSelectors.push(chainSelector);
    }

    /// @inheritdoc ICrossChainIntentBridge
    function removeSupportedChain(uint64 chainSelector) external onlyOwner {
        supportedChains[chainSelector].active = false;
    }

    function setFeeToken(address _feeToken) external onlyOwner {
        feeToken = _feeToken;
    }

    function setCcipGasLimit(uint256 _gasLimit) external onlyOwner {
        ccipGasLimit = _gasLimit;
    }

    function setBasketFactory(address _factory) external onlyOwner {
        basketFactory = IBasketFactoryForBridge(_factory);
    }

    receive() external payable {}
}
