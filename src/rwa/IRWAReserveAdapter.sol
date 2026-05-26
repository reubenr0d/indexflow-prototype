// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IRWAReserveAdapter
/// @notice Common interface every BasketVault calls when routing idle USDC into a
///         real-world-asset reserve token (Ondo USDY / Ondo mUSD / Mantle mETH).
/// @dev    Adapter is per-vault: each vault deploys (or is wired to) its own adapter
///         instance, and the adapter holds the reserve token on the vault's behalf.
///         The vault must be the adapter's sole authorised caller for mutating
///         functions; the adapter MUST revert if any other address tries to call
///         `deposit`, `withdraw`, or `setReserveToken`.
///
///         Decimal conventions (used uniformly across adapters and mocks):
///           - USDC: 6 decimals.
///           - USDY / mUSD / mETH: 18 decimals.
///           - All `usdcAmount` parameters are in raw USDC units (1 USDC = 1e6).
///           - All view returns labelled `Usdc` are likewise raw USDC units.
interface IRWAReserveAdapter {
    /// @notice The three reserve tokens supported by the multi-asset adapter.
    /// @dev    Encoded as enum so `setReserveToken` can rotate without per-token
    ///         function calls. New tokens must be added to the end of the enum to
    ///         preserve storage layout across upgrades.
    enum ReserveToken {
        USDY,
        MUSD,
        METH
    }

    /// @notice Pull `usdcAmount` from the calling vault and subscribe for the
    ///         currently configured reserve token. Returns the amount of reserve
    ///         token credited to the adapter's balance, in the token's native
    ///         decimals (18 for USDY / mUSD / mETH).
    /// @dev    Reverts unless `msg.sender == vault()`. Reverts if the underlying
    ///         primitive's subscribe / wrap call reverts (e.g. slippage breach,
    ///         primitive paused). The adapter MUST `safeIncreaseAllowance` on
    ///         USDC to the underlying primitive before calling subscribe / wrap.
    function deposit(uint256 usdcAmount) external returns (uint256 reserveAmountReceived);

    /// @notice Redeem the currently configured reserve token back to USDC and
    ///         transfer at least `usdcAmount` back to the calling vault. Returns
    ///         the actual USDC amount delivered (may exceed `usdcAmount` by a
    ///         dust rounding margin; MUST NOT be less unless the call reverts).
    /// @dev    Reverts unless `msg.sender == vault()`. If the underlying
    ///         primitive cannot satisfy the redemption (insufficient liquidity,
    ///         redemption-queue depth), the adapter MUST revert with a descriptive
    ///         reason rather than silently delivering less than requested.
    function withdraw(uint256 usdcAmount) external returns (uint256 usdcDelivered);

    /// @notice Rotate the reserve token: redeem the entire current reserve to
    ///         USDC, switch the configured token to `newToken`, then re-subscribe
    ///         the freed USDC into the new token. NAV-neutral except for any
    ///         slippage incurred during the round-trip.
    /// @dev    Reverts unless `msg.sender == vault()`. Reverts if `newToken`
    ///         equals the current reserve token (no-op rotation). Emits
    ///         `ReserveTokenChanged(oldToken, newToken, freedUsdc)`.
    function setReserveToken(ReserveToken newToken) external;

    /// @notice The currently configured reserve token.
    function reserveToken() external view returns (ReserveToken);

    /// @notice The vault authorised to call mutating functions on this adapter.
    function vault() external view returns (address);

    /// @notice USDC value of the adapter's current reserve-token holdings.
    /// @dev    All pricing is sourced from the existing IndexFlow
    ///         `OracleAdapter` (CustomRelayer-fed by the keeper from real
    ///         off-chain data — Ondo mainnet's RWADynamicOracle for USDY and
    ///         Mantle mainnet's mETH state for mETH). mUSD is valued 1:1
    ///         with USDC because it is $1-pegged by design. Used by
    ///         `BasketVault._pricingNav`.
    /// @return usdcValue Current reserve value in raw USDC units (6 decimals).
    function getReserveValueUsdc() external view returns (uint256 usdcValue);

    /// @notice Raw reserve-token balance held by the adapter (in native decimals).
    function getReserveBalance() external view returns (uint256);

    /// @notice Address of the currently configured reserve token. Useful for
    ///         off-chain monitoring and for the indexer to subscribe to the
    ///         correct ERC20 events.
    function getReserveTokenAddress() external view returns (address);

    /// @notice Emitted on every successful subscribe / wrap. `usdcIn` is the
    ///         USDC pulled from the vault; `reserveOut` is the reserve token
    ///         credited to the adapter's balance.
    event ReserveDeposited(ReserveToken indexed token, uint256 usdcIn, uint256 reserveOut);

    /// @notice Emitted on every successful redeem / unwrap.
    event ReserveWithdrawn(ReserveToken indexed token, uint256 reserveIn, uint256 usdcOut);

    /// @notice Emitted when the configured reserve token is rotated. `freedUsdc`
    ///         is the USDC freed by redeeming the previous reserve mid-rotation.
    event ReserveTokenChanged(ReserveToken indexed oldToken, ReserveToken indexed newToken, uint256 freedUsdc);
}
