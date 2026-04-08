// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {BasketVault} from "./BasketVault.sol";

/// @title BasketFactory
/// @notice Deploys new BasketVault instances.
/// @dev New vaults are deployed with factory as owner; ownership is transferred to `msg.sender` after setup.
contract BasketFactory is Ownable {
    /// @notice USDC address passed to every new basket.
    address public immutable usdc;
    /// @notice Oracle adapter used for new baskets (mutable by owner).
    address public oracleAdapter;
    /// @notice Optional `VaultAccounting` wired on create when nonzero (mutable by owner).
    address public vaultAccounting;

    /// @notice All baskets created through this factory.
    address[] public baskets;

    event BasketCreated(address indexed creator, address indexed vault, address shareToken, string name);

    /// @param _usdc USDC address for new vaults.
    /// @param _oracleAdapter Initial oracle adapter.
    /// @param _owner Factory owner.
    constructor(address _usdc, address _oracleAdapter, address _owner) Ownable(_owner) {
        require(_usdc != address(0), "USDC required");
        require(_oracleAdapter != address(0), "Oracle required");
        usdc = _usdc;
        oracleAdapter = _oracleAdapter;
    }

    /// @notice Default `VaultAccounting` address applied to new baskets (optional).
    /// @param _vaultAccounting Perp module or zero.
    function setVaultAccounting(address _vaultAccounting) external onlyOwner {
        vaultAccounting = _vaultAccounting;
    }

    /// @notice Update oracle adapter used for subsequent `createBasket` calls.
    /// @param _oracleAdapter Oracle adapter address.
    function setOracleAdapter(address _oracleAdapter) external onlyOwner {
        require(_oracleAdapter != address(0), "Oracle required");
        oracleAdapter = _oracleAdapter;
    }

    /// @notice Deploy a new basket vault, configure fees, optionally wire perp, transfer ownership to caller.
    /// @param _name Basket name.
    /// @param depositFeeBps Deposit fee for the new vault.
    /// @param redeemFeeBps Redeem fee for the new vault.
    /// @return vault Address of the new `BasketVault`.
    function createBasket(string calldata _name, uint256 depositFeeBps, uint256 redeemFeeBps)
        external
        returns (address)
    {
        BasketVault basket = new BasketVault(_name, usdc, oracleAdapter, address(this));

        basket.setFees(depositFeeBps, redeemFeeBps);

        if (vaultAccounting != address(0)) {
            basket.setVaultAccounting(vaultAccounting);
        }

        basket.transferOwnership(msg.sender);

        baskets.push(address(basket));

        emit BasketCreated(msg.sender, address(basket), address(basket.shareToken()), _name);

        return address(basket);
    }

    /// @notice Copy of all basket addresses created via this factory.
    /// @return Array of `BasketVault` addresses.
    function getAllBaskets() external view returns (address[] memory) {
        return baskets;
    }

    /// @notice Number of baskets deployed through this factory.
    /// @return Length of `baskets`.
    function getBasketCount() external view returns (uint256) {
        return baskets.length;
    }
}
