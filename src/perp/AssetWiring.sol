// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {OracleAdapter} from "./OracleAdapter.sol";
import {IOracleAdapter} from "./interfaces/IOracleAdapter.sol";
import {VaultAccounting} from "./VaultAccounting.sol";
import {FundingRateManager} from "./FundingRateManager.sol";
import {PriceSync} from "./PriceSync.sol";
import {IGMXVault} from "./interfaces/IGMXVault.sol";
import {MockIndexToken} from "../mocks/MockIndexToken.sol";

/// @title ISimplePriceFeed
/// @notice Minimal interface for the GMX SimplePriceFeed keeper API.
interface ISimplePriceFeedWiring {
    function setPrice(address token, uint256 price) external;
}

/// @title AssetWiring
/// @notice Coordinator that wires a new tradeable asset in a single transaction.
/// @dev Deploys a `MockIndexToken`, configures oracle, GMX price feed + vault, and all perp stack mappings.
/// Designed for local / testnet deployments; `wireAsset` is permissionless.
contract AssetWiring is Ownable {
    OracleAdapter public oracleAdapter;
    VaultAccounting public vaultAccounting;
    FundingRateManager public fundingRateManager;
    PriceSync public priceSync;
    ISimplePriceFeedWiring public priceFeed;
    IGMXVault public gmxVault;

    event AssetWired(string symbol, bytes32 indexed assetId, address indexed indexToken);

    constructor(
        address _oracleAdapter,
        address _vaultAccounting,
        address _fundingRateManager,
        address _priceSync,
        address _priceFeed,
        address _gmxVault,
        address _owner
    ) Ownable(_owner) {
        oracleAdapter = OracleAdapter(_oracleAdapter);
        vaultAccounting = VaultAccounting(_vaultAccounting);
        fundingRateManager = FundingRateManager(_fundingRateManager);
        priceSync = PriceSync(_priceSync);
        priceFeed = ISimplePriceFeedWiring(_priceFeed);
        gmxVault = IGMXVault(_gmxVault);
    }

    /// @notice Register and fully wire a new tradeable asset in one transaction.
    /// @param symbol Yahoo Finance ticker (e.g. "GLEN.L"). Hashed to derive the on-chain asset id.
    /// @param seedPriceRaw8 Initial price in 8-decimal USD (same units as `OracleAdapter` for decimals=8).
    function wireAsset(string calldata symbol, uint256 seedPriceRaw8) external {
        require(seedPriceRaw8 > 0, "Price required");

        MockIndexToken token = new MockIndexToken(string.concat(symbol, " Token"), symbol, 18);

        bytes32 assetId = keccak256(bytes(symbol));

        oracleAdapter.configureAsset(symbol, address(0), IOracleAdapter.FeedType.CustomRelayer, 86_400, 2000, 8);

        bytes32[] memory ids = new bytes32[](1);
        ids[0] = assetId;
        uint256[] memory prices = new uint256[](1);
        prices[0] = seedPriceRaw8;
        oracleAdapter.submitPrices(ids, prices);

        priceFeed.setPrice(address(token), seedPriceRaw8 * 1e22);
        gmxVault.setTokenConfig(address(token), 18, 10000, 0, 0, false, true);

        vaultAccounting.mapAssetToken(assetId, address(token));
        fundingRateManager.mapAssetToken(assetId, address(token));
        priceSync.addMapping(assetId, address(token));
        priceSync.syncAll();

        emit AssetWired(symbol, assetId, address(token));
    }

    /// @notice Pass-through for GMX vault gov calls the deployer may need post-deploy.
    /// @param target Contract to call (typically GMX vault).
    /// @param data Encoded function call.
    function govCall(address target, bytes calldata data) external onlyOwner returns (bytes memory) {
        (bool ok, bytes memory ret) = target.call(data);
        require(ok, "AssetWiring: gov call failed");
        return ret;
    }
}
