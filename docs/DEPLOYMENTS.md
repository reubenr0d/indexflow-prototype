# Deployment Registry

Canonical deployment references for Sepolia contracts, subgraph indexing, and push-notification infrastructure.

Last updated: 2026-04-10

## Deployment surfaces (production)

| Surface | Runtime | Purpose | Canonical source |
| --- | --- | --- | --- |
| Contracts | Ethereum Sepolia (`11155111`) | Onchain basket/perp protocol state and transactions | `apps/web/src/config/sepolia-deployment.json` |
| Subgraph | The Graph Studio (Sepolia-indexed) | Indexed read model for web and push-trigger scans | `NEXT_PUBLIC_SUBGRAPH_URL` (web) and `SUBGRAPH_URL` (push worker) |
| Push worker | Google Cloud Run + Cloud Scheduler + Firestore | Web Push subscription, preferences, dispatch, and digest delivery | `.github/workflows/deploy-production.yml` + GCP secrets |

Google Cloud resources in this repo are used only for serverless push notifications. They are not used for contract deployment, execution, or oracle keeper writes.

## Network summary

| Network | Chain ID | Status | Config source |
| --- | --- | --- | --- |
| Local (Anvil) | `31337` | Deployed | `apps/web/src/config/local-deployment.json` |
| Ethereum Sepolia | `11155111` | Deployed + verified | `apps/web/src/config/sepolia-deployment.json` |
| Arbitrum One | `42161` | Not deployed in this repo snapshot | N/A |
| Arbitrum Sepolia | `421614` | Not deployed in this repo snapshot | N/A |

## Sepolia contracts (primary chain deployment)

Config file: `apps/web/src/config/sepolia-deployment.json`

Purpose: canonical contract addresses used by the production web app for Sepolia interactions.

## Local (Anvil)

Config file: `apps/web/src/config/local-deployment.json`

Runtime note: the web app maps `anvil` to local deployment addresses, persists the selected target in browser `localStorage`, and keeps it aligned with the wallet chain selector in the connect button.

Subgraph note: when `NEXT_PUBLIC_SUBGRAPH_URL` is configured, the app enables subgraph reads for both `anvil` and `sepolia`.
If the subgraph URL is unset, unavailable, or returns unusable rows, the app falls back to RPC data paths.

- `basketFactory`: `0xD5ac451B0c50B9476107823Af206eD814a2e2580`
- `vaultAccounting`: `0x7A9Ec1d04904907De0ED7b6839CcdD59c3716AC9`
- `oracleAdapter`: `0xfbC22278A96299D91d41C453234d97b4F5Eb9B2d`
- `perpReader`: `0x720472c8ce72c2A2D711333e064ABD3E6BbEAdd3`
- `pricingEngine`: `0x86A2EE8FAf9A840F7a2c64CA3d51209F9A02081D`
- `fundingRateManager`: `0xA4899D35897033b927acFCf422bc745916139776`
- `priceSync`: `0xe8D2A1E88c91DCd5433208d4152Cc4F399a7e91d`
- `usdc`: `0xcbEAF3BDe82155F56486Fb5a1072cb8baAf547cc`
- `gmxVault`: `0x04C89607413713Ec9775E14b954286519d836FEf`

## Ethereum Sepolia address registry

- Deployment sender (latest successful run): `0x36716c8c5D1AE680C78bD0eCC230896556399713`
- Broadcast status: `ONCHAIN EXECUTION COMPLETE & SUCCESSFUL`
- Verification status: all 16 contracts verified on Etherscan
- Deployment block: `10630646`

Addresses:

- `basketFactory`: `0x109e0A03011d7c4c54a7073a828a07FfF2868304`  
  https://sepolia.etherscan.io/address/0x109e0A03011d7c4c54a7073a828a07FfF2868304
- `vaultAccounting`: `0x8C6B61ADfe35B1B0609D905650420F3A00f813Aa`  
  https://sepolia.etherscan.io/address/0x8C6B61ADfe35B1B0609D905650420F3A00f813Aa
- `oracleAdapter`: `0xBeB2E04850d1E306eb52EfC69d9B6f1550F10195`  
  https://sepolia.etherscan.io/address/0xBeB2E04850d1E306eb52EfC69d9B6f1550F10195
- `perpReader`: `0xDb7e9F905a73C4d81d26d0C2550FfFa70F4258B8`  
  https://sepolia.etherscan.io/address/0xDb7e9F905a73C4d81d26d0C2550FfFa70F4258B8
- `pricingEngine`: `0x81C1Fe4e8327EfD8acF0b557634485382154C02c`  
  https://sepolia.etherscan.io/address/0x81C1Fe4e8327EfD8acF0b557634485382154C02c
- `fundingRateManager`: `0x05AedC382F0C0EfD4E3CBa4b3B2e039ed87BB23D`  
  https://sepolia.etherscan.io/address/0x05AedC382F0C0EfD4E3CBa4b3B2e039ed87BB23D
- `priceSync`: `0x15ebFD9aF9f9a011ea2cD25C9C02627B960114f0`  
  https://sepolia.etherscan.io/address/0x15ebFD9aF9f9a011ea2cD25C9C02627B960114f0
