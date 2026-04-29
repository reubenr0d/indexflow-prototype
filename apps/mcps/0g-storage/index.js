#!/usr/bin/env node

/**
 * 0G Storage MCP Server
 *
 * Provides decentralized persistent storage for AI agents via 0G Network:
 *   - KV Store: Real-time state storage (replaces local state.json)
 *   - Log Layer: Append-only run history (replaces local run-log.jsonl)
 *
 * Storage layout:
 *   - All KV keys live in a SHARED stream (`ZG_STREAM_ID`, default: the
 *     agentio public hackathon node's indexed stream `0x...f2bd`).
 *   - Per-agent state keys are namespaced as `<wallet>:<AGENT_NAME>:<key>`
 *     so multiple teams can write to the shared stream without collisions.
 *     Callers see the unprefixed key in tool responses.
 *   - Vault-metadata blobs (consumed by the web app) live under the
 *     unprefixed key `vault:<vault_lower>:metadata` — vault addresses are
 *     globally unique on-chain so no wallet prefix is required.
 *   - The Log layer stores run-log entries as separate files; their root
 *     hashes are chained via `previousRoot`, with the head pointer stored
 *     under the KV key `last_runlog_root`.
 *
 * Requires:
 *   ZG_PRIVATE_KEY    - Funded wallet for storage fees (0G testnet tokens)
 *   ZG_RPC_URL        - 0G EVM RPC (default: https://evmrpc-testnet.0g.ai)
 *   ZG_INDEXER_RPC    - 0G Storage indexer (default: https://indexer-storage-testnet-turbo.0g.ai)
 *   ZG_KV_CLIENT_URL  - 0G KV node (default: agentio public node)
 *   ZG_STREAM_ID      - KV stream ID (default: agentio shared stream)
 *   AGENT_NAME        - Used in the wallet:agent: key prefix (default: "default")
 *   ZG_KV_TIMEOUT_MS  - Hard cap on KV read latency in ms (default: 5000)
 *   ZG_STORAGE_EXPECTED_REPLICA - Indexer replication: number of *full* sharding
 *     sets for KV batch writes and log file uploads (default: 2). The SDK
 *     needs this many complete replica groups; if the network cannot provide
 *     it, the MCP falls back to 1.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ethers } from "ethers";
import { Indexer, KvClient, Batcher, ZgFile, getFlowContract } from "@0gfoundation/0g-ts-sdk";
import { writeFileSync, readFileSync, existsSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import os from "node:os";

// ---------------------------------------------------------------------------
// Config from env
// ---------------------------------------------------------------------------

// Treat empty strings as unset. GitHub Actions evaluates `${{ vars.X }}` to
// "" when the variable is not defined; we still want the documented defaults
// to apply in that case.
function envOr(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === null) return fallback;
  const trimmed = String(v).trim();
  return trimmed === "" ? fallback : trimmed;
}

// Default KV client points at the agentio public hackathon node hosted by
// 0xAgentio (https://trivo25.github.io/agentio/) — no auth, no rate limit
// at time of writing. Swap to your own zgs_kv if it goes down.
const AGENTIO_KV_DEFAULT = "http://178.238.236.119:6789";
const AGENTIO_STREAM_DEFAULT =
  "0x000000000000000000000000000000000000000000000000000000000000f2bd";

const ZG_PRIVATE_KEY = envOr("ZG_PRIVATE_KEY", "");
const ZG_RPC_URL = envOr("ZG_RPC_URL", "https://evmrpc-testnet.0g.ai");
const ZG_INDEXER_RPC = envOr("ZG_INDEXER_RPC", "https://indexer-storage-testnet-turbo.0g.ai");
const ZG_KV_CLIENT_URL = envOr("ZG_KV_CLIENT_URL", AGENTIO_KV_DEFAULT);
const ZG_STREAM_ID = envOr("ZG_STREAM_ID", AGENTIO_STREAM_DEFAULT);
const AGENT_NAME = envOr("AGENT_NAME", "default");
// Hard cap each KV read so a temporary outage surfaces as a clear error
// rather than hanging the agent loop.
const ZG_KV_TIMEOUT_MS = parseInt(envOr("ZG_KV_TIMEOUT_MS", "5000"), 10);
/** How many full sharding sets the indexer should use for storage writes (min 1). */
const ZG_STORAGE_EXPECTED_REPLICA = Math.max(
  1,
  parseInt(envOr("ZG_STORAGE_EXPECTED_REPLICA", "2"), 10) || 1,
);

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`${label} timed out after ${ms}ms`);
      err.code = "ETIMEDOUT";
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// In-memory index of log entries uploaded *this session*. Persistent
// discoverability across runs comes from the `last_runlog_root` KV pointer
// + previousRoot chaining (see runlog_recent).
const logIndex = [];

