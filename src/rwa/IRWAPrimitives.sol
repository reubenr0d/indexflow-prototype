// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IRWAPrimitives
/// @notice Thin interfaces for the two manager / wrapper primitives our adapter
///         routes through on testnet: an Ondo InstantManager-compatible
///         surface for USDY subscribe / redeem, and an mUSD wrapper for
///         1:1 USDC <-> mUSD conversion.
/// @dev    All on-chain pricing is read from the existing IndexFlow
///         `OracleAdapter` (CustomRelayer-fed by the keeper from real
///         off-chain sources). The mocks in `src/rwa/mocks/` are plain
///         mintable ERC20s — only the *token contracts* are mocked on
///         testnet; the *prices* always come from real data.

/// @notice Ondo InstantManager-compatible surface for USDY subscribe / redeem.
interface IUSDYInstantManager {
    /// @notice Subscribe `usdcAmount` USDC for USDY at the current USDY/USDC
    ///         price from the on-chain OracleAdapter. Caller MUST approve
    ///         `usdcAmount` of USDC to this contract first.
    /// @return usdyOut USDY minted to `msg.sender` (18 decimals).
    function subscribe(address usdc, uint256 usdcAmount) external returns (uint256 usdyOut);

    /// @notice Redeem `usdyAmount` USDY back to `usdcOut` USDC at the current
    ///         oracle price. Caller MUST approve `usdyAmount` of USDY first.
    /// @return usdcOut USDC delivered to `msg.sender` (6 decimals).
    function redeem(address usdy, uint256 usdyAmount, address usdc) external returns (uint256 usdcOut);
}

/// @notice Ondo mUSD wrapper surface. Wrap is 1 USDC -> 1 mUSD (mUSD is 18d
///         so the wrapper handles the 6 -> 18 decimal scaling). Yield accrues
///         via balance rebase outside the adapter's read path; valuation is a
///         constant $1 per mUSD (rebasing tokens stay $1 by design).
interface IMUSDWrapper {
    function wrap(uint256 usdcAmount) external returns (uint256 musdOut);
    function unwrap(uint256 musdAmount) external returns (uint256 usdcOut);
}
