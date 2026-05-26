// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IMUSDWrapper} from "../IRWAPrimitives.sol";
import {MockMUSD} from "./MockMUSD.sol";

/// @title MockMUSDWrapper
/// @notice Testnet wrap / unwrap surface for mUSD with a constant 1:1 USDC
///         peg. Holds the wrapped USDC and releases on unwrap. Mints / burns
///         MockMUSD on each leg.
/// @dev    No yield logic. Real mainnet mUSD earns yield via rebase (token
///         balance grows over time at the published APY) but that mechanism
///         is intentionally NOT simulated on testnet — there is no admin-set
///         APY guess, no mock yield curve, no hardcoded number. mUSD in this
///         demo is a 0%-yield, compliance-friendly $1-pegged reserve. The
///         yield-router agent can still rotate into mUSD for risk-off
///         posture; it just won't out-earn USDY or mETH here. On mainnet the
///         deploy script will swap the mock for the real Ondo mUSD wrapper
///         and the rebase yield will flow naturally via balance growth.
contract MockMUSDWrapper is IMUSDWrapper {
    using SafeERC20 for IERC20;

    /// @notice Decimal scaler from USDC (6) to mUSD (18).
    uint256 public constant USDC_TO_MUSD_SCALE = 1e12;

    IERC20 public immutable usdc;
    MockMUSD public musd;

    constructor(address _usdc) {
        require(_usdc != address(0), "zero address");
        usdc = IERC20(_usdc);
    }

    function setMUSD(address _musd) external {
        require(address(musd) == address(0), "already set");
        require(_musd != address(0), "zero address");
        musd = MockMUSD(_musd);
    }

    function wrap(uint256 usdcAmount) external returns (uint256 musdOut) {
        require(usdcAmount > 0, "amount required");
        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);
        musdOut = usdcAmount * USDC_TO_MUSD_SCALE;
        musd.mint(msg.sender, musdOut);
    }

    function unwrap(uint256 musdAmount) external returns (uint256 usdcOut) {
        require(musdAmount > 0, "amount required");
        musd.burn(msg.sender, musdAmount);
        usdcOut = musdAmount / USDC_TO_MUSD_SCALE;
        require(usdc.balanceOf(address(this)) >= usdcOut, "insufficient usdc liquidity");
        usdc.safeTransfer(msg.sender, usdcOut);
    }
}
