# Regulatory Roadmap (Draft)

> **Status: Draft working memo**
>
> This document is a brainstorming aid for product and legal structuring. It is
> **not legal advice**, does not approve any launch path, and should not be used
> as a substitute for advice from counsel in the target jurisdiction.

## Why this exists

This repo is not a generic DeFi app. In the current implementation:

- users deposit **USDC** into a **BasketVault**
- users receive redeemable **BasketShareToken** interests
- the basket owner can move capital into a shared perp module
- the manager or authorized operator can open and close leveraged positions
- current oracle docs include equity and commodity-style references such as
  `BHP.AX`
- a draft utility token concept exists in
  [UTILITY_TOKEN_TOKENOMICS.md](./UTILITY_TOKEN_TOKENOMICS.md)

That combination likely creates a regulatory perimeter well beyond a normal
wallet-only token interface.

## Working view of the perimeter

This is the current product-risk inference, not a final legal conclusion:

- The basket interests may be treated as **units in a collective investment
  undertaking**, **transferable securities**, or both depending on structure and
  jurisdiction.
- The perp sleeve may be treated as **MiFID II financial instrument
  derivatives**, especially where exposure references equities, commodities, or
  other non-crypto assets.
- If the product is classified under existing financial-services law, **MiCA may
  not be the main launch regime**. MiCA is designed for crypto-assets and
  services not already regulated elsewhere.
- A "closed marketplace" can narrow the go-to-market path, but it does **not**
  automatically make the product unregulated.

## Recommended draft launch profile

If the goal is the lowest-friction path that still looks realistic, this is the
recommended draft profile:

- **Single EU member state first**
- **Professional / institutional investors only**
- **Invitation-only onboarding**
- **Primary issuance and issuer redemption only**
- **No public secondary market**
- **Hard block U.S. persons**
- **No retail-facing public marketing**
- **No fiat rails at launch**
- **No omnibus custody unless separately structured**
- **No utility / reward / governance token at launch**

This should be treated as the baseline unless counsel supports a broader launch.

## What probably does not work

These assumptions are high risk and should not be used as launch premises:

- "Closed marketplace" means no regulation
- Non-custodial means no AML / sanctions / licensing analysis
- Tokenizing fund interests avoids securities or fund rules
- Synthetic equity or commodity exposure can be sold like a generic crypto app
- A draft utility token can launch alongside the core product without changing
  the perimeter
- Yahoo Finance-style relayed pricing is acceptable for production regulated use

## Roadmap

### Phase 0: Product and jurisdiction freeze

Goal: remove the major design choices that change the legal answer.

Required decisions:

- pick the first launch member state
- decide whether the product is **issuer-only subscribe / redeem** or a true
  participant marketplace
- decide whether transfers of `BasketShareToken` are disabled, restricted, or
  free
- decide whether launch is professional-only, institutional-only, or retail
- decide whether any affiliate will custody assets, keys, or omnibus balances
- decide whether the utility token is deferred

Deliverables:

- one-page product perimeter summary
- launch assumptions memo
- list of features explicitly deferred from v1

### Phase 1: Classification memo

Goal: obtain a written external memo classifying the actual product.

Questions counsel should answer:

- what legal category best fits `BasketShareToken`
- whether the basket structure is an **AIF / fund-like vehicle**
- whether the operator activity is **portfolio management**, **investment
  services**, or both
- how the perp sleeve is classified
- whether equity / commodity synthetic references trigger additional rules
- whether primary-only issuance/redemption avoids a venue analysis
- what changes would trigger a **MiFID trading venue** issue

Deliverables:

- external legal classification memo
- redline list of product changes needed for the intended launch path

### Phase 2: Entity and licensing path

Goal: choose the operational wrapper that matches the classification memo.

Most likely paths to test with counsel:

- **AIF / AIFM-style structure** if the basket is treated as a pooled investment
  vehicle
- **investment firm / MiFID permissions** if the platform or affiliate is
  providing investment services or operating a venue
- **DLT Pilot Regime assessment** only if the business model genuinely includes
  trading tokenized financial instruments on DLT infrastructure

Decisions:

