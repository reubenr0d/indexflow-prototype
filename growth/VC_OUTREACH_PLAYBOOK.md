# VC Outreach Playbook -- Automated Fundraise Pipeline

This runs as a parallel track alongside the 4-layer asset manager growth engine. The goal is a high-volume, highly personalized outreach machine that minimizes manual work per VC touched.

**Automation target:** 90% automated (list building, enrichment, scoring, Tier 2/3 sequencing, signal monitoring, warm intro generation). 10% manual (Tier 1 personalization, VC calls, monthly investor updates).

---

## Tooling Stack

| Tool | Role |
| ---- | ---- |
| **Clay** | Central hub: list building, enrichment, scoring, AI classification |
| **Apollo / Crunchbase / PitchBook** | Source VC lists filtered by thesis, stage, check size, activity |
| **Instantly.ai** | Email sequencing at scale: multiple sending domains, warmup, rotation |
| **Expandi / Dripify / HeyReach** | LinkedIn automation: connection requests + message sequences synced with email |
| **Trigify / Jungler** | Monitor VC partner social activity (tweets about DeFi infra, structured products) |
| **Midbound / Vector** | De-anonymize VC website visitors for immediate founder follow-up |
| **Docsend or Notion** | Trackable deck links with per-viewer analytics |

---

## Pipeline Stages

### Stage 1: List Build (Clay)

**Filters:**
- Crypto VC with DeFi or infrastructure thesis
- Pre-seed to Series A stage
- Check size: $500K-$5M
- Recent activity: made a DeFi/infra investment in the last 12 months

**Enrichment per contact:**
- Partner names, verified emails, LinkedIn URLs, Twitter handles
- Portfolio companies (especially DeFi/structured products)
- Recent blog posts or tweets about relevant topics
- Mutual LinkedIn connections with founder

**Target volume:** 500-800 qualified VC contacts across 150-250 firms.

### Stage 2: Score & Tier (Clay + AI Classification)

Run an AI classifier (Clay + OpenAI/Claude) to score each contact on two axes:

**Fit score** (0-10): How well does their thesis align with IndexFlow?
- Portfolio includes DeFi infrastructure, structured products, or asset management → high
- General crypto fund with no infra focus → low

**Warm path score** (0-10): Can we reach them through a warm intro?
- Mutual LinkedIn connection exists → high
- They engaged with our content already → high
- No connection, no prior engagement → low

**Tier assignment:**

| Tier | Size | Criteria | Treatment |
| ---- | ---- | -------- | --------- |
| **Tier 1** | 50-80 contacts | Warm intro possible OR strong portfolio overlap | Founder-sent personalized email + warm intro request |
| **Tier 2** | 150-250 contacts | Thesis-aligned, no warm path | Automated multi-channel sequence (email + LinkedIn) |
| **Tier 3** | 300-500 contacts | Broad crypto VC, weaker thesis fit | Automated email-only sequence |

### Stage 3: Outreach Sequences

#### Tier 1 Sequence (founder-sent, 5 touches over 21 days)

**Day 0 -- Personalized email:**
```
Subject: {portfolio_company} → structured DeFi infrastructure

Hi {first_name},

Your investment in {portfolio_company} suggests you see the gap in
onchain structured products. We're building the infrastructure layer
that closes it.

IndexFlow is basket vault infrastructure backed by shared perpetual
liquidity -- think onchain ETF creation for asset managers, with
explicit NAV vs redemption honesty and chain-attributable deployment.

We're raising a private round. Deck attached via Docsend.

Would a 20-minute call make sense this week or next?

Best,
{founder_name}
```

**Day 2 -- LinkedIn connection request:**
```
Hi {first_name}, we're building structured DeFi infra for asset
managers (basket vaults + shared perp liquidity). Your {fund_name}
thesis on DeFi infrastructure caught my eye. Would love to connect.
```

**Day 5 -- Follow-up email:**
```
Subject: Re: {portfolio_company} → structured DeFi infrastructure

Hi {first_name},

Quick follow-up. One insight that might resonate given {fund_name}'s
thesis: most DeFi vault protocols conflate portfolio value with exit
liquidity. IndexFlow makes that distinction explicit -- reserve
depth is a product-quality parameter, not a treasury setting.

Here's a 4-minute read on why that matters: [blog post link]

Happy to walk through the architecture on a call.

Best,
{founder_name}
```

**Day 10 -- LinkedIn DM:**
```
{first_name}, thought you'd find this interesting -- our latest on
why NAV ≠ exit liquidity in DeFi vaults: [Substack link]
```

**Day 18 -- Final follow-up:**
```
Subject: Re: {portfolio_company} → structured DeFi infrastructure

Hi {first_name},

Last note on this. Since we first reached out, we've
{traction_metric -- e.g. "onboarded two asset managers to testnet
pilots" or "crossed $X in testnet TVL"}.

If the timing isn't right, no worries. Our Substack tracks the
build: [link]

Best,
{founder_name}
```

#### Tier 2 Sequence (automated, 6 touches over 28 days)

All emails use Clay variables for personalization.

| Day | Channel | Content |
| --- | ------- | ------- |
| 0 | Email | Personalized intro: `{first_name}`, `{fund_name}`, `{portfolio_company}`, `{thesis_hook}` + deck link |
| 1 | LinkedIn | Connection request with short note |
| 4 | Email | Follow-up with whitepaper/deck link + one key insight |
| 8 | LinkedIn | DM with a relevant content piece (Substack issue or blog post) |
| 14 | Email | Traction update or market thesis angle |
| 24 | Email | Break-up: "Not the right time? No problem. Here's our Substack if you want to follow the build." |

