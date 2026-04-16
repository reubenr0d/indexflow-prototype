# Deployment Registry

Canonical deployment references for Sepolia contracts, subgraph indexing, and push-notification infrastructure.

Last updated: 2026-04-17

## Deployment surfaces (production)

| Surface | Runtime | Purpose | Canonical source |
| --- | --- | --- | --- |
| Hub contracts | Ethereum Sepolia (`11155111`) | Full basket/perp protocol: BasketVault, VaultAccounting, GMX pool, OracleAdapter, StateRelay | `apps/web/src/config/sepolia-deployment.json` |
| Spoke contracts | Avalanche Fuji (`43113`), and future spokes | Deposit-only: BasketVault, BasketFactory, StateRelay, RedemptionReceiver (no perp module) | `apps/web/src/config/fuji-deployment.json` |
| Keeper service | Node.js (self-hosted or Cloud Run) | Epoch loop: routing weights + PnL adjustments posted to StateRelay on every chain | `services/keeper/` |
| Subgraph | The Graph Studio (per-chain) | Indexed read model for web and push-trigger scans | `NEXT_PUBLIC_SUBGRAPH_URL_{SEPOLIA,FUJI}` (web) and `SUBGRAPH_URL` (push worker) |
| Push worker | Google Cloud Run + Cloud Scheduler + Firestore | Web Push subscription, preferences, dispatch, and digest delivery | `.github/workflows/deploy-production.yml` + GCP secrets |

Google Cloud resources in this repo are used only for serverless push notifications. They are not used for contract deployment, execution, or oracle keeper writes.

## Hub vs spoke deployment topology

The protocol uses a **hub-and-spoke** architecture defined in `config/chains.json`:

| Chain | Role | Chain ID | Perp module | StateRelay | RedemptionReceiver |
| --- | --- | --- | --- | --- | --- |
| Sepolia | **Hub** | `11155111` | Yes (VaultAccounting, GMX pool, OracleAdapter, PriceSync, etc.) | Yes | No (hub bridges USDC outbound) |
| Fuji | **Spoke** | `43113` | No | Yes | Yes |
| Arbitrum Sepolia | **Spoke** (planned) | `421614` | No | Yes | Yes |

Hub deployments use `Deploy.s.sol` (full stack). Spoke deployments use `DeploySpoke.s.sol` (minimal deposit-only stack). The `deploy-all.sh` script reads `config/chains.json` and selects the correct deploy script per chain role.

### Contracts deployed per chain type

| Contract | Hub | Spoke | Deploy script |
| --- | --- | --- | --- |
| MockUSDC (or real USDC) | Yes | Yes | Both |
| `BasketFactory` | Yes (with oracle) | Yes (no oracle — `address(0)`) | Both |
| `BasketVault` / `BasketShareToken` | Yes (wired to VaultAccounting) | Yes (`vaultAccounting = address(0)`) | Created by factory |
| `StateRelay` | Yes | Yes | `Deploy.s.sol` / `DeploySpoke.s.sol` |
| `VaultAccounting` | Yes | No | `Deploy.s.sol` only |
| `OracleAdapter` | Yes | No | `Deploy.s.sol` only |
| `PricingEngine` | Yes | No | `Deploy.s.sol` only |
| `FundingRateManager` | Yes | No | `Deploy.s.sol` only |
| `PriceSync` | Yes | No | `Deploy.s.sol` only |
| `PerpReader` | Yes | No | `Deploy.s.sol` only |
| `AssetWiring` | Yes | No | `Deploy.s.sol` only |
| GMX fork (Vault, Router, etc.) | Yes | No | `Deploy.s.sol` only |
| `RedemptionReceiver` | No | Yes | Wired post-deploy |
| `PoolReserveRegistry` (legacy) | Yes | No | `DeployCoordination.s.sol` |

