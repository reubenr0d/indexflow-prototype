#!/usr/bin/env node

/**
 * Burst-probe: write 3 fresh keys (default + agentio + agentio-with-special-char)
 * back-to-back, capture their txSeqs, and append them to the watcher's
 * probe list (printed as JSON for easy copy/paste).
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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

const ZG_PRIVATE_KEY = process.env.ZG_PRIVATE_KEY || process.env.PRIVATE_KEY;
const ZG_RPC_URL = process.env.ZG_RPC_URL || "https://evmrpc-testnet.0g.ai";
const ZG_INDEXER_RPC = process.env.ZG_INDEXER_RPC || "https://indexer-storage-testnet-turbo.0g.ai";
const ZG_STREAM_ID = process.env.ZG_STREAM_ID ||
  "0x000000000000000000000000000000000000000000000000000000000000f2bd";

const { ethers } = await import("ethers");
const { Indexer, Batcher, getFlowContract, StorageNode } =
  await import("@0gfoundation/0g-ts-sdk");

const network = ethers.Network.from({ name: "0g-galileo", chainId: 16602 });
const provider = new ethers.JsonRpcProvider(ZG_RPC_URL, network, { staticNetwork: network });
const signer = new ethers.Wallet(ZG_PRIVATE_KEY, provider);
const wallet = (await signer.getAddress()).toLowerCase();

const chainHead = parseInt(await provider.send("eth_blockNumber", []), 16);
console.log(`chain head: ${chainHead}, wallet: ${wallet}`);

const indexer = new Indexer(ZG_INDEXER_RPC);
const sharded = await indexer.getShardedNodes();
const candidates = [...(sharded.trusted || []), ...(sharded.discovered || [])];

const probed = [];
for (const c of candidates) {
  try {
    const n = new StorageNode(c.url);
    const status = await Promise.race([
      n.getStatus(),
      new Promise((_, r) => setTimeout(() => r(new Error("timeout")), 4000)),
    ]);
    const lag = chainHead - (status?.logSyncHeight ?? 0);
    if (lag < 200) {
      probed.push({ url: c.url, status, lag, node: n, shard: c.config?.shardId, numShard: c.config?.numShard });
    }
  } catch {}
}
const byShard = new Map();
for (const f of probed) {
  const k = `${f.shard}/${f.numShard}`;
  const existing = byShard.get(k);
  if (!existing || f.status.nextTxSeq > existing.status.nextTxSeq) byShard.set(k, f);
}
const picked = [...byShard.values()];
if (picked.length === 0) {
  console.error("No fresh storage nodes available across any shard");
  process.exit(1);
}
console.log(`Using ${picked.length} fresh storage node(s): ${picked.map(p => `${p.url}(shard ${p.shard}/${p.numShard})`).join(", ")}`);

const flowAddress = picked[0].status.networkIdentity.flowAddress;
const flowContract = getFlowContract(flowAddress, signer);

const ts = Date.now();
const probes = [
  {
    id: `default-${ts}`,
    style: "default",
    key: `${wallet}:tail-probe:${ts}`,
  },
  {
    id: `agentio-shape-${ts}`,
    style: "agentio",
    key: `agentio-live/agents/snx-burst-${ts}/state/latest`,
  },
  {
    id: `simple-${ts}`,
    style: "simple",
    key: `snx-burst/${ts}/state`,
  },
];

const results = [];
for (const p of probes) {
  const value = JSON.stringify({ ts: new Date().toISOString(), id: p.id, style: p.style });
  const batcher = new Batcher(1, picked.map(n => n.node), flowContract, ZG_RPC_URL);
  batcher.streamDataBuilder.set(
    ZG_STREAM_ID,
    Uint8Array.from(Buffer.from(p.key, "utf-8")),
    Uint8Array.from(Buffer.from(value, "utf-8"))
  );
  const start = Date.now();
  const [tx, err] = await batcher.exec();
  if (err) {
    console.error(`Write failed for ${p.id}: ${err.message || err}`);
    continue;
  }
  // Storage node nextTxSeq is incremented by 1 after each write.
  const post = await picked[0].node.getStatus();
  const ourTxSeq = post.nextTxSeq - 1;
  const elapsed = Date.now() - start;
  console.log(`[${elapsed}ms] ${p.id} -> txSeq=${ourTxSeq} tx=${tx.txHash}`);
  results.push({ ...p, txSeq: ourTxSeq, txHash: tx.txHash });
}

console.log("\n=== JSON to paste into watcher PROBES list ===");
console.log(JSON.stringify(results.map(r => ({ id: r.id, txSeq: r.txSeq, key: r.key, style: r.style })), null, 2));
