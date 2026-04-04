# Perp Infrastructure (GMX v1 Fork)

Oracle-priced basket vaults backed by a shared perpetual liquidity pool, built on a GMX v1 fork.

## Architecture

```
Investor ──deposit USDC──► BasketVault ──allocate──► VaultAccounting ──► GMX Vault Pool
                │                                        │
          mint shares                              position PnL
          (oracle-priced)                          (tracked per vault)
```

### Basket Layer (`src/vault/`)

- **BasketVault** -- GLP-style vault: deposit USDC, receive shares priced by weighted oracle prices
- **BasketShareToken** -- ERC20 shares (6 decimals)
- **BasketFactory** -- Deploy new baskets with asset weight configurations

### Perp Layer (`src/perp/`)

- **OracleAdapter** -- Unified oracle for equities + commodities (Chainlink + custom relayer)
- **PricingEngine** -- Oracle price + deterministic size-based slippage
- **VaultAccounting** -- Per-vault capital tracking, PnL attribution, position management
- **FundingRateManager** -- Oracle-anchored, imbalance-based funding rates
- **PerpReader** -- Read-only aggregator for off-chain monitoring

### GMX Fork (`src/gmx/`)

Forked GMX v1 contracts (Solidity 0.6.12) providing the core position engine:
Vault, VaultUtils, Router, ShortsTracker, BasePositionManager.

## Tech Stack

- **Solidity** -- 0.6.12 (GMX fork) + ^0.8.24 (new contracts)
- **Foundry** -- Build, test, deploy
- **OpenZeppelin** 5.x -- ERC20, Ownable, ReentrancyGuard
- **Target chain** -- Arbitrum

## Setup

```bash
# Install dependencies
forge install
npm install

# Build
forge build

# Test
forge test -vv
```

## Configuration

Copy `.env.example` to `.env` and set:

```
ARBITRUM_RPC_URL=
ARBITRUM_SEPOLIA_RPC_URL=
ARBISCAN_API_KEY=
```

## Documentation

See [MODIFICATIONS.md](MODIFICATIONS.md) for detailed changes vs upstream GMX.