Spoke deployment configs (`apps/web/src/config/<chain>-deployment.json`) contain only `basketFactory`, `stateRelay`, and `usdc`. Hub configs include the full perp stack plus coordination contracts.

## Network summary

| Network | Chain ID | Role | Status | Config source |
| --- | --- | --- | --- | --- |
| Local (Anvil) | `31337` | Hub | Deployed | `apps/web/src/config/local-deployment.json` |
| Ethereum Sepolia | `11155111` | **Hub** | Deployed (2026-04-16) | `apps/web/src/config/sepolia-deployment.json` |
| Avalanche Fuji | `43113` | **Spoke** | Deployed (2026-04-16) | `apps/web/src/config/fuji-deployment.json` |
| Arbitrum One | `42161` | — | Not deployed in this repo snapshot | N/A |
| Arbitrum Sepolia | `421614` | Spoke (planned) | Not deployed in this repo snapshot | N/A |

## Sepolia contracts (hub chain deployment)

Config file: `apps/web/src/config/sepolia-deployment.json`

Purpose: canonical contract addresses used by the production web app for Sepolia interactions.

## Local (Anvil)

Config file: `apps/web/src/config/local-deployment.json`

Runtime note: the web app maps `anvil` to local deployment addresses, persists the selected target in browser `localStorage`, and keeps it aligned with the wallet chain selector in the connect button.

Subgraph note: per-chain subgraph URLs (`NEXT_PUBLIC_SUBGRAPH_URL_SEPOLIA`, `NEXT_PUBLIC_SUBGRAPH_URL_FUJI`) take precedence; `NEXT_PUBLIC_SUBGRAPH_URL` is the fallback for chains without a dedicated URL. If no URL is available for a chain, the app falls back to RPC data paths. The "All Chains" view in the network selector aggregates data from all configured chain subgraphs in parallel.

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

- Deployment sender: `0x36716c8c5D1AE680C78bD0eCC230896556399713`
- Broadcast status: `ONCHAIN EXECUTION COMPLETE & SUCCESSFUL`
- Deployed: 2026-04-16

Addresses:

- `basketFactory`: `0x0A71D2264731822f12B4591791460409A8dAF736`  
  https://sepolia.etherscan.io/address/0x0A71D2264731822f12B4591791460409A8dAF736
- `vaultAccounting`: `0x85e1b14665077aFc90A9800c38ecb5Fdbaf386d9`  
  https://sepolia.etherscan.io/address/0x85e1b14665077aFc90A9800c38ecb5Fdbaf386d9
- `oracleAdapter`: `0x64e9ce2Aa73e4834298291fd318396B5b610D4de`  
  https://sepolia.etherscan.io/address/0x64e9ce2Aa73e4834298291fd318396B5b610D4de
- `perpReader`: `0x000E344Ea3d224d3b4362f141D28e5A9C86F58a5`  
  https://sepolia.etherscan.io/address/0x000E344Ea3d224d3b4362f141D28e5A9C86F58a5
- `pricingEngine`: `0x76417d99bD00dA3788440b0a9103904e0D09eE51`  
  https://sepolia.etherscan.io/address/0x76417d99bD00dA3788440b0a9103904e0D09eE51
- `fundingRateManager`: `0x393B7199cfD9bCf2b97fD16AA7c1DE25Cce0a994`  
  https://sepolia.etherscan.io/address/0x393B7199cfD9bCf2b97fD16AA7c1DE25Cce0a994
- `priceSync`: `0xC418847161e7087E3302eFFe5f5325d8E3B0fD68`  
  https://sepolia.etherscan.io/address/0xC418847161e7087E3302eFFe5f5325d8E3B0fD68
- `usdc`: `0x91896C7AD50c9f09A0D197Ed54860f94c5253c6e`  
  https://sepolia.etherscan.io/address/0x91896C7AD50c9f09A0D197Ed54860f94c5253c6e
