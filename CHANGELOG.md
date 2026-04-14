# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Timestamp format for new entries in this section: `[YYYY-MM-DD HH:MM UTC±HH:MM]`.
Within each category, add newest entries at the top.
Legacy entries that predate this rule may remain without timestamps.

### Added

- [2026-04-14 12:30 UTC+07:00] Added [docs/TECHNICAL_ARCHITECTURE_AND_ROADMAP.md](docs/TECHNICAL_ARCHITECTURE_AND_ROADMAP.md) as the canonical repo-facing IndexFlow technical architecture and roadmap document. The new document formalizes the live basket-vault and shared-perp architecture with line-level code references, mermaid flow diagrams, a Solidity/TypeScript interface pack, security and audit guidance, dated competitor comparisons, and a tokenomics reconciliation around the current `$1M` private round at `$10M` FDV assumption.
- [2026-04-14 12:30 UTC+07:00] Added [`test/TechnicalArchitectureRoadmapMetrics.t.sol`](test/TechnicalArchitectureRoadmapMetrics.t.sol), a deterministic Foundry metrics harness for reserve depth, redemption headroom, shared-pool utilization, and stressed shared-liquidity loss behavior used by the technical architecture document.
- [2026-04-13 15:29 UTC+07:00] Added draft regulatory planning memo [docs/REGULATORY_ROADMAP_DRAFT.md](docs/REGULATORY_ROADMAP_DRAFT.md) covering the repo's likely EU-first perimeter, recommended low-scope launch profile, phased legal/compliance workstreams, and product decisions that materially widen the licensing burden. Updated [docs/README.md](docs/README.md) and [README.md](README.md) to surface the new draft docs route.
- [2026-04-12 15:16 UTC+07:00] Added standalone peer-review spec [`docs/SYNTHETIC_EPOCH_SECURITY_REVIEW.md`](docs/SYNTHETIC_EPOCH_SECURITY_REVIEW.md) covering synthetic epoch settlement decisions, protocol flow, anti-cherry-pick controls, threat model, audit invariants, operational runbook, and Mermaid security/flow diagrams.
- [2026-04-12] [`.env.example`](.env.example) expanded to cover Foundry RPC/verification, deploy `SEED_PRICE_RAW`, agent runner, vault MCP, price updater, subgraph `NETWORK`, push-worker, and CI secret pointers; added [`apps/web/.env.example`](apps/web/.env.example) for Next.js and Playwright. Gitignore now includes root `.env.local` and `apps/web/.env.local`.
- [2026-04-12] Agent skills convention: reusable skill files (`agents/skills/`) separate generalised tool/API references from agent-specific strategy. New `skills` frontmatter field loads skill files into the system prompt at runtime. Includes `vault-manager` and `yfinance` skills extracted from the sample agent.
- [2026-04-11] Agent memory system: each agent gets persistent state (`agents/memory/<name>/state.json`) and an append-only run log (`run-log.jsonl`). The runner loads recent history into the system prompt so agents have context across cron runs. Memory is committed to the repo; CI auto-commits changes after each run.
- [2026-04-11] Auto vault lifecycle: agents auto-deploy their own vault on first run via `create_vault`. The runner captures the vault address from `get_all_vaults` and saves it to state. If the agent `.md` file changes (SHA-256 hash mismatch), a new vault is deployed automatically.
- [2026-04-11] Vault scoping: each vault-manager agent manages exactly one vault. Frontmatter fields `vaultName`, `depositFeeBps`, and `redeemFeeBps` configure the auto-deployed vault. The runner injects vault address and run history into the system prompt.
- [2026-04-11] Yahoo Finance MCP server (`apps/yfinance-mcp/`): standalone MCP server for stock/ETF/index search and live quote lookups via Yahoo Finance, with automatic FX conversion to USD. Any agent can use it by adding `yfinance-mcp` to its `mcpServers` list.
- [2026-04-11] Multi-agent framework: agents are defined as markdown files (`agents/<name>.md`) with YAML frontmatter for config and markdown body as the system prompt. A generic runner (`scripts/agent-runner.mjs`) parses agent definitions, spawns MCP servers from a shared registry (`agents/mcp-servers.json`), and runs the LLM agent loop. No JavaScript knowledge needed to create new agents.
- [2026-04-11] `agent:run` npm script for running any agent by name (`npm run agent:run -- <name>`).
- [2026-04-11] GitHub Actions `vault-agent.yml` now accepts an `agent_name` dispatch input to run any agent from the `agents/` directory.
- [2026-04-11] Unified agent documentation (`docs/AGENTS_FRAMEWORK.md`): agent definitions, MCP tool reference, vault lifecycle, memory, workflows, risk guardrails, and architecture in a single doc.
- [2026-04-11] Vault Manager MCP server (`apps/vault-manager-mcp/`): on-chain vault reads (state, PnL, oracle assets, positions) and write tools (wire asset, create vault, set assets, allocate/withdraw perp, open/close positions) over stdio using `@modelcontextprotocol/sdk`.
- [2026-04-11] Sample vault management agent (`agents/sample-vault-manager.md`): example agent definition that reviews vault states and market conditions and executes management actions. Use as a template for custom agents. `scripts/vault-agent.mjs` is a backward-compatible wrapper.
- [2026-04-11] GitHub Actions cron workflow (`.github/workflows/vault-agent.yml`): runs the vault agent every 6 hours on Sepolia with manual dispatch and dry-run toggle.

- [2026-04-11] Npm scripts `agent`, `agent:dry`, and `mcp:vault-manager` for running the vault agent and MCP server.

### Changed

