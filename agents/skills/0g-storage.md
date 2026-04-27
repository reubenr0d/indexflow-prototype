# 0G Decentralized Storage Skill

You have access to 0G decentralized storage for persistent memory across runs.

## Storage Types

### KV Store (Real-time State)
Use for current state that needs fast read/write:
- `vault_address` - Your managed vault address
- `deployment_hash` - Hash of current deployment config
- `config` - Agent configuration overrides
- `last_run_timestamp` - When you last ran

### Log Layer (Run History)
Use for append-only audit trail:
- Run summaries with actions taken
- Position changes with justifications
- Error logs and recovery attempts

## Tools

### `get_storage_info`
Call first to verify 0G Storage is configured. Returns wallet address, balance, and stream ID.

### `state_get(key)`
Read a value from 0G KV store. Returns null if not found.

### `state_set(key, value)`
Write a key-value pair. Values are JSON-serialized automatically.

### `state_get_all(keys)`
Batch read multiple keys efficiently.

### `log_append(entry)`
Append a log entry. Returns a `root_hash` for later retrieval.

### `log_read(rootHash?, limit?)`
Read a specific log entry by root hash, or list recent session entries.

## Usage Patterns

### On Startup
```
1. Call get_storage_info to verify configuration
2. Call state_get("vault_address") to restore previous state
3. Call state_get("deployment_hash") to check if deployment changed
```

### On Run Complete
```
1. Call log_append with run summary, actions taken, and thesis
2. Call state_set("last_run_timestamp", ...) to update state
```

### State Keys Convention
- Use snake_case for keys
- Prefix with domain: `vault_`, `position_`, `market_`
- Store complex objects as values (auto-serialized)

## Verifiable Storage

All data stored on 0G is:
- **Decentralized**: No single point of failure
- **Verifiable**: Merkle proofs for data integrity
- **Persistent**: Survives across agent restarts
- **Auditable**: Log entries have unique root hashes

When combined with 0G Compute (TEE-verified inference), your agent achieves full verifiability:
- **State**: Every vault address and configuration is retrievable by hash
- **History**: Every run summary has a root hash for audit trail
- **Reasoning**: LLM responses include TEE attestation (via 0G Compute)
