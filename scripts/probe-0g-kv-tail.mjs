#!/usr/bin/env node

/**
 * Tail-sync probe for the agentio public KV node.
 *
 * - Writes a fresh key via the canonical 0G storage write path.
 * - Polls the agentio KV node (http://178.238.236.119:6789) until either:
 *     (a) our key appears (success — proves tail sync works for new writes), or
 *     (b) kv_getLast moves past our txSeq without our key (proves new writes
 *         are being skipped, same failure mode as our 53088-53092 writes).
 *
 *   ZG_KV_READ_DEADLINE_MS  default 600000 (10 min)
 *
 * **Write path (default — production-like):** Uses
 * `selectStorageWriteNodes(indexer, ZG_STORAGE_EXPECTED_REPLICA)` so the SDK
 * replicates each write across N **full sharding sets** (default 2; falls
 * back to 1 if the indexer cannot satisfy 2). Same path as the MCP and
 * `scripts/probe-0g-kv.mjs`.
 *
 * **Legacy diagnostic mode:** Set `ZG_KV_PROBE_PER_SHARD=1` to instead pick
 * one *fresh* storage node per shard from `getShardedNodes()`. Used in the
 * past to skip the stuck shard-0/2 cluster while debugging tail-sync gaps;
 * preserved here for future debugging only.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { selectStorageWriteNodes } from "./lib/select-0g-write-nodes.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

const envPath = resolve(projectRoot, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^"|"$/g, "");
    }
  }
}

const envOr = (k, d) => {
  const v = process.env[k];
  if (v === undefined || v === null) return d;
  const t = String(v).trim();
  return t === "" ? d : t;
};

const ZG_PRIVATE_KEY = envOr("ZG_PRIVATE_KEY", envOr("PRIVATE_KEY", ""));
const ZG_RPC_URL = envOr("ZG_RPC_URL", "https://evmrpc-testnet.0g.ai");
const ZG_INDEXER_RPC = envOr("ZG_INDEXER_RPC", "https://indexer-storage-testnet-turbo.0g.ai");
const ZG_KV_CLIENT_URL = envOr("ZG_KV_CLIENT_URL", "http://178.238.236.119:6789");
const ZG_STREAM_ID = envOr(
  "ZG_STREAM_ID",
  "0x000000000000000000000000000000000000000000000000000000000000f2bd"
);
const READ_DEADLINE_MS = parseInt(envOr("ZG_KV_READ_DEADLINE_MS", "600000"), 10);
const ZG_STORAGE_EXPECTED_REPLICA = Math.max(
  1,
  parseInt(envOr("ZG_STORAGE_EXPECTED_REPLICA", "2"), 10) || 1,
);
const PER_SHARD_MODE = ["1", "true", "yes"].includes(
  String(envOr("ZG_KV_PROBE_PER_SHARD", "")).toLowerCase().trim(),
);

if (!ZG_PRIVATE_KEY) {
  console.error("ZG_PRIVATE_KEY required");
  process.exit(2);
}

const { ethers } = await import("ethers");
const { Indexer, KvClient, Batcher, getFlowContract, StorageNode } =
  await import("@0gfoundation/0g-ts-sdk");

const network = ethers.Network.from({ name: "0g-galileo", chainId: 16602 });
const provider = new ethers.JsonRpcProvider(ZG_RPC_URL, network, { staticNetwork: network });
const signer = new ethers.Wallet(ZG_PRIVATE_KEY, provider);
const wallet = (await signer.getAddress()).toLowerCase();

console.log("0G KV tail-sync probe");
console.log("  KV node:", ZG_KV_CLIENT_URL);
console.log("  Stream: ", ZG_STREAM_ID);
console.log("  Wallet: ", wallet);
console.log(
  "  Mode:   ",
  PER_SHARD_MODE
    ? "ZG_KV_PROBE_PER_SHARD=1 (manual per-shard pick)"
    : `selectNodes(${ZG_STORAGE_EXPECTED_REPLICA}) with fallback to 1`,
);

const indexer = new Indexer(ZG_INDEXER_RPC);

let nodeClients;
let trackingNode;
let flowAddress;
if (PER_SHARD_MODE) {
  // 1. Find a fresh storage node per shard (skipping any stuck cluster).
  const chainHeadHex = await provider.send("eth_blockNumber", []);
  const chainHead = parseInt(chainHeadHex, 16);
  console.log(`  Chain head: ${chainHead}`);

  const sharded = await indexer.getShardedNodes();
  const candidates = [...(sharded.trusted || []), ...(sharded.discovered || [])];
  console.log(`  Indexer offers ${candidates.length} node(s)`);

  const probed = [];
  for (const c of candidates) {
    try {
      const n = new StorageNode(c.url);
      const status = await Promise.race([
        n.getStatus(),
        new Promise((_, r) => setTimeout(() => r(new Error("timeout")), 4000)),
      ]);
      const lag = chainHead - (status?.logSyncHeight ?? 0);
      const shard = c.config?.shardId ?? null;
      const numShard = c.config?.numShard ?? null;
      probed.push({ url: c.url, status, lag, node: n, shard, numShard });
      console.log(
        `    ${c.url} shard=${shard}/${numShard} h=${status.logSyncHeight} txSeq=${status.nextTxSeq} lag=${lag}`
      );
    } catch (e) {
      console.log(`    ${c.url} -> error: ${e.message}`);
    }
  }

  const fresh = probed.filter((p) => p.lag < 500);
  const byShard = new Map();
  for (const f of fresh) {
    const key = `${f.shard}/${f.numShard}`;
    const existing = byShard.get(key);
    if (!existing || f.status.nextTxSeq > existing.status.nextTxSeq) {
      byShard.set(key, f);
    }
  }
  const picked = [...byShard.values()];
  if (picked.length === 0) {
    console.error("\nNo fresh storage node available across any shard.");
    process.exit(1);
  }
  console.log(
    `\nUsing ${picked.length} storage node(s): ${picked.map((p) => `${p.url} (shard ${p.shard}/${p.numShard})`).join(", ")}`
  );
  nodeClients = picked.map((p) => p.node);
  trackingNode = picked[0].node;
  flowAddress = picked[0].status.networkIdentity.flowAddress;
} else {
  const ctx = await selectStorageWriteNodes(indexer, ZG_STORAGE_EXPECTED_REPLICA);
  console.log(
    `\nUsing ${ctx.nodes.length} storage node client(s) from selectNodes(${ctx.used})${ctx.usedFallback ? ` (fell back from ${ctx.requested})` : ""}`,
  );
  nodeClients = ctx.nodes;
  trackingNode = ctx.nodes[0];
  const status = await trackingNode.getStatus();
  flowAddress = status?.networkIdentity?.flowAddress;
}

// 2. Write a fresh key via the picked nodes.
const flowContract = getFlowContract(flowAddress, signer);
// PROBE_KEY_STYLE: "default" (our prefix) | "agentio" (mimics
// agentio-live/agents/agent-live-*/state/latest path). Used to test
// whether the KV ingester filters by key prefix.
const PROBE_KEY_STYLE = envOr("PROBE_KEY_STYLE", "default");
const probeKey =
  PROBE_KEY_STYLE === "agentio"
    ? `agentio-live/agents/snx-tail-probe-${Date.now()}/state/latest`
    : `${wallet}:tail-probe:${Date.now()}`;