- [2026-04-14 14:01 UTC+07:00] Renamed the architecture document to [`TECHNICAL_ARCHITECTURE_AND_ROADMAP.md`](docs/TECHNICAL_ARCHITECTURE_AND_ROADMAP.md), updated internal naming to “Technical Architecture & Roadmap”, and published it in the in-app docs map at `/docs/technical-architecture-roadmap` by updating [`apps/web/src/lib/docs.server.ts`](apps/web/src/lib/docs.server.ts), [`apps/web/src/lib/wiki.test.ts`](apps/web/src/lib/wiki.test.ts), [`README.md`](README.md), and [`docs/README.md`](docs/README.md).
- [2026-04-14 12:30 UTC+07:00] Updated [README.md](README.md) and [docs/README.md](docs/README.md) to surface the new technical architecture document.
- [2026-04-13 14:25 UTC+07:00] Agent deployment memory invalidation: `scripts/agent-runner.mjs` now fingerprints deployment context (`runNetwork`, `DEPLOYMENT_CONFIG` content/path, `RPC_URL`) and automatically invalidates stale agent memory on deployment changes by archiving `agents/memory/<agent>/state.json` plus the active `run-log.<network>.jsonl` into `agents/memory/<agent>/archive/` before starting a fresh lifecycle. `state.json` now persists `deploymentFingerprint` and `deploymentConfigPath`.
- [2026-04-13 13:13 UTC+07:00] Exchange-safe symbol rollout across deploy/scripts, MCP, web API, and admin UI: canonical seeded equity is now `BHP.AX` (replacing `BHP`) in `DeployLocal`/`DeploySepolia`; `SubmitAndSyncOraclePrices` suffixed override keys renamed to `BHP_AX_PRICE_RAW` / `RIO_AX_PRICE_RAW`; Yahoo quote surfaces (`apps/yfinance-mcp` and `/api/yahoo-finance/quote`) now return symbol-resolution metadata (`requestedSymbol`, `resolvedSymbol`, `isAmbiguous`, `candidates`); `wire_asset` (vault-manager MCP) and the web Register Asset flow now reject ambiguous unsuffixed equities and require explicit exchange suffixes while still allowing unique unsuffixed equities and non-equity symbols; tests/E2E/docs/tooltips migrated to `BHP.AX` defaults.
- [2026-04-13 13:05 UTC+07:00] Agent runner dry-run logging policy tightened: when `AGENT_DRY_RUN=1`, `scripts/agent-runner.mjs` no longer appends to `agents/memory/<agent>/run-log.<network>.jsonl` on either success or failure, preventing dry-run observations from polluting persisted context. Docs updated in `README.md` and `docs/AGENTS_FRAMEWORK.md`.
- [2026-04-13 12:55 UTC+07:00] Agent run history is now network-scoped to prevent cross-network prompt context bleed: `scripts/agent-runner.mjs` reads/writes `agents/memory/<agent>/run-log.<network>.jsonl` (resolved from `AGENT_NETWORK` or inferred from `DEPLOYMENT_CONFIG` filename). GitHub Actions `vault-agent.yml` now passes `AGENT_NETWORK=${{ matrix.network }}`. Docs and env template updated for the new memory layout and override variable.
- [2026-04-12 12:20 UTC+07:00] Agent runner write-safety gate: new `AGENT_CONFIRM_WRITES=1` mode intercepts assistant write-tool batches and requires operator approval (`approve` / `reject`) or free-text refinement feedback in an interactive terminal loop before executing on-chain writes. In non-interactive environments (e.g. CI), confirmation is explicitly bypassed and writes proceed. Run summaries now include confirmation batch decisions.
- [2026-04-11] Agent renamed from `vault-manager` to `sample-vault-manager` to serve as an example template. Rewritten for single-vault scoping with `vaultName`, `depositFeeBps`, `redeemFeeBps` frontmatter fields.
- [2026-04-11] `scripts/agent-runner.mjs` extended with memory loading/saving, SHA-256 file hash change detection, vault context injection into system prompt, vault address capture from `create_vault`/`get_all_vaults`, and run-log persistence.
- [2026-04-11] GitHub Actions `vault-agent.yml` now auto-commits agent memory (`agents/memory/`) to the repo after each run instead of using ephemeral cache. Added `contents: write` permission and `vault-agent[bot]` committer identity.
- [2026-04-11] Yahoo Finance tools (`yfinance_search`, `yfinance_quote`) extracted from `vault-manager-mcp` into a standalone `yfinance-mcp` server (`apps/yfinance-mcp/`). `update_oracle_prices` removed from vault-manager-mcp — oracle price updates are handled by a separate keeper, not the position management agent.
- [2026-04-11] Agent system refactored from single hardcoded script to markdown-based multi-agent framework: `scripts/vault-agent.mjs` (329 lines) split into generic runner (`scripts/agent-runner.mjs`), agent definition (`agents/sample-vault-manager.md`), and MCP server registry (`agents/mcp-servers.json`). Existing `npm run agent` / `agent:dry` commands unchanged.
- [2026-04-11] MCP server tool descriptions rewritten with return shapes, cross-tool disambiguation ("call X first", "use Y after"), and parameter examples for non-obvious types (bytes32, raw USDC, GMX 1e30 scale).
- [2026-04-11] MCP server error responses now return structured JSON with `error_code`, `message`, and `recovery_hint` (suggested next tool or fix) instead of bare error strings.
- [2026-04-11] MCP server read tools now include human-readable companion fields (`_usdc`, `_usd`, `_pct`) alongside raw on-chain values; write tools return parsed receipts (`transactionHash`, `status`, `blockNumber`) and `next_steps` with suggested follow-up tools.
- [2026-04-11] MCP server: new `get_all_vault_states` batch tool returns a full state summary (NAV, PnL, reserves, positions) for every vault in a single call, reducing agent turns from N+1 to 1.
- [2026-04-11] Vault agent (`scripts/vault-agent.mjs`): LLM API calls now retry with exponential backoff (3 attempts, 2s/4s/8s) on 429 and 5xx errors; tool responses are truncated to a configurable token budget (`AGENT_MAX_TOOL_RESPONSE`, default 6000 chars) before being sent to the LLM; a structured JSON run summary is emitted at exit for CI parsing.
- [2026-04-11] Merged `docs/SKILL_VAULT_MANAGER.md` into `docs/AGENTS_FRAMEWORK.md` — single unified doc for agent framework, MCP tool reference, workflows, and risk guardrails.

### Fixed

- [2026-04-13 13:05 UTC+07:00] Subgraph manifest hotfix for shared helper ABI coverage: added missing ABI declarations across mappings that call basket refresh/snapshot helpers (`VaultAccounting`, `BasketFactory`, `BasketVaultTemplate`) so runtime helper `tryCall` bindings (`BasketVault`, `BasketShareToken`, `ERC20`, `VaultAccounting`) are available and indexing no longer fails with missing-ABI errors.
- [2026-04-13 12:10 UTC+07:00] Restored local agent runtime dependencies by adding root packages `@modelcontextprotocol/sdk` and `zod` to `package.json`, fixing `npm run agent:run` startup failure (`ERR_MODULE_NOT_FOUND: @modelcontextprotocol/sdk`).
- [2026-04-10] Exclude Anvil chain (localhost:8545) from wagmi and Privy configs on non-local deployments so Chrome's Local Network Access prompt ("access to other apps and services") no longer appears on production/preview sites; Anvil is still available on localhost and in E2E mode.

### Changed

