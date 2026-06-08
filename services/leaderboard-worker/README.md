# Curator Leaderboard Worker

Weekly NAV-growth snapshot generator for the **Curators Guild** Galxe campaign. Computes rankings from Envio HyperIndex and writes JSON consumed by the Galxe REST credential route.

## How it runs (production)

**GitHub Actions** — not Cloud Run.

[`.github/workflows/curator-leaderboard.yml`](../../.github/workflows/curator-leaderboard.yml) runs every **Sunday 23:59 UTC** (and on manual `workflow_dispatch`):

1. Runs this worker against Envio (`ENVIO_URL` GitHub secret)
2. Writes `apps/web/public/curator-leaderboard.snapshot.json`
3. Commits and pushes to `main`
4. The push triggers [`.github/workflows/deploy-production.yml`](../../.github/workflows/deploy-production.yml), which redeploys Vercel

The credential route at `apps/web/src/app/api/galxe/credential/route.ts` loads the snapshot from:

- `CURATOR_LEADERBOARD_SNAPSHOT_URL` (optional override), or
- `{NEXT_PUBLIC_SITE_URL}/curator-leaderboard.snapshot.json` (default on Vercel)

Set `NEXT_PUBLIC_SITE_URL=https://indexflow.app` in production so the fallback resolves correctly.

## Run locally

```bash
cd services/leaderboard-worker
npm install
ENVIO_URL="https://indexer.dev.hyperindex.xyz/<slug>/v1/graphql" npm run start
```

Stdout-only (for debugging):

```bash
ENVIO_URL="..." npm run snapshot
```

## Environment

| Variable | Required | Default | Purpose |
| -------- | -------- | ------- | ------- |
| `ENVIO_URL` | yes | — | Hasura GraphQL endpoint |
| `CURATOR_LEADERBOARD_OUTPUT_PATH` | no | `apps/web/public/curator-leaderboard.snapshot.json` | Output file path |
| `CURATOR_HUB_CHAIN_ID` | no | `11155111` | Hub chain ID |
| `CURATOR_SNAPSHOT_NOW_UNIX` | no | now | Override snapshot time (tests) |
| `CURATOR_LEADERBOARD_STDOUT` | no | `0` | Set `1` to print JSON to stdout |

## Galxe credential IDs

| credId | Meaning |
| ------ | ------- |
| `curator-genesis` | Entry quest — live Envio |
| `curator-weekly-winner-{weekKey}` | Top 5 for ISO week (e.g. `2026-W24`) |
| `curator-streak-2` | 2 consecutive Top 5 weeks |
| `curator-streak-3` | 3+ consecutive Top 5 weeks |
| `curator-badge-champion` | Won weekly #1 at least once |
| `curator-badge-consistent` | Top 5 in ≥3 distinct weeks |
| `curator-badge-veteran` | Basket alive ≥30 days — live Envio |

See [`growth/GALXE_CAMPAIGN_PLAN.md`](../../growth/GALXE_CAMPAIGN_PLAN.md) for the full quest tree.
