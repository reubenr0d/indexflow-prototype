# E2E Testing (Playwright + Anvil)

This repo includes a browser E2E suite for the web app with real onchain writes on local Anvil.

## Architecture

- **No subgraph required.** When `NEXT_PUBLIC_E2E_TEST_MODE=1` is set, the app disables all subgraph queries and uses direct RPC reads (contract calls + event logs) for every data surface. This eliminates the Docker/graph-node dependency for e2e testing.
- **Local Anvil** is the only backend. Tests interact with contracts deployed to `127.0.0.1:8545`.
- **Privy embedded wallet** (primary): when `NEXT_PUBLIC_PRIVY_APP_ID` is set, the Playwright `globalSetup` logs in with a Privy test account, auto-creates an embedded wallet, funds it, and transfers contract ownership. All transactions are auto-signed by the embedded wallet — no MetaMask or browser extension needed.
- **Mock connector** (fallback): when no Privy app ID is set, the legacy wagmi `mock` connector with the Anvil deployer account is used instead.

## Scope

- Real UI interactions in Chromium via Playwright.
- Real contract writes against local Anvil deployments.
- Oracle price movement is the only synthetic market input (submitted onchain through the admin Assets page at `/admin/oracle`).
- No frontend/API request stubs for basket/perp/pool transaction flows.
- All data reads go through direct RPC fallbacks (no subgraph, no GraphQL).

## Local Run (with Privy)

1. Enable test accounts in the Privy dashboard (**User management > Authentication > Advanced**).
2. Add credentials to `apps/web/.env.local`:

```env
NEXT_PUBLIC_PRIVY_APP_ID=your-app-id
PRIVY_TEST_EMAIL=test-XXXX@privy.io
PRIVY_TEST_OTP=XXXXXX
```

3. Start Anvil, deploy contracts, run tests:

```bash
anvil --host 127.0.0.1 --port 8545
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 npm run deploy:local
NEXT_PUBLIC_E2E_TEST_MODE=1 E2E_RPC_URL=http://127.0.0.1:8545 npm run test:e2e:ci
```

The `globalSetup` will log in with the test account, create the embedded wallet, fund it with ETH + USDC, and transfer ownership of all deployed contracts.

## Local Run (without Privy)

If `NEXT_PUBLIC_PRIVY_APP_ID` is not set, tests fall back to the wagmi mock connector:

```bash
anvil --host 127.0.0.1 --port 8545
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 npm run deploy:local
NEXT_PUBLIC_E2E_TEST_MODE=1 E2E_RPC_URL=http://127.0.0.1:8545 npm run test:e2e:ci
```

No Docker, graph-node, or subgraph deployment is needed.

## CI Run

`test.yml` includes an `e2e` job that:

- installs Playwright Chromium,
- starts Anvil (bare process, no Docker),
- runs `deploy:local` to deploy contracts,
- runs `test:e2e:ci` with:
  - `NEXT_PUBLIC_E2E_TEST_MODE=1` — forces anvil target and disables subgraph
  - `E2E_RPC_URL=http://127.0.0.1:8545` — RPC endpoint for Playwright helpers
  - `NEXT_PUBLIC_PRIVY_APP_ID` / `PRIVY_TEST_EMAIL` / `PRIVY_TEST_OTP` (from GitHub secrets) — enables Privy embedded-wallet auth
- uploads Playwright artifacts on failure.

## Privy Global Setup Flow

When Privy credentials are available, `e2e/global-setup.ts` runs before all tests:

1. Launches a headless Chromium browser.
2. Navigates to the app and clicks "Log in" (Privy modal).
3. Enters the test email and OTP to authenticate.
4. Waits for the embedded wallet to connect.
5. Reads the wallet address from the header DOM (`data-address` attribute).
6. Funds the wallet: 100 ETH (for gas) + 100k USDC.
7. Transfers ownership of all deployed contracts (`transferOwnership`) and GMX vault governance (`setGov`) from the Anvil deployer to the embedded wallet.
8. Saves Playwright `storageState` to `e2e/.auth/privy-state.json` — subsequent tests reuse this session without re-logging in.
9. Writes the wallet address to `e2e/.auth/wallet-address.json` for test helpers.

## Data Sources in E2E Mode

When `NEXT_PUBLIC_E2E_TEST_MODE=1`, `getSubgraphUrlForTarget()` always returns `null`, so `isSubgraphEnabled` is `false` for every deployment target. All hooks that normally prefer subgraph data will use their RPC fallback paths:

| Surface | RPC fallback |
|---------|-------------|
| Basket list | `BasketFactory.getAllBaskets` + `PerpReader.getBasketInfoBatch` |
| Basket trends | Historical `readContract` at sampled blocks |
| Share price chart | Multi-block `getSharePrice` sampling |
| Oracle price history | `PriceUpdated` event logs |
| Portfolio holdings | `balanceOf` per share token + deposit/redeem log scan |
| Basket activity | `BasketVault` / `VaultAccounting` event logs |