- [2026-04-10 23:20 UTC+07:00] Deployment documentation expanded in `docs/DEPLOYMENTS.md` to explicitly separate production surfaces: Sepolia contract registry, Sepolia-indexed subgraph deployment/runtime wiring, and Google Cloud Run/Scheduler/Firestore usage scoped to push notifications only (no contract execution role). README deployment-doc summary updated to match.
- [2026-04-10 22:19 UTC+07:00] Web app PWA + settings rollout: added App Router manifest (`/manifest.webmanifest`), service-worker bootstrap (`public/sw.js` registration), new `/settings` route with install guidance and per-event push preferences, and header/account navigation entry for Settings. Preferences are API-first to a configurable push service (`NEXT_PUBLIC_PUSH_SERVICE_URL`) with wallet-scoped localStorage fallback when unavailable.
- [2026-04-10] E2E tests now use Privy embedded wallets for transaction signing instead of wagmi mock connector: `globalSetup` logs in with a Privy test account (email + OTP), funds the embedded wallet via Anvil RPC, and transfers contract ownership so all UI-driven transactions are auto-signed without MetaMask or browser extensions. Falls back to the legacy mock connector when `NEXT_PUBLIC_PRIVY_APP_ID` is not set. CI passes Privy secrets from GitHub repository settings.
- [2026-04-10 21:52 UTC+07:00] Codecov scope tightened to Solidity files only: added repository `.codecov.yml` project-path filter (`**/*.sol`) and set `codecov-action` `disable_search: true` in CI coverage upload/retry steps so only Foundry `lcov.info` is considered.
- [2026-04-10 21:40 UTC+07:00] Test coverage expansion across all Solidity scopes: added new Foundry suites for `BasketFactory`, `FundingRateManager`, `PerpReader`, GMX admin/pricing and Router/SimplePriceFeed flows, plus deploy-script helper coverage (`DeployLocal` / `DeploySepolia` internals). CI coverage input remains unchanged (`forge coverage --ir-minimum --report lcov --report-file lcov.info`) with all Solidity files still included for Codecov.
- [2026-04-10] Fresh Sepolia deployment with all contracts verified on Etherscan, including `AssetWiring` (previously missing from config); deployment starts at block 10630646.
- [2026-04-10] Subgraph deploy script migrated from deprecated `--product hosted-service` to `--studio` for The Graph Subgraph Studio.
- [2026-04-10] All write-transaction hooks use Privy gas sponsorship (`sponsor: true`) via `useSponsoredWriteContract`, enabling gasless transactions for users with Privy embedded wallets on Sepolia; falls back to standard wagmi `useWriteContract` in E2E/non-Privy mode.
- [2026-04-10] E2E tests now run without a subgraph: `getSubgraphUrlForTarget()` returns `null` when `NEXT_PUBLIC_E2E_TEST_MODE=1`, forcing all data surfaces to use direct RPC fallbacks (contract reads + event logs). CI e2e job uses bare Anvil + contract deploy only — no Docker, graph-node, or subgraph deployment needed. Wallet connection uses wagmi mock connector with auto-connect on page load.
- [2026-04-10] Web app: public basket detail page (`/baskets/[address]`) now shows per-asset oracle price charts, open positions table with PnL, compact composition + reserve health sidebar, and a horizontal metrics strip; deposit/redeem panel moves above content on mobile and sticks on desktop. Old composition card and advanced-metrics accordion are replaced by the shared components.
- [2026-04-10] Web app: extract `useBasketDashboardData` hook consolidating ~120 lines of duplicated basket data-fetching shared between admin and public basket pages; move `MetricsStrip`, `AssetPricePanel`, `PositionsTable`, and `CompositionSidebar` from `admin/` to the shared `components/baskets/` namespace.
- [2026-04-10] Git hooks: replace `.githooks` + `hooks:install` with **Husky** (`devDependency`); `prepare` runs `husky`. Pre-commit runs fast lint checks (`forge fmt --check`, `eslint src/`) reusing existing `node_modules`; pre-push verifies lockfile consistency via `npm ls` (~5s) instead of `npm ci` (~60s).
- [2026-04-10] Web app: scope ESLint to `src/` only (`eslint src/` instead of bare `eslint`); add `coverage/**` to `globalIgnores` in `eslint.config.mjs`.
- [2026-04-10] Web app: redesign admin basket detail page (`/admin/baskets/[address]`) into a professional trading dashboard with a compact metrics strip, per-asset oracle price charts with 24H/7D/30D windows, a standalone positions table with leverage and PnL % columns (stacked cards on mobile), a composition + reserve health sidebar, and collapsible trade/operations panels; layout is fully responsive for PWA use with trader-priority mobile ordering.
- [2026-04-10] Web app: replace RainbowKit with Privy for authentication and wallet management; adds email OTP and Google login alongside external wallets (MetaMask, WalletConnect), with embedded wallet support for users without an existing wallet.
- [2026-04-10] Web app: Anvil (localhost) testing now uses MetaMask as an external wallet through Privy with pre-funded Anvil accounts; chain configuration passes Anvil through Privy's `supportedChains` with a local RPC override.
- [2026-04-10] Web app: admin panel auth guard uses Privy `authenticated` state instead of wagmi `isConnected`, allowing email/Google-authenticated users with embedded wallets to access the admin.
- [2026-04-10] Pre-commit hook no longer requires a local Foundry install; Solidity formatting check is skipped with a notice when `forge` is not available (CI still enforces it).
- [2026-04-10] Web app: network selector only shows networks with real deployment configs (placeholder addresses are filtered out) and shows a per-network SG badge when a subgraph is configured; RainbowKit's built-in chain selector is hidden in favour of the single selector.
- [2026-04-10] CI: upgrade `actions/checkout` v4 → v5, `actions/setup-node` v4 → v5, and `actions/upload-artifact` v4 → v5 across all workflows (`test.yml`, `update-prices.yml`) to use Node.js 24 runtime and avoid the June 2026 deprecation of Node.js 20 actions.
- [2026-04-10] CI: bump runner `node-version` from 20 to 22 (current LTS).
- [2026-04-10] Pre-commit hook: discover Foundry via `$HOME/.foundry/bin` and `$HOME/.cargo/bin` dynamically instead of hardcoding an absolute user path; fail with a clear error when `forge` is missing.

### Fixed

- [2026-04-10] `apps/web/package-lock.json` regenerated so `npm ci --prefix apps/web` matches `package.json` (fixes CI Lint install step when the lockfile was missing `react@18.3.1` and other resolved entries).

### Added

