// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {BasketVault} from "./BasketVault.sol";
import {IOracleAdapter} from "../perp/interfaces/IOracleAdapter.sol";

/// @title BasketFactory
/// @notice Deploys new BasketVault instances with asset configurations.
contract BasketFactory is Ownable {
    address public immutable usdc;
    address public oracleAdapter;
    address public vaultAccounting;

    address[] public baskets;

    event BasketCreated(
        address indexed creator,
        address indexed vault,
        address shareToken,
        string name
    );

    constructor(
        address _usdc,
        address _oracleAdapter,
        address _owner
    ) Ownable(_owner) {
        require(_usdc != address(0), "USDC required");
        require(_oracleAdapter != address(0), "Oracle required");
        usdc = _usdc;
        oracleAdapter = _oracleAdapter;
    }

    function setVaultAccounting(address _vaultAccounting) external onlyOwner {
        vaultAccounting = _vaultAccounting;
    }

    function setOracleAdapter(address _oracleAdapter) external onlyOwner {
        require(_oracleAdapter != address(0), "Oracle required");
        oracleAdapter = _oracleAdapter;
    }

    /// @notice Deploy a new basket vault with specified asset allocations.
    function createBasket(
        string calldata _name,
        bytes32[] calldata assetIds,
        uint256[] calldata weightsBps,
        uint256 depositFeeBps,
        uint256 redeemFeeBps
    ) external returns (address) {
        BasketVault vault = new BasketVault(
            _name,
            usdc,
            oracleAdapter,
            msg.sender
        );

        vault.setAssets(assetIds, weightsBps);
        vault.setFees(depositFeeBps, redeemFeeBps);

        if (vaultAccounting != address(0)) {
            vault.setVaultAccounting(vaultAccounting);
        }

        vault.transferOwnership(msg.sender);

        baskets.push(address(vault));

        emit BasketCreated(
            msg.sender,
            address(vault),
            address(vault.shareToken()),
            _name
        );

        return address(vault);
    }

    function getAllBaskets() external view returns (address[] memory) {
        return baskets;
    }

    function getBasketCount() external view returns (uint256) {
        return baskets.length;
    }
}
