# Global pool management flow (GMX vault liquidity controls)

This document covers **global GMX vault liquidity operations** exposed in the web admin, and how they differ from basket-level allocation.

For basket owner actions (`allocateToPerp`, `withdrawFromPerp`), see [ASSET_MANAGER_FLOW.md](./ASSET_MANAGER_FLOW.md).

## Scope

This flow is for pool-level controls on the GMX vault:

- `setBufferAmount(token, amount)` (gov-only)
- `directPoolDeposit(token)` after sending token balance to the vault

These controls apply to **all whitelisted GMX tokens** and affect shared pool liquidity behavior, not a single basket’s capital bucket.

## UI location

- Route: `/admin/pool`
- Section: **Pool Controls**
- Per-token controls include:
  - Current pool amount, buffer amount, utilization, wallet balance
  - Buffer input/action
  - Direct pool deposit input/action

## Roles and permissions

- **GMX gov wallet**
  - Can call `setBufferAmount`.
  - Can also perform direct pool deposit.
- **Non-gov operator wallet**
  - Cannot set buffer amount.
  - Can perform direct pool deposit if wallet has token balance.

UI behavior:

- `Set Buffer` is disabled unless connected wallet equals `gmxVault.gov()`.
- `Deposit To Pool` is available for any connected wallet with sufficient balance.

## End-to-end flows

### 1) Update buffer amount (gov)

1. Connect gov wallet.
2. Open `/admin/pool`.
3. For token `T`, enter buffer amount in human units.
4. Click **Set Buffer**.
5. Wallet confirms tx calling `gmxVault.setBufferAmount(T, amountRaw)`.

Result:

- GMX `bufferAmounts[T]` is updated.
- This changes swap headroom constraints enforced by GMX pool logic.

### 2) Direct pool funding (any operator)

1. Connect wallet with token `T` balance.
2. Open `/admin/pool`.
3. Enter deposit amount in human units.
4. Click **Deposit To Pool**.
5. Wallet confirms tx #1: `ERC20(T).transfer(gmxVault, amountRaw)`.
6. Wallet confirms tx #2: `gmxVault.directPoolDeposit(T)`.

Result:

- Tokens are added to GMX `poolAmounts[T]`.
- Action is **non-dilutive**: no basket shares are minted and no per-basket accounting entry is created.

## Amount units

- UI inputs are human units.
- Conversion to on-chain base units uses each token’s `decimals`.
- Inputs with precision beyond token decimals are rejected by UI validation.

## Operational caveats

- `directPoolDeposit` requires token already transferred to GMX vault; calling it alone with zero delta reverts.
- Pool-level controls are distinct from basket-level perp allocation and should be treated as protocol operations.
- Buffer changes can affect swap availability and should be coordinated with risk policy.