// ---------------------------------------------------------------------------
// 0G SDK initialization (lazy)
// ---------------------------------------------------------------------------

let _provider = null;
let _signer = null;
let _indexer = null;
let _kvClient = null;
let _flowContract = null;
let _walletAddress = null;

function getProvider() {
  if (!_provider) {
    // Explicit Network with staticNetwork disables ENS reverse-lookup (which
    // ethers v6 attempts on signer.resolveName even for hex addresses, and
    // throws "network does not support ENS" on chains without ENS like 0G).
    const network = ethers.Network.from({ name: "0g-galileo", chainId: 16602 });
    _provider = new ethers.JsonRpcProvider(ZG_RPC_URL, network, {
      staticNetwork: network,
    });
  }
  return _provider;
}

function getSigner() {
  if (!_signer) {
    if (!ZG_PRIVATE_KEY) {
      throw new Error("ZG_PRIVATE_KEY is required for 0G Storage operations");
    }
    _signer = new ethers.Wallet(ZG_PRIVATE_KEY, getProvider());
  }
  return _signer;
}

async function getWalletAddress() {
  if (_walletAddress) return _walletAddress;
  _walletAddress = (await getSigner().getAddress()).toLowerCase();
  return _walletAddress;
}

function getIndexer() {
  if (!_indexer) {
    _indexer = new Indexer(ZG_INDEXER_RPC);
  }
  return _indexer;
}

function getKvClient() {
  if (!_kvClient) {
    _kvClient = new KvClient(ZG_KV_CLIENT_URL);
  }
  return _kvClient;
}

/**
 * Select storage nodes for writes: try `ZG_STORAGE_EXPECTED_REPLICA` full sets,
 * then fall back to 1 if the indexer cannot satisfy the replication request.
 * @returns {{ nodes: unknown[], expectedReplica: number, requested: number, usedFallback: boolean }}
 */
async function getStorageWriteContext() {
  const indexer = getIndexer();
  const requested = ZG_STORAGE_EXPECTED_REPLICA;
  const order =
    requested === 1
      ? [1]
      : [requested, 1].filter((n, i, a) => a.indexOf(n) === i);
  let lastErr = null;
  for (const n of order) {
    const [nodes, err] = await indexer.selectNodes(n);
    if (!err && nodes?.length) {
      return {
        nodes,
        expectedReplica: n,
        requested,
        usedFallback: n < requested,
      };
    }
    lastErr = err;
  }
  throw new Error(
    `Could not select storage nodes for writes (last error: ${lastErr?.message || lastErr})`
  );
}

async function getFlowContractInstance() {
  if (_flowContract) return _flowContract;
  // The 0G SDK expects the *flow contract address* (not the RPC URL). It is
  // discovered from a storage node's status payload. Picking it up via the
  // indexer guarantees the address matches the network the indexer is on.
  const indexer = getIndexer();
  const [nodes, err] = await indexer.selectNodes(1);
  if (err) throw new Error(`Indexer selectNodes failed: ${err.message || err}`);
  const status = await nodes[0].getStatus();
  const flowAddress = status?.networkIdentity?.flowAddress;
  if (!flowAddress) {
    throw new Error(
      "Storage node did not return networkIdentity.flowAddress; cannot init flow contract"
    );
  }
  _flowContract = getFlowContract(flowAddress, getSigner());
  return _flowContract;
}