- [2026-04-10 22:19 UTC+07:00] Serverless push backend scaffold under `apps/push-worker` (Cloud Run target): endpoints for subscribe/unsubscribe/preferences/test/dispatch/public-key/health, Firestore persistence for subscriptions + preference docs + dispatch cursors/logs, subgraph-first signal polling for investor/operator notifications, digest summary dispatch path, and VAPID Web Push send/prune handling.
- [2026-04-10 22:19 UTC+07:00] Production deploy workflow `.github/workflows/deploy-production.yml`: main-branch automation for Cloud Run deployment (OIDC auth), Cloud Scheduler reconciliation (realtime + digest dispatch jobs), Vercel production deploy, and push-service smoke checks.
- [2026-04-10 22:19 UTC+07:00] Docs/runbook and CI coverage for push/PWA: added `docs/PWA_PUSH_NOTIFICATIONS.md`, `/docs/pwa-push-notifications` route mapping (`pwa-notifications` alias), README + env docs updates, and a dedicated push-worker unit-test job in `.github/workflows/test.yml`.
- [2026-04-10] Web app: `NEXT_PUBLIC_PRIVY_APP_ID` environment variable required for the Privy SDK; `NEXT_PUBLIC_WALLETCONNECT_ID` is no longer needed.
- [2026-04-10] Web app: network selector dropdown in the header lets users switch between Anvil (Local) and Sepolia; anvil target automatically uses the local graph-node subgraph, sepolia uses the configured `NEXT_PUBLIC_SUBGRAPH_URL`.
- [2026-04-10] CI: scheduled GitHub Actions workflow (`update-prices.yml`) fetches Yahoo Finance quotes every 15 minutes and syncs on-chain prices for all registered `CustomRelayer` assets; supports manual dispatch with per-network targeting and matrix-based multi-network parameterization. Runs as a dry-run validation check on pull requests (no on-chain transactions).
- [2026-04-10] `redeploy:local` npm script: single host-side command that deploys contracts to Docker Anvil, syncs subgraph networks, builds and deploys the subgraph to the local graph-node — UI picks up new addresses via Next.js HMR.
- [2026-04-10] `local:dev` npm script: starts the Next.js dev server on host.
- [2026-04-10] Web app: basket detail pages (investor and admin) now display unrealised, realised, and net P&L tiles via `PerpReader.getVaultPnL` (pure RPC, no subgraph dependency).
- [2026-04-10] Web app: basket list `TrendPill` components now show live 24h / 7d share price deltas from `useBasketTrendSnapshots` (subgraph primary, RPC multi-block fallback).
- [2026-04-10] Web app: portfolio page shows per-basket and aggregate cost basis, P&L, and ROI derived from deposit/redeem history (subgraph primary, `Deposited`/`Redeemed` log scan fallback).
- [2026-04-10] Web app: admin basket detail gains capital utilization % and leverage ratio stat cards in the Accounting section.
- [2026-04-10] Web app: position manager card shows an Open Positions P&L table with per-position unrealised P&L computed from oracle prices and entry prices.
- [2026-04-10] Web app: share price history area chart on both investor and admin basket detail pages (subgraph `BasketSnapshot` primary, RPC multi-block `getSharePrice` sampling fallback).
- [2026-04-10] `AssetWiring` coordinator contract (`src/perp/AssetWiring.sol`): permissionless `wireAsset(symbol, seedPrice8)` deploys a `MockIndexToken`, configures the oracle, seeds the GMX price feed, and maps the asset across `VaultAccounting`, `FundingRateManager`, and `PriceSync` in a single transaction.
- [2026-04-10] `wirer` role on `OracleAdapter`, `VaultAccounting`, `FundingRateManager`, and `PriceSync`: `mapping(address => bool) wirers` with `setWirer(address, bool)` owner function and `onlyOwnerOrWirer` modifier on functions that `AssetWiring` and `BasketFactory` need to call.
- [2026-04-10] `BasketFactory.createBasket` now auto-registers new baskets in `VaultAccounting` via `registerVault`, removing the need for a separate admin transaction.
- [2026-04-10] `IPerp.registerVault` added to the perp interface so `BasketFactory` can call it through the interface.

### Changed

- [2026-04-10] `docker-compose.local.yml` slimmed to infra-only (Anvil, Postgres, IPFS, graph-node); UI and deploy services removed — UI runs on host for native hot reload, deploys run via `redeploy:local`.
- [2026-04-10] `isSubgraphEnabledForTarget` now enables the subgraph for any deployment target when `NEXT_PUBLIC_SUBGRAPH_URL` is set (previously limited to Sepolia only).
- [2026-04-10] `local:up` now starts Docker infra then runs `redeploy:local` automatically.
- [2026-04-10] CI lint job now also installs web dependencies and runs ESLint (`npm run lint:web`) alongside `forge fmt --check`; pre-commit hook updated to run the same full-project checks instead of only linting staged files.
- [2026-04-10] Admin "Register New Asset" card now calls `AssetWiring.wireAsset()` in a single transaction instead of the previous two-step `configureAsset` + `submitPrice` flow.
- [2026-04-10] Deploy scripts (`DeployLocal.s.sol`, `DeploySepolia.s.sol`) refactored: deploy `AssetWiring`, set wirer/keeper roles, transfer GMX vault governance to `AssetWiring`, wire BHP via `wireAsset`, and output `assetWiring` address to deployment JSON.
- [2026-04-10] `VaultAccounting.registerVault` and `mapAssetToken` now use `onlyOwnerOrWirer` instead of `onlyOwner`.
- [2026-04-10] `OracleAdapter.configureAsset` now uses `onlyOwnerOrWirer` instead of `onlyOwner`.
- [2026-04-10] `FundingRateManager.mapAssetToken` now uses `onlyOwnerOrWirer` instead of `onlyOwner`.
- [2026-04-10] `PriceSync.addMapping` now uses `onlyOwnerOrWirer` instead of `onlyOwner`.
- [2026-04-10] Web app: basket detail admin page UI/UX overhaul — add breadcrumb back-navigation and copy-on-click address; group content into titled sections (Overview, Reserves, Accounting, Composition, Operations, Position Management); replace plain-text reserve health with a styled status banner; make Operations section collapsible; add two-click confirmation on Close Position; create reusable `Select` UI component replacing raw `<select>` elements; fix fee collection not triggering post-tx data refresh; extract 7 inline sub-components into `components/baskets/admin/`.
- [2026-04-10] Web app: admin sidebar and overview quick link rename **Oracle** → **Assets** (route remains `/admin/oracle`); page title and operator docs updated accordingly.
- [2026-04-10] `DeployLocal.s.sol` / `DeploySepolia.s.sol`: BHP-only `CustomRelayer` deploy; initial BHP price from Yahoo via `vm.ffi` running `scripts/fetch-yf-asset-price.js`, which writes `cache/yf-seed-price.txt` for `vm.readFile` (avoids Forge mis-parsing decimal ASCII from FFI stdout). `foundry.toml`: `ffi = true`, `read` on `./cache`. Optional `SEED_PRICE_RAW` skips Yahoo. Add other assets via Admin → Assets or a custom deploy.
- [2026-04-10] `OracleAdapter.configureAsset` now accepts a `string symbol` instead of `bytes32 assetId`; the asset id is computed as `keccak256(bytes(symbol))` internally and the symbol is stored in a new `assetSymbols` mapping. The `AssetConfigured` event now emits the symbol string. A `getAssetSymbol(bytes32)` view is also added.
- [2026-04-10] Yahoo Finance price relayer (`scripts/update-yahoo-finance-prices.js`) is now fully on-chain driven: it enumerates active `CustomRelayer` assets and reads their symbols from the contract. No local config file (`yahoo-finance-feed-config.json`) is needed.
- [2026-04-10] Web app asset labels are now fetched from on-chain `assetSymbols` mapping via `useReadContracts`, replacing the client-side `asset-registry.ts` localStorage approach.
- [2026-04-10] Subgraph `AssetMeta` entity now includes a `symbol` field indexed from the updated `AssetConfigured` event.
- [2026-04-10] Npm price scripts renamed from `update-yf:*` / `update-pyth:*` to unified `update-prices:*`.

