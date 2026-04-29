#!/usr/bin/env node

/**
 * Long-running watcher for the agentio public KV node.
 *
 * Polls the KV tail and a list of pre-written probe keys every 60s.
 * Stops with a verdict when the tail has walked past every probe's
 * txSeq, classifying each as "found" or "skipped". Useful for
 * disambiguating the "key prefix filter" hypothesis against the
 * "block-height threshold" hypothesis on the agentio hackathon node.
 *
 *   node scripts/probe-0g-kv-watcher.mjs
 *
 * Output goes to stdout AND is appended to scripts/agent-debug-log.jsonl
 * so we can produce a clean timeline for the agentio team.
 */

import { writeFileSync, appendFileSync, existsSync, readFileSync } from "node:fs";
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

const KV_URL = process.env.ZG_KV_CLIENT_URL || "http://178.238.236.119:6789";
const STREAM_ID =
  process.env.ZG_STREAM_ID ||
  "0x000000000000000000000000000000000000000000000000000000000000f2bd";
const POLL_MS = parseInt(process.env.WATCHER_POLL_MS || "60000", 10);
const DEADLINE_MS = parseInt(process.env.WATCHER_DEADLINE_MS || `${4 * 60 * 60 * 1000}`, 10); // 4h
const LOG_PATH = resolve(projectRoot, "scripts/agent-debug-log.jsonl");

// Keys we have already written and their assigned txSeq.
// Update as new probes land.
const PROBES = [
  { id: "default-old-cffq77", txSeq: 53088, key: "0x36716c8c5d1ae680c78bd0ecc230896556399713:probe:__probe_1777355641431_cffq77", style: "default" },
  { id: "default-old-v911bo", txSeq: 53089, key: "0x36716c8c5d1ae680c78bd0ecc230896556399713:probe:__probe_1777356160714_v911bo", style: "default" },
  { id: "default-old-nnsrqc", txSeq: 53090, key: "0x36716c8c5d1ae680c78bd0ecc230896556399713:probe:__probe_1777356682124_nnsrqc", style: "default" },
  { id: "default-tail-1101691", txSeq: 53650, key: "0x36716c8c5d1ae680c78bd0ecc230896556399713:tail-probe:1777373101691", style: "default" },
  { id: "default-tail-2022342", txSeq: 54004, key: "0x36716c8c5d1ae680c78bd0ecc230896556399713:tail-probe:1777380022342", style: "default" },
  { id: "agentio-style-tail-557338", txSeq: 54046, key: "agentio-live/agents/snx-tail-probe-1777380557338/state/latest", style: "agentio" },
  // Fresh burst written at 13:37 UTC to test if NEW writes from us
  // (across 3 key shapes) get indexed while the dev says "it works for me".
  { id: "default-1777383451440", txSeq: 54240, key: "0x36716c8c5d1ae680c78bd0ecc230896556399713:tail-probe:1777383451440", style: "default" },
  { id: "agentio-shape-1777383451440", txSeq: 54241, key: "agentio-live/agents/snx-burst-1777383451440/state/latest", style: "agentio" },
  { id: "simple-1777383451440", txSeq: 54242, key: "snx-burst/1777383451440/state", style: "simple" },
];

async function rpc(method, params = []) {
  const res = await fetch(KV_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(8000),
  });
  return await res.json();
}

function logLine(obj) {
  const line = { t: new Date().toISOString(), ...obj };
  console.log(JSON.stringify(line));
  try {
    appendFileSync(LOG_PATH, JSON.stringify(line) + "\n");
  } catch (e) {
    console.error(`(log append failed: ${e.message})`);
  }
}

async function getTail() {
  try {
    const res = await rpc("kv_getLast", [STREAM_ID, 0, 256]);
    if (!res?.result) return null;
    return res.result;
  } catch (e) {
    return { error: e.message };
  }
}