// ---------------------------------------------------------------------------
// Tool response helpers
// ---------------------------------------------------------------------------

function toolError(code, message, recoveryHint) {
  const payload = { success: false, error_code: code, message };
  if (recoveryHint) payload.recovery_hint = recoveryHint;
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    isError: true,
  };
}

function toolSuccess(data) {
  return {
    content: [{ type: "text", text: JSON.stringify({ success: true, ...data }, null, 2) }],
  };
}

function keyToBytes(key) {
  return Uint8Array.from(Buffer.from(key, "utf-8"));
}

function valueToBytes(value) {
  const str = typeof value === "string" ? value : JSON.stringify(value);
  return Uint8Array.from(Buffer.from(str, "utf-8"));
}

function bytesToString(value) {
  if (value === null || value === undefined) return null;
  // KvClient.getValue resolves with `{ data: <base64-string>, size, version }`
  // (see node_modules/@0gfoundation/0g-ts-sdk/lib.esm/kv/client.js); decode
  // the base64 payload directly.
  //
  // The agentio public KV node returns `{ version: 0, data: "", size: 0 }`
  // for keys that don't exist *and* for keys whose write transaction has
  // landed on chain but not yet replicated to the KV node. Treat both as
  // "not present" by returning null whenever size is 0 (we never write
  // empty values — every state_set serialises to at least `{}` / `""`).
  if (typeof value === "object" && typeof value.data === "string") {
    if (typeof value.size === "number" && value.size === 0) return null;
    if (value.data === "") return null;
    try {
      return Buffer.from(value.data, "base64").toString("utf-8");
    } catch {
      return null;
    }
  }
  if (typeof value === "string") {
    if (value === "") return null;
    try {
      return Buffer.from(value, "base64").toString("utf-8");
    } catch {
      return value;
    }
  }
  if (value instanceof Uint8Array || Buffer.isBuffer(value)) {
    return Buffer.from(value).toString("utf-8");
  }
  return null;
}

// ---------------------------------------------------------------------------
// Key namespacing
// ---------------------------------------------------------------------------

// All per-agent state keys are prefixed `<wallet>:<agent>:` so that multiple
// teams can share the agentio stream safely. `vault:<addr>:metadata` keys
// are intentionally NOT prefixed — vault addresses are globally unique
// on-chain and the web app needs to read them without knowing which agent
// owns the vault.
async function prefixedKey(rawKey) {
  const wallet = await getWalletAddress();
  return `${wallet}:${AGENT_NAME}:${rawKey}`;
}

function vaultMetadataKey(vault) {
  if (typeof vault !== "string" || !vault.startsWith("0x")) {
    throw new Error(`vault must be a 0x-prefixed address, got: ${vault}`);
  }
  return `vault:${vault.toLowerCase()}:metadata`;
}

// ---------------------------------------------------------------------------
// Low-level KV helpers (used by both registered tools and internal pointer
// reads/writes for the run-log chain).
// ---------------------------------------------------------------------------

async function kvGetRaw(rawKey) {
  const kvClient = getKvClient();
  const value = await withTimeout(
    kvClient.getValue(ZG_STREAM_ID, ethers.encodeBase64(keyToBytes(rawKey))),
    ZG_KV_TIMEOUT_MS,
    `KV getValue(${rawKey})`
  );
  if (!value) return null;
  return bytesToString(value);
}

async function kvSetRaw(rawKey, value, writeCtx) {
  const flowContract = await getFlowContractInstance();
  const ctx = writeCtx ?? (await getStorageWriteContext());

  const batcher = new Batcher(1, ctx.nodes, flowContract, ZG_RPC_URL);
  batcher.streamDataBuilder.set(ZG_STREAM_ID, keyToBytes(rawKey), valueToBytes(value));

  const [tx, batchErr] = await batcher.exec();
  if (batchErr) throw new Error(`Batch execution error: ${batchErr}`);
  return tx;
}

