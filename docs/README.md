# Documentation Index

This index mirrors the in-app wiki information architecture used at `/docs` in the web app.

## In-app wiki map

- `/docs` — searchable docs hub with role filters and start-here tracks.
- `/docs/overview` — protocol mental model and system paths.
- `/docs/investor` — deposit/redeem mechanics and liquidity behavior.
- `/docs/operator` — basket/perp setup and daily operations runbook.
- `/docs/oracle-price-sync` — keeper and feed synchronization operations.
- `/docs/pool-management` — GMX pool controls (`setBufferAmount`, `directPoolDeposit`).
- `/docs/contracts-reference` — contract capability and permissions map.
- `/docs/troubleshooting` — common failures, diagnostics, and recovery flow.
- `/docs/security-risk` — role boundaries, risk controls, and operational guardrails.

## Canonical markdown sources

- [INVESTOR_FLOW.md](./INVESTOR_FLOW.md)
- [ASSET_MANAGER_FLOW.md](./ASSET_MANAGER_FLOW.md)
- [GLOBAL_POOL_MANAGEMENT_FLOW.md](./GLOBAL_POOL_MANAGEMENT_FLOW.md)
- [PRICE_FEED_FLOW.md](./PRICE_FEED_FLOW.md)
- [../README.md](../README.md) (Operations + deployment workflow)
- [../MODIFICATIONS.md](../MODIFICATIONS.md) (upstream GMX diffs)

## Content template standard

Each in-app wiki page follows this normalized template:

- Who is this for
- What this section covers (`Overview / Guides / Reference`)
- Required permissions
- Step-by-step flow
- Failure modes
- Related pages

When markdown docs are updated, ensure corresponding in-app wiki content stays aligned.
