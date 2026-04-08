# E2E Testing (Playwright + Anvil)

This repo includes a browser E2E suite for the web app with real onchain writes on local Anvil.

## Scope

- Real UI interactions in Chromium via Playwright.
- Real contract writes against local Anvil deployments.
- Oracle price movement is the only synthetic market input (submitted onchain through admin/oracle flow).
- No frontend/API request stubs for basket/perp/pool transaction flows.

## Local Run

1. Start Anvil (`31337`).
2. Deploy local contracts.
3. Run E2E suite with test mode enabled.

```bash
anvil --host 127.0.0.1 --port 8545
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 npm run deploy:local
NEXT_PUBLIC_E2E_TEST_MODE=1 E2E_RPC_URL=http://127.0.0.1:8545 npm run test:e2e:ci
```

## CI Run

`test.yml` includes an `e2e` job that:

- installs Playwright Chromium,
- starts Anvil,
- runs `deploy:local`,
- runs `test:e2e:ci` with:
  - `NEXT_PUBLIC_E2E_TEST_MODE=1`
  - `E2E_RPC_URL=http://127.0.0.1:8545`
- uploads Playwright artifacts on failure.

## Coverage Target

Current lifecycle coverage includes:

- smoke/UI navigation,
- admin basket create/manage,
- admin oracle submit/sync,
- user deposit,
- perp allocate/open/close,
- user redeem,
- admin pool buffer/deposit writes,
- net-profit assertion (`final USDC > initial USDC`) after profitable lifecycle.
