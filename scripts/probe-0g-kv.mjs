#!/usr/bin/env node

/**
 * 0G KV Round-Trip Probe
 *
 * Writes + reads a throwaway namespaced KV key against the configured
 * 0G storage stack (default: agentio public node + shared stream). Prints
 * the latency for each leg and exits non-zero with a fix hint on failure.
 *
 *   node scripts/probe-0g-kv.mjs
 *
 * Used as a pre-flight step in the vault-agent workflow so a dead KV
 * endpoint surfaces with a clear "swap ZG_KV_CLIENT_URL" hint instead of
 * deep-running the agent loop and failing on the first state read.
 *
 * Env:
 *   ZG_KV_READ_DEADLINE_MS - Max time to poll for read-after-write (ms).
 *     Default 300000 (5m) locally. On GitHub Actions, default 300000 (5m) to
 *     cap job time; increase via repo `vars` if you use `ZG_KV_PROBE_STRICT_READ=1`.
 *   ZG_KV_PROBE_STRICT_READ - If `1`, fail when read-after-write does not
 *     confirm within the deadline. **Default: `0` in GitHub Actions** (soft
 *     pass if write succeeded — the public agentio KV often never shows the
 *     key in time). **Default: `1` locally** (full round-trip). Set `0`
 *     locally to soft-pass on read timeout; set `1` in CI to require reads.
 *   ZG_KV_PROBE_OK_IF_WRITE_ONLY - If "1" (anywhere), soft-pass on read
 *     timeout when write succeeded (overrides local strict default).
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { selectStorageWriteNodes } from "./lib/select-0g-write-nodes.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

// Tiny .env loader so dev runs don't need a runtime flag.
const envPath = resolve(projectRoot, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^"|"$/g, "");
    }
  }
}

function envOr(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === null) return fallback;
  const trimmed = String(v).trim();
  return trimmed === "" ? fallback : trimmed;
}

const AGENTIO_KV_DEFAULT = "http://178.238.236.119:6789";
const AGENTIO_STREAM_DEFAULT =
  "0x000000000000000000000000000000000000000000000000000000000000f2bd";

const ZG_PRIVATE_KEY = envOr("ZG_PRIVATE_KEY", envOr("PRIVATE_KEY", ""));
const ZG_RPC_URL = envOr("ZG_RPC_URL", "https://evmrpc-testnet.0g.ai");
const ZG_INDEXER_RPC = envOr("ZG_INDEXER_RPC", "https://indexer-storage-testnet-turbo.0g.ai");
const ZG_KV_CLIENT_URL = envOr("ZG_KV_CLIENT_URL", AGENTIO_KV_DEFAULT);
const ZG_STREAM_ID = envOr("ZG_STREAM_ID", AGENTIO_STREAM_DEFAULT);
const ZG_KV_TIMEOUT_MS = parseInt(envOr("ZG_KV_TIMEOUT_MS", "5000"), 10);
const ZG_STORAGE_EXPECTED_REPLICA = Math.max(
  1,
  parseInt(envOr("ZG_STORAGE_EXPECTED_REPLICA", "2"), 10) || 1,
);
const AGENT_NAME = envOr("AGENT_NAME", "probe");

console.log("0G KV Round-Trip Probe");
console.log("  KV node:    ", ZG_KV_CLIENT_URL);
console.log("  Stream ID:  ", ZG_STREAM_ID);
console.log("  Indexer RPC:", ZG_INDEXER_RPC);
console.log("  EVM RPC:    ", ZG_RPC_URL);
console.log("  Agent name: ", AGENT_NAME);
console.log("  Replicas:   ", `request ${ZG_STORAGE_EXPECTED_REPLICA} full set(s) (falls back to 1 if indexer cannot)`);
const isGithubActions = envOr("GITHUB_ACTIONS", "") === "true";
const defaultReadDeadlineMs = 5 * 60 * 1000;
const effectiveReadDeadlineMs = parseInt(
  envOr("ZG_KV_READ_DEADLINE_MS", String(defaultReadDeadlineMs)),
  10,
);
const strictReadEnv = isGithubActions
  ? envOr("ZG_KV_PROBE_STRICT_READ", "0")
  : envOr("ZG_KV_PROBE_STRICT_READ", "1");
const requireReadRoundtrip = ["1", "true", "yes"].includes(
  String(strictReadEnv).toLowerCase().trim(),
);
if (isGithubActions) {
  console.log("  Read poll:  ", `${Math.round(effectiveReadDeadlineMs / 1000)}s max (set ZG_KV_READ_DEADLINE_MS to override)`);
  console.log(
    "  Read rule:  ",
    requireReadRoundtrip
      ? "strict — job fails if read-after-write does not succeed"
      : "soft in CI — job passes if write leg succeeded (read is best-effort; set ZG_KV_PROBE_STRICT_READ=1 to require round-trip, or self-host zgs_kv)",
  );
}

if (!ZG_PRIVATE_KEY) {
  console.error("\n[FAIL] ZG_PRIVATE_KEY (or PRIVATE_KEY) is required to write to KV.");
  console.error("        Fund a wallet at https://faucet.0g.ai and export the key:");
  console.error("        export ZG_PRIVATE_KEY=0x...");
  process.exit(2);
}

const { ethers } = await import("ethers");
const {
  Indexer,
  KvClient,
  Batcher,
  getFlowContract,
} = await import("@0gfoundation/0g-ts-sdk");

const network = ethers.Network.from({ name: "0g-galileo", chainId: 16602 });
const provider = new ethers.JsonRpcProvider(ZG_RPC_URL, network, {
  staticNetwork: network,
});
const signer = new ethers.Wallet(ZG_PRIVATE_KEY, provider);
const wallet = (await signer.getAddress()).toLowerCase();
console.log("  Wallet:     ", wallet);

const probeKey = `${wallet}:${AGENT_NAME}:__probe_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const probeValue = JSON.stringify({ ts: new Date().toISOString(), source: "probe-0g-kv" });
console.log("  Probe key:  ", probeKey);

function withTimeout(p, ms, label) {
  return Promise.race([
    p,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

const kv = new KvClient(ZG_KV_CLIENT_URL);
const indexer = new Indexer(ZG_INDEXER_RPC);

let writeLatencyMs = null;
let readLatencyMs = null;

try {
  // ── Write leg ─────────────────────────────────────────────────────────
  const writeStart = Date.now();
  const { nodes, used, usedFallback } = await selectStorageWriteNodes(
    indexer,
    ZG_STORAGE_EXPECTED_REPLICA,
  );
  if (usedFallback) {
    console.log(`  (indexer selected ${used} full set(s); ${ZG_STORAGE_EXPECTED_REPLICA} was requested but not available)\n`);
  } else {
    console.log(`  (indexer selected ${used} full set(s) for this write)\n`);
  }
  const status = await nodes[0].getStatus();
  const flowAddress = status?.networkIdentity?.flowAddress;
  if (!flowAddress) throw new Error("Storage node returned no flowAddress");
  const flowContract = getFlowContract(flowAddress, signer);

  // Batcher(streamVersion, nodeClients, ...) — first arg is KV stream data version, not replica count.
  const batcher = new Batcher(1, nodes, flowContract, ZG_RPC_URL);
  batcher.streamDataBuilder.set(
    ZG_STREAM_ID,
    Uint8Array.from(Buffer.from(probeKey, "utf-8")),
    Uint8Array.from(Buffer.from(probeValue, "utf-8"))
  );
  const [tx, batchErr] = await batcher.exec();
  if (batchErr) throw new Error(`batcher.exec failed: ${batchErr.message || batchErr}`);
  writeLatencyMs = Date.now() - writeStart;
  const txHash = tx?.txHash ?? "?";
  const rootHash = tx?.rootHash ?? "?";
  console.log(`\n[OK]   write leg  ${writeLatencyMs}ms (tx ${txHash}, root ${rootHash})`);
} catch (err) {
  console.error(`\n[FAIL] write leg: ${err.message || err}`);
  console.error("        Hints:");
  console.error("          - Wallet may need 0G testnet funds (https://faucet.0g.ai).");
  console.error("          - Indexer may be unreachable; verify ZG_INDEXER_RPC.");
  process.exit(1);
}

// KV reads need to wait for the agentio node to replicate the new key
// from chain. Replication latency on the public hackathon node varies a
// lot — usually under a minute, occasionally several minutes when it's
// catching up.
//
// The KV node returns `{ version: 0, data: "", size: 0 }` for both
// missing keys *and* keys not yet replicated. Treat size===0 as
// "still syncing", non-empty + matching payload as success, and
// non-empty + mismatching payload as a real failure.
const READ_DEADLINE_MS = effectiveReadDeadlineMs;
const PROBE_OK_IF_WRITE_ONLY = ["1", "true", "yes"].includes(
  (envOr("ZG_KV_PROBE_OK_IF_WRITE_ONLY", "") || "").toLowerCase().trim(),
);
/** Soft-pass read timeout: explicit env, or CI default (public KV is unreliable for reads). */
const allowSoftPassOnReadTimeout =
  PROBE_OK_IF_WRITE_ONLY || (isGithubActions && !requireReadRoundtrip);