### Removed

- [2026-04-10] Pyth Network integration: deleted `scripts/update-pyth-relayer-prices.js`, `scripts/pyth-feed-config.json`, and `update-pyth:*` npm scripts.
- [2026-04-10] Local feed config file `scripts/yahoo-finance-feed-config.json` (superseded by on-chain symbol storage).
- [2026-04-10] Client-side asset registry `apps/web/src/lib/asset-registry.ts` and all `resolveAssetSymbol` / `registerAssetSymbol` imports (superseded by on-chain reads).
- [2026-04-10] `Custom Oracle (Pyth)` badge label from oracle source display; all custom relayer assets now show `Custom Oracle`.

### Fixed

- [2026-04-10] Admin "Register New Asset" now converts non-USD Yahoo Finance quotes to USD before seeding the on-chain price via `wireAsset`, fixing `DeviationTooLarge` reverts on the first relayer price update for assets quoted in foreign currencies (e.g. GBp for LSE stocks). The `/api/yahoo-finance/quote` route now returns a `priceUsd` field with server-side FX conversion.
- [2026-04-10 16:30 UTC+07:00] Web app: contract revert errors now surface clean messages in toasts. Cross-contract custom errors (e.g. `VaultNotRegistered` from VaultAccounting when calling BasketVault) are decoded against a combined error ABI instead of falling through to a generic fallback. Wallet rejections silently dismiss the pending toast instead of showing an error.
- [2026-04-10 14:34 UTC+07:00] CI E2E/local deploy env hardening: `.github/workflows/test.yml` now sets placeholder `ETHERSCAN_API_KEY` and `ARBISCAN_API_KEY` at workflow scope so `forge script ... --broadcast` for local Anvil deploys does not fail on missing explorer API key env vars when no verification is performed.
- [2026-04-10 14:26 UTC+07:00] CI Foundry toolchain install stability: `.github/workflows/test.yml` now pins `foundry-rs/foundry-toolchain@v1` to `v1.3.1` across all jobs (build/test/coverage/lint/e2e) instead of floating `stable`, avoiding upstream `foundryup` attestation/hash mismatches that were failing E2E setup.
- [2026-04-10 14:08 UTC+07:00] CI coverage upload reliability: Codecov upload in `.github/workflows/test.yml` is explicitly non-blocking (`continue-on-error: true` plus `fail_ci_if_error: false`) and now retries once after a failed first attempt, so transient Codecov API `5xx` responses do not fail otherwise healthy workflow runs.
- [2026-04-10 13:10 UTC+07:00] Web app deployment-target subgraph gating: `anvil` now uses subgraph reads whenever `NEXT_PUBLIC_SUBGRAPH_URL` is configured (same behavior as `sepolia`), while preserving RPC fallback when subgraph URL is unset/unavailable/returns unusable rows.
- Web app local-network data source selection: basket/listing surfaces now gate subgraph usage by active deployment target (`isSubgraphEnabled`) instead of raw subgraph URL presence, so Anvil sessions reliably use RPC fallback and show locally created baskets.
- Subgraph network targeting corrected from `arbitrum-sepolia` to `sepolia` for Ethereum Sepolia deployments: `apps/subgraph` sync/manifest/deploy flow now uses `NETWORK=sepolia`, docs/scripts were updated accordingly, and the legacy `apps/subgraph/indexflow-prototype` Studio manifest now also targets `sepolia` with the current `sepolia-deployment.json` BasketFactory address.
- Web app lint reliability: ESLint now ignores generated `.vercel/**` build output, preventing non-source artifacts from causing lint failures during local/CI runs.
- Web app: enforced strict data-source fallback policy for indexed/list/history reads: when `NEXT_PUBLIC_SUBGRAPH_URL` is configured and subgraph queries succeed, subgraph data is preferred; when subgraph is unavailable/errors/returns unusable rows, affected views fully fall back to RPC instead of partial mixed sourcing.
- Web app: fixed `/prices/[assetId]` type mismatch by normalizing invalid asset ids to `undefined` (not `null`) before `useOraclePriceHistory` calls.
- Web app: fixed basket detail page compile issues in `/baskets/[address]` by cleaning duplicated/invalid sections and tightening history-source selection.
- Web app: stabilized `/baskets/[address]` deposit/redeem card height to reduce CLS by always rendering a reserved quote section (with placeholder values), upgraded deposit/redeem tabs to equal-width segmented controls, and clear the amount input whenever switching tabs.
- Web app: `/baskets/[address]` deposit/redeem panel now uses icon tabs with text labels for mode switching and removes the top `Quote preview` header/status chip row to simplify the card header area.
- Web app: normalized GMX USD `1e30` notional displays to full-dollar formatting across exposure surfaces, fixing corrupted outputs like `Net: $1000000000000000000.0B` in composition rows and correcting open-interest / pool notional stat rendering.
- Web app: admin basket `Perp Allocation` card now shows `Available to Deposit` (remaining USDC available for perp allocation) alongside current allocation.
- Web app: portfolio page wraps the value / loading skeleton in a `<div>` instead of `<p>` so `Skeleton` (a `<div>`) is not nested inside a paragraph, avoiding invalid HTML and React hydration warnings.
- `DeployLocal` local deploy script: deploy `VaultMath` and link `Vault` creation bytecode from `out/Vault.sol/Vault.json` so `forge script` no longer fails on `vm.getCode("Vault.sol:Vault")` (wrong artifact id and unlinked `VaultMath` placeholders). `foundry.toml` grants read access to `./out` for `vm.readFile`.
- Web app: admin basket `Perp Position Management` now treats size inputs as USD notional and converts to onchain `1e30` before calling `openPosition` / `closePosition` (collateral remains USDC `1e6`), fixing reverted GOLD-long attempts like `size=10`, `collateral=999` (`Vault: _size must be more than _collateral`). Max-size labels/use-max now display USD-notional values, and open/close errors are surfaced via toasts.
- Web app: basket and admin composition cards now fallback to onchain `VaultAccounting.getPositionTracking` exposure reads per configured asset when subgraph exposure rows are missing/stale, so allocation updates appear immediately after position opens/closes.