## Wallet Connection

### Privy path (recommended)

- **Provider**: `PrivyWeb3ProviderInner` in `Web3Provider.tsx` — used when `NEXT_PUBLIC_PRIVY_APP_ID` is set.
- **Auth**: Privy test-account email + OTP in `globalSetup`.
- **Signing**: Privy embedded wallet auto-signs all transactions (no popups).
- **Session**: `storageState` persists the authenticated session across tests.

### Mock connector path (legacy fallback)

- **Config**: `apps/web/src/config/wagmi.ts` — `e2eConfig` with mock connector, single Anvil chain, account `0xf39f...2266`.
- **Auto-connect**: `AutoConnectE2EWallet` in `Web3Provider.tsx` connects on mount.
- **Manual fallback**: Header "E2E Connect" button (`data-testid="e2e-connect-wallet"`) — only visible when Privy is not configured.

## Cross-Chain E2E with Envio

For testing cross-chain routing with Envio indexing, run dual Anvil instances with the Envio dev server:

### Local Setup

1. Start two Anvil instances:

```bash
# Terminal 1: Hub chain (chain ID 31337)
anvil --host 127.0.0.1 --port 8545 --chain-id 31337

# Terminal 2: Spoke chain (chain ID 31338)
anvil --host 127.0.0.1 --port 8546 --chain-id 31338
```

2. Deploy contracts to both chains:

```bash
# Deploy hub contracts
CHAIN=local npm run deploy:local

# Deploy spoke contracts
CHAIN=local-spoke forge script script/DeploySpoke.s.sol:DeploySpoke --rpc-url http://127.0.0.1:8546 --broadcast
```

3. Start Envio dev server:

```bash
cd apps/envio
npm run dev:local
```

4. Run cross-chain tests:

```bash
NEXT_PUBLIC_E2E_TEST_MODE=1 \
NEXT_PUBLIC_ENVIO_URL=http://127.0.0.1:8080/v1/graphql \
E2E_HUB_RPC_URL=http://127.0.0.1:8545 \
E2E_SPOKE_RPC_URL=http://127.0.0.1:8546 \
E2E_HUB_CHAIN_ID=31337 \
E2E_SPOKE_CHAIN_ID=31338 \
npx --prefix apps/web playwright test --grep "cross-chain|Envio"
```

### Cross-Chain Test Coverage

The Envio cross-chain E2E suite is split into two spec files:

**`envio-cross-chain.spec.ts`** — Core indexing verification:
- **Envio indexing**: Verifies baskets are indexed from both hub and spoke chains
- **StateRelay routing**: Tests routing weight indexing via `keeperPostWeights` helper
- **Multi-chain deposit UI**: Tests the routing breakdown drawer
- **Portfolio aggregation**: Verifies TVL aggregates across chains
- **User position aggregation**: Tests user position queries across chains

**`envio-comprehensive.spec.ts`** — Withdrawal, admin, and UI verification:
- **Redemption flows**: Tests deposit-then-redeem flow with balance verification
- **Max redeem**: Verifies share balance display in max button
- **Chains tab**: Tests `/chains` page metrics and routing state display
- **TVL verification**: Checks basket detail shows correct TVL after deposit
- **Balance updates**: Verifies share balance updates in UI after deposits
- **Fee display**: Tests that fee percentages are shown correctly
- **Envio data consistency**: Verifies Envio basket data matches UI display
- **Deposit count tracking**: Confirms Envio indexes deposit transactions

**`price-apy-pnl.spec.ts`** — Price keepers, APY, and profit verification:
- **Oracle price submission**: Tests admin oracle page price submission via UI
- **Price reflection**: Verifies prices appear in `/prices` page after keeper updates
- **APY display**: Tests APY metric visibility in basket detail and list views
- **Unrealized PnL**: Verifies unrealized PnL metrics in basket detail when positions exist
- **Net PnL**: Tests net PnL display for registered baskets
- **Position PnL**: Verifies individual position PnL in positions table
- **Price change effects**: Tests that price updates reflect in unrealized PnL
- **Share price/TVL consistency**: Verifies share price and TVL metric display

### CI Integration

The `cross_chain_e2e` job in `.github/workflows/test.yml`:

- Starts dual Anvil instances (8545 + 8546)
- Deploys hub and spoke contracts
- Generates Envio local config with deployed addresses
- Starts Envio dev server
- Runs Playwright tests with Envio GraphQL endpoint

## Coverage Target

Playwright helpers assume the local deploy registers **`BHP.AX`** as the sole oracle index asset (`BHP_ASSET_ID` in `apps/web/e2e/helpers.ts`).

Current lifecycle coverage includes:

- smoke/UI navigation,
- admin basket create/manage,
- admin assets (oracle) submit/sync,
- user deposit,
- perp allocate/open/close,
- user redeem,
- admin pool buffer/deposit writes,
- net-profit assertion (`final USDC > initial USDC`) after profitable lifecycle.