const STATUS_INTERVAL_MS = 10000;
const writeFinishedAt = Date.now();
const readDeadlineMs = writeFinishedAt + READ_DEADLINE_MS;
console.log(`\nPolling KV for replication (deadline ${Math.round(READ_DEADLINE_MS / 1000)}s)...`);
let attempt = 0;
let lastStatusAt = 0;
let lastErr = null;
while (Date.now() < readDeadlineMs) {
  attempt += 1;
  try {
    const readStart = Date.now();
    const value = await withTimeout(
      kv.getValue(ZG_STREAM_ID, Buffer.from(probeKey, "utf-8").toString("base64")),
      ZG_KV_TIMEOUT_MS,
      "kv.getValue"
    );
    const sizeFromNode = value && typeof value === "object" ? value.size : null;
    const dataFromNode = value && typeof value === "object" ? value.data : null;
    const decoded =
      typeof dataFromNode === "string" && dataFromNode.length > 0
        ? Buffer.from(dataFromNode, "base64").toString("utf-8")
        : "";

    if (decoded === probeValue) {
      readLatencyMs = Date.now() - readStart;
      const elapsedSec = Math.round((Date.now() - writeFinishedAt) / 1000);
      console.log(`\n[OK]   read leg   ${readLatencyMs}ms (attempt ${attempt}, ${elapsedSec}s after write)`);
      console.log(`[OK]   payload roundtripped: ${decoded}`);
      console.log(`\nTotal: write=${writeLatencyMs}ms read=${readLatencyMs}ms (after ${attempt} read attempt(s))`);
      process.exit(0);
    }

    if (decoded !== "") {
      // Genuine mismatch — the node returned different bytes for this
      // key. That is not a sync issue and would never resolve itself.
      console.error(`\n[FAIL] payload mismatch on attempt ${attempt}`);
      console.error(`        expected: ${probeValue}`);
      console.error(`        got:      ${decoded}`);
      console.error(`        size:     ${sizeFromNode}`);
      process.exit(1);
    }

    lastErr = new Error(`KV not yet replicated (size=${sizeFromNode}, attempt ${attempt})`);
  } catch (err) {
    lastErr = err;
  }

  if (Date.now() - lastStatusAt >= STATUS_INTERVAL_MS) {
    const elapsed = Math.round((Date.now() - writeFinishedAt) / 1000);
    console.log(`  ...waiting (${elapsed}s elapsed, ${attempt} read attempt(s) so far): ${lastErr?.message || "no response"}`);
    lastStatusAt = Date.now();
  }
  // Backoff between attempts (1s, 2s, 4s, 8s, capped at 15s).
  const wait = Math.min(1000 * Math.pow(2, attempt - 1), 15000);
  await new Promise((r) => setTimeout(r, wait));
}

