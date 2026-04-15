# IndexFlow Protocol

IndexFlow is a structured-exposure protocol built around basket vaults that accept USDC, mint transferable basket shares, and optionally allocate capital into a shared perpetual-liquidity layer derived from a GMX v1 fork.

This documentation covers the protocol architecture, operator guides, oracle infrastructure, and governance considerations.

## Core Concepts

Start here to understand how the protocol works.

- [Technical Architecture & Roadmap](./TECHNICAL_ARCHITECTURE_AND_ROADMAP.md) — Full system architecture, module map, NAV math, and development roadmap.
- [Investor Flow](./INVESTOR_FLOW.md) — Deposit, redeem, share pricing, and what investors do and don't control.
- [Share Price & Operations](./SHARE_PRICE_AND_OPERATIONS.md) — NAV calculation, share price mechanics, deposit/redeem math, and dry-run scripts.

## Guides

Step-by-step runbooks for curators, operators, and asset managers.

- [Curator & Asset Manager Flow](./ASSET_MANAGER_FLOW.md) — What curators do, decision framework, basket setup, capital allocation, position management, and risk controls.
- [Perp Risk Math](./PERP_RISK_MATH.md) — Leverage formulas, sizing heuristics, liquidation caveats, and pre/post-flight checklists.
- [Operator Interactions](./OPERATOR_INTERACTIONS.md) — Contract call reference for every operator-callable function with plain-English summaries.

## Infrastructure

Oracle feeds, deployments, and pool management.

- [Price Feed Flow](./PRICE_FEED_FLOW.md) — OracleAdapter, PriceSync, Chainlink vs custom relayer, and keeper setup.
- [Oracle & Supported Assets](./ORACLE_SUPPORTED_ASSETS.md) — Supported assets on Sepolia, Yahoo relayer integration, and adding new assets.
- [Global Pool Management](./GLOBAL_POOL_MANAGEMENT_FLOW.md) — GMX buffer amounts, direct pool deposits, and the admin pool interface.
- [Deployments](./DEPLOYMENTS.md) — Sepolia and local contract addresses, subgraph deployment, and refresh commands.

## Operations

Testing, notifications, and operational tooling.

- [E2E Testing](./E2E_TESTING.md) — Playwright + Anvil setup, test modes, CI configuration, and RPC fallbacks.
- [Push Notifications](./PWA_PUSH_NOTIFICATIONS.md) — PWA manifest, service worker, Cloud Run/Firestore infrastructure, and staging runbook.

## Protocol

Tokenomics, governance, and regulatory considerations.

- [Utility Token & Tokenomics](./UTILITY_TOKEN_TOKENOMICS.md) — Backstop mechanics, redemption reserves, ve-model, emissions, and POL.
- [Regulatory Roadmap](./REGULATORY_ROADMAP_DRAFT.md) — EU-focused regulatory planning and compliance checklist (draft).
- [Agents Framework](./AGENTS_FRAMEWORK.md) — Multi-agent architecture, MCP tool reference, vault lifecycle workflows, and memory model.