### Added

- Root `package.json` dependency on `yahoo-finance2` so `scripts/update-yahoo-finance-prices.js` runs from the repo without `NODE_PATH`; npm scripts `update-yf:local` and `update-yf:local:dry` target `local-deployment.json` and `http://127.0.0.1:8545`.
- Admin oracle tab: deep links to Yahoo Finance (`https://finance.yahoo.com/quote/...`) when a stock is selected in Register New Asset, when Oracle Write Controls has a resolved ticker, and on each oracle status card that maps to a known symbol.
- Yahoo Finance asset search and registration: admin oracle page now includes a "Register New Asset" card that searches any publicly-traded equity via Yahoo Finance and registers it as a `CustomRelayer` oracle asset on-chain with an initial price seed. Admin basket detail `SetAssetsCard` also uses the same search dropdown alongside registered oracle assets.
- Yahoo Finance price relayer: `scripts/update-yahoo-finance-prices.js` fetches quotes from Yahoo Finance for assets in `scripts/yahoo-finance-feed-config.json`, converts non-USD prices via FX rates (`AUDUSD`, `GBPUSD`, `CADUSD`), and submits 8-decimal USD raw prices to `OracleAdapter.submitPrices` + `PriceSync.syncAll`. Initial config includes 24 mining equities across ASX, LSE, and TSX exchanges.
- New npm tasks: `update-yf:sepolia` (broadcast) and `update-yf:sepolia:dry` (dry-run) for Yahoo Finance relayer.
- Next.js API routes `GET /api/yahoo-finance/search` and `GET /api/yahoo-finance/quote` wrapping `yahoo-finance2` for server-side equity search and live quotes.
- [2026-04-10 13:10 UTC+07:00] Sepolia relayer updater path for non-Chainlink assets: `scripts/update-pyth-relayer-prices.js` fetches Hermes latest values for `XAG` and core mining equities (`BHP`, `RIO`, `VALE`, `NEM`, `FCX`, `SCCO`), converts `(price, expo)` to 8-decimal raw values, enforces feed freshness, submits `OracleAdapter.submitPrices`, then calls `PriceSync.syncAll`.
- Oracle operator feed map file `scripts/pyth-feed-config.json` with pinned Pyth feed ids for `XAG` and the core six mining equities.
- New npm tasks for Sepolia relayer operations: `update-pyth:sepolia` (broadcast) and `update-pyth:sepolia:dry` (validation-only).
- `src/mocks/MockChainlinkFeed.sol` for local/testing Chainlink-style mutable feed data (`latestRoundData`) with configurable decimals/description.
- Documentation: new [docs/ORACLE_SUPPORTED_ASSETS.md](docs/ORACLE_SUPPORTED_ASSETS.md) with a Sepolia-only oracle asset matrix mapping each supported symbol (`XAU`, `XAG`, `BHP`, `RIO`, `VALE`, `NEM`, `FCX`, `SCCO`) to its configured source identifier (Chainlink feed address or Pyth feed ID), plus updater path notes.
- Local compose orchestration via `docker-compose.local.yml` and root scripts (`local:up`, `local:down`, `local:logs`) to run Anvil, contract deploy, subgraph deploy, and web UI with compose-managed local subgraph env.
- Web app deployment target state layer (`sepolia` / `anvil`) with persistent browser selection (`localStorage`) and wallet-chain-driven switching.
- Web tests: new deployment helper coverage (`apps/web/src/lib/deployment.test.ts`) and deployment contract resolver coverage (`apps/web/src/config/contracts.test.ts`).
- Web app E2E stack (Playwright + Chromium) under `apps/web/e2e` with deterministic CI wallet mode (`NEXT_PUBLIC_E2E_TEST_MODE=1`), smoke coverage, and a full user lifecycle gate from deposit to redeem-with-profit with admin basket/oracle/pool writes and onchain net-profit assertions.
- CI: new `e2e` job in `.github/workflows/test.yml` for PR/push branches (`main`, `develop`, `feature/**`) that starts Anvil, runs `deploy:local`, executes Playwright, and uploads trace/screenshot/video/report artifacts on failures.
- Web app admin oracle surface: manual write controls on `/admin/oracle` for `OracleAdapter.submitPrice` and `PriceSync.syncAll` (real onchain tx path for relayer price updates).
- Docs: [docs/E2E_TESTING.md](docs/E2E_TESTING.md) runbook covering local and CI E2E setup/assumptions, plus README/docs index updates.
- Integration coverage: new `test/GlobalLiquiditySharingIntegration.t.sol` suite for shared GMX liquidity across multiple vaults/baskets, including multi-vault happy-path assertions, an explicit equal-profit/equal-loss no-global-pool-drain check, constrained-liquidity stress (`Vault: poolAmount exceeded` on second close), and basket-level coupling under shared pool pressure.
- Documentation: new [docs/DEPLOYMENTS.md](docs/DEPLOYMENTS.md) deployment registry with per-network status (local/Sepolia/Arbitrum), canonical contract addresses, Sepolia Etherscan links, sender context, and refresh/verification commands.
- Repo tooling: Husky-managed pre-commit hook (`.husky/pre-commit`) runs `forge fmt --check` + `npm run lint:web`; pre-push hook (`.husky/pre-push`) validates lockfile consistency via `npm ls`; `prepare` runs `husky` to set `core.hooksPath`.
- Subgraph: `AssetTokenMapped` indexing support via a new immutable `AssetTokenMapUpdate` entity, plus manifest handler wiring for `VaultAccounting.AssetTokenMapped`.
- Subgraph: `sync:networks` workflow/script to derive `apps/subgraph/networks.json` addresses from `apps/web/src/config/local-deployment.json` and `apps/web/src/config/sepolia-deployment.json`.
- Web app prices drilldown route (`/prices/[assetId]`) with per-asset header status, historical `PriceUpdated` timeline, and price chart window controls (`24H`, `7D`, `30D`; default `7D`).
- Web app oracle price history data path: subgraph-first query for `OraclePriceUpdate` rows with RPC `getLogs` fallback (`PriceUpdated` events) when subgraph history is unavailable.
- Subgraph `OraclePriceUpdate` entity and `OracleAdapter` mapping persistence for immutable per-event oracle history (`assetId`, `price`, `priceTimestamp`, `blockNumber`, `txHash`, `logIndex`, `createdAt`), plus mapping test coverage.
- Web app: in-app docs/wiki under `/docs` with searchable section metadata, role filters, start-here paths, stable subsection routes (`/docs/overview`, `/docs/investor`, `/docs/operator`, `/docs/oracle-price-sync`, `/docs/pool-management`, `/docs/contracts-reference`, `/docs/troubleshooting`, `/docs/security-risk`), reusable per-page template sections (`Who is this for`, `What this section covers`, `Required permissions`, `Step-by-step flow`, `Failure modes`, `Related pages`), role badges, network context callouts, and in-page table-of-contents anchors.
- Web app docs IA expansion: new in-app routes `/docs/perp-risk-math` and `/docs/operator-interactions` with leverage formulas, unit glossary, operator preflight/postflight checklists, and per-contract interaction matrix data (inputs, preconditions, state deltas, failure risks, post-tx checks). Added canonical markdown companions: [docs/PERP_RISK_MATH.md](docs/PERP_RISK_MATH.md) and [docs/OPERATOR_INTERACTIONS.md](docs/OPERATOR_INTERACTIONS.md).
- Web navigation now links to docs from the main header and admin sidebar; admin overview quick actions include `Docs Wiki`.
- [docs/README.md](docs/README.md): maintainer-facing documentation index mirroring the in-app wiki IA and canonical markdown sources.
- [docs/SHARE_PRICE_AND_OPERATIONS.md](docs/SHARE_PRICE_AND_OPERATIONS.md): share-price calculation reference, dry-run oracle update commands, admin position/PnL update flow, and investor withdrawal-with-profit walkthrough.
- Subgraph schema/mapping support for per-basket perp exposure (`BasketExposure`: `longSize`, `shortSize`, `netSize`) and web query hooks for exposure + paginated basket activity history.
- Investor vault detail page (`/baskets/[address]`) now includes a `Vault History` timeline (subgraph-backed with load-more) plus RPC fallback over BasketVault and VaultAccounting logs when subgraph data is unavailable.
- Web app (`/admin/pool`): global GMX pool write controls for all whitelisted tokens:
  - gov-gated `setBufferAmount`
  - direct pool funding flow (`ERC20.transfer(gmxVault, amount)` then `directPoolDeposit(token)`)
  Includes token symbol/decimals/wallet balance reads for human-unit inputs, plus `parseTokenAmountInput` coverage tests.