- `gmxVault`: `0xc70f8762901cb6a0530cDFBBbB32A641aBF06A92`  
  https://sepolia.etherscan.io/address/0xc70f8762901cb6a0530cDFBBbB32A641aBF06A92
- `assetWiring`: `0xB9B1A15D0200aBB069d18d3dE99bdc35ec6C6931`  
  https://sepolia.etherscan.io/address/0xB9B1A15D0200aBB069d18d3dE99bdc35ec6C6931

### Coordination layer (Sepolia, deployed 2026-04-16)

- `poolReserveRegistry`: `0x74E6781dDa5a0D98f8BB55aBf1Bd12B42666af76`  
  https://sepolia.etherscan.io/address/0x74E6781dDa5a0D98f8BB55aBf1Bd12B42666af76
- `ccipReserveMessenger`: `0x902d11Abdf1BF2bb8f930833d4f266Af42CAFD60`  
  https://sepolia.etherscan.io/address/0x902d11Abdf1BF2bb8f930833d4f266Af42CAFD60
- `intentRouter` (ERC1967 proxy): `0x231a1E2Bbe35a1B1b19F865a97E2250c64d8F7a5`  
  https://sepolia.etherscan.io/address/0x231a1E2Bbe35a1B1b19F865a97E2250c64d8F7a5
- `intentRouter` (implementation): `0xa947eEa1DD83853c035ea1745DcC3D133792ebFF`  
  https://sepolia.etherscan.io/address/0xa947eEa1DD83853c035ea1745DcC3D133792ebFF
- `crossChainIntentBridge`: `0x20c20889815E89b43400c330955C100Cea480eAd`  
  https://sepolia.etherscan.io/address/0x20c20889815E89b43400c330955C100Cea480eAd
- `oracleConfigQuorum`: `0xd8D301955Aeba52b81ed83A40F5571812C2C76e9`  
  https://sepolia.etherscan.io/address/0xd8D301955Aeba52b81ed83A40F5571812C2C76e9

Configuration: TWAP window 30 min, min snapshot interval 5 min, max staleness 1 hour, broadcast threshold 5%, max escrow duration 2 hours, min intent 100 USDC, CCIP fee token LINK (`0x779877A7B0D9E8603169DdbD7836e478b4624789`), chain selector `16015286601757825753`.

Cross-chain peers: Fuji (selector `14767482510784806043`) wired bidirectionally.

### StateRelay (Sepolia, hub)

The hub `StateRelay` receives keeper-posted routing weights and per-vault global PnL adjustments. Address is recorded in the deployment config as `stateRelay` once deployed.

> **Note:** `stateRelay` and `redemptionReceiver` addresses are added to deployment JSONs by the `DeploySpoke.s.sol` / `DeployCoordination.s.sol` scripts. If not yet present in the config file, they were deployed in a separate broadcast.

## Avalanche Fuji address registry (spoke)

- Deployment sender: `0x36716c8c5D1AE680C78bD0eCC230896556399713`
- Broadcast status: `ONCHAIN EXECUTION COMPLETE & SUCCESSFUL`
- Deployed: 2026-04-16
- Chain selector: `14767482510784806043`
- Cross-chain peers: Sepolia (selector `16015286601757825753`) wired bidirectionally

**Spoke role:** Fuji is a deposit-only spoke. Active spoke contracts are `BasketFactory`, `BasketVault` (created by factory), `StateRelay`, and `RedemptionReceiver`. There is **no** active `VaultAccounting`, GMX pool, or perp infrastructure on this chain. Deposit routing and NAV adjustments are driven by `StateRelay`, and cross-chain redemption fills arrive via `RedemptionReceiver`.

### Active spoke contracts

- `basketFactory`: `0x5Fe782E55250C3A2E62F88FE13c5F44e70f9058B`
- `usdc`: `0xdE808A7465d990D514d5e8e0Af4D8b900440F043`

