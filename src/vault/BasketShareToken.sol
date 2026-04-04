// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title BasketShareToken
/// @notice Transferable ERC20 representing basket shares. Mint/burn restricted to vault.
contract BasketShareToken is ERC20 {
    address public immutable VAULT;

    modifier onlyVault() {
        require(msg.sender == VAULT, "Only vault");
        _;
    }

    constructor(
        string memory name_,
        string memory symbol_,
        address vault_
    ) ERC20(name_, symbol_) {
        require(vault_ != address(0), "Vault address required");
        VAULT = vault_;
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external onlyVault {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyVault {
        _burn(from, amount);
    }
}
