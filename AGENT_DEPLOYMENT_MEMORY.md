# Agent Deployment Memory

Local allowlist/ownership ledger for deployment operations.
Agents must read this file before touching cloud resources.

Last updated: 2026-04-17

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
| GCP | `watchful-gear-493003-t8` | Cloud Run Service | `indexflow-push-worker` | production | agent | `read`, `deploy`, `update-config` | Serverless Web Push API/dispatch worker for PWA notifications | 2026-04-11 |
| GCP | `watchful-gear-493003-t8` | Cloud Scheduler Job | `indexflow-push-realtime` | production | agent | `read`, `deploy`, `update-config` | Realtime dispatch trigger (`*/5 * * * *`) | 2026-04-11 |
| GCP | `watchful-gear-493003-t8` | Cloud Scheduler Job | `indexflow-push-digest` | production | agent | `read`, `deploy`, `update-config` | Digest dispatch trigger (`0 */6 * * *`) | 2026-04-11 |

| Ethereum Sepolia | Chain `11155111` | Smart Contract | `PoolReserveRegistry` (`0x970F75182913195D3594822DD456cD710E5C42B0`) | sepolia | agent | `read` | TWAP-based GMX pool depth tracking and proportional routing weights | 2026-04-15 |
| Ethereum Sepolia | Chain `11155111` | Smart Contract | `CCIPReserveMessenger` (`0x2350D1689eD1A8a4654Ef45Fe5d25Bd5f432116a`) | sepolia | agent | `read` | Delta-triggered CCIP pool state broadcast/receive | 2026-04-15 |
| Ethereum Sepolia | Chain `11155111` | Smart Contract | `IntentRouter` proxy (`0x1198Cde5Abe79E3aB67981Cd9352D5a0d480F556`) | sepolia | agent | `read`, `deploy` | UUPS-upgradeable intent escrow and execution router (hub-only; spokes do not deploy IntentRouter) | 2026-04-15 |
| Ethereum Sepolia | Chain `11155111` | Smart Contract | `IntentRouter` impl (`0x482d0530B1b1d6f49d5FC733a321E615B53CB711`) | sepolia | agent | `read` | IntentRouter logic implementation (hub-only) | 2026-04-15 |
| Ethereum Sepolia | Chain `11155111` | Smart Contract | `CrossChainIntentBridge` (`0xad177ecAd0C6Ac73Daa46264097ff7ff9b887F27`) | sepolia | agent | `read` | Stateless CCIP relay for cross-chain deposit intents (hub-only; spokes do not deploy IntentBridge) | 2026-04-15 |
| Ethereum Sepolia | Chain `11155111` | Smart Contract | `OracleConfigQuorum` (`0x762C7080D391f9169cdeeD93c65Ad5016D67701A`) | sepolia | agent | `read` | Quorum-based oracle config consensus via CCIP (address will change on redeploy) | 2026-04-15 |
|| Ethereum Sepolia | Chain `11155111` | Smart Contract | `StateRelay` (pending deploy) | sepolia | agent | `read`, `deploy` | Keeper-posted routing weights, global NAV, and per-chain PnL adjustments; replaces CCIP mesh | 2026-04-17 |
|| Ethereum Sepolia | Chain `11155111` | Smart Contract | `RedemptionReceiver` (pending deploy) | sepolia | agent | `read`, `deploy` | Receives CCIP USDC from hub to fill pending spoke redemptions | 2026-04-17 |
|| Avalanche Fuji | Chain `43113` | Smart Contract | `StateRelay` (pending deploy) | fuji | agent | `read`, `deploy` | Keeper-posted routing weights, global NAV, and per-chain PnL adjustments (spoke instance) | 2026-04-17 |
|| Avalanche Fuji | Chain `43113` | Smart Contract | `RedemptionReceiver` (pending deploy) | fuji | agent | `read`, `deploy` | Receives CCIP USDC from hub to fill pending spoke redemptions (spoke instance) | 2026-04-17 |

## Update Template

Use this template for new entries:

| Provider | Project/Account | Resource Type | Resource Name | Environment | Owner | Allowed Actions | Purpose | Created |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `<provider>` | `<project>` | `<type>` | `<name>` | `<env>` | `agent|user` | `<comma-separated-actions>` | `<short-purpose>` | `<YYYY-MM-DD>` |
