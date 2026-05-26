---
status: proposed
proposedDate: 2026-05-26
proposedBy: reuben

theme: AI Infrastructure Basket
slug: ai-infrastructure-basket
rationale: |
  Capex cycle for AI compute is the single largest equity-market theme
  of 2026. Asset managers (Galxe Track A) want a single transferable
  share that gives them exposure across the AI supply chain --
  accelerators, memory, foundry, equipment, hyperscalers -- without
  picking winners inside any one layer. No equivalent basket exists
  on IndexFlow yet (Minestarters covers mining-equity; nothing covers
  tech). All target tickers route through the existing Yahoo Finance
  relayer, so the unblock is procedural (`configureAsset` per ticker)
  rather than infrastructural. Designed as the first **non-mining**
  basket on IndexFlow, anchoring the Season 1 "many baskets, one
  engine" narrative scheduled for Thu Jun 11.

targetCuratorPersona:
  - galxe_track_a_institutional
  - galxe_track_b_crypto_builder

assets:
  - symbol: NVDA
    exchange: NASDAQ
    oracle: yahoo-finance-relayer
    registeredOnChain: false
    notes: AI accelerator leader; Blackwell ramp through 2026
  - symbol: AMD
    exchange: NASDAQ
    oracle: yahoo-finance-relayer
    registeredOnChain: false
    notes: MI300X / MI325X challenger
  - symbol: AVGO
    exchange: NASDAQ
    oracle: yahoo-finance-relayer
    registeredOnChain: false
    notes: Custom AI silicon (Google TPU manufacturing partner)
  - symbol: MU
    exchange: NASDAQ
    oracle: yahoo-finance-relayer
    registeredOnChain: false
    notes: HBM3/HBM3E memory supplier; HBM is the AI capacity bottleneck
  - symbol: TSM
    exchange: NYSE
    oracle: yahoo-finance-relayer
    registeredOnChain: false
    notes: NYSE ADR for Taiwan Semiconductor (2330.TW); foundry for NVDA + AMD + AVGO
  - symbol: ASML
    exchange: NASDAQ
    oracle: yahoo-finance-relayer
    registeredOnChain: false
    notes: NASDAQ ADR for ASML.AS; EUV lithography monopoly
  - symbol: AMAT
    exchange: NASDAQ
    oracle: yahoo-finance-relayer
    registeredOnChain: false
    notes: Deposition + etch equipment; secondary equipment beneficiary
  - symbol: MSFT
    exchange: NASDAQ
    oracle: yahoo-finance-relayer
    registeredOnChain: false
    notes: Azure + OpenAI partnership; largest single hyperscaler capex line
  - symbol: GOOGL
    exchange: NASDAQ
    oracle: yahoo-finance-relayer
    registeredOnChain: false
    notes: TPU + Gemini; vertically integrated AI stack
  - symbol: META
    exchange: NASDAQ
    oracle: yahoo-finance-relayer
    registeredOnChain: false
    notes: Llama open-weights program; large GPU spend justifies inclusion despite no cloud business

oracleGap: partial
oracleGapRemediation: |
  All 10 tickers are Yahoo Finance-supported US equities or ADRs and
  the relayer already covers them as a class (see
  `docs/ORACLE_SUPPORTED_ASSETS.md` §Adding more assets), but none are
  registered on Sepolia today -- the default `DeploySepolia` deploy
  only seeds `BHP.AX`. Operator unblock:

  1. For each ticker, the operator (or a curator with admin rights)
     runs `OracleAdapter.configureAsset(symbol, ...)` via the Admin →
     Assets UI or directly via Foundry script.
  2. After each `configureAsset`, the existing relayer cron
     (`scripts/update-yahoo-finance-prices.js`, exposed as
     `npm run update-prices:sepolia`) auto-picks the new asset on its
     next tick -- no relayer code changes needed.
  3. Verify each new symbol resolves via `OracleAdapter.getPrice` and
     that `PriceSync.syncAll()` pushes the value into GMX
     `SimplePriceFeed`.

  Symbol-policy note (per docs/ORACLE_SUPPORTED_ASSETS.md §Adding more
  assets): all 10 tickers are unique unsuffixed equities, which are
  explicitly allowed. No suffix disambiguation needed (unlike
  `BHP.AX` / `BHP.L`).

handoff:
  existingAgentBinding: null
  newAgentRequired: false
  vaultBindingHint: |
    V1 launch is manually curated -- no trading agent required. The
    curator (founder for V1; a Track-A operator later) sets equal-weight
    allocation at launch and rebalances quarterly by hand. This is
    deliberate: Track A institutional managers explicitly value manual
    curation, and "no algo" is part of the pitch for this basket. If
    weekly cadence outgrows manual review (>= 1h/week), promote to a
    new `agents/ai-infra-manager.md` prompt modelled on mining-manager
    but with sector-equity signal sources (e.g. semiconductor capex
    surveys, hyperscaler earnings transcripts, EUV shipment data) and
    refresh `existingAgentBinding` here.

season1SlotAlignment: 2026-06-11   # Thu — anchors the "many baskets, one engine" standalone (Track C, Engineers Guild). AI Infra is the concrete proof point that the engine supports themes beyond mining.
partnerships: []   # No partner-aligned ticker; could co-feature with a partner-mining basket once partner-named baskets launch
estimatedLaunchEta: 2026-06-04   # Thu — gives 1 week of on-chain price stability before the Thu Jun 11 X slot