- `usdc`: `0x8E8056412447BFf11b693263bef80B9a046f53fB`  
  https://sepolia.etherscan.io/address/0x8E8056412447BFf11b693263bef80B9a046f53fB
- `gmxVault`: `0x99B0Ff40C7d6CBcaEf167532e09191CA23384f7b`  
  https://sepolia.etherscan.io/address/0x99B0Ff40C7d6CBcaEf167532e09191CA23384f7b
- `assetWiring`: `0x7CD4d8a5E928BE091f8e652bc9D0F9E07874b90C`  
  https://sepolia.etherscan.io/address/0x7CD4d8a5E928BE091f8e652bc9D0F9E07874b90C

### Coordination layer (Sepolia, deployed 2026-04-15)

Deployed via `script/DeployCoordination.s.sol` on top of the existing Sepolia stack. All contracts verified on Etherscan.

- `poolReserveRegistry`: `0x970F75182913195D3594822DD456cD710E5C42B0`  
  https://sepolia.etherscan.io/address/0x970F75182913195D3594822DD456cD710E5C42B0
- `ccipReserveMessenger`: `0x2350D1689eD1A8a4654Ef45Fe5d25Bd5f432116a`  
  https://sepolia.etherscan.io/address/0x2350D1689eD1A8a4654Ef45Fe5d25Bd5f432116a
- `intentRouter` (ERC1967 proxy): `0x1198Cde5Abe79E3aB67981Cd9352D5a0d480F556`  
  https://sepolia.etherscan.io/address/0x1198Cde5Abe79E3aB67981Cd9352D5a0d480F556
- `intentRouter` (implementation): `0x482d0530B1b1d6f49d5FC733a321E615B53CB711`  
  https://sepolia.etherscan.io/address/0x482d0530B1b1d6f49d5FC733a321E615B53CB711
- `crossChainIntentBridge`: `0xad177ecAd0C6Ac73Daa46264097ff7ff9b887F27`  
  https://sepolia.etherscan.io/address/0xad177ecAd0C6Ac73Daa46264097ff7ff9b887F27
- `oracleConfigQuorum`: `0x762C7080D391f9169cdeeD93c65Ad5016D67701A` *(pre-quorum deployment; address will change on redeploy)*  
  https://sepolia.etherscan.io/address/0x762C7080D391f9169cdeeD93c65Ad5016D67701A

Configuration: TWAP window 30 min, min snapshot interval 5 min, max staleness 1 hour, broadcast threshold 5%, max escrow duration 2 hours, min intent 100 USDC, CCIP fee token LINK (`0x779877A7B0D9E8603169DdbD7836e478b4624789`), chain selector `16015286601757825753`.

## Subgraph deployment (Sepolia indexed)

Runtime: The Graph Studio

Purpose: indexed query layer used by:

- web app read paths (`NEXT_PUBLIC_SUBGRAPH_URL`)
- push-worker trigger scans (`SUBGRAPH_URL`)

Canonical workflow:

```bash
# authenticate once
npx graph auth <DEPLOY_KEY>

# deploy sepolia-indexed subgraph
NETWORK=sepolia SUBGRAPH_SLUG=<your-slug> npm --prefix apps/subgraph run deploy
```

After deploy:

- set web app `NEXT_PUBLIC_SUBGRAPH_URL` to the Studio query URL (Vercel + local env as needed)
- set push worker `SUBGRAPH_URL` to the same or equivalent production query URL

## Google Cloud deployment (push notifications only)

Runtime components:

- Cloud Run service (`apps/push-worker`)
- Cloud Scheduler jobs (`realtime` and `digest` dispatch)
- Firestore collections (`subscriptions`, `preferences`, `dispatch_state`, `dispatch_log`)

Purpose boundary:

- Accept push subscriptions and preference updates
- Evaluate trigger/digest jobs and send Web Push via VAPID
- Persist push-only state (preference + dedupe/cursor logs)
- No contract deployment/verification responsibilities
- No replacement of onchain execution or deploy scripts

CI deployment path:

- `.github/workflows/deploy-production.yml` deploys Cloud Run from `main`
- same workflow reconciles Scheduler jobs and runs push health smoke checks

## How to refresh

- Local (Docker Compose workflow):
  - First time: `npm run local:up` (starts Docker infra + deploys contracts + subgraph)
  - Start UI: `npm run local:dev` (Next.js dev server on host, hot reloads)
  - Redeploy after code changes: `npm run redeploy:local` (re-deploys contracts + subgraph; UI picks up new addresses via HMR)
  - Teardown/reset volumes: `npm run local:down`
  - Standalone contract-only deploy (bare Anvil, no Docker): `npm run deploy:local`
- Sepolia:
  - `npm run deploy:sepolia` (same Yahoo seed behavior; optional `SEED_PRICE_RAW` override)
  - Optional verify pass:
    - `forge script script/DeploySepolia.s.sol:DeploySepolia --rpc-url sepolia --private-key $PRIVATE_KEY --broadcast --resume --verify -vvv`

Then update this file from:

- `apps/web/src/config/local-deployment.json`
- `apps/web/src/config/sepolia-deployment.json`
- active Subgraph Studio query URL (for current production slug/version)
- Cloud Run service URL and Scheduler job names (if changed)
