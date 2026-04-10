# Codex Memory (Repo Rules)

These rules apply to work in this repository unless a deeper-scope `AGENTS.md` overrides them.

## Keep Changelog Updated

When changes are substantive (code, build/deploy config, scripts, dependencies), update `CHANGELOG.md` in the same session under `## [Unreleased]`.

Skip changelog edits for typo-only/comment-only/format-only changes or purely internal refactors with no observable effect.

## Keep README And Docs Updated

After each task, ensure documentation is current for any user/operator-visible change:

- Update `README.md` for command, setup, config, deployment, or workflow changes.
- Update relevant files under `docs/` when behavior, architecture, or operational flow changes.
- For web-app-visible behavior, also update in-app docs content in `apps/web/src/lib/wiki.ts` (and `apps/web/src/lib/tooltip-copy.ts` when labels/tooltips change).
- Keep `docs/README.md` (in-app wiki map) aligned when adding/removing/relabeling `/docs` routes or sections.
- If markdown docs and in-app docs describe the same workflow, update both in the same session.
- If no documentation impact exists, explicitly verify no doc changes are needed before finishing.

## Foundry Command Reliability In Agent Shell

Do not rely on `cd` for Foundry commands in agent terminals. Prefer explicit project root and PATH:

```bash
PATH="/Users/reuben/.foundry/bin:$PATH" forge <subcommand> --root /Users/reuben/Desktop/minestarters/code/snx-prototype
```

If `forge` is not found, prepend `~/.foundry/bin` to `PATH` or call `/Users/reuben/.foundry/bin/forge` directly.

## ABI Regeneration Policy (No Manual ABI Edits)

If any contract ABI can change (function/event/error/signature changes), regenerate ABIs with commands. Do not manually edit:

- `apps/web/src/abi/contracts.ts`
- files under `apps/subgraph/abis/`

Run:

```bash
PATH="/Users/reuben/.foundry/bin:$PATH" forge build --root /Users/reuben/Desktop/minestarters/code/snx-prototype
node scripts/extract-abis.js
for c in BasketFactory BasketVault BasketShareToken VaultAccounting OracleAdapter; do jq '.abi' "out/$c.sol/$c.json" > "apps/subgraph/abis/$c.json"; done
```

`ERC20.json` in `apps/subgraph/abis/` is a stable external ABI and is not regenerated from local `out/`.

## Local Redeploy Rule (When Docker Compose Is Running)

When contract or subgraph code changes and the local Docker stack is running (`npm run local:up`), redeploy instead of leaving stale deployments.

Use:

```bash
npm run redeploy:local
```

This deploys contracts to Docker Anvil, syncs subgraph network addresses, rebuilds and deploys the subgraph to graph-node, and updates `apps/web/src/config/local-deployment.json`. The Next.js dev server (started with `npm run local:dev`) picks up new addresses via HMR.

For bare-metal Anvil without Docker (no subgraph), use `npm run deploy:local` instead.

## Scope-Specific Rule (Web App)

For work in `apps/web`, also follow [`apps/web/AGENTS.md`](/Users/reuben/Desktop/minestarters/code/snx-prototype/apps/web/AGENTS.md) (Next.js docs/version caveat).