const readFailMsg = `\n[FAIL] read leg gave up after ${Math.round(READ_DEADLINE_MS / 1000)}s: ${lastErr?.message || lastErr || "unknown"}`;
if (allowSoftPassOnReadTimeout) {
  console.error(readFailMsg);
  if (PROBE_OK_IF_WRITE_ONLY) {
    console.error("        [WARN] ZG_KV_PROBE_OK_IF_WRITE_ONLY=1 — pass (write leg succeeded).");
  } else {
    console.error(
      "        [WARN] Read-after-write not confirmed (write leg still succeeded on-chain / storage).",
    );
    console.error(
      "        GitHub Actions: soft pass by default — set ZG_KV_PROBE_STRICT_READ=1 to fail here, or self-host ZG_KV_CLIENT_URL. See AGENTS_FRAMEWORK.md.",
    );
  }
  process.exit(0);
}
console.error(readFailMsg);
console.error("        Hints:");
console.error(`          - Verify ZG_KV_CLIENT_URL=${ZG_KV_CLIENT_URL} is reachable.`);
if (isGithubActions) {
  console.error("          - Strict read mode is on (ZG_KV_PROBE_STRICT_READ=1). Either:");
  console.error("              * raise ZG_KV_READ_DEADLINE_MS (current 300000ms in workflow), or");
  console.error("              * unset ZG_KV_PROBE_STRICT_READ to soft-pass on read timeout, or");
  console.error("              * point ZG_KV_CLIENT_URL at a self-hosted zgs_kv node.");
} else {
  console.error("          - The public agentio node can lag many minutes; raise");
  console.error("            ZG_KV_READ_DEADLINE_MS or set ZG_KV_PROBE_STRICT_READ=0");
  console.error("            to allow pass when write works but read lags (see script header).");
}
console.error("          - If reads stay null indefinitely, swap to a self-hosted zgs_kv:");
console.error("              export ZG_KV_CLIENT_URL=http://<your-node>:6789");
console.error("            See docs/AGENTS_FRAMEWORK.md for the self-host guide.");
process.exit(1);
