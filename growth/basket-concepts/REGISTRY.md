# Basket Concepts Registry

Append-only roll-up of every basket concept ever proposed. **Sort by date, never delete rows.** When a concept's status changes, update the row in place (don't remove or duplicate it).

This file is the canonical answer to "what themes have we considered, and where are they?" Schema, lifecycle, and folder layout live in [`README.md`](README.md).

---

## Schema

| column | meaning |
|--------|---------|
| `date` | proposal date (matches filename prefix) |
| `slug` | filename slug (matches filename suffix, no extension) |
| `theme` | short human-readable theme name |
| `status` | `proposed` \| `approved` \| `launched` \| `retired` (see README §Lifecycle) |
| `persona` | primary `targetCuratorPersona` from the concept file (use the shortest readable form) |
| `oracle_gap` | aggregate `oracleGap` flag: `none` \| `partial` \| `full` |
| `launch_eta` | `estimatedLaunchEta` for proposed/approved; actual launch date for launched; blank for retired-pre-launch |
| `on_chain_address` | BasketVault address once launched, blank otherwise |
| `notes` | one-line context (last decision, blocker, or launch link) |

---

## Roll-up

| date       | slug                          | theme                       | status   | persona                       | oracle_gap | launch_eta | on_chain_address | notes |
|------------|-------------------------------|-----------------------------|----------|-------------------------------|------------|------------|------------------|-------|
| 2026-05-26 | ai-infrastructure-basket      | AI Infrastructure Basket    | proposed | galxe_track_a_institutional   | partial    | 2026-06-04 | -                | First worked example; seeded manually to validate the workflow. Needs `configureAsset` for 10 US-equity + ADR tickers before launch. |
