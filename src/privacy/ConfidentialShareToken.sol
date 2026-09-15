// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Nox, euint256, externalEuint256} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";
import {ERC7984} from "@iexec-nox/nox-confidential-contracts/contracts/token/ERC7984.sol";

/// @title ConfidentialShareToken
/// @notice ERC-7984 confidential basket share token. Balances and total supply
///         are encrypted — only ACL-authorised addresses can decrypt holdings.
///         Mint and burn are restricted to the paired vault.
contract ConfidentialShareToken is ERC7984 {
    address public immutable VAULT;

    error OnlyVault();

    modifier onlyVault() {
        if (msg.sender != VAULT) revert OnlyVault();
        _;
    }

    /// @param name_   ERC-7984 token name.
    /// @param symbol_ ERC-7984 token symbol.
    /// @param vault_  Deploying ConfidentialBasketVault address.
    constructor(string memory name_, string memory symbol_, address vault_) ERC7984(name_, symbol_, "") {
        require(vault_ != address(0), "Vault required");
        VAULT = vault_;
    }

    /// @notice Mint encrypted shares to `to`. Called by vault on deposit.
    /// @param to     Recipient address.
    /// @param amount Encrypted share amount.
    function mint(address to, euint256 amount) external onlyVault {
        _mint(to, amount);
        // Grant recipient ACL so they can decrypt their own balance.
        Nox.allow(amount, to);
    }

    /// @notice Burn encrypted shares from `from`. Called by vault on redeem.
    /// @param from   Share holder.
    /// @param amount Encrypted share amount to burn.
    function burn(address from, euint256 amount) external onlyVault {
        _burn(from, amount);
    }

    /// @notice Burn encrypted shares held by this contract (pending redemptions).
    /// @param amount Encrypted share amount to burn.
    function burnFromVault(euint256 amount) external onlyVault {
        _burn(address(this), amount);
    }
}