async function checkProbe(p) {
  const keyB64 = Buffer.from(p.key, "utf-8").toString("base64");
  try {
    const res = await rpc("kv_getValue", [STREAM_ID, keyB64, 0, 4096]);
    const r = res?.result;
    if (!r) return { found: false, size: null, raw: "no result" };
    if (typeof r.size === "number" && r.size > 0 && r.data) {
      const decoded = Buffer.from(r.data, "base64").toString("utf-8");
      return { found: true, size: r.size, version: r.version, decoded };
    }
    return { found: false, size: r.size ?? 0 };
  } catch (e) {
    return { found: false, error: e.message };
  }
}

const startedAt = Date.now();
const verdicts = new Map(); // probe.id -> "found" | "skipped"
let lastTailVersion = null;

logLine({ event: "watcher.start", kv: KV_URL, stream: STREAM_ID, probeCount: PROBES.length, pollMs: POLL_MS, deadlineMs: DEADLINE_MS });

while (Date.now() - startedAt < DEADLINE_MS) {
  // Tail snapshot
  const tail = await getTail();
  const tailVersion = tail && typeof tail === "object" && typeof tail.version === "number" ? tail.version : null;
  const tailKey = tail && tail.key ? Buffer.from(tail.key, "base64").toString("utf-8") : null;

  if (tailVersion !== lastTailVersion) {
    logLine({ event: "tail.move", from: lastTailVersion, to: tailVersion, key: tailKey });
    lastTailVersion = tailVersion;
  }

  // Check every probe whose txSeq is at or below the current tail (the
  // KV has had a chance to index it). Probes above the tail are still
  // pending — we don't classify them yet.
  let pendingCount = 0;
  for (const probe of PROBES) {
    if (verdicts.has(probe.id)) continue;
    if (tailVersion === null || probe.txSeq > tailVersion) {
      pendingCount++;
      continue;
    }
    const result = await checkProbe(probe);
    if (result.found) {
      verdicts.set(probe.id, "found");
      logLine({ event: "probe.found", id: probe.id, style: probe.style, txSeq: probe.txSeq, version: result.version, decoded: result.decoded?.slice(0, 200) });
    } else {
      // Tail has moved past this txSeq, but the key isn't indexed. Give
      // it a small grace window in case the KV processes out of order.
      const distance = tailVersion - probe.txSeq;
      if (distance >= 5) {
        verdicts.set(probe.id, "skipped");
        logLine({ event: "probe.skipped", id: probe.id, style: probe.style, txSeq: probe.txSeq, tailNow: tailVersion, distance });
      } else {
        pendingCount++;
      }
    }
  }

  if (verdicts.size === PROBES.length) {
    logLine({
      event: "watcher.done",
      verdicts: Object.fromEntries(verdicts),
      summary: {
        defaultFound: [...verdicts.entries()].filter(([id]) => id.startsWith("default") && verdicts.get(id) === "found").length,
        defaultSkipped: [...verdicts.entries()].filter(([id]) => id.startsWith("default") && verdicts.get(id) === "skipped").length,
        agentioFound: [...verdicts.entries()].filter(([id]) => id.startsWith("agentio") && verdicts.get(id) === "found").length,
        agentioSkipped: [...verdicts.entries()].filter(([id]) => id.startsWith("agentio") && verdicts.get(id) === "skipped").length,
      },
    });
    process.exit(0);
  }

  // Heartbeat every poll: counts of verdicts so far + pending probes.
  logLine({
    event: "watcher.heartbeat",
    elapsedSec: Math.round((Date.now() - startedAt) / 1000),
    tailVersion,
    pendingProbes: pendingCount,
    verdicts: Object.fromEntries(verdicts),
  });

  await new Promise((r) => setTimeout(r, POLL_MS));
}

logLine({
  event: "watcher.deadline",
  reason: `Deadline ${Math.round(DEADLINE_MS / 1000)}s reached without all probes classified.`,
  verdicts: Object.fromEntries(verdicts),
});
process.exit(1);
