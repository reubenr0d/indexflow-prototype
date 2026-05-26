# Vault Themes Skill

Heuristics and lookups for `basket-ideator` when proposing new basket themes. Keeps proposals grounded in oracle reality, existing inventory, and the Season 1 curator-persona taxonomy.

## Authoritative inputs

- [`docs/ORACLE_SUPPORTED_ASSETS.md`](../../docs/ORACLE_SUPPORTED_ASSETS.md) — canonical asset universe + oracle relayer per asset.
- [`growth/basket-concepts/REGISTRY.md`](../../growth/basket-concepts/REGISTRY.md) — append-only roll-up of every proposed/approved/launched theme.
- [`growth/basket-concepts/queue/`](../../growth/basket-concepts/queue/) — live proposal files (frontmatter schema in `growth/basket-concepts/README.md`).
- [`growth/GALXE_CAMPAIGN_PLAN.md`](../../growth/GALXE_CAMPAIGN_PLAN.md) — Track A / B / C / Cross-Chain-Couriers persona definitions.
- [`growth/X_CONTENT_CALENDAR.md`](../../growth/X_CONTENT_CALENDAR.md) — Season 1 slot alignment.
- `apps/web/src/config/*-deployment.json` — live contract addresses (to know which BasketFactory will deploy a theme).
- Envio HyperIndex `BasketCreated` event history (live dedupe — what's actually on-chain right now).

## The four-question gate

A theme passes only if **all four** answers are yes:

1. **Oracle coverage?** At least 3 of the proposed assets resolve in `docs/ORACLE_SUPPORTED_ASSETS.md`. Anything below that needs an explicit `oracle_gap_flag: true` + a remediation paragraph (e.g. "yfinance relayer can pick up this BMV ticker — needs `configureAsset` per symbol, no new contract code").
2. **Not a duplicate?** No `status: proposed | approved | launched` row in REGISTRY.md for the same theme. No live `BasketCreated` event whose `vaultName` overlaps the proposed name by more than two tokens.
3. **Clear curator persona?** Exactly one (or two adjacent) of: `galxe_track_a_institutional`, `galxe_track_b_crypto_builder`, `galxe_track_c_ai_engineer`, `galxe_track_cross_chain_couriers`. Themes without a target persona are speculation, not pipeline.
4. **Plausible calendar tie-in?** At least one X-calendar slot in the next 30 days where this theme could anchor the post (e.g. "Many baskets, one engine" on Thu Jun 11 wants a *non-mining* theme). If no slot exists, propose as a backlog entry, not a queue/ file.

If any answer is "no", skip the theme — don't try to talk yourself into it.

## Frontmatter shape (mechanical)

The seed file [`growth/basket-concepts/queue/2026-05-26-ai-infrastructure-basket.md`](../../growth/basket-concepts/queue/2026-05-26-ai-infrastructure-basket.md) is the worked example. Required:

```yaml
---
status: proposed
proposedDate: <YYYY-MM-DD>
proposedBy: basket-ideator

theme: <Title Case Theme Name>
slug: <kebab-case-slug>
rationale: |
  <2-4 paragraph market thesis. Cite Season narrative slot. Name the curator
  persona. State what gap this fills vs existing baskets.>

targetCuratorPersona:
  - <one or two from the Galxe persona enum>

assets:
  - symbol: <TICKER>
    exchange: <NASDAQ | TSX | ASX | ...>
    oracle: <relayer id from docs/ORACLE_SUPPORTED_ASSETS.md>
    registeredOnChain: <bool — already wired via configureAsset?>
    notes: <one-line context>

seasonNarrativeAlignment:
  slotDate: <YYYY-MM-DD>
  arc: <which X-calendar slot this anchors>

oracleGapFlag: <bool>
oracleGapRemediation: <only if oracleGapFlag: true; describe the unblock>

estimatedLaunchEta: <ISO week range, e.g. "2026-W24 → 2026-W25">
---
```

Any deviation from this shape blocks the risk-officer review.

## Handoff (do this every tick, even on a skip)

After writing the queue/ file, you MUST:

1. Append a row to `growth/basket-concepts/REGISTRY.md` with `(date, slug, theme, status: proposed)`.
2. Open a `category: vault-concept` issue via `propose_issue` that links the queue/ file and summarises what the trading-agent author would need (oracle wiring, perp eligibility, risk parameters).

The handoff chain is fixed: ideator proposes → founder approves → founder (or `issue-implementer`) authors `agents/<vault-name>-manager.md` → existing `scripts/agent-runner.mjs` + `.github/workflows/vault-agent.yml` deploys. You never touch any of those downstream steps.

## What this skill is NOT

- **Not** a market timing tool. We don't forecast prices; we propose *coverage* gaps.
- **Not** a vault deployer. `mayDeployContracts: false` in `COMPANY.md` is a hard wall.
- **Not** a curator. Once a theme is approved, a human or trading-agent picks it up — the ideator's job ends at handoff.
