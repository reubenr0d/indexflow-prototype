// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockMETH
/// @notice Plain 18-decimal mintable ERC20 used as the testnet stand-in for
///         Mantle's mETH token. Holds no yield logic — the per-token USDC
///         value is read from the on-chain OracleAdapter (CustomRelayer-fed
///         by the keeper from real Mantle mainnet mETH state).
/// @dev    Only the configured `adapter` may mint / burn so the MethAdapter
///         is the single mutation path.
contract MockMETH is ERC20 {
    uint8 private constant DECIMALS = 18;
    address public immutable adapter;

    constructor(address _adapter) ERC20("Mock mETH", "mETH") {
        require(_adapter != address(0), "adapter required");
        adapter = _adapter;
    }

    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }

    function mint(address to, uint256 amount) external {
        require(msg.sender == adapter, "only adapter");
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        require(msg.sender == adapter, "only adapter");
        _burn(from, amount);
    }
}
