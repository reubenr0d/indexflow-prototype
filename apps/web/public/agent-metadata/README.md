# Agent metadata

Each AI-managed vault has a static JSON file at
`<vault_lowercase>.json` in this folder describing the agent operator,
its current thesis, and timestamps. The Next.js app fetches it from
`/agent-metadata/<vault>.json` via the `useAgentMetadata` hook and uses
it to render the "AI Operator" badge on basket pages.

These files are written by the agent runner (`scripts/agent-runner.mjs`,
`publishAgentMetadata`) after every run, tracked in git, and committed
back to `main` by CI under the `vault-agent[bot]` identity — see
`.github/workflows/vault-agent.yml`.

See `docs/AGENTS_FRAMEWORK.md` for the lifecycle.
