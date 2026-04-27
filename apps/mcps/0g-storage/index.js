#!/usr/bin/env node

/**
 * 0G Storage MCP Server
 *
 * Provides decentralized persistent storage for AI agents via 0G Network:
 *   - KV Store: Real-time state storage (replaces local state.json)
 *   - Log Layer: Append-only run history (replaces local run-log.jsonl)
 *
 * Requires:
 *   ZG_PRIVATE_KEY - Funded wallet for storage fees (0G testnet tokens)
 *   ZG_RPC_URL - 0G EVM RPC (default: https://evmrpc-testnet.0g.ai)
 *   ZG_INDEXER_RPC - 0G Storage indexer (default: https://indexer-storage-testnet-turbo.0g.ai)
 *   ZG_STREAM_ID - Stream ID for KV operations (auto-created if not set)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ethers } from "ethers";
import { Indexer, KvClient, Batcher, ZgFile, MemData, getFlowContract } from "@0gfoundation/0g-ts-sdk";
import { writeFileSync, readFileSync, existsSync, unlinkSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import os from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Config from env
// ---------------------------------------------------------------------------

const ZG_PRIVATE_KEY = process.env.ZG_PRIVATE_KEY ?? "";
const ZG_RPC_URL = process.env.ZG_RPC_URL ?? "https://evmrpc-testnet.0g.ai";
const ZG_INDEXER_RPC = process.env.ZG_INDEXER_RPC ?? "https://indexer-storage-testnet-turbo.0g.ai";
const ZG_KV_CLIENT_URL = process.env.ZG_KV_CLIENT_URL ?? "http://3.101.147.150:6789";
const ZG_STREAM_ID = process.env.ZG_STREAM_ID ?? "";
const AGENT_NAME = process.env.AGENT_NAME ?? "default";

// Cache for log root hashes (in-memory index of uploaded logs)
const logIndex = [];
let cachedStreamId = ZG_STREAM_ID;

// ---------------------------------------------------------------------------
// 0G SDK initialization
// ---------------------------------------------------------------------------

let _provider = null;
let _signer = null;
let _indexer = null;
let _kvClient = null;
let _flowContract = null;

function getProvider() {
  if (!_provider) {
    _provider = new ethers.JsonRpcProvider(ZG_RPC_URL);
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

async function getFlowContractInstance() {
  if (!_flowContract) {
    _flowContract = await getFlowContract(ZG_RPC_URL, getSigner());
  }
  return _flowContract;
}

// ---------------------------------------------------------------------------
// Helper functions
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

function bytesToString(bytes) {
  if (!bytes) return null;
  if (typeof bytes === "string") {
    // May be base64 encoded
    try {
      return Buffer.from(bytes, "base64").toString("utf-8");
    } catch {
      return bytes;
    }
  }
  return Buffer.from(bytes).toString("utf-8");
}

async function ensureStreamId() {
  if (cachedStreamId) return cachedStreamId;
  
  // Generate a deterministic stream ID based on agent name and wallet address
  const signer = getSigner();
  const address = await signer.getAddress();
  const seed = `0g-agent-${AGENT_NAME}-${address}`;
  const hash = createHash("sha256").update(seed).digest("hex");
  cachedStreamId = `0x${hash}`;
  return cachedStreamId;
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "0g-storage",
  version: "1.0.0",
});

// ── Storage Info Tool ───────────────────────────────────────────────────────

server.registerTool(
  "get_storage_info",
  {
    title: "Get 0G Storage Info",
    description:
      "Get 0G Storage configuration and connection status. " +
      "Returns network endpoints, wallet address, and stream ID for KV operations. " +
      "Call this first to verify 0G Storage is properly configured.",
    inputSchema: {},
  },
  async () => {
    try {
      const signer = getSigner();
      const address = await signer.getAddress();
      const balance = await getProvider().getBalance(address);
      const streamId = await ensureStreamId();
      
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
          stream_id: streamId,
          agent_name: AGENT_NAME,
        },
      });
    } catch (err) {
      return toolError("CONFIG_ERROR", err.message,
        "Check that ZG_PRIVATE_KEY is set and has 0G testnet tokens. Get tokens from https://faucet.0g.ai");
    }
  },
);

// ── KV Store Tools ──────────────────────────────────────────────────────────

server.registerTool(
  "state_get",
  {
    title: "Get State from 0G KV",
    description:
      "Read a value from 0G decentralized KV store by key. " +
      "Returns the stored value (parsed as JSON if valid) or null if not found. " +
      "Use this to retrieve persistent agent state across runs.",
    inputSchema: {
      key: z.string().describe("The key to retrieve (e.g. 'vault_address', 'config', 'last_run')"),
    },
  },
  async ({ key }) => {
    try {
      const streamId = await ensureStreamId();
      const kvClient = getKvClient();
      const keyBytes = keyToBytes(key);
      
      const value = await kvClient.getValue(streamId, ethers.encodeBase64(keyBytes));
      
      if (!value) {
        return toolSuccess({ key, value: null, found: false });
      }
      
      const valueStr = bytesToString(value);
      
      // Try to parse as JSON
      let parsed = valueStr;
      try {
        parsed = JSON.parse(valueStr);
      } catch {
        // Keep as string
      }
      
      return toolSuccess({ key, value: parsed, found: true, raw: valueStr });
    } catch (err) {
      if (err.message?.includes("not found") || err.message?.includes("null")) {
        return toolSuccess({ key, value: null, found: false });
      }
      return toolError("KV_READ_ERROR", err.message,
        "Check that the stream ID exists and has data. Use get_storage_info to verify configuration.");
    }
  },
);

server.registerTool(
  "state_set",
  {
    title: "Set State in 0G KV",
    description:
      "Write a key-value pair to 0G decentralized KV store. " +
      "Values are automatically JSON-serialized if not strings. " +
      "This persists agent state on-chain for recovery across runs. " +
      "Requires 0G tokens for storage fees.",
    inputSchema: {
      key: z.string().describe("The key to store (e.g. 'vault_address', 'config')"),
      value: z.any().describe("The value to store (object, array, string, or number)"),
    },
  },
  async ({ key, value }) => {
    try {
      const streamId = await ensureStreamId();
      const indexer = getIndexer();
      const flowContract = await getFlowContractInstance();
      
      // Select storage nodes
      const [nodes, nodesErr] = await indexer.selectNodes(1);
      if (nodesErr) {
        throw new Error(`Error selecting nodes: ${nodesErr}`);
      }
      
      // Create batcher for KV operation
      const batcher = new Batcher(1, nodes, flowContract, ZG_RPC_URL);
      
      const keyBytes = keyToBytes(key);
      const valueBytes = valueToBytes(value);
      
      batcher.streamDataBuilder.set(streamId, keyBytes, valueBytes);
      
      const [tx, batchErr] = await batcher.exec();
      if (batchErr) {
        throw new Error(`Batch execution error: ${batchErr}`);
      }
      
      return toolSuccess({
        key,
        value,
        stream_id: streamId,
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

// ── Log Layer Tools ─────────────────────────────────────────────────────────

server.registerTool(
  "log_append",
  {
    title: "Append to 0G Log",
    description:
      "Append an entry to the agent's run log on 0G Storage (Log layer). " +
      "Each entry is stored as a separate file with a unique root hash. " +
      "Use this to record run history, actions taken, and audit trails. " +
      "Returns the root hash which can be used to retrieve the entry later.",
    inputSchema: {
      entry: z.any().describe("The log entry to append (object with timestamp, actions, summary, etc.)"),
    },
  },
  async ({ entry }) => {
    try {
      const indexer = getIndexer();
      const signer = getSigner();
      
      // Add metadata to entry
      const logEntry = {
        ...entry,
        _meta: {
          agent: AGENT_NAME,
          timestamp: new Date().toISOString(),
          wallet: await signer.getAddress(),
        },
      };
      
      // Write to temp file (SDK requires file path)
      const tempDir = os.tmpdir();
      const tempPath = resolve(tempDir, `0g-log-${Date.now()}.json`);
      writeFileSync(tempPath, JSON.stringify(logEntry, null, 2));
      
      try {
        // Create file object and generate merkle tree
        const file = await ZgFile.fromFilePath(tempPath);
        const [tree, treeErr] = await file.merkleTree();
        if (treeErr) throw new Error(`Merkle tree error: ${treeErr}`);
        
        const rootHash = tree.rootHash();
        
        // Upload to 0G Storage
        const [tx, uploadErr] = await indexer.upload(file, ZG_RPC_URL, signer);
        if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message || uploadErr}`);
        
        await file.close();
        
        // Track in local index
        logIndex.push({
          rootHash,
          timestamp: logEntry._meta.timestamp,
          tx,
        });
        
        return toolSuccess({
          root_hash: rootHash,
          transaction: tx,
          entry: logEntry,
          storage_type: "0G_LOG",
          retrieval_hint: "Use log_read with this root_hash to retrieve the entry",
        });
      } finally {
        // Clean up temp file
        if (existsSync(tempPath)) {
          unlinkSync(tempPath);
        }
      }
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
      "Read a log entry from 0G Storage by its root hash, or list recent entries from this session. " +
      "If rootHash is provided, downloads and returns that specific entry. " +
      "If omitted, returns the index of log entries from this session.",
    inputSchema: {
      rootHash: z.string().optional().describe("Root hash of the log entry to retrieve (from log_append result)"),
      limit: z.number().optional().describe("Max entries to return from session index (default: 10)"),
    },
  },
  async ({ rootHash, limit = 10 }) => {
    try {
      // If no rootHash, return session index
      if (!rootHash) {
        const recent = logIndex.slice(-limit).reverse();
        return toolSuccess({
          session_entries: recent,
          count: recent.length,
          total_session_entries: logIndex.length,
          note: "These are entries from this session. Provide a rootHash to retrieve a specific entry.",
        });
      }
      
      // Download specific entry by root hash
      const indexer = getIndexer();
      const tempDir = os.tmpdir();
      const outputPath = resolve(tempDir, `0g-download-${Date.now()}.json`);
      
      try {
        const err = await indexer.download(rootHash, outputPath, true);
        if (err) throw new Error(`Download failed: ${err.message || err}`);
        
        const content = readFileSync(outputPath, "utf-8");
        let parsed = content;
        try {
          parsed = JSON.parse(content);
        } catch {
          // Keep as string
        }
        
        return toolSuccess({
          root_hash: rootHash,
          entry: parsed,
          verified: true,
        });
      } finally {
        if (existsSync(outputPath)) {
          unlinkSync(outputPath);
        }
      }
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

// ── Batch State Operations ──────────────────────────────────────────────────

server.registerTool(
  "state_get_all",
  {
    title: "Get All State Keys",
    description:
      "Retrieve multiple state values from 0G KV store in a single call. " +
      "More efficient than multiple state_get calls. " +
      "Returns an object with all requested keys and their values.",
    inputSchema: {
      keys: z.array(z.string()).describe("Array of keys to retrieve"),
    },
  },
  async ({ keys }) => {
    try {
      const streamId = await ensureStreamId();
      const kvClient = getKvClient();
      
      const results = {};
      const errors = [];
      
      for (const key of keys) {
        try {
          const keyBytes = keyToBytes(key);
          const value = await kvClient.getValue(streamId, ethers.encodeBase64(keyBytes));
          
          if (!value) {
            results[key] = null;
          } else {
            const valueStr = bytesToString(value);
            try {
              results[key] = JSON.parse(valueStr);
            } catch {
              results[key] = valueStr;
            }
          }
        } catch (err) {
          errors.push({ key, error: err.message });
          results[key] = null;
        }
      }
      
      return toolSuccess({
        values: results,
        keys_found: Object.values(results).filter(v => v !== null).length,
        keys_missing: Object.values(results).filter(v => v === null).length,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (err) {
      return toolError("KV_READ_ERROR", err.message,
        "Check network connectivity and stream ID configuration.");
    }
  },
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
