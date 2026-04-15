// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {CCIPReceiver} from "@chainlink/contracts-ccip/contracts/applications/CCIPReceiver.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import {IOracleConfigBroadcaster} from "./interfaces/IOracleConfigBroadcaster.sol";
import {IOracleAdapter} from "../perp/interfaces/IOracleAdapter.sol";

interface IOracleAdapterForReceiver {
    function configureAsset(
        string calldata symbol,
        address feedAddress,
        IOracleAdapter.FeedType feedType,
        uint256 stalenessThreshold,
        uint256 deviationBps,
        uint8 decimals_
    ) external;

    function getAssetConfig(bytes32 assetId) external view returns (IOracleAdapter.AssetConfig memory);
    function isAssetActive(bytes32 assetId) external view returns (bool);
}

/// @title OracleConfigReceiver
/// @notice Deployed on remote chains. Receives canonical oracle config from the
/// canonical chain via CCIP and applies it to the local OracleAdapter, preserving
/// the local feedAddress.
contract OracleConfigReceiver is CCIPReceiver, Ownable {
    IOracleAdapterForReceiver public immutable oracleAdapter;
    uint64 public canonicalChainSelector;
    address public canonicalBroadcaster;

    event CanonicalConfigApplied(bytes32 indexed assetId, string symbol);
    event AssetNeedsFeedAddress(bytes32 indexed assetId, string symbol);

    error InvalidCanonicalSource(uint64 chainSelector, address sender);

    constructor(
        address _ccipRouter,
        address _oracleAdapter,
        uint64 _canonicalChainSelector,
        address _canonicalBroadcaster,
        address _owner
    ) CCIPReceiver(_ccipRouter) Ownable(_owner) {
        oracleAdapter = IOracleAdapterForReceiver(_oracleAdapter);
        canonicalChainSelector = _canonicalChainSelector;
        canonicalBroadcaster = _canonicalBroadcaster;
    }

    function _ccipReceive(Client.Any2EVMMessage memory message) internal override {
        if (message.sourceChainSelector != canonicalChainSelector) {
            revert InvalidCanonicalSource(message.sourceChainSelector, address(0));
        }

        address sender = abi.decode(message.sender, (address));
        if (sender != canonicalBroadcaster) {
            revert InvalidCanonicalSource(message.sourceChainSelector, sender);
        }

        IOracleConfigBroadcaster.CanonicalAssetConfig memory canonical =
            abi.decode(message.data, (IOracleConfigBroadcaster.CanonicalAssetConfig));

        address localFeed;
        if (oracleAdapter.isAssetActive(canonical.assetId)) {
            IOracleAdapter.AssetConfig memory existing = oracleAdapter.getAssetConfig(canonical.assetId);
            localFeed = existing.feedAddress;
        }

        oracleAdapter.configureAsset(
            canonical.symbol,
            localFeed,
            canonical.feedType,
            canonical.stalenessThreshold,
            canonical.deviationBps,
            canonical.decimals
        );

        emit CanonicalConfigApplied(canonical.assetId, canonical.symbol);

        if (localFeed == address(0)) {
            emit AssetNeedsFeedAddress(canonical.assetId, canonical.symbol);
        }
    }

    function setCanonicalBroadcaster(address _broadcaster) external onlyOwner {
        canonicalBroadcaster = _broadcaster;
    }

    function setCanonicalChainSelector(uint64 _selector) external onlyOwner {
        canonicalChainSelector = _selector;
    }
}
