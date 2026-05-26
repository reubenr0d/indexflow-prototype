# LP Outreach Playbook -- Seeding the Perp Pool and Basket Vaults

This runs as a parallel track alongside the 4-layer asset-manager growth engine (see [`growth/README.md`](README.md)) and the [VC Outreach Playbook](VC_OUTREACH_PLAYBOOK.md). The goal: bootstrap enough liquidity that IndexFlow's redeemable-NAV guarantee actually holds at mainnet launch.

> Portfolio value and exit liquidity are not the same thing -- and exit liquidity is bounded by perp-pool depth. Without LP capital in the shared OI pool, baskets cannot run their long/short hedge legs. LP seeding is therefore a **product-viability gate**, not a growth nice-to-have.

**Automation target:** 70% automated (list building, enrichment, scoring, Tier 2/3 sequencing, live perp-pool stats as social proof). 30% manual (Tier 1 personalisation with top MM teams + DAO treasury negotiation + risk-parameter discussions). Higher manual share than VC outreach because LP terms are negotiated per counterparty, not boilerplate.

This is a **scaffold**. Target lists and outreach copy are stubbed; the operator (or a future `lp-outreach-agent`, see [`COMPANY.md`](../COMPANY.md) §Backlog) fleshes them out as the priority activates.

---

## Two-Track Audience

LP outreach addresses two distinct counterparty types with different motivations and instruments. Run them as parallel pipelines in the same Clay workspace, tagged by track.

### Track A: Perp-Layer LPs (priority 1)

**What they deposit:** USDC into the shared perp OI pool that backs every basket's hedge leg. Per-chain pool address lives in `apps/web/src/config/<network>-deployment.json` under `poolToken` / `vaultUtils`.

**Why they care:** Funding-rate spread (paid by long basket positions) + a share of protocol fees. Risk is parametrised -- per-LP deposit cap, funding-rate floor, withdrawal queue depth (see [`docs/PERP_RISK_MATH.md`](../docs/PERP_RISK_MATH.md) and [`docs/GLOBAL_POOL_MANAGEMENT_FLOW.md`](../docs/GLOBAL_POOL_MANAGEMENT_FLOW.md)).

**Targets (operator to validate during enrichment):**

| Segment | Examples |
| ------- | -------- |
| Professional market makers | Wintermute, GSR, Amber, Selini, Auros, Cumberland, B2C2, FalconX, Galaxy Digital |
| Onchain-native market-making funds | TBD -- list to be built from Defillama "MM" tags |
| Specialist DeFi liquidity desks | Folkvang (status TBD), TBD others |
| Crypto-native prop trading | Jump Crypto (post-restructure), Jane Street crypto desk |

**Pitch primitive:** "Earn the funding-rate spread on the long side of every basket on IndexFlow. Risk parameters live in [`docs/PERP_RISK_MATH.md`](../docs/PERP_RISK_MATH.md) + [`docs/GLOBAL_POOL_MANAGEMENT_FLOW.md`](../docs/GLOBAL_POOL_MANAGEMENT_FLOW.md). Live pool utilisation: [Envio dashboard link]. Deposit cap: $X (negotiable for anchor LPs above $Y)."

**Vehicle:** Direct USDC deposit into the per-chain shared OI pool contract. Anchor LPs (Tier 1) get a side-letter on deposit caps and withdrawal priority; everyone else uses the standard onchain interface.

### Track B: Basket-Vault Depositors (priority 2)

**What they deposit:** USDC into individual basket vaults (the Galxe "Allocators Guild" persona from [`GALXE_CAMPAIGN_PLAN.md`](GALXE_CAMPAIGN_PLAN.md), scaled to institutional size).

**Why they care:** Curator-managed exposure to a thematic basket (e.g. AI infra, mining equities, RWA) with transferable shares and explicit NAV tracking. Allocator Hall of Fame credit (Season 1 → ongoing) for early depositors.

**Targets (operator to validate):**

| Segment | Examples |
| ------- | -------- |
| DAO treasuries sitting on idle USDC | Lido, Aave, Optimism (RetroPGF surplus), Arbitrum, ENS, Compound, MakerDAO/Sky, Uniswap, Gitcoin, ApeCoin |
| Crypto-native treasuries | Coinbase Ventures, OKX Ventures, Animoca, Pantera, Galaxy treasury allocators |
| Fintech treasuries | TBD |
| Family offices via partner network | Sourced through Avalanche, Mantle, 0xLabs warm intros |
| Onchain-native funds-of-funds | TBD -- list to be built |

