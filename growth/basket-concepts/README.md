# Basket Concepts

Idea pipeline for new testnet baskets on IndexFlow. **Proposals live here; deployments do not.**

This folder is the canonical inbox for new basket-vault themes. It is read and written by the planned `basket-ideator` agent (see [`COMPANY.md`](../../COMPANY.md) §Employees §Brainstorm) and by humans during the period before that agent is live.

The folder ships **before** the agent: humans drive the first concepts through end-to-end to validate the lifecycle, then `basket-ideator` takes over the weekly proposal cadence.

---

## Why this exists

The Season 1 success metric is "new testnet baskets created from `utm_source=x` per week" (see [`COMPANY.md`](../../COMPANY.md) §`season-1-operator-trials`). The metric only moves if we keep shipping new themes. Without a structured idea pipeline:

- Themes get re-pitched in DMs and lost.
- The "did we already do this?" check happens ad-hoc.
- Oracle gaps, persona fit, and X-calendar alignment are reviewed only at launch time -- too late.

This folder makes the idea pipeline a first-class repo primitive. Each concept is a markdown file you can review, diff, and link to from a GitHub issue or a partnership tracker.

---

## Folder layout

```
growth/basket-concepts/
  README.md                                    <- you are here
  REGISTRY.md                                  <- append-only roll-up table of every concept ever proposed
  queue/
    <YYYY-MM-DD>-<theme-slug>.md               <- one file per concept; lifecycle status drives sorting
```

File naming: `<proposed-date>-<kebab-case-theme-slug>.md`. Date is the proposal date, not the launch date. The slug is durable; it never changes once the file exists (rename via `git mv` only if the theme name materially changes pre-approval).

---

## Frontmatter schema

Every concept file starts with YAML frontmatter. Required keys are marked `R`, optional are `O`.

```yaml
---
status: proposed | approved | launched | retired       # R -- current lifecycle state (see Lifecycle below)
proposedDate: YYYY-MM-DD                                # R -- when the concept entered the queue
proposedBy: <agent-name | human-name>                   # R -- e.g. `basket-ideator`, `reuben`, or `0xlabs-suggestion`

theme: <human-readable theme name>                      # R -- e.g. "AI Infrastructure Basket"
slug: <kebab-case-slug>                                 # R -- must match the filename
rationale: |                                            # R -- 2-5 sentence "why now"
  Multi-line markdown OK.

targetCuratorPersona:                                   # R -- one or more; map to Galxe tracks where possible
  - galxe_track_a_institutional                         #   asset managers (BYO-license)
  - galxe_track_b_crypto_builder                        #   crypto-native operators
  - galxe_track_c_ai_agent_builder                      #   AI-agent builders
  - indexflow_internal                                  #   IndexFlow Labs runs it directly (rare; flag for review)
  - minestarters_curator                                #   reserved for mining-equity themes

assets:                                                 # R -- target asset list
  - symbol: NVDA                                        # R per row -- exact ticker (Yahoo Finance suffix where ambiguous, e.g. BHP.AX)
    exchange: NASDAQ                                    # R per row -- listing venue
    oracle: yahoo-finance-relayer                       # R per row -- yahoo-finance-relayer | chainlink | tbd
    registeredOnChain: false                            # R per row -- has OracleAdapter.configureAsset been called on the target network?
    notes: AI accelerator leader                        # O per row -- 1-line context
  # ... repeat per asset

oracleGap: none | partial | full                        # R -- aggregate flag
  # none    = every asset has an oracle AND is registered on-chain
  # partial = oracles exist (e.g. Yahoo relayer covers all US equities) but configureAsset hasn't been called
  # full    = needs new oracle infrastructure (e.g. Chainlink feed integration) before the basket is feasible
oracleGapRemediation: |                                 # R if oracleGap != none -- explicit unblock steps
  e.g. "Operator runs configureAsset for each ticker; relayer auto-picks up new assets per docs/ORACLE_SUPPORTED_ASSETS.md §Adding more assets."

handoff:                                                # R -- how the approved concept becomes an on-chain vault
  existingAgentBinding: null | <agent-name>             # null if a new trading agent is needed; otherwise the agent whose vault override will be set
  newAgentRequired: true | false                        # true => operator (or issue-implementer) must author a new agents/<name>.md
  vaultBindingHint: |                                   # O -- if existingAgentBinding is set, what AGENT_VAULT_OVERRIDE-style hint
    Example: bind via AGENT_VAULT_OVERRIDE to a vault whose name matches /AI Infra/i.

season1SlotAlignment: null | YYYY-MM-DD                 # O -- date in growth/X_CONTENT_CALENDAR.md if this launch can anchor a free slot
partnerships: []                                        # O -- related partner files under growth/partnerships/ that this theme leverages (e.g. avalanche.md for an AVAX-native basket)
estimatedLaunchEta: YYYY-MM-DD                          # R -- realistic target; blank only if blocked on infra

redFlagChecks:                                          # R -- automated checks the agent ran (humans tick manually)
  oracleCoverage: pass | partial | fail
  duplicationCheck: pass | fail                         # Envio query: does a basket with this theme already exist?
  regulatorySensitivity: low | medium | high            # e.g. firearms / cannabis / single-issuer concentration => high
  singleIssuerConcentration: pass | fail                # no asset > 40% by weight at default allocation
  symbolPolicy: pass | fail                             # ambiguous unsuffixed equities rejected per docs/ORACLE_SUPPORTED_ASSETS.md §Adding more assets

decisionLog:                                            # R -- append-only audit trail; oldest first
  - date: YYYY-MM-DD
    by: <agent-or-human>
    decision: proposed | approved | request_changes | retired | launched
    notes: <one-line context>
---
```