> **Note:** `stateRelay` and `redemptionReceiver` addresses are added to the deployment JSON by `DeploySpoke.s.sol` / `DeployCoordination.s.sol`. If not present in the config file, they were deployed in a separate broadcast. Future spoke deployments via `DeploySpoke.s.sol` will produce a minimal config with only `basketFactory`, `stateRelay`, and `usdc`.

### Legacy full-stack contracts (not used by spoke vaults)

The initial Fuji deployment used `Deploy.s.sol` (full stack) before the hub-spoke distinction was formalized. The following contracts exist on-chain but are **not wired** to spoke vaults and are not operationally active:

- `vaultAccounting`: `0x32E2A385aA9540d5119ceAA2Ecf4FD97a1e002e0`
- `oracleAdapter`: `0x0E07EA10A1fF1412B9D93F7A38b6498eDaAcf419`
- `perpReader`: `0xdF4977C4c1128E4f5f9079DC8C1F02503C36a55b`
- `pricingEngine`: `0x071f63b036771711A38B3173B634E823429e26bE`
- `fundingRateManager`: `0x5f2538b39d71bf3525E78F8E0E470b7171616339`
- `priceSync`: `0x3994e822C29753f30Dde33Da382abDEc86284434`
- `gmxVault`: `0x6aE8Fdd35CFc0A254635114C835199b51DD27320`
- `assetWiring`: `0x006A1cbD2fD82BfA78deFFfc2A960E080cd57132`

### Legacy coordination layer (Fuji)

- `poolReserveRegistry`: `0x9140E4212C1934399cEc160B2334580f6aD5C474`
- `ccipReserveMessenger`: `0x609C888353aebEc4C4971a5d05Af4e92a94b1cAA`
- `intentRouter` (ERC1967 proxy): `0xeD4d7c06d0ff68647f29a4e4224Fe93c6178eE06`
- `intentRouter` (implementation): `0xfB41a68116B79488F6932E1E2c1c5619387223FC`
- `crossChainIntentBridge`: `0x3a99A1B72d26F8E2C73700B1e41C39CF943Bb986`
- `oracleConfigQuorum`: `0x1D4f7B04CeF73849f33Ea0F87c67f876B09bd36D`

Configuration: TWAP window 30 min, min snapshot interval 5 min, max staleness 1 hour, broadcast threshold 5%, max escrow duration 2 hours, min intent 100 USDC, CCIP fee token LINK (`0x0b9d5D9136855f6FEc3c0993feE6E9CE8a297846`).

## Subgraph deployment (Sepolia indexed)

Runtime: The Graph Studio

Purpose: indexed query layer used by:

- web app read paths (`NEXT_PUBLIC_SUBGRAPH_URL_{SEPOLIA,FUJI}` or fallback `NEXT_PUBLIC_SUBGRAPH_URL`)
- push-worker trigger scans (`SUBGRAPH_URL`)

Canonical workflow:

```bash
# authenticate once
npx graph auth <DEPLOY_KEY>

# deploy sepolia-indexed subgraph
NETWORK=sepolia SUBGRAPH_SLUG=<your-slug> npm --prefix apps/subgraph run deploy
```

After deploy:

- set web app per-chain subgraph URLs (`NEXT_PUBLIC_SUBGRAPH_URL_SEPOLIA`, `NEXT_PUBLIC_SUBGRAPH_URL_FUJI`) or fallback `NEXT_PUBLIC_SUBGRAPH_URL` to the Studio query URLs (Vercel + local env as needed)
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

## Adding a new spoke chain

To add a new spoke chain to the protocol:

1. Add an entry to `config/chains.json` with `"role": "spoke"` and the chain's CCIP router, selector, LINK token, etc.
2. Add an RPC alias in `foundry.toml` under `[rpc_endpoints]`.
3. Run the deployment:

```bash
./scripts/deploy-all.sh --chain <chain-name>
```

