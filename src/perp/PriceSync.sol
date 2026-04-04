// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IOracleAdapter} from "./interfaces/IOracleAdapter.sol";

/// @dev 0.8.24 interface for calling the 0.6.12 SimplePriceFeed
interface ISimplePriceFeed {
    function setPrice(address token, uint256 price) external;
    function setPrices(address[] calldata tokens, uint256[] calldata prices) external;
    function prices(address token) external view returns (uint256);
}

/// @title PriceSync
/// @notice Propagates prices from OracleAdapter (0.8.24) to SimplePriceFeed (0.6.12)
/// ensuring a single source of truth. Call syncPrices() after every oracle update
/// so GMX Vault reads the same economic price as the basket/perp layers.
contract PriceSync is Ownable {
    IOracleAdapter public oracleAdapter;
    ISimplePriceFeed public simplePriceFeed;

    struct AssetMapping {
        bytes32 assetId;
        address gmxToken;
    }

    AssetMapping[] internal _mappings;
    mapping(bytes32 => uint256) internal _mappingIndex;
    mapping(bytes32 => bool) internal _mappingExists;

    event Synced(bytes32 indexed assetId, address indexed token, uint256 price);
    event MappingAdded(bytes32 indexed assetId, address indexed token);
    event MappingRemoved(bytes32 indexed assetId);

    error MappingAlreadyExists(bytes32 assetId);
    error MappingNotFound(bytes32 assetId);
    error ZeroAddress();

    constructor(
        address _oracleAdapter,
        address _simplePriceFeed,
        address _owner
    ) Ownable(_owner) {
        if (_oracleAdapter == address(0) || _simplePriceFeed == address(0)) revert ZeroAddress();
        oracleAdapter = IOracleAdapter(_oracleAdapter);
        simplePriceFeed = ISimplePriceFeed(_simplePriceFeed);
    }

    // ─── Mapping Management ──────────────────────────────────────

    function addMapping(bytes32 assetId, address gmxToken) external onlyOwner {
        if (gmxToken == address(0)) revert ZeroAddress();
        if (_mappingExists[assetId]) revert MappingAlreadyExists(assetId);

        _mappingIndex[assetId] = _mappings.length;
        _mappingExists[assetId] = true;
        _mappings.push(AssetMapping({assetId: assetId, gmxToken: gmxToken}));

        emit MappingAdded(assetId, gmxToken);
    }

    function removeMapping(bytes32 assetId) external onlyOwner {
        if (!_mappingExists[assetId]) revert MappingNotFound(assetId);

        uint256 idx = _mappingIndex[assetId];
        uint256 lastIdx = _mappings.length - 1;

        if (idx != lastIdx) {
            AssetMapping memory last = _mappings[lastIdx];
            _mappings[idx] = last;
            _mappingIndex[last.assetId] = idx;
        }

        _mappings.pop();
        delete _mappingIndex[assetId];
        delete _mappingExists[assetId];

        emit MappingRemoved(assetId);
    }

    // ─── Price Sync ──────────────────────────────────────────────

    /// @notice Sync all mapped asset prices from OracleAdapter to SimplePriceFeed.
    function syncAll() external {
        uint256 len = _mappings.length;
        for (uint256 i = 0; i < len; i++) {
            _syncOne(_mappings[i].assetId, _mappings[i].gmxToken);
        }
    }

    /// @notice Sync specific asset prices.
    function syncPrices(bytes32[] calldata assetIds) external {
        for (uint256 i = 0; i < assetIds.length; i++) {
            if (!_mappingExists[assetIds[i]]) revert MappingNotFound(assetIds[i]);
            uint256 idx = _mappingIndex[assetIds[i]];
            _syncOne(_mappings[idx].assetId, _mappings[idx].gmxToken);
        }
    }

    // ─── Views ───────────────────────────────────────────────────

    function getMappingCount() external view returns (uint256) {
        return _mappings.length;
    }

    function getMapping(uint256 index) external view returns (bytes32 assetId, address gmxToken) {
        AssetMapping memory m = _mappings[index];
        return (m.assetId, m.gmxToken);
    }

    function isMapped(bytes32 assetId) external view returns (bool) {
        return _mappingExists[assetId];
    }

    // ─── Admin ───────────────────────────────────────────────────

    function setOracleAdapter(address _oracleAdapter) external onlyOwner {
        if (_oracleAdapter == address(0)) revert ZeroAddress();
        oracleAdapter = IOracleAdapter(_oracleAdapter);
    }

    function setSimplePriceFeed(address _simplePriceFeed) external onlyOwner {
        if (_simplePriceFeed == address(0)) revert ZeroAddress();
        simplePriceFeed = ISimplePriceFeed(_simplePriceFeed);
    }

    // ─── Internal ────────────────────────────────────────────────

    function _syncOne(bytes32 assetId, address gmxToken) internal {
        (uint256 price,) = oracleAdapter.getPrice(assetId);
        simplePriceFeed.setPrice(gmxToken, price);
        emit Synced(assetId, gmxToken, price);
    }
}
