// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockUSDC
/// @notice Simple mintable USDC-like token for local testing.
/// @dev Anyone may `mint`; not suitable for production.
contract MockUSDC is ERC20 {
    uint8 private constant DECIMALS = 6;

    constructor() ERC20("Mock USDC", "mUSDC") {}

    /// @inheritdoc ERC20
    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }

    /// @notice Mint test USDC to `to`.
    /// @param to Recipient.
    /// @param amount Amount (6 decimals).
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
