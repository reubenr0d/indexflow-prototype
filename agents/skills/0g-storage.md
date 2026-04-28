# 0G Decentralized Storage Skill

You have access to 0G decentralized storage for persistent memory across runs.

## Storage Layout

All KV writes from this agent go into a **shared 0G stream** (the agentio
public hackathon node by default — `http://178.238.236.119:6789`,
stream `0x...f2bd`). To stay safe in a multi-tenant stream, the
`0g-storage-mcp` automatically prefixes every per-agent state key with
`<your_wallet_lowercase>:<agent_name>:`. You write `state_set("vault_address", "0x...")`
and the MCP stores it under `0xabc...:0g-vault-manager:vault_address` —
unprefixed key in, unprefixed key out, no collision risk.

Vault metadata blobs (consumed by the public web app) live under the
unprefixed key `vault:<vault_lower>:metadata`. Vault addresses are
globally unique on-chain, so no wallet prefix is needed and any consumer
can look up a vault's "AI managed" panel without knowing which agent
manages it.

Run-log entries form an append-only chain in the 0G Log layer. Each
entry's `_meta.previousRoot` links to the prior root hash; the head
pointer is stored under the KV key `last_runlog_root` so future runs (or
the `runlog_recent` tool) can walk the chain backwards.

## Tools

### `get_storage_info`
Call first to verify 0G Storage is configured. Returns wallet address,
balance, the shared stream ID, and the key-prefix the MCP will apply.

### `state_get(key)`
Read a value from 0G KV store (the MCP prefixes the key for you). Returns
null if not found.

### `state_set(key, value)`
Write a key-value pair (auto-prefixed). Values are JSON-serialized
automatically. Requires 0G testnet funds.

### `state_get_all(keys)`
Batch read multiple keys (each auto-prefixed) in parallel.

### `log_append(entry)`
Append a log entry to the 0G Log layer. The MCP automatically stamps
`_meta.previousRoot` from the current head and updates the
`last_runlog_root` pointer. Returns a `root_hash` for later retrieval.

### `log_read(rootHash?, limit?)`
Read a specific log entry by root hash (cross-session), or list the
in-memory session index when `rootHash` is omitted.

### `runlog_recent({ limit })`
Walk the run-log chain backwards from `last_runlog_root` and return up to
`limit` entries (newest first). The runner uses this on startup to
reconstruct recent run history without grepping local files.

### `vault_metadata_set({ vault, metadata })`
Publish a JSON metadata blob for a vault (key:
`vault:<vault_lower>:metadata`). The web app's
`/api/agent-metadata/[vault]` route reads this directly. Used by the
runner — agents typically don't call this themselves.

### `vault_metadata_get({ vault })`
Read a vault's metadata blob. Useful for agents auditing other vaults.

## Usage Patterns

### On Startup
```
1. Call get_storage_info to verify configuration.
2. Call state_get("vault_address") to restore previous state. The
   runner has typically already loaded state via state_get_all and
   injected it into your system prompt — only call state_get yourself
   if you need a key the runner didn't load.
```

### On Run Complete
```
1. Call log_append with a run summary, actions taken, and thesis. The
   chain pointer + previousRoot link is handled for you.
2. The runner persists vault lifecycle keys (vault_address, agent_file_hash,
   deployment_fingerprint, last_run_at, etc.); you only need state_set
   for keys you own (e.g. analytical notes, custom thresholds).
```

### State Keys Convention
- Use snake_case for keys.
- Prefix with domain: `vault_`, `position_`, `market_`.
- Store complex objects as values (auto-serialized).
- The MCP adds the wallet+agent prefix on top, so two teams running
  identically named agents on the same shared stream stay isolated.

## Concurrency notes

KV is last-writer-wins per key. Two write paths sharing a key (e.g. the
runner and the model both writing `vault_address`) can clobber each
other if they overlap. Convention:

- The **runner** is the sole writer of vault lifecycle keys
  (`vault_address`, `vault_name`, `agent_file_hash`,
  `deployment_fingerprint`, `deployment_config_path`, `deployed_at`,
  `last_run_at`).
- The **model** writes its own analytical/thesis keys.

## Verifiable Storage

All data stored on 0G is:
- **Decentralized**: No single point of failure.
- **Verifiable**: Merkle proofs for data integrity (root hash per Log entry).
- **Persistent**: Survives across agent restarts.
- **Auditable**: Log entries form a hash-linked chain via `previousRoot`.

When combined with 0G Compute (TEE-verified inference), your agent
achieves full verifiability:
- **State**: Every vault address and configuration is retrievable from KV.
- **History**: Every run summary has a root hash; chain head lives in KV.
- **Reasoning**: LLM responses include TEE attestation (via 0G Compute).