This will:
- Deploy `BasketVault`, `BasketFactory`, `StateRelay`, and `RedemptionReceiver` using `DeploySpoke.s.sol`.
- Write the deployment config to `apps/web/src/config/<chain-name>-deployment.json`.
- The keeper service will automatically pick up the new chain on next restart (reads from `config/chains.json`).

After deployment, wire the `RedemptionReceiver`'s trusted sender to the hub's keeper address so cross-chain redemption fills can flow.

## How to deploy

### Multi-chain deployment (recommended)

`deploy-all.sh` reads `config/chains.json` and deploys every chain using the correct Forge script based on its `role`:

- **Hub** chains (`"role": "hub"`) → `script/Deploy.s.sol` (full perp stack + coordination)
- **Spoke** chains (`"role": "spoke"`) → `script/DeploySpoke.s.sol` (USDC + BasketFactory + StateRelay only)

```bash
# Deploy all chains defined in config/chains.json
./scripts/deploy-all.sh

# Deploy a single chain
./scripts/deploy-all.sh --chain fuji

# Preview without broadcasting
./scripts/deploy-all.sh --dry-run
```

The script prints a summary showing hub/spoke counts and success/failure per chain.

### Single-chain deployment (hub)

Hub chains deploy the full stack including GMX fork, oracle, perp layer, coordination, and basket factory:

```bash
# Deploy hub base stack
CHAIN=sepolia npm run deploy:sepolia

# Coordination layer (legacy, requires base stack deployed first)
CHAIN=sepolia TREASURY=0x... npm run deploy:coordination -- --rpc-url sepolia

# Full deployment with peer wiring
./scripts/deploy-chain.sh sepolia --peer fuji
```

### Single-chain deployment (spoke)

Spoke chains deploy only the deposit-only infrastructure:

```bash
# Spoke deploy via deploy-all.sh
./scripts/deploy-all.sh --chain fuji

# Or directly via Forge
CHAIN=fuji forge script script/DeploySpoke.s.sol:DeploySpoke --rpc-url fuji --broadcast -vvv
```

`DeploySpoke.s.sol` deploys `MockUSDC` (or uses a real USDC address), `StateRelay`, and `BasketFactory` (with `oracleAdapter = address(0)`). The output config contains only `basketFactory`, `stateRelay`, and `usdc`.

### Wire peers (cross-chain)

After deploying both hub and spoke, wire the `RedemptionReceiver` trusted sender and CCIP peers:

```bash
LOCAL_CHAIN=sepolia REMOTE_CHAIN=fuji npm run deploy:wire-peers -- --rpc-url sepolia
LOCAL_CHAIN=fuji REMOTE_CHAIN=sepolia npm run deploy:wire-peers -- --rpc-url fuji
```

### Adding a new chain

1. Add an entry to `config/chains.json` with `"role": "hub"` or `"role": "spoke"` and the chain's CCIP router, selector, LINK token, etc.
2. Add an RPC alias in `foundry.toml` under `[rpc_endpoints]` if not already present.
3. Run `./scripts/deploy-all.sh --chain <chain-name>`.
4. Wire cross-chain peers if needed (see above).

### Local (Docker Compose workflow)

- First time: `npm run local:up` (starts Docker infra + deploys contracts + subgraph)
- Start UI: `npm run local:dev` (Next.js dev server on host, hot reloads)
- Redeploy after code changes: `npm run redeploy:local` (re-deploys contracts + subgraph; UI picks up new addresses via HMR)
- Teardown/reset volumes: `npm run local:down`
- Standalone contract-only deploy (bare Anvil, no Docker): `npm run deploy:local`

### Verify pass (optional, after deploy)

```bash
CHAIN=sepolia forge script script/Deploy.s.sol:Deploy --rpc-url sepolia --private-key $PRIVATE_KEY --broadcast --resume --verify -vvv
```

Then update this file from:

- `apps/web/src/config/{chain}-deployment.json`
- active Subgraph Studio query URL (for current production slug/version)
- Cloud Run service URL and Scheduler job names (if changed)