Below the frontmatter, the file body is free-form markdown -- use it for thesis, allocation weights, X-thread angles, curator pitch, anything that helps a human (or `content-publisher` / `broadcast-bot`) work from a single source.

---

## Lifecycle

```
[proposed] -- founder reviews --> [approved] -- vault deployed --> [launched] -- vault decommissioned --> [retired]
     \                                                                                                       ^
      \---------------------------- founder declines ------------------------------------------------------/
```

| Transition | Trigger | Required edits |
|------------|---------|----------------|
| `(new)` -> `proposed` | `basket-ideator` writes the file (or a human seeds one) | Full frontmatter with `status: proposed`; first `decisionLog` entry recorded; row added to `REGISTRY.md` |
| `proposed` -> `approved` | Founder reviews and accepts | Flip `status`; append `decisionLog` entry with approval rationale; update the REGISTRY row's status column |
| `proposed` -> `retired` | Founder declines | Flip `status`; append `decisionLog` with reason; update REGISTRY |
| `approved` -> `launched` | Trading agent author authors/binds the agent + on-chain vault is live | Flip `status`; add `onChainVaultAddress` + `launchedDate` + `xPostedUrl` (the broadcast-bot announcement) to a new `launched:` block in frontmatter; update REGISTRY |
| `launched` -> `retired` | Vault decommissioned | Flip `status`; append `decisionLog` with reason + redemption-window dates; update REGISTRY |

**Never delete files.** Retired concepts stay in `queue/` as the historical record. Sort/filter via the `status` field, not the filesystem.

---

## Handoff to trading agents

The same 6-step chain documented in [`COMPANY.md`](../../COMPANY.md) §Employees §Brainstorm `basket-ideator.handoff`:

1. `basket-ideator` (or a human) writes `queue/<date>-<slug>.md` with `status: proposed`.
2. Founder reviews; if approved, flips `status: proposed -> approved` + logs decision.
3. Founder (or `issue-implementer` via `/agent implement` on a tracking issue) creates a new `agents/<name>.md` trading-agent prompt OR binds an existing trading agent's vault override to the new basket.
4. Existing `scripts/agent-runner.mjs` + `.github/workflows/vault-agent.yml` deploys the vault and starts running it. Status flips to `launched` and on-chain address gets recorded.
5. `broadcast-bot` (brainstorm; activates when authored) picks up the `BasketCreated` event and drafts an `@IndexFlowBots` announcement.
6. `content-publisher` (brainstorm; activates when authored) folds the launch into the X content calendar via [`growth/X_CONTENT_CALENDAR.md`](../X_CONTENT_CALENDAR.md).

The boundary is explicit: **this folder never deploys a contract.** Contract deployment stays inside the repo-managed trading-agent flow (see [`COMPANY.md`](../../COMPANY.md) §Out of Scope).

---

## How `basket-ideator` will use this folder (once live)

- Weekly heartbeat (Mon 09:00 UTC per the planned schedule in `COMPANY.md`).
- Reads inputs from [`docs/ORACLE_SUPPORTED_ASSETS.md`](../../docs/ORACLE_SUPPORTED_ASSETS.md), `apps/web/src/config/*-deployment.json`, existing `agents/*.md`, [`growth/X_CONTENT_CALENDAR.md`](../X_CONTENT_CALENDAR.md), [`growth/X_GROWTH_PLAN.md`](../X_GROWTH_PLAN.md), [`growth/GALXE_CAMPAIGN_PLAN.md`](../GALXE_CAMPAIGN_PLAN.md), [`growth/partnerships/`](../partnerships/), and live Envio `BasketCreated` history.
- Drafts 1-3 concept files per week into `queue/` with `status: proposed`.
- Appends each to `REGISTRY.md`.
- Files one GitHub issue per drafted concept with label `category:vault-concept` so triage is visible outside the file tree.
- **Never modifies an already-approved or launched concept** -- those edits are humans-only.

## How humans use this folder *before* the agent is live

Same schema, manual cadence. Drop a concept in `queue/`, append to `REGISTRY.md`, file the GitHub issue. The lifecycle and decisionLog conventions are the audit trail.

[`queue/2026-05-26-ai-infrastructure-basket.md`](queue/2026-05-26-ai-infrastructure-basket.md) is the first worked example -- seeded manually to validate the workflow.

---

## Cross-references

- [`COMPANY.md`](../../COMPANY.md) §Employees §Brainstorm -- the `basket-ideator` proposal that owns this folder
- [`COMPANY.md`](../../COMPANY.md) §Strategic priorities §`season-1-operator-trials` -- the goal whose metric this folder feeds
- [`docs/ORACLE_SUPPORTED_ASSETS.md`](../../docs/ORACLE_SUPPORTED_ASSETS.md) -- canonical oracle coverage reference for every `oracleGap` evaluation
- [`docs/ASSET_MANAGER_FLOW.md`](../../docs/ASSET_MANAGER_FLOW.md) -- the curator lifecycle every approved concept eventually flows through
- [`growth/X_CONTENT_CALENDAR.md`](../X_CONTENT_CALENDAR.md) -- target slot alignment for launch posts
- [`growth/GALXE_CAMPAIGN_PLAN.md`](../GALXE_CAMPAIGN_PLAN.md) -- the Track A/B/C curator persona vocabulary
- [`growth/partnerships/`](../partnerships/) -- partner-aligned theme cross-refs
- [`AGENTS.md`](../../AGENTS.md) -- repo-wide agent policy (never auto-commit; deployment safety; etc.)