- [docs/PRICE_FEED_FLOW.md](docs/PRICE_FEED_FLOW.md): price-feed lifecycle (bootstrap admin, reconfiguration, Chainlink vs custom relayer sync, consumer reads, optional direct `SimplePriceFeed` updates) with Mermaid sequence diagrams; README **Documentation** link.
- [docs/INVESTOR_FLOW.md](docs/INVESTOR_FLOW.md): investor-oriented flow for basket shares, mint/redeem vs NAV, perp allocation, and operational dependencies; README **Documentation** links.
- Web app: SVG favicon (`icon.svg`) and matching inline header logo — white triangle on a black circle.
- `VaultAccounting.getVaultPnL` aggregate **unrealised** mark-to-market PnL per basket vault (sum of GMX `getPositionDelta` over open legs; GMX USD precision; price PnL only, not funding), with per-vault `_openPositionKeys` enumeration. In-place upgrades need a backfill of that list for already-open legs (or redeploy).
- Unit tests for aggregate unrealised PnL (`test/VaultAccounting.t.sol`) and integration checks vs GMX deltas (`test/Integration.t.sol`, `test/VaultAccountingIntegration.t.sol`).
- Web tests: `apps/web/src/lib/wiki.test.ts` validates slug/page registry integrity, docs home start-path route resolution, and non-empty structured docs sections.
- README **Operations** section: PriceSync vs OracleAdapter, keeper setup, Chainlink vs custom relayer price flow, and funding keeper calls.
- Web app: liquidity-aware indicative quotes from `PricingEngine` on Admin → Position Management (open form) and on Live Prices when a USDC notional is entered; uses GMX USDC `poolAmount` as liquidity input (GMX fills may still differ).
- Integration test suite (`test/VaultAccountingIntegration.t.sol`) covering VaultAccounting `openPosition` / `closePosition` against the real GMX Vault: long profitable, long loss, short profitable, and full deposit→open→close→withdraw pipeline with PnL verification.
- Initial changelog and Cursor rule for maintaining this file.
- Per-vault risk limits in VaultAccounting: `maxOpenInterest` and `maxPositionSize` caps with admin setters.
- Emergency pause mechanism (`setPaused`) on VaultAccounting; blocks `openPosition`, `closePosition`, `depositCapital`, and `withdrawCapital` when active.
- Optional `maxPerpAllocation` cap on BasketVault to limit capital sent to the perp pool.
- Events: `MaxOpenInterestSet`, `MaxPositionSizeSet`, `PauseToggled`.
- Risk-limits unit test suite (`test/RiskLimits.t.sol`) covering owner-gated setters, pause/unpause deposit/withdraw blocking, and BasketVault `maxPerpAllocation` enforcement.
- `src/gmx/libraries/VaultMath.sol`: linked library for position PnL / next-average-price pure math; `VaultPricing` delegates `getDelta` and `getNextAveragePrice` to it to reduce `Vault` runtime bytecode.

### Removed

- [2026-04-10 13:10 UTC+07:00] Dead vendored GMX code: duplicate math libraries, unused OZ subtrees (ERC721, introspection, Strings, EnumerableMap/Set, vendored ERC20/Ownable), unused token implementations (WETH, Token), reference-only contracts (VaultPriceFeed, FastPriceFeed, FastPriceEvents), and ~20 unused interfaces for stripped modules (staking, AMM, governance, GLP, PositionRouter).
- Reader.sol functions for stripped features: `getTotalStaked`, `getStakingInfo`, `getVestingInfo`, `getPairInfo`.

### Changed