redFlagChecks:
  oracleCoverage: partial          # exists at the class level, not yet at the per-asset registered-on-chain level
  duplicationCheck: pass           # no AI-themed basket exists in Envio history as of 2026-05-26
  regulatorySensitivity: low       # public US-listed equities + ADRs; no firearms / cannabis / single-issuer concentration
  singleIssuerConcentration: pass  # equal-weight => 10% per name; well under the 40% threshold
  symbolPolicy: pass               # all tickers are unique unsuffixed equities (allowed per docs/ORACLE_SUPPORTED_ASSETS.md)

decisionLog:
  - date: 2026-05-26
    by: reuben
    decision: proposed
    notes: First worked example seeded manually to validate the basket-concepts workflow before basket-ideator is authored.
---

# AI Infrastructure Basket

## Thesis

The 2026 AI capex cycle is concentrated across five interlocking layers: **accelerators** (NVDA, AMD, AVGO), **memory** (MU), **foundry** (TSM), **equipment** (ASML, AMAT), and **hyperscalers** (MSFT, GOOGL, META). A diversified basket lets an asset manager take exposure to the capex theme without picking winners inside any single layer. Stratified by layer rather than by market cap, the basket holds equal weights at launch and rebalances quarterly to the same weights (a deliberately uninteresting allocation policy -- the basket's value is the diversification, not the active call).

## Why this basket on IndexFlow specifically

1. **Transferable shares.** A DAO treasury, family office, or fund-of-funds can hold the basket share token and trade it without unwinding the underlying. None of the five-layer ETFs (e.g. SOXX, SMH) ship as composable share tokens.
2. **Honest redemption mechanics.** The basket's `BasketVault` ships with the same NAV-vs-redeemable-liquidity discipline as every other IndexFlow basket (see [`docs/WHITEPAPER_DRAFT.md`](../../../docs/WHITEPAPER_DRAFT.md) §1). Asset managers can quote redemption depth as a parameter, not a promise.
3. **Curator narrative.** This is the first **non-mining** basket on IndexFlow. It proves the protocol's thesis that the engine is theme-agnostic -- which is exactly the narrative Thu Jun 11's "many baskets, one engine" X slot needs as a concrete proof point.

## Allocation at launch

| layer | symbol | weight |
|-------|--------|--------|
| Accelerators | NVDA, AMD, AVGO | 10% each (30% total) |
| Memory | MU | 10% |
| Foundry | TSM | 10% |
| Equipment | ASML, AMAT | 10% each (20% total) |
| Hyperscalers | MSFT, GOOGL, META | 10% each (30% total) |

Rebalance back to equal weights every quarter. No dynamic reweighting in V1.

## X content angle (for `content-publisher` once live)

Anchor the Thu Jun 11 standalone (`growth/drafts/2026-06-11-tweet-many-baskets-one-engine.md`) with this basket as the named example. Suggested hook: *"Same engine that runs the Minestarters mining baskets just shipped an AI infrastructure basket. Different sector, same NAV-vs-exit-liquidity discipline."* Quote-tweet 2 hours later with the basket's testnet deep-link including `utm_source=x&utm_campaign=season-1` for attribution.

## Launch checklist (operator)

- [ ] Confirm the 10 tickers are still the right layer representatives (refresh during the week of launch — supply-chain news moves fast)
- [ ] For each ticker, run `OracleAdapter.configureAsset(symbol, ...)` on Sepolia (Admin → Assets UI or Foundry script)
- [ ] Run `npm run update-prices:sepolia:dry` to confirm all 10 prices resolve before broadcast
- [ ] Run `npm run update-prices:sepolia` to seed the initial prices and `PriceSync.syncAll()`
- [ ] Verify `OracleAdapter.getPrice(keccak256("NVDA"))` etc. returns expected values
- [ ] Deploy the BasketVault via the standard curator UI; name it "AI Infrastructure" (slug `ai-infra`)
- [ ] Deposit small USDC seed to confirm shares mint correctly
- [ ] Update this concept file: flip `status: approved -> launched`; add `launched:` block with `launchedDate`, `onChainVaultAddress`, `xPostedUrl`
- [ ] Update [`REGISTRY.md`](../REGISTRY.md) row
- [ ] Notify `content-publisher` (when live) by referencing this concept slug in the Thu Jun 11 calendar row's `linked_concept` field (or do it manually for V1)

## Cross-references

- [`growth/basket-concepts/README.md`](../README.md) — frontmatter schema, lifecycle, handoff conventions
- [`docs/ORACLE_SUPPORTED_ASSETS.md`](../../../docs/ORACLE_SUPPORTED_ASSETS.md) — the oracle-coverage doc that the `oracleGap: partial` flag points to
- [`growth/X_CONTENT_CALENDAR.md`](../../X_CONTENT_CALENDAR.md) — Thu Jun 11 slot this launch anchors
- [`growth/GALXE_CAMPAIGN_PLAN.md`](../../GALXE_CAMPAIGN_PLAN.md) — Track A institutional persona this basket primarily targets
- [`COMPANY.md`](../../../COMPANY.md) §`season-1-operator-trials` — the strategic priority this launch feeds