**Pitch primitive:** "Deposit USDC into [curator]'s [basket name] -- e.g. the Minestarters mining-equity basket -- receive transferable basket shares with curator-managed NAV. Live curator track record: [link to Hall of Fame]. Redemption: open queue with deterministic NAV pricing."

**Vehicle:** Deposit via `app.indexflow.xyz` into a curator's `BasketVault`. Multi-sig-friendly (deposit + redeem are standard ERC-20 + ERC-4626-ish flows).

### Track C: Insurance Fund Seeders (priority 3, deferred)

Same target pool as Track A but with risk-on tranche appetite. Insurance-fund design is TBD and gated on post-audit work -- defer outreach until the instrument exists.

---

## Tooling Stack

Mirrors the VC playbook so the same Clay workspace can serve both pipelines, tagged by `outreach_track: vc | lp_perp | lp_basket`.

| Tool | Role |
| ---- | ---- |
| **Clay** | Central hub: list building (MM teams + DAO treasury wallets via onchain enrichment), AI scoring per track, sequence orchestration |
| **Apollo / Crunchbase / PitchBook** | Source MM firm + fintech treasury contacts |
| **Defillama / Dune** | Source DAO treasury wallets sitting on USDC; rank by idle balance |
| **Instantly.ai** | Email sequencing -- separate sending domains from VC outreach to keep deliverability isolated |
| **Expandi / Dripify / HeyReach** | LinkedIn for MM BD teams (DAOs run on Discord/Telegram, not LinkedIn) |
| **Trigify / Jungler** | Monitor MM partner social activity (tweets about onchain MM, GMX-like venues, OI farming) |
| **Telegram / Discord outreach** | Primary channel for DAO treasury teams (NOT LinkedIn) -- track manually in Clay |
| **Envio HyperIndex** | Live perp-pool utilisation, basket TVL, OI depth -- attached as social proof in every outreach |
| **Docsend or Notion** | Trackable risk-parameter memo per counterparty class |

---

## Pipeline Stages

### Stage 1: List Build (Clay)

**Track A filters (perp-layer LPs):**
- Crypto market makers active in perpetuals (GMX, dYdX, Hyperliquid, Aevo)
- Onchain MM funds with disclosed activity in last 6 months
- Self-described "DeFi LP funds"

**Track B filters (basket-vault depositors):**
- DAO treasuries with > $5M idle USDC on a chain IndexFlow targets (Sepolia hub → Avalanche / Mantle / BNB / Alephium spokes)
- Fintech treasuries with disclosed crypto allocations
- Family offices flagged as crypto-active via partner network

**Enrichment per contact:**
- Wallet address (for DAO treasuries, via Defillama)
- Decision-maker name + role + verified email + Telegram handle (DAOs) or LinkedIn (firms)
- Recent onchain activity: last LP position size, last withdrawal, average deposit duration
- Mutual connections with founder or partner network

**Target volume (operator to set after first pass):**
- Track A: 50-100 Tier 1 + Tier 2 contacts across 30-50 firms (small pond; quality > quantity)
- Track B: 200-400 contacts across 100-200 DAO/fintech treasuries

### Stage 2: Score & Tier (Clay + AI Classification)

Run an AI classifier (Clay + OpenAI/Claude) per track. **Critical:** for perp-layer LPs, the deposit-size axis dominates fit -- a $500K MM with deep operational maturity beats a $50M generalist fund every time.

**Fit score (0-10):** Has counterpart deposited into a comparable GMX-style perp venue? Have they written publicly about onchain LP strategy? Do they have a risk team that can read [`docs/PERP_RISK_MATH.md`](../docs/PERP_RISK_MATH.md)?

**Warm path score (0-10):** Mutual connection via Avalanche, Mantle, or 0xLabs? Engaged with IndexFlow content already? Partner introduction routable?

**Tier assignment (per track):**

| Tier | Track A size | Track B size | Treatment |
| ---- | ------------ | ------------ | --------- |
| **Tier 1** | 10-20 contacts | 30-50 contacts | Founder-sent personalised email + warm-intro routing through partner network + offer of a 30-min risk-parameter walkthrough |
| **Tier 2** | 30-50 contacts | 80-150 contacts | Automated multi-channel sequence (email + LinkedIn for firms; email + Telegram for DAOs) with curator-track-record proof |
| **Tier 3** | rest | rest | Automated email-only sequence with newsletter capture as fallback |