function tryJsonParse(str) {
  if (str === null || str === undefined) return str;
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "0g-storage",
  version: "2.0.0",
});

// ── Storage Info Tool ───────────────────────────────────────────────────────

server.registerTool(
  "get_storage_info",
  {
    title: "Get 0G Storage Info",
    description:
      "Get 0G Storage configuration and connection status. " +
      "Returns network endpoints, wallet address, and the shared stream ID. " +
      "Call this first to verify 0G Storage is properly configured.",
    inputSchema: {},
  },
  async () => {
    try {
      const address = await getWalletAddress();
      const balance = await getProvider().getBalance(address);

      return toolSuccess({
        network: {
          rpc_url: ZG_RPC_URL,
          indexer_rpc: ZG_INDEXER_RPC,
          kv_client_url: ZG_KV_CLIENT_URL,
        },
        wallet: {
          address,
          balance_wei: balance.toString(),
          balance_0g: ethers.formatEther(balance),
        },
        storage: {
          stream_id: ZG_STREAM_ID,
          agent_name: AGENT_NAME,
          key_prefix: `${address}:${AGENT_NAME}:`,
          expected_replica_requested: ZG_STORAGE_EXPECTED_REPLICA,
        },
      });
    } catch (err) {
      return toolError("CONFIG_ERROR", err.message,
        "Check that ZG_PRIVATE_KEY is set and has 0G testnet tokens. Get tokens from https://faucet.0g.ai");
    }
  },
);

// ── KV State Tools ──────────────────────────────────────────────────────────

server.registerTool(
  "state_get",
  {
    title: "Get State from 0G KV",
    description:
      "Read a value from 0G decentralized KV store by key (auto-namespaced under your wallet+agent prefix). " +
      "Returns the stored value (parsed as JSON if valid) or null if not found. " +
      "Use this to retrieve persistent agent state across runs.",
    inputSchema: {
      key: z.string().describe("The unprefixed key to retrieve (e.g. 'vault_address', 'config', 'last_run')"),
    },
  },
  async ({ key }) => {
    try {
      const stored = await kvGetRaw(await prefixedKey(key));
      if (stored === null) {
        return toolSuccess({ key, value: null, found: false });
      }
      return toolSuccess({ key, value: tryJsonParse(stored), found: true, raw: stored });
    } catch (err) {
      if (err.message?.includes("not found") || err.message?.includes("null")) {
        return toolSuccess({ key, value: null, found: false });
      }
      return toolError("KV_READ_ERROR", err.message,
        `Check that ZG_KV_CLIENT_URL=${ZG_KV_CLIENT_URL} is reachable. Run scripts/probe-0g-kv.mjs to diagnose.`);
    }
  },
);

server.registerTool(
  "state_set",
  {
    title: "Set State in 0G KV",
    description:
      "Write a key-value pair to 0G decentralized KV store (auto-namespaced under your wallet+agent prefix). " +
      "Values are automatically JSON-serialized if not strings. " +
      "Persists agent state on-chain for recovery across runs. " +
      "Requires 0G tokens for storage fees.",
    inputSchema: {
      key: z.string().describe("The unprefixed key to store (e.g. 'vault_address', 'config')"),
      value: z.any().describe("The value to store (object, array, string, or number)"),
    },
  },
  async ({ key, value }) => {
    try {
      const prefixed = await prefixedKey(key);
      const tx = await kvSetRaw(prefixed, value);
      return toolSuccess({
        key,
        prefixed_key: prefixed,
        value,
        stream_id: ZG_STREAM_ID,
        transaction: tx,
        storage_type: "0G_KV",
      });
    } catch (err) {
      if (err.message?.includes("insufficient funds")) {
        return toolError("INSUFFICIENT_FUNDS", err.message,
          "Wallet needs 0G tokens for storage fees. Get tokens from https://faucet.0g.ai");
      }
      return toolError("KV_WRITE_ERROR", err.message,
        "Check wallet balance and network connectivity. Use get_storage_info to diagnose.");
    }
  },
);

