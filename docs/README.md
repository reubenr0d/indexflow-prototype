# Documentation Index

This index mirrors the in-app docs routes at `/docs` in the web app.

## Repo-only technical papers

These markdown files live in `docs/` but are intentionally **not** mapped to in-app `/docs` routes:

- [INDEXFLOW_TECHNICAL_WHITEPAPER.md](./INDEXFLOW_TECHNICAL_WHITEPAPER.md) — canonical engineering whitepaper for the current repo snapshot, with code references, interface pack, mermaid diagrams, and roadmap labels.

## In-app docs map (canonical routes)

- `/docs` — searchable index built from repository markdown under `docs/*.md`.
- `/docs/readme` — source: `docs/README.md`
- `/docs/investor-flow` — source: `docs/INVESTOR_FLOW.md`
- `/docs/asset-manager-flow` — source: `docs/ASSET_MANAGER_FLOW.md`
- `/docs/perp-risk-math` — source: `docs/PERP_RISK_MATH.md`
- `/docs/operator-interactions` — source: `docs/OPERATOR_INTERACTIONS.md`
- `/docs/price-feed-flow` — source: `docs/PRICE_FEED_FLOW.md`
- `/docs/oracle-supported-assets` — source: `docs/ORACLE_SUPPORTED_ASSETS.md`
- `/docs/global-pool-management-flow` — source: `docs/GLOBAL_POOL_MANAGEMENT_FLOW.md`
- `/docs/deployments` — source: `docs/DEPLOYMENTS.md`
- `/docs/e2e-testing` — source: `docs/E2E_TESTING.md`
- `/docs/share-price-and-operations` — source: `docs/SHARE_PRICE_AND_OPERATIONS.md`
- `/docs/pwa-push-notifications` — source: `docs/PWA_PUSH_NOTIFICATIONS.md`
- `/docs/utility-token-tokenomics` — source: `docs/UTILITY_TOKEN_TOKENOMICS.md`
- `/docs/regulatory-roadmap-draft` — source: `docs/REGULATORY_ROADMAP_DRAFT.md`
- `/docs/agents-framework` — source: `docs/AGENTS_FRAMEWORK.md`

## Legacy route aliases

These legacy in-app wiki routes are preserved for compatibility and redirect to canonical routes:

- `/docs/overview` -> `/docs/readme`
- `/docs/investor` -> `/docs/investor-flow`
- `/docs/operator` -> `/docs/asset-manager-flow`
- `/docs/perp-risk-math` -> `/docs/perp-risk-math`
- `/docs/operator-interactions` -> `/docs/operator-interactions`
- `/docs/oracle-price-sync` -> `/docs/price-feed-flow`
- `/docs/pool-management` -> `/docs/global-pool-management-flow`
- `/docs/contracts-reference` -> `/docs/readme`
- `/docs/troubleshooting` -> `/docs/readme`
- `/docs/security-risk` -> `/docs/readme`
- `/docs/pwa-notifications` -> `/docs/pwa-push-notifications`

## Canonical markdown sources

- [README.md](./README.md)
- [INDEXFLOW_TECHNICAL_WHITEPAPER.md](./INDEXFLOW_TECHNICAL_WHITEPAPER.md) — repo-only technical whitepaper, not an in-app `/docs` route
- [INVESTOR_FLOW.md](./INVESTOR_FLOW.md)
- [ASSET_MANAGER_FLOW.md](./ASSET_MANAGER_FLOW.md)
- [PERP_RISK_MATH.md](./PERP_RISK_MATH.md)
- [OPERATOR_INTERACTIONS.md](./OPERATOR_INTERACTIONS.md)
- [PRICE_FEED_FLOW.md](./PRICE_FEED_FLOW.md)
- [ORACLE_SUPPORTED_ASSETS.md](./ORACLE_SUPPORTED_ASSETS.md)
- [GLOBAL_POOL_MANAGEMENT_FLOW.md](./GLOBAL_POOL_MANAGEMENT_FLOW.md)
- [DEPLOYMENTS.md](./DEPLOYMENTS.md)
- [E2E_TESTING.md](./E2E_TESTING.md)
- [SHARE_PRICE_AND_OPERATIONS.md](./SHARE_PRICE_AND_OPERATIONS.md)
- [PWA_PUSH_NOTIFICATIONS.md](./PWA_PUSH_NOTIFICATIONS.md)
- [UTILITY_TOKEN_TOKENOMICS.md](./UTILITY_TOKEN_TOKENOMICS.md)
- [REGULATORY_ROADMAP_DRAFT.md](./REGULATORY_ROADMAP_DRAFT.md)
- [AGENTS_FRAMEWORK.md](./AGENTS_FRAMEWORK.md) — multi-agent framework: agent definitions, MCP tool reference, vault lifecycle, and memory

## Sync expectation

When markdown files under `docs/` change, `/docs` reflects those changes automatically because content is rendered directly from repository markdown.
