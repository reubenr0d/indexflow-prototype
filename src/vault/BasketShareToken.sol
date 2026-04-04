// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title BasketShareToken
/// @notice Transferable ERC20 representing basket shares. Mint/burn restricted to vault.
/// @dev Deployed by `BasketVault` constructor; uses 6 decimals to match USDC-style amounts.
contract BasketShareToken is ERC20 {
    /// @notice Basket vault allowed to mint/burn.
    address public immutable VAULT;

    modifier onlyVault() {
        require(msg.sender == VAULT, "Only vault");
        _;
    }

    /// @param name_ ERC20 name (typically basket name + " Share").
    /// @param symbol_ ERC20 symbol (e.g. BSKT).
    /// @param vault_ Deploying `BasketVault` address.
    constructor(string memory name_, string memory symbol_, address vault_) ERC20(name_, symbol_) {
        require(vault_ != address(0), "Vault address required");
        VAULT = vault_;
    }

    /// @inheritdoc ERC20
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Mint shares to `to` (vault-only).
    /// @param to Recipient.
    /// @param amount Share amount (6 decimals).
    function mint(address to, uint256 amount) external onlyVault {
        _mint(to, amount);
    }

    /// @notice Burn shares from `from` (vault-only).
    /// @param from Owner of shares to burn.
    /// @param amount Share amount.
    function burn(address from, uint256 amount) external onlyVault {
        _burn(from, amount);
    }
}
