---
type: co-marketing-proposal
partner: Envio
partner_file: growth/partnerships/envio-proposal.md → growth/partnerships/envio.md
draft_status: ready_to_send
last_updated: 2026-05-27
---

# IndexFlow × Envio — Season 1 co-marketing proposal

> External-facing document. Paste into a DM / email to the Envio counterpart once a named contact is confirmed. Internal source-of-truth lives in [`envio.md`](envio.md); update both in lockstep.

## The ask in one sentence

Make Envio HyperIndex the named data plane for IndexFlow Season 1, with one co-tweet anchor slot (Thu Jun 18 16:30 UTC), a Build Bigger. Ship Faster grant PR, a Featured Developer slot in the next monthly Envio Developer Update newsletter, a showcase listing at [`docs.envio.dev/showcase`](https://docs.envio.dev/showcase), and a case-study post on [`docs.envio.dev/blog`](https://docs.envio.dev/blog) along the Polymarket / Sablier pattern.

## Why this is already true (the case study)

IndexFlow is a permissionless basket-vault protocol with a hub-and-spoke cross-chain coordination layer. Every metric we publish externally — every basket count, every TVL number, every Season 1 attribution claim — already resolves through Envio HyperIndex. The partnership is recognition of a dependency, not the start of one.

Concretely, here is where Envio shows up in the IndexFlow repo today:

- **Canonical live indexer.** [`AGENT_DEPLOYMENT_MEMORY.md`](../../AGENT_DEPLOYMENT_MEMORY.md) pins the deployment as `Envio Cloud org reubenr0d | HyperIndex deployment | indexflow-prototype-3`, auto-deploying from `reubenr0d/indexflow-prototype@main`, root `apps/envio`, dev tier. Current URL (as of 2026-05-26): `https://indexer.dev.hyperindex.xyz/115a80f/v1/graphql`. The same row is reproduced as a top-level contact in [`paperclip/companies/indexflow/COMPANY.md`](../../paperclip/companies/indexflow/COMPANY.md) alongside Twitter, Telegram, GitHub, and ops email — Envio is treated as a first-class company surface.
- **Multichain footprint, one Hasura endpoint.** The single indexer serves Sepolia (`11155111`), Avalanche Fuji (`43113`), Arbitrum Sepolia (`421614`), and the Mantle Sepolia hub (`5003`) from the 2026-05-26 hackathon deploy — per [`apps/envio/config.yaml`](../../apps/envio/config.yaml). This is exactly the shape Envio's multichain story wants to point at.
- **Agent skill + MCP wrapper.** [`agents/skills/envio-graphql.md`](../../agents/skills/envio-graphql.md) is the canonical query surface for every IndexFlow agent that needs onchain data. The repo-owned MCP wrapper at [`apps/mcps/envio-graphql/`](../../apps/mcps/envio-graphql/) exposes `recent_basket_created`, `count_baskets_by_theme`, `discover_schema`, and `query_graphql` as typed tools — all read-only, all cached at 60s to respect dev-tier rate limits.
- **Every public number resolves through HyperIndex.** The `/operators` Hall of Fame leaderboard quality multipliers ([`growth/GALXE_CAMPAIGN_PLAN.md`](../GALXE_CAMPAIGN_PLAN.md) Multi-Dimensional Leaderboard section: TVL retention, depositor count, operator-action freshness), every Season 1 `utm_source=x&utm_campaign=season-1` attribution claim ([`growth/X_CONTENT_CALENDAR.md`](../X_CONTENT_CALENDAR.md) line 31, contract documented in [`agents/skills/envio-graphql.md`](../../agents/skills/envio-graphql.md) "Per-vault activity"), and the live perp-pool stats attached as social proof in every LP-outreach email ([`growth/LP_OUTREACH_PLAYBOOK.md`](../LP_OUTREACH_PLAYBOOK.md)) all join through Envio. Without Envio there is no quality multiplier; without the quality multiplier the leaderboard collapses to social-only scores capped at 10% of total.

In short: Envio is named in `COMPANY.md`, `AGENT_DEPLOYMENT_MEMORY.md`, three growth-plan documents, one shared agent skill, one MCP server, and one canonical contact row. The partnership is the right shape.

## What IndexFlow offers Envio in Season 1

| Surface | When | Description |
| ------- | ---- | ----------- |
| Named co-tweet anchor slot | Thu Jun 18 16:30 UTC | Dedicated Season 1 X standalone framed entirely as a data-plane flex; `@envio_indexer` mention pinned in the caption. Draft: [`growth/drafts/2026-06-18-tweet-envio-data-plane.md`](../drafts/2026-06-18-tweet-envio-data-plane.md). Sits adjacent to the 15:00 Season 1 recap thread so the co-tweet rides peak-week traffic. |
| Named credit in Sun Jun 21 Spaces | Sun Jun 21 21:00 UTC | Season-close Spaces ([`growth/drafts/2026-06-21-spaces-season-close.md`](../drafts/2026-06-21-spaces-season-close.md)) attributes every season-end number to Envio HyperIndex on-air; co-host invite open if Envio wants a seat. |
| Named credit in Season 1 recap blog | Mon Jun 29 | Long-form atomization of the Thu Jun 18 recap thread, per [`growth/X_CONTENT_CALENDAR.md`](../X_CONTENT_CALENDAR.md) post-season section. LinkedIn cross-post Tue Jun 30. Envio named as the data plane in both. |
| Pre-written case-study draft | Late Jun | IndexFlow drafts the full [`docs.envio.dev/blog`](https://docs.envio.dev/blog) case-study post end-to-end (four chains, one Hasura endpoint, basket-protocol shape — Polymarket / Sablier-style) and hands it to Envio's editorial team to revise rather than write from scratch. |
| Co-funded Boost.xyz Action (Season 1 follow-up if budget permits) | TBD | Bonus rewards for the first N operators to ship an agent that queries `apps/mcps/envio-graphql/`. Engineers Guild surface. |

## What IndexFlow is asking from Envio

1. **Co-tweet on Thu Jun 18** quoting the data standalone, ideally posted within 60 minutes of the IndexFlow post.
2. **Build Bigger. Ship Faster grant** — IndexFlow will submit a PR to [`enviodev/grant-program`](https://github.com/enviodev/grant-program) using the proposal template. We are a clean fit on all three published criteria — creativity (basket-vault-as-primitive), technical difficulty (four-chain hub-and-spoke), and impact (permissionless basket protocol with live Season 1 traction). Ask: confirm the review path / reviewer and let us know what would push the application toward the upper end of the $10K USDC pool.
3. **Featured Developer slot in the next monthly Envio Developer Update newsletter** ([Beehiiv](https://envio.beehiiv.com/) / Medium / docs blog) — the four-chain Hasura endpoint as the hook. We are happy to provide a quote, a short interview, screenshots, and a link bundle in whatever shape works for the editor.
4. **Showcase listing at [`docs.envio.dev/showcase`](https://docs.envio.dev/showcase)** alongside v4.xyz, Stable Volume, Liqo, Sablier, and Polymarket-tier projects. We will provide the showcase blurb in whatever shape Envio's editor wants.
5. **Case-study post on [`docs.envio.dev/blog`](https://docs.envio.dev/blog)** along the Polymarket (8 subgraphs → 1, 4B events in 6 days) and Sablier (12 deployments → 1 across 27 chains) pattern. IndexFlow would be the first multichain *vault* protocol in the series (the existing posts lean DEX / streaming / prediction-market). We are happy to draft the post end-to-end for Envio's editorial team to revise — saves you editorial time and gives you a draft you can edit rather than write from scratch.
6. **Real-time subscription roadmap signal.** The MCP wrapper at `apps/mcps/envio-graphql/` polls today; we would drop the cron the day native subscriptions ship on Envio Cloud. If there is a private beta or design-partner program, we would like to be in it.

## Concrete next steps with dates

| Date | Owner | Action |
| ---- | ----- | ------ |
| Fri Jun 5 | IndexFlow | Submit the Build Bigger. Ship Faster grant PR to [`enviodev/grant-program`](https://github.com/enviodev/grant-program) using the proposal template. |
| Mon Jun 15 | Envio | Confirm Thu Jun 18 16:30 UTC co-tweet timing and any logo / claim language constraints. |
| Tue Jun 16 | IndexFlow | Share the polished Thu Jun 18 draft with the named Envio counterpart for review. |
| Thu Jun 18 | Both | Post and co-tweet. |
| Mon Jul 6 | Envio | Confirm Featured Developer slot timing for the July 2026 Envio Developer Update newsletter. |
| Open lane (parallel, not blocking) | Both | Grant PR review, showcase listing copy, case-study draft, real-time subscription roadmap conversation. |

## Logistics

- **IndexFlow counterpart:** Reuben — repo + Telegram per [`paperclip/companies/indexflow/COMPANY.md`](../../paperclip/companies/indexflow/COMPANY.md) contact rows; ops email [`ops@indexflow.app`](mailto:ops@indexflow.app).
- **Self-verify every claim above:** the IndexFlow repo is public at the repo URL pinned in `COMPANY.md`. Every file path in this document is a clickable link in-repo. The live indexer URL is in the [`AGENT_DEPLOYMENT_MEMORY.md`](../../AGENT_DEPLOYMENT_MEMORY.md) Envio row.
- This proposal supersedes any ad-hoc earlier conversation. If anything below contradicts an earlier message, this document wins.