- home member state
- newco structure
- regulated partner vs self-licensed path
- depositary / administrator / fund operations model if required
- who is the legal manager, operator, and client-facing counterparty

Deliverables:

- target entity chart
- licensing workplan
- preliminary budget and timeline

### Phase 3: Compliance buildout

Goal: stand up the minimum operational controls required before onboarding.

Required workstreams:

- KYC / KYB onboarding policy
- sanctions and PEP screening
- wallet screening and blocked-address handling
- source-of-funds / source-of-wealth triggers
- suspicious-activity escalation
- privacy and data-governance policy
- DORA-style operational resilience mapping for critical ICT systems and vendors
- incident response and regulator-notification runbooks

Deliverables:

- AML / sanctions policy set
- onboarding standard operating procedure
- incident and escalation matrix
- vendor register and control owner map

### Phase 4: Product restrictions and documentation

Goal: make the app match the legal assumptions instead of contradicting them.

Likely product changes before a serious launch:

- whitelist-only onboarding and wallet activation
- hard geo-blocking and U.S. exclusion terms
- transfer restrictions or outright transfer disablement on basket interests
- explicit redemption gating and suspension language
- clear investor disclosures for:
  - manager discretion
  - leverage and liquidation risk
  - oracle risk
  - stablecoin depeg risk
  - limited redemption liquidity when capital is allocated to perps
- removal or isolation of unfinished utility-token flows

Operational cleanup likely needed:

- replace Yahoo Finance relayer feeds with production-grade licensed reference
  data
- document NAV governance, valuation challenge procedures, and stale-price
  handling
- define reserve, suspension, and exceptional redemption policy

Deliverables:

- updated terms and disclosures
- launch-ready onboarding copy
- risk disclosure pack
- ops runbook for valuation, incident, and redemption events

### Phase 5: Launch readiness

Goal: confirm the actual system and operations satisfy the intended launch model.

Readiness checks:

- only approved investors can onboard
- blocked jurisdictions cannot access onboarding
- investors cannot use unsupported transfer or secondary trading paths
- product docs match actual contract and operator behavior
- AML, sanctions, and incident alerts route to named owners
- oracle, pricing, and valuation procedures are documented and exercised

Exit criteria:

- counsel sign-off on launch structure
- compliance owner sign-off
- final disclosure pack approved
- production data vendors approved

## Product decisions that change the roadmap materially

Each of these widens the perimeter and should be treated as a separate project:

- admitting **retail**
- admitting **U.S. persons**
- enabling investor-to-investor transfer or order matching
- adding a **utility / governance / rewards token**
- adding **fiat on-ramps**
- taking custody of user assets or private keys
- broadening synthetic references beyond the first approved asset set

## Draft launch checklist

- choose one member state and one legal theory
- defer the utility token
- keep launch investor set narrow
- keep transfers restricted
- block U.S. access
- replace prototype market data
- get external classification memo
- build AML / sanctions onboarding
- rewrite disclosures to match actual basket and perp behavior

## Useful official references

- European Commission MiCA overview:
  https://finance.ec.europa.eu/digital-finance/crypto-assets_en
- ESMA MiCA page:
  https://www.esma.europa.eu/esmas-activities/digital-finance-and-innovation/markets-crypto-assets-regulation-mica
- ESMA AIFMD key concepts guidelines:
  https://www.esma.europa.eu/sites/default/files/library/2015/11/2013-611_guidelines_on_key_concepts_of_the_aifmd_-_en.pdf
- European Commission EMIR overview:
  https://finance.ec.europa.eu/financial-markets/financial-markets-policy/post-trade-services/derivatives-emir_en
- ESMA DLT Pilot Regime:
  https://www.esma.europa.eu/esmas-activities/digital-finance-and-innovation/dlt-pilot-regime
- European Commission DORA overview:
  https://finance.ec.europa.eu/digital-finance/digital-operational-resilience-act-dora_en

## Open questions for the next revision

- Which member state is the actual first launch target?
- Is the commercial goal a managed product, a private placement, or a true
  marketplace?
- Are basket interests meant to be transferable between investors?
- Is the utility token still part of the v1 business plan?
- Is the user base meant to include any retail cohort?