const probeValue = JSON.stringify({ ts: new Date().toISOString(), source: "tail-probe", style: PROBE_KEY_STYLE });
console.log(`Probe key style: ${PROBE_KEY_STYLE}`);
console.log(`Probe key: ${probeKey}`);

const batcher = new Batcher(1, nodeClients, flowContract, ZG_RPC_URL);
batcher.streamDataBuilder.set(
  ZG_STREAM_ID,
  Uint8Array.from(Buffer.from(probeKey, "utf-8")),
  Uint8Array.from(Buffer.from(probeValue, "utf-8"))
);

const writeStart = Date.now();
const [tx, batchErr] = await batcher.exec();
if (batchErr) {
  console.error(`\nWrite failed: ${batchErr.message || batchErr}`);
  process.exit(1);
}
const writeMs = Date.now() - writeStart;
console.log(`\n[OK] write ${writeMs}ms (tx ${tx.txHash}, root ${tx.rootHash})`);

// Re-fetch storage node status to learn the assigned txSeq.
const postStatus = await trackingNode.getStatus();
const ourTxSeq = postStatus.nextTxSeq - 1; // batcher.exec increments nextTxSeq by 1
console.log(`  Storage node now: nextTxSeq=${postStatus.nextTxSeq}, our entry likely at ${ourTxSeq}`);