server.registerTool(
  "state_get_all",
  {
    title: "Get All State Keys",
    description:
      "Retrieve multiple state values from 0G KV store in a single call (each auto-namespaced). " +
      "More efficient than multiple state_get calls. " +
      "Returns an object with all requested keys and their values (null when missing).",
    inputSchema: {
      keys: z.array(z.string()).describe("Array of unprefixed keys to retrieve"),
    },
  },
  async ({ keys }) => {
    try {
      // Resolve the prefix once (one wallet getAddress) then read in parallel.
      const wallet = await getWalletAddress();
      const reads = await Promise.all(
        keys.map(async (key) => {
          try {
            const stored = await kvGetRaw(`${wallet}:${AGENT_NAME}:${key}`);
            return [key, stored === null ? null : tryJsonParse(stored), null];
          } catch (err) {
            return [key, null, err.message];
          }
        })
      );

      const results = {};
      const errors = [];
      for (const [key, value, err] of reads) {
        results[key] = value;
        if (err) errors.push({ key, error: err });
      }

      return toolSuccess({
        values: results,
        keys_found: Object.values(results).filter((v) => v !== null).length,
        keys_missing: Object.values(results).filter((v) => v === null).length,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (err) {
      return toolError("KV_READ_ERROR", err.message,
        `Check network connectivity and that ZG_KV_CLIENT_URL=${ZG_KV_CLIENT_URL} is reachable.`);
    }
  },
);

// ── Vault Metadata Tools (consumed by the web app) ──────────────────────────

server.registerTool(
  "vault_metadata_set",
  {
    title: "Set Vault Metadata",
    description:
      "Write a JSON metadata blob for a vault to 0G KV at the unprefixed key " +
      "`vault:<vault_lower>:metadata`. The web app's /api/agent-metadata/[vault] " +
      "route reads this key directly. Used by the runner to publish 'AI managed' " +
      "info (thesis, recent actions, last run timestamp).",
    inputSchema: {
      vault: z.string().describe("The vault address (0x-prefixed)"),
      metadata: z.any().describe("The metadata blob (object) to publish"),
    },
  },
  async ({ vault, metadata }) => {
    try {
      const key = vaultMetadataKey(vault);
      const tx = await kvSetRaw(key, metadata);
      return toolSuccess({
        vault: vault.toLowerCase(),
        key,
        stream_id: ZG_STREAM_ID,
        transaction: tx,
        storage_type: "0G_KV",
      });
    } catch (err) {
      if (err.message?.includes("insufficient funds")) {
        return toolError("INSUFFICIENT_FUNDS", err.message,
          "Wallet needs 0G tokens for storage fees. Get tokens from https://faucet.0g.ai");
      }
      return toolError("KV_WRITE_ERROR", err.message,
        "Check wallet balance and network connectivity. Use get_storage_info to diagnose.");
    }
  },
);

server.registerTool(
  "vault_metadata_get",
  {
    title: "Get Vault Metadata",
    description:
      "Read the JSON metadata blob for a vault from 0G KV at the unprefixed key " +
      "`vault:<vault_lower>:metadata`. Returns null if not set.",
    inputSchema: {
      vault: z.string().describe("The vault address (0x-prefixed)"),
    },
  },
  async ({ vault }) => {
    try {
      const key = vaultMetadataKey(vault);
      const stored = await kvGetRaw(key);
      if (stored === null) {
        return toolSuccess({ vault: vault.toLowerCase(), key, metadata: null, found: false });
      }
      return toolSuccess({
        vault: vault.toLowerCase(),
        key,
        metadata: tryJsonParse(stored),
        found: true,
      });
    } catch (err) {
      return toolError("KV_READ_ERROR", err.message,
        `Check that ZG_KV_CLIENT_URL=${ZG_KV_CLIENT_URL} is reachable. Run scripts/probe-0g-kv.mjs to diagnose.`);
    }
  },
);

// ── Log Layer Tools ─────────────────────────────────────────────────────────

const LAST_RUNLOG_ROOT_KEY = "last_runlog_root";

async function uploadLogEntry(logEntry, writeCtx) {
  const indexer = getIndexer();
  const signer = getSigner();
  const ctx = writeCtx ?? (await getStorageWriteContext());
  const tempDir = os.tmpdir();
  const tempPath = resolve(tempDir, `0g-log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`);
  writeFileSync(tempPath, JSON.stringify(logEntry, null, 2));

  try {
    const file = await ZgFile.fromFilePath(tempPath);
    const [tree, treeErr] = await file.merkleTree();
    if (treeErr) {
      await file.close();
      throw new Error(`Merkle tree error: ${treeErr}`);
    }
    const rootHash = tree.rootHash();

    const [tx, uploadErr] = await indexer.upload(
      file,
      ZG_RPC_URL,
      signer,
      { expectedReplica: ctx.expectedReplica },
    );
    await file.close();
    if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message || uploadErr}`);

    return { rootHash, tx };
  } finally {
    if (existsSync(tempPath)) unlinkSync(tempPath);
  }
}

async function downloadLogEntry(rootHash) {
  const indexer = getIndexer();
  const tempDir = os.tmpdir();
  const outputPath = resolve(tempDir, `0g-download-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`);

  try {
    const err = await indexer.download(rootHash, outputPath, true);
    if (err) throw new Error(`Download failed: ${err.message || err}`);
    const content = readFileSync(outputPath, "utf-8");
    return tryJsonParse(content);
  } finally {
    if (existsSync(outputPath)) unlinkSync(outputPath);
  }
}

server.registerTool(
  "log_append",
  {
    title: "Append to 0G Log",
    description:
      "Append an entry to the agent's run log on 0G Storage (Log layer). " +
      "Each entry is a separate file with a unique root hash. The new entry's " +
      "`_meta.previousRoot` links back to the prior entry, and the head pointer " +
      "is stored in KV under `last_runlog_root` so future runs can walk the chain. " +
      "Use this to record run history, actions taken, and audit trails.",
    inputSchema: {
      entry: z.any().describe("The log entry to append (object with timestamp, actions, summary, etc.)"),
    },
  },
  async ({ entry }) => {
    try {
      const wallet = await getWalletAddress();
      const pointerKey = `${wallet}:${AGENT_NAME}:${LAST_RUNLOG_ROOT_KEY}`;

      // Look up the previous head (best effort — if KV is briefly unreachable
      // we still upload the entry without a previousRoot link, which makes a
      // new chain head that future calls will extend).
      let previousRoot = null;
      try {
        const prev = await kvGetRaw(pointerKey);
        if (prev) previousRoot = tryJsonParse(prev);
      } catch (_err) {
        previousRoot = null;
      }

      const logEntry = {
        ...entry,
        _meta: {
          agent: AGENT_NAME,
          timestamp: new Date().toISOString(),
          wallet,
          previousRoot,
        },
      };

      const writeCtx = await getStorageWriteContext();
      const { rootHash, tx } = await uploadLogEntry(logEntry, writeCtx);

      // Update the head pointer so future runs can find this entry.
      let pointerTx = null;
      let pointerError = null;
      try {
        pointerTx = await kvSetRaw(pointerKey, rootHash, writeCtx);
      } catch (err) {
        pointerError = err.message;
      }

      logIndex.push({ rootHash, timestamp: logEntry._meta.timestamp, tx });

      return toolSuccess({
        root_hash: rootHash,
        previous_root: previousRoot,
        transaction: tx,
        pointer_transaction: pointerTx,
        pointer_error: pointerError,
        entry: logEntry,
        storage_type: "0G_LOG",
        expected_replica_used: writeCtx.expectedReplica,
        expected_replica_requested: writeCtx.requested,
        expected_replica_fallback: writeCtx.usedFallback,
        retrieval_hint: "Use log_read with this root_hash, or runlog_recent to walk the chain.",
      });
    } catch (err) {
      if (err.message?.includes("insufficient funds")) {
        return toolError("INSUFFICIENT_FUNDS", err.message,
          "Wallet needs 0G tokens for storage fees. Get tokens from https://faucet.0g.ai");
      }
      return toolError("LOG_WRITE_ERROR", err.message,
        "Check wallet balance and network connectivity.");
    }
  },
);

server.registerTool(
  "log_read",
  {
    title: "Read from 0G Log",
    description:
      "Read a log entry from 0G Storage by its root hash, or list recent entries " +
      "uploaded in this session. If `rootHash` is provided, downloads and returns " +
      "that specific entry. Otherwise returns the in-memory session index.",
    inputSchema: {
      rootHash: z.string().optional().describe("Root hash of the log entry to retrieve (from log_append result)"),
      limit: z.number().optional().describe("Max entries to return from session index (default: 10)"),
    },
  },
  async ({ rootHash, limit = 10 }) => {
    try {
      if (!rootHash) {
        const recent = logIndex.slice(-limit).reverse();
        return toolSuccess({
          session_entries: recent,
          count: recent.length,
          total_session_entries: logIndex.length,
          note: "These are entries from this session. Provide a rootHash, or use runlog_recent to walk the cross-session chain.",
        });
      }
      const entry = await downloadLogEntry(rootHash);
      return toolSuccess({ root_hash: rootHash, entry, verified: true });
    } catch (err) {
      if (err.message?.includes("not found")) {
        return toolError("LOG_NOT_FOUND", `Log entry not found for root hash: ${rootHash}`,
          "Verify the root hash is correct. It should be from a previous log_append result.");
      }
      return toolError("LOG_READ_ERROR", err.message,
        "Check network connectivity and verify the root hash.");
    }
  },
);

server.registerTool(
  "runlog_recent",
  {
    title: "Read Recent Run-Log Entries",
    description:
      "Walk the agent's run-log chain backwards starting from the head pointer " +
      "stored in KV under `last_runlog_root`. Each entry's `_meta.previousRoot` " +
      "links to the prior entry, so this returns the most recent N entries in " +
      "reverse-chronological order. Use this to load run history at runner startup.",
    inputSchema: {
      limit: z.number().optional().describe("Max entries to walk (default: 5)"),
    },
  },
  async ({ limit = 5 }) => {
    try {
      const wallet = await getWalletAddress();
      const pointerKey = `${wallet}:${AGENT_NAME}:${LAST_RUNLOG_ROOT_KEY}`;
      const headRaw = await kvGetRaw(pointerKey);
      const head = headRaw ? tryJsonParse(headRaw) : null;
      if (!head) {
        return toolSuccess({ entries: [], count: 0, head_root: null });
      }

      const entries = [];
      let cursor = head;
      const seen = new Set();
      while (cursor && entries.length < limit) {
        if (seen.has(cursor)) break;
        seen.add(cursor);
        let entry;
        try {
          entry = await downloadLogEntry(cursor);
        } catch (err) {
          entries.push({ rootHash: cursor, entry: null, error: err.message });
          break;
        }
        entries.push({ rootHash: cursor, entry });
        cursor = entry?._meta?.previousRoot ?? null;
      }

      return toolSuccess({
        entries,
        count: entries.length,
        head_root: head,
        truncated: cursor !== null && entries.length >= limit,
      });
    } catch (err) {
      return toolError("RUNLOG_READ_ERROR", err.message,
        `Check that ZG_KV_CLIENT_URL=${ZG_KV_CLIENT_URL} and the indexer at ZG_INDEXER_RPC=${ZG_INDEXER_RPC} are reachable.`);
    }
  },
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
