// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IOracleAdapter} from "./interfaces/IOracleAdapter.sol";

/// @title ISimplePriceFeed
/// @notice Minimal 0.8.x interface for the forked 0.6.12 `SimplePriceFeed` setter API.
interface ISimplePriceFeed {
    /// @notice Set stored price for one GMX token (keeper-gated on deployed feed).
    function setPrice(address token, uint256 price) external;
    /// @notice Batch set stored prices.
    function setPrices(address[] calldata tokens, uint256[] calldata prices) external;
    /// @notice Read stored price for `token`.
    function prices(address token) external view returns (uint256);
}

/// @title PriceSync
/// @notice Propagates prices from `OracleAdapter` (0.8.24) to `SimplePriceFeed` (0.6.12).
/// @dev Permissionless `syncAll` / `syncPrices`: anyone may pay gas to align GMX on-chain prices with the adapter.
/// Run after Chainlink reads or after keeper `submitPrice` for custom assets so the perp engine matches basket oracle economics.
contract PriceSync is Ownable {
    /// @notice Source of normalized prices.
    IOracleAdapter public oracleAdapter;
    /// @notice GMX-facing feed contract updated by this module.
    ISimplePriceFeed public simplePriceFeed;

    /// @notice One oracle asset id mapped to a GMX pool token address.
    /// @param assetId `OracleAdapter` key.
    /// @param gmxToken Token address whose price is set on `SimplePriceFeed`.
    struct AssetMapping {
        bytes32 assetId;
        address gmxToken;
    }

    AssetMapping[] internal _mappings;
    mapping(bytes32 => uint256) internal _mappingIndex;
    mapping(bytes32 => bool) internal _mappingExists;

    /// @notice Addresses authorized alongside owner on guarded admin functions (e.g. `addMapping`).
    mapping(address => bool) public wirers;

    event Synced(bytes32 indexed assetId, address indexed token, uint256 price);
    event MappingAdded(bytes32 indexed assetId, address indexed token);
    event MappingRemoved(bytes32 indexed assetId);
    /// @notice Emitted when `setWirer` runs.
    event WirerSet(address indexed account, bool active);

    /// @notice `addMapping` when id already mapped.
    error MappingAlreadyExists(bytes32 assetId);
    /// @notice `syncPrices` or `removeMapping` for unknown id.
    error MappingNotFound(bytes32 assetId);
    /// @notice Constructor or admin setters received zero address.
    error ZeroAddress();

    modifier onlyOwnerOrWirer() {
        require(msg.sender == owner() || wirers[msg.sender], "Not authorized");
        _;
    }

    /// @param _oracleAdapter Oracle adapter.
    /// @param _simplePriceFeed GMX simple price feed.
    /// @param _owner Owner for mapping admin.
    constructor(address _oracleAdapter, address _simplePriceFeed, address _owner) Ownable(_owner) {
        if (_oracleAdapter == address(0) || _simplePriceFeed == address(0)) revert ZeroAddress();
        oracleAdapter = IOracleAdapter(_oracleAdapter);
        simplePriceFeed = ISimplePriceFeed(_simplePriceFeed);
    }

    // ─── Mapping Management ──────────────────────────────────────

    /// @notice Register an oracle asset id to a GMX token for syncing.
    /// @param assetId Adapter asset key.
    /// @param gmxToken GMX index/collateral token whose `setPrice` target applies.
    function addMapping(bytes32 assetId, address gmxToken) external onlyOwnerOrWirer {
        if (gmxToken == address(0)) revert ZeroAddress();
        if (_mappingExists[assetId]) revert MappingAlreadyExists(assetId);

        _mappingIndex[assetId] = _mappings.length;
        _mappingExists[assetId] = true;
        _mappings.push(AssetMapping({assetId: assetId, gmxToken: gmxToken}));

        emit MappingAdded(assetId, gmxToken);
    }

    /// @notice Remove a mapping entry (swap-remove internal array).
    /// @param assetId Previously added asset id.
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

    /// @notice Push every mapped asset's adapter price into `SimplePriceFeed`.
    /// @dev Callable by anyone.
    function syncAll() external {
        uint256 len = _mappings.length;
        for (uint256 i = 0; i < len; i++) {
            _syncOne(_mappings[i].assetId, _mappings[i].gmxToken);
        }
    }

    /// @notice Sync a subset of mapped assets (must exist in mapping).
    /// @param assetIds Asset ids to sync.
    function syncPrices(bytes32[] calldata assetIds) external {
        for (uint256 i = 0; i < assetIds.length; i++) {
            if (!_mappingExists[assetIds[i]]) revert MappingNotFound(assetIds[i]);
            uint256 idx = _mappingIndex[assetIds[i]];
            _syncOne(_mappings[idx].assetId, _mappings[idx].gmxToken);
        }
    }

    // ─── Views ───────────────────────────────────────────────────

    /// @notice Number of oracle→GMX mappings.
    /// @return Length of internal mapping list.
    function getMappingCount() external view returns (uint256) {
        return _mappings.length;
    }

    /// @notice Nth mapping entry.
    /// @param index Index in `[0, getMappingCount())`.
    /// @return assetId Oracle id.
    /// @return gmxToken GMX token.
    function getMapping(uint256 index) external view returns (bytes32 assetId, address gmxToken) {
        AssetMapping memory m = _mappings[index];
        return (m.assetId, m.gmxToken);
    }

    /// @notice Whether `assetId` has a mapping.
    /// @param assetId Asset id.
    /// @return True if registered.
    function isMapped(bytes32 assetId) external view returns (bool) {
        return _mappingExists[assetId];
    }

    // ─── Admin ───────────────────────────────────────────────────

    /// @notice Authorize or revoke a wirer for `addMapping`.
    /// @param account Address to toggle.
    /// @param active Whether account may call wirer-guarded functions.
    function setWirer(address account, bool active) external onlyOwner {
        wirers[account] = active;
        emit WirerSet(account, active);
    }

    /// @notice Point sync source to a new adapter.
    /// @param _oracleAdapter New oracle adapter address.
    function setOracleAdapter(address _oracleAdapter) external onlyOwner {
        if (_oracleAdapter == address(0)) revert ZeroAddress();
        oracleAdapter = IOracleAdapter(_oracleAdapter);
    }

    /// @notice Point sync sink to a new feed contract.
    /// @param _simplePriceFeed New `SimplePriceFeed` address.
    function setSimplePriceFeed(address _simplePriceFeed) external onlyOwner {
        if (_simplePriceFeed == address(0)) revert ZeroAddress();
        simplePriceFeed = ISimplePriceFeed(_simplePriceFeed);
    }

    // ─── Internal ────────────────────────────────────────────────

    /// @dev Read `oracleAdapter.getPrice` and `setPrice` on GMX feed for `gmxToken`.
    function _syncOne(bytes32 assetId, address gmxToken) internal {
        (uint256 price,) = oracleAdapter.getPrice(assetId);
        simplePriceFeed.setPrice(gmxToken, price);
        emit Synced(assetId, gmxToken, price);
    }
}