#### Tier 3 Sequence (automated email only, 4 touches over 21 days)

| Day | Content |
| --- | ------- |
| 0 | Short intro email + deck link |
| 5 | Follow-up with one key insight from the whitepaper |
| 12 | Traction/milestone update |
| 20 | Break-up + Substack subscribe link (captures them into Layer 3 nurture) |

### Stage 4: Signal Monitoring (Ongoing)

All signals feed back into Clay for automatic tier re-classification.

| Signal | Action |
| ------ | ------ |
| VC from target list visits website | Midbound/Vector flags → Slack alert to founder → immediate personal follow-up |
| 3+ email opens + link click | Clay re-scores as hot → founder follow-up within 24 hours |
| VC partner likes/comments on team LinkedIn content | Flag for personalized DM from founder |
| 3+ Substack newsletter opens | Move to Tier 1 treatment regardless of original tier |
| Deck opened via Docsend | Track time spent per slide; if >2 minutes total → Slack alert |

### Stage 5: Warm Intro Automation

For Tier 1 targets where Clay identifies mutual LinkedIn connections:

1. Clay enrichment identifies 1-3 mutual connections ranked by relationship strength.
2. Generate a pre-written "forwardable email" the mutual connection can send with one click.

**Template for mutual connection:**
```
Subject: Quick intro -- {founder_name} at IndexFlow

Hi {vc_first_name},

My friend {founder_name} is building IndexFlow -- onchain basket
vault infrastructure for asset managers, backed by shared perpetual
liquidity. Think structured DeFi products with honest redemption
mechanics.

They're raising a private round and I thought it'd be right up
{fund_name}'s alley given your work in DeFi infrastructure.

Happy to make the intro if you're interested.

{mutual_name}
```

3. Founder sends the forwardable email to the mutual connection with: "Would you be open to forwarding this to {vc_name}? No pressure."

---

## VC-Specific Content

Some content serves double duty -- it builds credibility with asset managers AND warms VCs. These are produced as part of the main growth engine but distributed specifically to the VC pipeline.

### Monthly Investor Update Email

Separate from Substack. Sent to all VCs who have engaged (opened deck, replied, took a call).

**Template structure:**
```
Subject: IndexFlow -- {month} Update

Hi {first_name},

Quick update on where we are.

**Metrics:**
- Testnet TVL: $X
- Active pilots: N asset managers
- Pipeline: $X in committed interest
- Team: N people

**What shipped:**
- [2-3 bullets on product/infra milestones]

**What's next:**
- [2-3 bullets on upcoming milestones]

**The raise:**
- [Current status: X% committed, targeting close by date]

Happy to hop on a call if anything here is interesting.

Best,
{founder_name}
```

### Deck Refresh Cadence

- Refresh the deck quarterly with new metrics.
- Re-send to warm VCs who didn't convert: "Updated deck -- we've added {X metric} since we last spoke."
- Track deck views via Docsend to identify re-engaged VCs.

---

## Metrics to Track

### Volume Metrics

| Metric | Target |
| ------ | ------ |
| Emails sent per week (all tiers) | 100-200 |
| LinkedIn connections sent per week | 30-50 |
| Meetings booked per week | 3-5 |
| Deck views per week | 20-40 |

### Conversion Metrics

| Metric | Target |
| ------ | ------ |
| Email reply rate (Tier 1) | 15-25% |
| Email reply rate (Tier 2) | 8-15% |
| Email reply rate (Tier 3) | 3-8% |
| LinkedIn connection acceptance | 30-50% |
| Meeting booked from first touch (Tier 1) | <14 days |
| Meeting booked from first touch (Tier 2) | <28 days |

### Pipeline Metrics

| Stage | Definition |
| ----- | ---------- |
| Intro call | First meeting happened |
| Partner meeting | Second meeting with decision-maker |
| Due diligence | Reviewing docs, references, testnet |
| Term sheet | Terms proposed |
| Closed | Committed capital |

### Cost Metrics

- Cost per meeting booked (tool costs / meetings)
- Cost per term sheet
- Time per Tier 1 email (target: <15 minutes with Clay pre-draft)

---

## Deliverability Setup

### Domain Configuration

- Use 2-3 sending domains (not the primary indexflow.app domain).
- Example: `mail.indexflow.io`, `team.indexflow.co`
- Configure SPF, DKIM, DMARC on each.
- Warm each domain for 2 weeks before volume outreach (Instantly.ai handles warmup).

### Sending Limits

- Tier 1: founder's personal email, 5-10 per day max
- Tier 2: Instantly.ai sending domains, 30-50 per day per domain
- Tier 3: Instantly.ai sending domains, 50-80 per day per domain
- Rotate across domains to stay under provider limits.

### Hygiene

- Verify all emails via Clay/Apollo before sending.
- Remove bounces immediately.
- Monitor spam complaint rates (target: <0.1%).
- Pause sequences for any domain showing deliverability drops.

---

## Operational Cadence

| Frequency | Task |
| --------- | ---- |
| Weekly | Review signal monitoring alerts; send Tier 1 personalized emails; check reply rates |
| Bi-weekly | Refresh Clay enrichment for new signals; adjust tier assignments |
| Monthly | Write and send investor update; refresh deck if new metrics available |
| Quarterly | Full list refresh (new VCs, new funds, updated portfolios); major deck update |
