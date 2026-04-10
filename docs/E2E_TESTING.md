# E2E Testing (Playwright + Anvil)

This repo includes a browser E2E suite for the web app with real onchain writes on local Anvil.

## Architecture

- **No subgraph required.** When `NEXT_PUBLIC_E2E_TEST_MODE=1` is set, the app disables all subgraph queries and uses direct RPC reads (contract calls + event logs) for every data surface. This eliminates the Docker/graph-node dependency for e2e testing.
- **Local Anvil** is the only backend. Tests interact with contracts deployed to `127.0.0.1:8545`.
- **Wallet connection** uses wagmi's `mock` connector with the first Anvil pre-funded account (`0xf39f...2266`). The `AutoConnectE2EWallet` provider auto-connects on page load; the header shows an "E2E Connect" button as a manual fallback.

## Scope

- Real UI interactions in Chromium via Playwright.
- Real contract writes against local Anvil deployments.
- Oracle price movement is the only synthetic market input (submitted onchain through the admin Assets page at `/admin/oracle`).
- No frontend/API request stubs for basket/perp/pool transaction flows.
- All data reads go through direct RPC fallbacks (no subgraph, no GraphQL).

## Local Run

1. Start Anvil (`31337`).
2. Deploy local contracts.
3. Run E2E suite with test mode enabled.

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
  - `NEXT_PUBLIC_E2E_TEST_MODE=1` — forces anvil target, mock wallet, and disables subgraph
  - `E2E_RPC_URL=http://127.0.0.1:8545` — RPC endpoint for Playwright helpers
- uploads Playwright artifacts on failure.

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

E2E mode uses wagmi's `mock` connector (not MetaMask or Privy):

- **Config**: `apps/web/src/config/wagmi.ts` — `e2eConfig` with mock connector, single Anvil chain, account `0xf39f...2266`.
- **Auto-connect**: `AutoConnectE2EWallet` in `Web3Provider.tsx` connects on mount.
- **Manual fallback**: Header "E2E Connect" button (`data-testid="e2e-connect-wallet"`) uses the first available connector.
- **Test helper**: `connectWallet(page)` in `e2e/helpers.ts` clicks the connect button if visible.

## Coverage Target

Playwright helpers assume the local deploy registers **`BHP`** as the sole oracle index asset (`BHP_ASSET_ID` in `apps/web/e2e/helpers.ts`).

Current lifecycle coverage includes:

- smoke/UI navigation,
- admin basket create/manage,
- admin assets (oracle) submit/sync,
- user deposit,
- perp allocate/open/close,
- user redeem,
- admin pool buffer/deposit writes,
- net-profit assertion (`final USDC > initial USDC`) after profitable lifecycle.
