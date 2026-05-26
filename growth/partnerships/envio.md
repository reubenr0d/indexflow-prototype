---
partner: Envio
canonical_handle: "@envio_indexer"
status: active
co_marketing: agreed
funding_intros: none
counterpart: TBD (TBD)
indexflow_lead: Reuben
last_touch: 2026-05-27
next_milestone: "Confirm @envio_indexer co-tweet timing for Thu Jun 18 16:30 UTC Envio data-flex standalone; submit Build Bigger. Ship Faster grant PR to enviodev/grant-program"
next_milestone_date: 2026-06-15
co_branded_surfaces:
  x_calendar: 2026-06-18
  galxe_quest: TBD (Season 2 candidate)
  boost_action: TBD (Season 1 follow-up if budget permits)
  ecosystem_grant: scoped
guilds_touched: [Engineers, Cross-Chain Couriers]
---

# Envio

## Why this partnership exists

Envio is already IndexFlow's data plane — the relationship is recognition, not future integration. Every public IndexFlow surface that reports a number resolves through Envio: the `/operators` leaderboard quality multipliers ([`growth/GALXE_CAMPAIGN_PLAN.md`](../GALXE_CAMPAIGN_PLAN.md) Multi-Dimensional Leaderboard section), every `utm_source=x&utm_campaign=season-1` deep-link attribution ([`growth/X_CONTENT_CALENDAR.md`](../X_CONTENT_CALENDAR.md) line 31), and the live perp-pool stats attached as social proof in every LP-outreach email ([`growth/LP_OUTREACH_PLAYBOOK.md`](../LP_OUTREACH_PLAYBOOK.md)). One Hasura endpoint serves every chain in IndexFlow's footprint — Sepolia hub `11155111`, Fuji spoke `43113`, Arbitrum Sepolia `421614`, and the Mantle Sepolia hub `5003` from the 2026-05-26 hackathon deploy — per [`apps/envio/config.yaml`](../../apps/envio/config.yaml). The canonical live URL is pinned in [`AGENT_DEPLOYMENT_MEMORY.md`](../../AGENT_DEPLOYMENT_MEMORY.md) (`Envio | Envio Cloud org reubenr0d | HyperIndex deployment | indexflow-prototype-3`), the canonical query patterns live in [`agents/skills/envio-graphql.md`](../../agents/skills/envio-graphql.md), and the repo-owned MCP wrapper at [`apps/mcps/envio-graphql/`](../../apps/mcps/envio-graphql/) (`recent_basket_created` / `count_baskets_by_theme` / `discover_schema` / `query_graphql`) is the typed boundary every agent reads through.

## Active campaigns

- 2026-06-18 (Thu standalone, 16:30 UTC) — `growth/drafts/2026-06-18-tweet-envio-data-plane.md`. Data-flex standalone pairing with the 15:00 Season 1 recap thread the same day; positions the standalone as the "here's how every number in that thread was measured" caption, with a single `@envio_indexer` mention inviting the co-tweet. Headline shape: "X baskets created · Y deposits · Z UTM-attributed Season 1 actions — every number resolved live from Envio HyperIndex." Co-tweet from `@envio_indexer` quoting the standalone with one line on why HyperIndex is the natural data plane for a multichain basket protocol.

## Open requests on both sides

**From them:**

- TBD — first confirmed touch needs to surface what Envio wants from IndexFlow beyond what we are already proposing (logo placement, technical-content collaboration, conference co-presence).

**From us:**

1. Confirm `@envio_indexer` co-tweet timing for the Thu Jun 18 16:30 UTC standalone, by Mon Jun 15.
2. Confirm review path + reviewer for a "Build Bigger. Ship Faster" grant PR to [`enviodev/grant-program`](https://github.com/enviodev/grant-program). IndexFlow will submit using the template; what would push the application toward the upper end of the $10K USDC pool?
3. Slot IndexFlow into the next monthly Envio Developer Update newsletter ([Beehiiv](https://envio.beehiiv.com/) / Medium / docs blog) — ideally the **"Featured Developer"** section, with the four-chain Hasura endpoint as the hook.
4. Add IndexFlow to [`docs.envio.dev/showcase`](https://docs.envio.dev/showcase) alongside v4.xyz / Sablier / Polymarket-tier projects.
5. Solicit input on Envio's real-time subscription roadmap — the MCP wrapper at `apps/mcps/envio-graphql/` polls today and would drop the cron the day native subscriptions ship.

## Future surfaces (Season 2+)

- Case study on [`docs.envio.dev/blog`](https://docs.envio.dev/blog) — "four chains, one Hasura endpoint, basket-protocol shape" — following the Polymarket (8 subgraphs → 1, 4B events in 6 days) and Sablier (12 deployments → 1 across 27 chains) pattern. IndexFlow would be the first multichain *vault* protocol in the series.
- Upgrade from the public dev-tier indexer to a paid Envio Cloud tier with auth and native subscriptions; pairs with the real-time subscription ask above so any future growth-analytics agent that needs sub-minute latency can react to events directly instead of polling.
- Co-funded Boost.xyz Action: bonus rewards for the first N operators to ship an agent that queries `apps/mcps/envio-graphql/` (Engineers Guild surface).
- Galxe Onboarding quest inside the Engineers Guild: "Pass the HyperIndex primer quiz" — what does HyperIndex actually index, what is the difference between an event handler and an entity, what does `chainId` scoping unlock.
- Co-marketed thread on the keeper-side analytics pipe once `services/keeper/` redundancy lands (pairs cleanly with the Nox MPC arc — both are operator-grade infra stories).

## Historical thread / contact log

- 2026-05-27 — Envio confirmed co-marketing in principle (co_marketing=agreed); execution (Thu Jun 18 slot confirmation, counterpart name, grant PR review path) still pending. No funding intros offered (funding_intros=none). Canonical X handle confirmed as `@envio_indexer`. Ecosystem-grant track identified as the "Build Bigger. Ship Faster" $10K USDC program ([`enviodev/grant-program`](https://github.com/enviodev/grant-program)); not yet submitted. External-facing proposal drafted at [`envio-proposal.md`](envio-proposal.md) for hand-off.
- 2026-05-26 — Envio HyperIndex URL rotated to slug `115a80f` after Mantle Sepolia hub + multichain `config.yaml` push (per [`CHANGELOG.md`](../../CHANGELOG.md) 2026-05-26 entry). Indexer now serves four chains from one Hasura endpoint. No partnership conversation at this point — purely a deploy event — but the multichain footprint is the substrate the Thu Jun 18 data-flex standalone leans on.
