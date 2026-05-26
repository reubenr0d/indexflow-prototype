// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockMUSD
/// @notice 18-decimal $1-pegged token. The testnet variant is non-rebasing:
///         balances are static and value-per-token is always 1.0 USDC. No
///         yield simulation. Real mainnet mUSD earns yield via rebase
///         (balances grow at Ondo's published APY) and the deploy script
///         swaps this mock for the real Ondo mUSD on mainnet.
/// @dev    Only the configured `wrapper` may mint / burn so the wrap /
///         unwrap path is the only way supply changes.
contract MockMUSD is ERC20 {
    uint8 private constant DECIMALS = 18;
    address public immutable wrapper;

    constructor(address _wrapper) ERC20("Mock mUSD", "mUSD") {
        require(_wrapper != address(0), "wrapper required");
        wrapper = _wrapper;
    }

    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }

    function mint(address to, uint256 amount) external {
        require(msg.sender == wrapper, "only wrapper");
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        require(msg.sender == wrapper, "only wrapper");
        _burn(from, amount);
    }
}