- [2026-04-10 13:52 UTC+07:00] Web app `/prices` and `/prices/[assetId]` oracle source badges are now dynamically derived from configured source metadata: `Chainlink` for Chainlink feeds, `Custom Oracle (Pyth)` for known Pyth-relayed custom assets, and `Custom Oracle` for other custom-relayer assets.
- [2026-04-10 13:44 UTC+07:00] Web app `/prices` and `/prices/[assetId]` source badges now identify custom-relayer assets as `Custom Oracle (Pyth)` (instead of generic `Custom Oracle`) so operators can immediately see that those feeds come from the Pyth relayer path.
- [2026-04-10 13:33 UTC+07:00] `SyncAllOraclePrices` operator table was simplified to remove low-signal identifiers: rows now show token symbol-style asset labels (for example `GOLD`, `SILVER`, `BHP`) with `Before/Adapter/After/Status`, plus a changed-only `Before -> After` section, without printing asset hash ids or token addresses.
- [2026-04-10 13:31 UTC+07:00] `SyncAllOraclePrices` script logs were reformatted for operator readability: post-sync output now prints a single markdown-style summary table (`Before`, `Adapter`, `After`, `Status`), marks changed prices with `>>value<<`, and adds a dedicated `Changed Prices` section that lists only rows where feed price actually changed.
- [2026-04-10 13:10 UTC+07:00] Oracle deployment profiles now use a mixed-source Sepolia/local model:
  - `XAU` configured as `FeedType.Chainlink` (`0xC5981F461d74c46eB4b0CF3f4Ec79f025573B0Ea` on Sepolia, mock Chainlink feed locally).
  - `XAG` plus mining equities (`BHP`, `RIO`, `VALE`, `NEM`, `FCX`, `SCCO`) configured as `FeedType.CustomRelayer` with `stalenessThreshold=86400` and `deviationBps=2000`.
  - New asset ids are wired through local/Sepolia deploy scripts for index token creation, GMX token config, `VaultAccounting.mapAssetToken`, `FundingRateManager.mapAssetToken`, and `PriceSync.addMapping`.
- `SubmitAndSyncOraclePrices` manual override support now covers relayed `XAG` and mining equities (`BHP`, `RIO`, `VALE`, `NEM`, `FCX`, `SCCO`) while leaving `XAU` on the Chainlink read path.
- Oracle and operations docs now include the Sepolia mixed-source runbook and relayer updater command flow.
- Web app runtime contract resolution now follows selected deployment target: `anvil` resolves from `apps/web/src/config/local-deployment.json`, `sepolia` resolves from `apps/web/src/config/sepolia-deployment.json`.
- Web app wallet network guard now auto-switches MetaMask to the selected deployment chain (Anvil or Sepolia) instead of always forcing Sepolia.
- Web app subgraph policy now disables subgraph reads when deployment target is `anvil`, using RPC-only paths/fallbacks where available.
- Web app `/docs` migrated from hardcoded wiki JSON to direct markdown rendering from repository `docs/*.md` with canonical filename-based routes, searchable docs index built from a server manifest, legacy route alias compatibility redirects, and live Mermaid rendering for fenced `mermaid` code blocks.
- Web app wallet UX: added a global MetaMask network guard that auto-prompts `wallet_switchEthereumChain` to Ethereum Sepolia when a connected MetaMask session is on the wrong chain (including Anvil), with cooldown/in-flight protection and error toast fallback to avoid prompt loops.
- Web app contract config wiring (`apps/web/src/config/contracts.ts`): `anvil` runtime mapping now points to `sepolia-deployment.json` addresses (same source as Sepolia), so local app sessions read from the existing Sepolia deployment JSON instead of `local-deployment.json`.
- Web app: basket deposit/redeem panel now shows a live quote preview, action icons, inline transaction rail states, and clearer submit/approval status feedback; shared status/trend pill primitives and basket icon helpers were added for consistency.
- Web app UI: added reusable information popups (`InfoTooltip` + `InfoLabel`) across titled cards and table-like headers, including stat cards and admin basket list headers, with centralized tooltip copy keys for consistent operator-facing explanations.
- Web docs and landing page copy: rewrote in-app wiki language and homepage messaging for a more beginner-friendly explanation of deposits, basket shares, shared perp trading, operator roles, and liquidity constraints.
- Web app basket/admin composition cards now use a four-state matrix: allocated composition, assets-added-without-perp-activity, no-assets-allocated-yet (`0.00%` rows), and no-assets-listed-yet; configured assets prefer onchain `getAssetCount/getAssetAt` reads with subgraph fallback to avoid indexing-lag gaps, and configured-asset rows show asset name + address subtext + latest oracle price + last update time.
- Web app basket/admin composition section now keeps one stable card/table layout (same heading, row geometry, allocation rail, and aggregate row) across allocated/zero-alloc/loading/empty states, with compact per-state notes and placeholder/skeleton rows to reduce CLS.
- Web app `Perp-Driven Composition` allocated rows now consistently render asset name + address on both public/admin pages (instead of raw asset ids on public), with aligned net/long/short detail hierarchy while preserving the stable low-CLS layout.
- Web app `Perp-Driven Composition` allocated rows now use a shared public/admin renderer with a diverging long-vs-short graphic, net-direction badge, full-dollar notional labels (`Net`, `Long`, `Short`), and subordinated allocation rail so exposure skew is immediately visible.
- Web app home page (`/`) redesigned to a high-energy, proof-first landing flow: stronger hero hierarchy, live protocol metrics strip (TVL/open interest/active baskets/perp utilization), tighter capital-flow narrative, explicit trust surface, and CTA priority toward opening baskets.
- Basket contracts are now weightless and fully perp-driven for pricing:
  - `BasketFactory.createBasket` no longer accepts initial `assetIds/weights`.
  - `BasketVault.setAssets` now accepts only `bytes32[] assetIds`.
  - Share pricing/mint/redeem flows use NAV (`idle USDC + perp allocated + realised/unrealised perp PnL`) instead of weighted basket oracle pricing.
  - `BasketVault.withdrawFromPerp` and `VaultAccounting.withdrawCapital` now support withdrawing realised profits (not only principal) while keeping accounting state consistent.
- Web admin basket setup no longer collects base weights; asset registration is ID-only.
- Web basket/admin composition UI removed base-weight presentation and now renders perp-driven exposure composition from indexed `long/short/net` sizes.
- `foundry.toml`: `optimizer_runs` lowered (200 → 1), `bytecode_hash = "none"`, and `cbor_metadata = false` so the deployed `Vault` stays under the EIP-170 runtime limit together with `VaultMath` linking.
- `VaultPricing.sol`: `_getDeltaInner` / `_getNextAveragePriceInner` isolate storage reads and library calls to satisfy the stack depth limit under `via_ir`.

- README: CI and Codecov line-coverage badges; NatSpec coverage table removed. CI runs `forge coverage --ir-minimum` and uploads LCOV to Codecov via OIDC.
- Documentation: expanded NatSpec across first-party Solidity 0.8.x contracts and interfaces in `src/perp/` and `src/vault/` (external/public API, structs, and errors) for even coverage and easier auditing.
- `PerpReader.getTotalVaultValue` includes unrealised PnL from `getVaultPnL` so basket NAV is mark-to-market (previously realised only).
- Web app: MetaMask in the RainbowKit modal uses wagmi’s injected extension connector (`eth_requestAccounts` / `wallet_requestPermissions`) instead of the MetaMask SDK path, so the browser extension prompt reliably appears.
- CI: push runs only on `main`, `develop`, and `feature/**`; test job runs after build (`needs: build`); single `forge test -vvv` step; removed non-enforcing TODO/FIXME grep from lint.
