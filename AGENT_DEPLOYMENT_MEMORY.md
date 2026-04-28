# Agent Deployment Memory

Local allowlist/ownership ledger for deployment operations.
Agents must read this file before touching cloud resources.

Last updated: 2026-04-27

## Policy

- Resources not listed here are treated as protected (`read` only).
- Existing deployments are user-owned unless explicitly marked otherwise.
- Agent-created resources must be recorded immediately after creation.

## Resources

| Provider | Project/Account | Resource Type | Resource Name | Environment | Owner | Allowed Actions | Purpose | Created |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GCP | `industrial-joy-440019-h3` | Cloud Run Service | `PUSH_WORKER_SERVICE` (from env/secrets) | production | user | `read`, `deploy`, `update-config` | Web Push API/dispatch worker for PWA notifications | 2026-04-10 |
| GCP | `industrial-joy-440019-h3` | Cloud Scheduler Job | `PUSH_REALTIME_JOB_NAME` (from env/secrets) | production | user | `read`, `deploy`, `update-config` | Triggers realtime push dispatch cadence | 2026-04-10 |
| GCP | `industrial-joy-440019-h3` | Cloud Scheduler Job | `PUSH_DIGEST_JOB_NAME` (from env/secrets) | production | user | `read`, `deploy`, `update-config` | Triggers digest push dispatch cadence | 2026-04-10 |
| Vercel | org/project from CI secrets | Web Deployment | `apps/web` production deployment | production | user | `read`, `deploy` | Production Next.js web app deployment | 2026-04-10 |
| The Graph Studio | Studio account `867` | Subgraph | `indexflow-prototype` (Sepolia, label `0.2.1`) | production | user | `read`, `deploy` | Indexed read model for web / push worker; deployed from `apps/subgraph` | 2026-04-17 |
| GCP | `watchful-gear-493003-t8` | Cloud Run Service | `indexflow-push-worker` | production | agent | `read`, `deploy`, `update-config` | Serverless Web Push API/dispatch worker for PWA notifications | 2026-04-11 |
| GCP | `watchful-gear-493003-t8` | Cloud Scheduler Job | `indexflow-push-realtime` | production | agent | `read`, `deploy`, `update-config` | Realtime dispatch trigger (`*/5 * * * *`) | 2026-04-11 |
| GCP | `watchful-gear-493003-t8` | Cloud Scheduler Job | `indexflow-push-digest` | production | agent | `read`, `deploy`, `update-config` | Digest dispatch trigger (`0 */6 * * *`) | 2026-04-11 |

| Ethereum Sepolia | Chain `11155111` | Smart Contract | `PoolReserveRegistry` (`0xEA3F5EC162F0b583B10E2e14506aC1e0aD4Cf449`) | sepolia | agent | `read` | TWAP-based GMX pool depth tracking and proportional routing weights | 2026-04-17 |
| Ethereum Sepolia | Chain `11155111` | Smart Contract | `CCIPReserveMessenger` (`0x26ffdD8c87c4057C13e8Ce3491953Bd1e4B6Fe6B`) | sepolia | agent | `read` | Delta-triggered CCIP pool state broadcast/receive | 2026-04-17 |
| Ethereum Sepolia | Chain `11155111` | Smart Contract | `IntentRouter` proxy (`0xa71220762Ff6C0e8D55d492da3265D56C279d2cE`) | sepolia | agent | `read`, `deploy` | UUPS-upgradeable intent escrow and execution router (hub-only; spokes do not deploy IntentRouter) | 2026-04-17 |
| Ethereum Sepolia | Chain `11155111` | Smart Contract | `IntentRouter` impl (`0x730400eEA631f8C4b31066483f6042732C1C783D`) | sepolia | agent | `read` | IntentRouter logic implementation (hub-only) | 2026-04-17 |
| Ethereum Sepolia | Chain `11155111` | Smart Contract | `CrossChainIntentBridge` (`0x1aC98b06a556815C1e0FfE46fdD69Ed489435b8F`) | sepolia | agent | `read` | Stateless CCIP relay for cross-chain deposit intents (hub-only; spokes do not deploy IntentBridge) | 2026-04-17 |
| Ethereum Sepolia | Chain `11155111` | Smart Contract | `OracleConfigQuorum` (`0x446A26005bc82FcC7eB725413229ecBF65366548`) | sepolia | agent | `read` | Quorum-based oracle config consensus via CCIP (address will change on redeploy) | 2026-04-17 |
|| Ethereum Sepolia | Chain `11155111` | Smart Contract | `StateRelay` (pending deploy) | sepolia | agent | `read`, `deploy` | Keeper-posted routing weights, global NAV, and per-chain PnL adjustments; replaces CCIP mesh | 2026-04-17 |
|| Ethereum Sepolia | Chain `11155111` | Smart Contract | `RedemptionReceiver` (pending deploy) | sepolia | agent | `read`, `deploy` | Receives CCIP USDC from hub to fill pending spoke redemptions | 2026-04-17 |
|| Avalanche Fuji | Chain `43113` | Smart Contract | `StateRelay` (pending deploy) | fuji | agent | `read`, `deploy` | Keeper-posted routing weights, global NAV, and per-chain PnL adjustments (spoke instance) | 2026-04-17 |
|| Avalanche Fuji | Chain `43113` | Smart Contract | `RedemptionReceiver` (pending deploy) | fuji | agent | `read`, `deploy` | Receives CCIP USDC from hub to fill pending spoke redemptions (spoke instance) | 2026-04-17 |
| Avalanche Fuji | Chain `43113` | Smart Contract config | `StateRelay.keeper()` on `0x0A564071Fb11A0b84314f0B78AC69C5742Db22A2` (set to KeeperHub wallet `0xBAefbc6D…e409`) | fuji | agent | `read`, `update-config` | Aligns Fuji StateRelay with Sepolia for unified KeeperHub-routed `updateState`. setKeeper tx `0xb25d4bd16b36b957849145ef329d40487c3b2624ce76f8520787e802e016ecff`. Owner remains operator PRIVATE_KEY wallet; `setKeeper` is reversible by owner. | 2026-04-27 |
| Avalanche Fuji | Chain `43113` | Off-chain wallet | KeeperHub-managed wallet `0xBAefbc6D66C6ACc123374A0ABa10E946b932e409` | fuji | agent | `read`, funded once with 0.5 AVAX | Gas funding for KeeperHub `updateState` writes on Fuji (KeeperHub does not auto-fund non-named networks reached via numeric chain id). Funding tx `0xa8da1e14121cc86a718e282d59a672c330900b84c256f97a7f179dc52baa22e6`. Monitor balance and refill before depletion. | 2026-04-27 |

## Update Template

Use this template for new entries:

| Provider | Project/Account | Resource Type | Resource Name | Environment | Owner | Allowed Actions | Purpose | Created |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `<provider>` | `<project>` | `<type>` | `<name>` | `<env>` | `agent|user` | `<comma-separated-actions>` | `<short-purpose>` | `<YYYY-MM-DD>` |