### Stage 3: Outreach Sequences

**Tier 1 (founder-sent, 4 touches over 21 days, track-specific):**

Track A (perp-layer LPs) Day 0 template -- replace `{vars}` from Clay:

```
Subject: {firm_name} → perp-pool LP opportunity (IndexFlow, parametrised risk)

Hi {first_name},

Your work on {recent_lp_activity} suggests {firm_name} is actively
sizing onchain perp LP positions. IndexFlow is opening a shared
perp pool that backs basket-vault hedge legs -- think GMX-style OI
pool, but with explicit per-LP deposit caps and a redemption queue
documented as a product parameter, not a treasury setting.

Risk memo (Docsend): {risk_memo_link}
Live pool utilisation (Envio): {envio_dashboard_link}

Deposit caps are negotiable for anchor LPs above {anchor_threshold}.
Would a 30-min walkthrough of the risk parameters make sense this
week or next?

Best,
{founder_name}
```

Track B (basket-vault depositors) Day 0 template:

```
Subject: {dao_name} treasury → curator-managed onchain exposure

Hi {first_name},

{dao_name}'s treasury is sitting on {idle_usdc_amount} USDC across
{chain_list}. IndexFlow lets a treasury allocate to a curator-run
basket vault with transferable shares and explicit NAV tracking --
no committee vote required to enter or exit a position.

Two baskets that might fit {dao_name}'s mandate:
- {basket_1_name} -- {basket_1_curator} -- {basket_1_track_record}
- {basket_2_name} -- {basket_2_curator} -- {basket_2_track_record}

Hall of Fame: {hall_of_fame_link}

Happy to walk through how the allocator workflow works on a call.

Best,
{founder_name}
```

**Tier 2 / Tier 3 sequences:** Mirror the VC playbook's cadence (6 touches / 28 days for Tier 2, 4 touches / 21 days for Tier 3). Substitute the Substack newsletter break-up CTA with "subscribe to the Operator Update -- monthly perp-pool stats + new-basket announcements."

### Stage 4: Signal Monitoring (Ongoing)

| Signal | Action |
| ------ | ------ |
| Target MM team's wallet deposits into a comparable venue (GMX, Hyperliquid) | Clay onchain-enrichment flags → Slack alert → re-tier to Tier 1 |
| DAO treasury proposes a USDC allocation diversification vote | Trigify flags governance forum activity → personalised note from founder citing the vote |
| Counterparty visits indexflow.app docs page on perp-pool risk parameters | Midbound/Vector flags → immediate founder follow-up |
| Risk memo opened > 2 minutes on Docsend | Tier-up; schedule founder follow-up within 24h |

### Stage 5: Anchor-LP Negotiation (Manual)

Tier 1 closes happen on calls, not in sequences. Document the negotiation envelope in advance so the founder can move fast without re-deriving terms per counterparty:

- Deposit cap range: $X-$Y per LP
- Funding-rate floor (LPs earn ≥ floor regardless of pool utilisation): TBD
- Withdrawal queue priority: standard FIFO vs anchor-LP fast lane (anchor only above $Z deposit)
- Service-fee credit, equity warrant, or token allocation in lieu of fee share -- decide ONE primary mechanism, do not stack

Every term agreed with an anchor LP must be reflected back into [`docs/PERP_RISK_MATH.md`](../docs/PERP_RISK_MATH.md) and [`docs/GLOBAL_POOL_MANAGEMENT_FLOW.md`](../docs/GLOBAL_POOL_MANAGEMENT_FLOW.md) so the public risk surface stays canonical.

---

## LP-Specific Content

Some content from the main growth engine doubles as LP credibility material. Distribute it through the LP pipeline as it ships:

### Monthly Pool Update Email

Separate from the Substack newsletter. Sent to all LPs who have engaged (opened memo, replied, took a call) and to anchor LPs post-deposit.

```
Subject: IndexFlow Perp Pool -- {month} Update

Hi {first_name},

Snapshot of the shared perp pool this month:

**Pool metrics:**
- Total USDC deposited: $X
- Utilisation (rolling 30d avg): N%
- Funding-rate spread captured by LPs: $Y
- Max drawdown (rolling 30d): Z%

**Risk-parameter changes:**
- [List of any parameter changes with rationale, or "no changes"]

**Basket activity feeding the pool:**
- N new baskets opened hedge legs this month
- Top-3 baskets by OI: [list]

**Next milestones:**
- [Audit progress, new chain spokes, etc]

Pool stats live: {envio_dashboard_link}

Best,
{founder_name}
```

