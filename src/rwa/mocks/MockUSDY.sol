// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockUSDY
/// @notice 18-decimal accumulating yield-bearing token used as the testnet
///         counterpart to Ondo's USDY. Balance is fixed; the per-token USDC
///         value is read from the on-chain `OracleAdapter` (USDY-USDC
///         CustomRelayer feed posted by the keeper from real Ondo mainnet
///         `RWADynamicOracle.getPrice()` via mainnet RPC). No price logic
///         lives in this token contract.
/// @dev    Only the configured `instantManager` may mint / burn so that the
///         adapter's subscribe / redeem round-trip is the only path that
///         moves the supply.
contract MockUSDY is ERC20 {
    uint8 private constant DECIMALS = 18;
    address public immutable instantManager;

    constructor(address _instantManager) ERC20("Mock USDY", "mUSDY") {
        require(_instantManager != address(0), "manager required");
        instantManager = _instantManager;
    }

    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }

    function mint(address to, uint256 amount) external {
        require(msg.sender == instantManager, "only manager");
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        require(msg.sender == instantManager, "only manager");
        _burn(from, amount);
    }
}
