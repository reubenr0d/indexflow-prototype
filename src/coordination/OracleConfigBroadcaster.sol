// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IRouterClient} from "@chainlink/contracts-ccip/contracts/interfaces/IRouterClient.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import {IOracleConfigBroadcaster} from "./interfaces/IOracleConfigBroadcaster.sol";
import {IOracleAdapter} from "../perp/interfaces/IOracleAdapter.sol";

interface IOracleAdapterExtended is IOracleAdapter {
    function assetList(uint256 index) external view returns (bytes32);
    function getAssetCount() external view returns (uint256);
    function getAssetSymbol(bytes32 assetId) external view returns (string memory);
}

/// @title OracleConfigBroadcaster
/// @notice Deployed on the canonical chain. Reads asset configs from the local OracleAdapter
/// and broadcasts them to registered remote chains via CCIP (excluding feedAddress).
contract OracleConfigBroadcaster is IOracleConfigBroadcaster, Ownable {
    IOracleAdapterExtended public immutable oracleAdapter;
    address public immutable ccipRouter;
    address public feeToken;
    uint256 public ccipGasLimit;

    struct RemoteChain {
        address receiver;
        bool active;
    }

    uint64[] public remoteChainSelectors;
    mapping(uint64 => RemoteChain) public remoteChains;

    error AssetNotActive(bytes32 assetId);
    error ChainNotRegistered(uint64 chainSelector);

    constructor(
        address _oracleAdapter,
        address _ccipRouter,
        address _feeToken,
        address _owner
    ) Ownable(_owner) {
        oracleAdapter = IOracleAdapterExtended(_oracleAdapter);
        ccipRouter = _ccipRouter;
        feeToken = _feeToken;
        ccipGasLimit = 300_000;
    }

    /// @inheritdoc IOracleConfigBroadcaster
    function broadcastConfig(bytes32 assetId) external onlyOwner {
        IOracleAdapter.AssetConfig memory cfg = oracleAdapter.getAssetConfig(assetId);
        if (!cfg.active) revert AssetNotActive(assetId);

        string memory symbol = oracleAdapter.getAssetSymbol(assetId);
        CanonicalAssetConfig memory canonical = CanonicalAssetConfig({
            assetId: assetId,
            symbol: symbol,
            feedType: cfg.feedType,
            stalenessThreshold: cfg.stalenessThreshold,
            deviationBps: cfg.deviationBps,
            decimals: cfg.decimals
        });

        _broadcastToAll(canonical);
    }

    /// @inheritdoc IOracleConfigBroadcaster
    function broadcastAllConfigs() external onlyOwner {
        uint256 count = oracleAdapter.getAssetCount();
        for (uint256 i = 0; i < count; i++) {
            bytes32 assetId = oracleAdapter.assetList(i);
            IOracleAdapter.AssetConfig memory cfg = oracleAdapter.getAssetConfig(assetId);
            if (!cfg.active) continue;

            string memory symbol = oracleAdapter.getAssetSymbol(assetId);
            CanonicalAssetConfig memory canonical = CanonicalAssetConfig({
                assetId: assetId,
                symbol: symbol,
                feedType: cfg.feedType,
                stalenessThreshold: cfg.stalenessThreshold,
                deviationBps: cfg.deviationBps,
                decimals: cfg.decimals
            });

            _broadcastToAll(canonical);
        }
    }

    function _broadcastToAll(CanonicalAssetConfig memory canonical) internal {
        bytes memory payload = abi.encode(canonical);

        for (uint256 i = 0; i < remoteChainSelectors.length; i++) {
            uint64 dest = remoteChainSelectors[i];
            RemoteChain memory rc = remoteChains[dest];
            if (!rc.active) continue;

            Client.EVM2AnyMessage memory message = Client.EVM2AnyMessage({
                receiver: abi.encode(rc.receiver),
                data: payload,
                tokenAmounts: new Client.EVMTokenAmount[](0),
                feeToken: feeToken,
                extraArgs: Client._argsToBytes(Client.EVMExtraArgsV1({gasLimit: ccipGasLimit}))
            });

            uint256 fee = IRouterClient(ccipRouter).getFee(dest, message);

            bytes32 messageId;
            if (feeToken == address(0)) {
                messageId = IRouterClient(ccipRouter).ccipSend{value: fee}(dest, message);
            } else {
                IERC20(feeToken).approve(ccipRouter, fee);
                messageId = IRouterClient(ccipRouter).ccipSend(dest, message);
            }

            emit ConfigBroadcast(canonical.assetId, dest, messageId);
        }
    }

    // ─── Admin ────────────────────────────────────────────────────

    /// @inheritdoc IOracleConfigBroadcaster
    function addRemoteChain(uint64 chainSelector, address receiverAddress) external onlyOwner {
        remoteChains[chainSelector] = RemoteChain({receiver: receiverAddress, active: true});
        remoteChainSelectors.push(chainSelector);
        emit RemoteChainRegistered(chainSelector, receiverAddress);
    }

    /// @inheritdoc IOracleConfigBroadcaster
    function removeRemoteChain(uint64 chainSelector) external onlyOwner {
        if (!remoteChains[chainSelector].active) revert ChainNotRegistered(chainSelector);
        remoteChains[chainSelector].active = false;
        emit RemoteChainRemoved(chainSelector);
    }

    function setFeeToken(address _feeToken) external onlyOwner {
        feeToken = _feeToken;
    }

    function setCcipGasLimit(uint256 _gasLimit) external onlyOwner {
        ccipGasLimit = _gasLimit;
    }

    receive() external payable {}
}