// 3. Poll KV: track tail watermark and look for our key.
const kv = new KvClient(ZG_KV_CLIENT_URL);
const keyB64 = Buffer.from(probeKey, "utf-8").toString("base64");
const writtenAt = Date.now();
const deadline = writtenAt + READ_DEADLINE_MS;
let attempt = 0;
let lastTailVersion = null;

console.log(`\nPolling KV tail every ~10s (deadline ${Math.round(READ_DEADLINE_MS / 1000)}s)...`);
while (Date.now() < deadline) {
  attempt++;
  let tailVersion = null;
  try {
    const last = await kv.getLast(ZG_STREAM_ID, 0, 256);
    if (last && typeof last === "object") tailVersion = last.version;
  } catch {}
  let value = null;
  try {
    value = await kv.getValue(ZG_STREAM_ID, keyB64);
  } catch {}
  const size = value && typeof value === "object" ? value.size : null;
  const data = value && typeof value === "object" ? value.data : "";
  const elapsed = Math.round((Date.now() - writtenAt) / 1000);

  if (size && size > 0 && data) {
    const decoded = Buffer.from(data, "base64").toString("utf-8");
    if (decoded === probeValue) {
      console.log(`\n[OK] Found our key after ${elapsed}s and ${attempt} attempts`);
      console.log(`     KV tail version: ${tailVersion}`);
      console.log(`     Our txSeq:       ${ourTxSeq}`);
      console.log(`     Decoded value:   ${decoded}`);
      console.log("\nTail sync is healthy — new writes ARE being indexed.");
      process.exit(0);
    }
  }

  // Print whenever the tail moves, every ~10s, or when we cross our txSeq.
  const tailMoved = tailVersion !== lastTailVersion;
  const crossed = tailVersion !== null && ourTxSeq !== null && tailVersion >= ourTxSeq;
  if (tailMoved || attempt === 1) {
    console.log(
      `  t=${elapsed}s attempt=${attempt}: tail v=${tailVersion} (delta to ours: ${
        tailVersion !== null ? tailVersion - ourTxSeq : "?"
      })${crossed ? " ← passed our txSeq" : ""}`
    );
    lastTailVersion = tailVersion;
  }
  if (crossed && (!size || size === 0)) {
    // Tail walked past our txSeq but didn't index our key. That's the
    // same gap-skip behaviour we saw for 53088/53089/53090 — give it
    // 30 more seconds to be sure (sometimes tail jumps in batches),
    // then fail.
    if (elapsed > 30 && tailVersion - ourTxSeq > 5) {
      console.error(
        `\n[FAIL] KV tail walked past our txSeq ${ourTxSeq} (now at v=${tailVersion}) ` +
          `without indexing our key. Same gap-skip behaviour as the earlier writes. ` +
          `The KV ingester is dropping entries during catch-up.`
      );
      process.exit(1);
    }
  }
  await new Promise((r) => setTimeout(r, 10000));
}

console.error(`\n[FAIL] Deadline (${Math.round(READ_DEADLINE_MS / 1000)}s) reached. Tail at v=${lastTailVersion}, our txSeq=${ourTxSeq}.`);
process.exit(1);
