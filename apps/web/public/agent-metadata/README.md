# Agent metadata

Each AI-managed vault has a static JSON file at
`<vault_lowercase>.json` in this folder describing the agent operator,
its current thesis, the latest run, and the most recent justified
on-chain actions. The Next.js app fetches it from
`/agent-metadata/<vault>.json` via the `useAgentMetadata` hook and
renders the "AI Operator" badge, the **AI Activity** section
(thesis + collapsible run summary + collapsible "Show all decisions"
panel listing every justified action), and per-row justifications in
Vault History on the basket detail page.

Schema (all consumer-side fields are optional except `isAiManaged`):

```jsonc
{
  "isAiManaged": true,
  "agentName": "vault-manager",
  "agentDescription": "Autonomous vault manager…",
  "thesis": "…",
  "lastRunAt": "2026-05-21T04:06:04.334Z",
  "latestRun": {
    "runId": "2026-05-21T04:06:04.334Z",
    "finishedAt": "2026-05-21T04:06:04.334Z",
    "summary": "first 500 chars of the LLM's final message"
  },
  "recentActions": [
    {
      "tool": "allocate_to_perp",
      "justification": "…",
      "timestamp": "2026-05-21T04:06:04.334Z",
      "txHash": "0x…",
      "agentName": "vault-manager",
      "runId": "2026-05-21T04:06:04.334Z",
      "params": { "kind": "allocate_to_perp", "amountUsdc": "500000000" }
    }
  ]
}
```

`recentActions` is deduplicated by `txHash` and capped at 100 entries
(override with `AGENT_METADATA_ACTION_LIMIT`).

### `params` shape per tool

Optional per-action `params` is a discriminated union (keyed by `kind` which
mirrors `tool`). It drops the redundant `vault` address and `justification`,
keeping just the fields the UI uses to render chips. Unknown / read-only tools
omit `params` entirely.

| `tool` | `params` shape |
| --- | --- |
| `wire_asset` | `{ kind: "wire_asset", symbol, seedPriceUsd? }` |
| `create_vault` | `{ kind: "create_vault", name, depositFeeBps, redeemFeeBps, deployToSpokes? }` |
| `set_vault_assets` | `{ kind: "set_vault_assets", assetIds: string[], count }` |
| `allocate_to_perp` / `withdraw_from_perp` | `{ kind: <tool>, amountUsdc }` (raw 6-decimal USDC string) |
| `open_position` | `{ kind: "open_position", assetId, isLong, size, collateral }` (raw GMX 1e30 / 6dp USDC strings) |
| `close_position` | `{ kind: "close_position", assetId, isLong, sizeDelta, collateralDelta }` |

These files are written by the agent runner (`scripts/agent-runner.mjs`,
`publishAgentMetadata`) after every run, tracked in git, and committed
back to `main` by CI under the `vault-agent[bot]` identity — see
`.github/workflows/vault-agent.yml`.

See `docs/AGENTS_FRAMEWORK.md` for the lifecycle.
