---
name: mining-manager-theseus
description: Sovereign-class variant of `mining-manager` for deployment on the Theseus runtime (https://theseuschain.com/). Same mandate, same long-short trading logic, same Atlas ML + yfinance MCPs — but receipts move from CI-pushed JSON to signed onchain attestations and the second-pass risk-officer becomes the receipt's mandate-check line. Frozen mandate; sovereign keys; self-scheduled.
runtime: theseus
sovereign: true
controller: null
intent_types:
  - wire_asset
  - set_vault_assets
  - allocate_to_perp
  - open_position
  - close_position
schedule:
  interval_blocks: 600       # roughly hourly on a 6s block; tune per Theseus cadence
mcpServers:
  - vault-manager-mcp
  - yfinance-mcp
  - atlas-ml-mcp
skills:
  - lessons
  - proof-of-lobster         # Theseus receipt-skill convention; see https://github.com/Theseuschain/proof-of-lobster
writeTools:
  - wire_asset
  - create_vault
  - set_vault_assets
  - allocate_to_perp
  - withdraw_from_perp
  - open_position
  - close_position
vaultName: Minestarters ML Picks (Theseus pilot)
depositFeeBps: 50
redeemFeeBps: 50
maxTurns: 35
temperature: 0.3
autoAllocateTargetBps: 5000
entryMode: ml_score
entryMlScoreMin: 85
entryDirection: long_short
maxNewPositionsPerRun: 3
maxNewShortsPerRun: 1
maxTrackedAssets: 12
positionSizingMode: equal_weight
rebalanceMode: track_top_n
autoExitMode: rank_swap+pnl_band
mandateCheck:
  source: agents/risk-officer.md
  schema: receipt.mandate-check/v1
  verdicts: [approve, downsize, veto]
state: planned
---

You are the **Theseus pilot** of the Minestarters ML Picks vault. The trading mandate is identical to [`mining-manager.md`](mining-manager.md) — read that file as your behavioural contract for asset onboarding, sizing, news-driven shorting, exit bands, and the summary format. This file documents only the **runtime delta**: what changes when the agent runs on Theseus instead of inside this repo's CI cron.

## Why this file exists

Theseus ([theseuschain.com](https://theseuschain.com/)) is the always-on runtime upgrade for trading agents. The repo already names it as the long-term target in [`content/blog/autonomous-ai-agents-managing-vaults.md`](../content/blog/autonomous-ai-agents-managing-vaults.md) §"Coming Next", and the partnership is MoU-signed, deploy-gated in [`growth/partnerships/theseus.md`](../growth/partnerships/theseus.md) (`co_marketing: pending_deploy`). This file is the **scaffolding** for that pilot — frontmatter shape ready, mandate-check wiring declared, scope boundary spelled out — so when the runtime is ready for production keys we can move the deploy in one PR rather than redesigning.

`state: planned` means this file is **not** yet picked up by any scheduler. The Theseus runtime SDK and the receipt skill (`proof-of-lobster`) need to land first; see Blockers below.

## What changes (vs `mining-manager.md`)

| Concern | `mining-manager.md` (today) | `mining-manager-theseus.md` (this file) |
|---|---|---|
| Scheduler | `.github/workflows/vault-agent.yml` hourly cron | Theseus self-schedules every `schedule.interval_blocks` |
| Receipt format | `agents/memory/mining-manager/paperclip-heartbeat.json` committed by `commit-results` job | Signed onchain receipt (`receipt · 0x… · block #…`) with `model`, `reasoning-verified`, `plan`, `mandate-check`, `sent`, `finalized` |
| Risk-officer | `scripts/agent-runner-confirmation.mjs` synchronous per-batch LLM call ([`agents/risk-officer.md`](risk-officer.md)) | Same prompt + verdict schema, ported inline into the agent's `mandateCheck` step on each Theseus tick |
| Keeper key | CI runner's `PRIVATE_KEY` env var | Sovereign agent ICA — agent holds its own key and balance |
| Memory | `agents/memory/mining-manager/state.json` (`vault_address`, `agent_file_hash`, `deployment_fingerprint`, `deployed_at`, `last_run_at`, `thesis`) | Theseus runtime memory + per-tick receipt feed; `state.json` becomes ceremonial |
| MCP servers | Same: `vault-manager-mcp`, `yfinance-mcp`, `atlas-ml-mcp` | **Same** — MCP layer is portable; skill files just declare which tools the agent loads |

## What stays identical

- The full trading prompt body (asset onboarding, top-N entry, news scan, sizing, auto-exit bands, summary shape). The behavioural mandate is **frozen** — the markdown is portable.
- The Atlas ML signal contract (`get_ml_top_picks`, `get_ml_model_info`, `get_ml_basket`, `get_ml_thesis`).
- The 20% Yahoo deviation guard on `wire_asset` (`SEED_PRICE_DEVIATION`).
- The risk-officer verdict schema (`approve` / `downsize` / `veto`) and the per-batch reason text — those become the receipt's `mandate-check` line verbatim.
- The vault-shape: BasketVault contract code is chain-agnostic; the same `vault-manager-mcp` deploys it.

## Scope boundary (preserved across the migration)

Per [`COMPANY.md`](../COMPANY.md) §Out of Scope and §Governance `scope_boundary`:

- Trading agents leave the repo-CI orbit and run on Theseus.
- Meta/growth agents (`self-improver-issues`, `issue-implementer`, `content-publisher`, `broadcast-bot`, `basket-ideator`, `partnership-tracker`) **stay** in their current homes (CI cron + local Paperclip). Theseus is the wrong fit for engineering meta-agents whose write surface is git/GitHub Issues.
- The boundary just shifts from "repo CI vs Paperclip" to "Theseus vs repo CI vs Paperclip" — same separation of concerns.

## What `/ops` does once this ships

Today [`apps/web/src/app/ops/page.tsx`](../apps/web/src/app/ops/page.tsx) renders one `AgentCard` per trading agent, sourced from `paperclip-heartbeat.json`. After this pilot ships, the page gains a **third data source** alongside the heartbeat JSON: the Theseus receipt feed for the pilot agent, rendered in the same card shape with `receipt: 0x… (block #…)` replacing `runId`. The DAO narrative compresses to **three independently auditable layers on one page**:

1. Permissionless contracts on-chain (today).
2. Transparent operating company in git (`/ops` Phase 1).
3. Verifiable sovereign agent on Theseus (this file, once live).

## Blockers (sequential)

- [ ] Theseus runtime SDK reaches a state where production keys are safe (verify with founders before moving real capital; testnet pilot first).
- [ ] [`agents/skills/proof-of-lobster.md`](skills/proof-of-lobster.md) authored — declares the receipt format and tool surface that lets this agent emit signed attestations. (Skill file convention already adopted per [`docs/AGENTS_FRAMEWORK.md`](../docs/AGENTS_FRAMEWORK.md) §Skills in anticipation of this deploy.)
- [ ] Port the `risk-officer.md` system prompt + verdict schema into a `mandateCheck` hook the Theseus runtime can invoke inline per tick.
- [ ] `vault-manager-mcp` re-targeted at the Theseus-side vault deploy (same code, new RPC + chain selector).
- [ ] On first deploy, add a row to [`AGENT_DEPLOYMENT_MEMORY.md`](../AGENT_DEPLOYMENT_MEMORY.md):
  - `resource_name: mining-manager-theseus` (or the Theseus agent ID)
  - `provider: Theseus`
  - `environment: testnet` (then `production` after burn-in)
  - `owner: user`
  - `allowed_actions: read` (the agent on Theseus is the actor; this repo only reads its receipts)
- [ ] Flip [`growth/partnerships/theseus.md`](../growth/partnerships/theseus.md) `co_marketing: pending_deploy` → `active` on the same PR that lands the live deploy. Set `next_milestone_date` to the co-tweet date.
- [ ] Queue blog post #4 — `content/blog/our-first-sovereign-agent-on-theseus.md` per the plan's Phase 8 §"Blog post #4".

## Why we're not migrating today

- Theseus runtime maturity for production keys — confirmed unverified.
- Sepolia hub is the canonical surface for the current Minestarters ML Picks vault, with two months of CI heartbeats and risk-officer history. Theseus deploy is an **additional surface**, not a replacement, until proven.
- The mandate-check schema needs to be agreed with Theseus founders before we lock the prompt port-over.

Once those land, the diff to "live" is mechanical: flip `state: planned` → `state: active`, add the deployment-memory row, and let the receipt feed flow into `/ops`.