### Risk Memo (Docsend, version-controlled)

Single document per counterparty class (one for MM teams, one for DAOs) covering: pool mechanics, fee economics, per-LP risk envelope, withdrawal queue mechanics, historical drawdown bounds, contract addresses + audit status. Refresh quarterly with new metrics. Track via Docsend.

---

## Metrics to Track

### Pipeline Metrics

| Stage | Definition |
| ----- | ---------- |
| Risk memo viewed | LP opened the Docsend memo |
| Intro call | First meeting happened |
| Risk walkthrough | Second meeting with risk-team decision-maker |
| Deposit committed | LP signals commitment (verbal or signed side-letter) |
| Deposit live onchain | USDC actually in the pool / basket vault |

### Per-Track Targets (operator to set after first quarter)

| Metric | Track A target | Track B target |
| ------ | -------------- | -------------- |
| Tier 1 reply rate | 25-40% (small pond; high warm-intro share) | 15-25% |
| Risk memo open rate | > 60% of replies | n/a (use deck) |
| Intro call → deposit commit | 30-50% | 15-25% |
| Time-to-first-deposit (Tier 1) | < 60 days | < 90 days |

### Pool-Level Targets

Set these once the audit clears -- they're the canonical Season 2 / mainnet-launch success metrics that feed `goals.lp-seed-liquidity` in `COMPANY.md`:

- `perpPoolUsdcDeposited_target_at_launch`: TBD
- `basketTvlUsd_target_at_launch`: TBD
- `anchorLpCount_target_at_launch`: TBD
- `perpPoolUtilizationCeilingHit_count_monthly`: 0 (any non-zero value signals capacity expansion needed)

---

## Operational Cadence

| Frequency | Task |
| --------- | ---- |
| Weekly | Review signal monitoring (onchain + governance forums); send Tier 1 personalised emails; refresh live pool stats embeds in outreach drafts |
| Bi-weekly | Refresh Clay enrichment for new treasury / MM signals; re-tier based on onchain activity |
| Monthly | Send pool-update email; refresh risk memo if parameters changed; sync with VC outreach on cross-tagged contacts (some funds wear both hats) |
| Quarterly | Full target list refresh; major risk memo update (post-audit, post-spoke-deploy, post-parameter changes); anchor-LP business review |
| Per-event | After every protocol upgrade that changes risk parameters, push a notification to every active and engaged LP within 48 hours |

---

## Boundary with VC Outreach

Some funds wear both hats (Pantera invests AND allocates; Galaxy invests AND market-makes). For dual-hat contacts:

1. Tag in Clay as `dual_hat: true` and run only the **primary** track (whichever workflow the contact's current activity favours).
2. Cross-reference in the founder's manual outreach: "BTW we're also raising a private round -- if your investment team's interested, here's the deck" -- never in automated sequences.
3. Never send VC and LP automated sequences to the same contact in the same quarter.

---

## Cross-References

- [`growth/README.md`](README.md) -- 4-layer asset manager funnel (the curator side of the equation)
- [`growth/VC_OUTREACH_PLAYBOOK.md`](VC_OUTREACH_PLAYBOOK.md) -- equity-side parallel pipeline (mirror this playbook's structure)
- [`growth/partnerships/README.md`](partnerships/README.md) -- warm-intro routing (Avalanche, Mantle, 0xLabs feed both VC and LP outreach)
- [`growth/GALXE_CAMPAIGN_PLAN.md`](GALXE_CAMPAIGN_PLAN.md) -- the retail-allocator persona (Track B's mainstream version)
- [`docs/PERP_RISK_MATH.md`](../docs/PERP_RISK_MATH.md) + [`docs/GLOBAL_POOL_MANAGEMENT_FLOW.md`](../docs/GLOBAL_POOL_MANAGEMENT_FLOW.md) -- canonical perp-pool risk-parameter docs (every LP outreach links here)
- [`COMPANY.md`](../COMPANY.md) §Strategic priorities -- `lp-seed-liquidity` goal, including the `lp-outreach-agent` backlog entry with promote-when triggers
