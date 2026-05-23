// Unit tests for agents/memory/shared/ helpers used by yfinance + vault MCPs
// and by the agent runner. Uses node:test + a per-test temp PROJECT_ROOT
// so file writes never leak into the real repo memory dir.

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";

import {
  getCachedNews,
  writeNewsCache,
  readNewsCacheUnion,
  readRecentlyClosed,
  recordRecentlyClosed,
  checkChurnGuard,
  sharedMemoryDir,
  CHURN_GUARD_WINDOW_MS,
} from "./agent-shared-memory.mjs";

function makeRoot() {
  const root = mkdtempSync(resolve(tmpdir(), "agent-shared-memory-"));
  return {
    root,
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

test("writeNewsCache + getCachedNews roundtrip within TTL", () => {
  const { root, cleanup } = makeRoot();
  try {
    const now = Date.now();
    writeNewsCache({
      agentName: "mining-manager",
      entries: {
        "AHR.V": [{ title: "Permit granted" }],
      },
      projectRoot: root,
      now,
    });

    const hit = getCachedNews({
      symbol: "AHR.V",
      projectRoot: root,
    });
    assert.ok(hit, "expected cache hit");
    assert.equal(hit.headlines[0].title, "Permit granted");
    assert.equal(hit.sourceAgent, "mining-manager");
  } finally {
    cleanup();
  }
});

test("getCachedNews returns null when entry is past TTL", () => {
  const { root, cleanup } = makeRoot();
  try {
    const stale = Date.now() - 2 * 60 * 60 * 1000; // 2h ago
    writeNewsCache({
      agentName: "mining-manager",
      entries: { "AHR.V": [{ title: "old" }] },
      projectRoot: root,
      now: stale,
      ttlMs: 30 * 60 * 1000,
    });
    const miss = getCachedNews({
      symbol: "AHR.V",
      projectRoot: root,
      ttlMs: 30 * 60 * 1000,
    });
    assert.equal(miss, null, "expected cache miss past TTL");
  } finally {
    cleanup();
  }
});

test("readNewsCacheUnion picks the freshest entry across per-agent files", () => {
  const { root, cleanup } = makeRoot();
  try {
    const older = Date.now() - 5 * 60 * 1000;
    const newer = Date.now() - 1 * 60 * 1000;
    writeNewsCache({
      agentName: "mining-manager",
      entries: { "AHR.V": [{ title: "older" }] },
      projectRoot: root,
      now: older,
    });
    writeNewsCache({
      agentName: "quality-matrix-manager",
      entries: { "AHR.V": [{ title: "newer" }] },
      projectRoot: root,
      now: newer,
    });
    const merged = readNewsCacheUnion({ projectRoot: root });
    const entry = merged.get("AHR.V");
    assert.ok(entry);
    assert.equal(entry.headlines[0].title, "newer");
    assert.equal(entry.sourceAgent, "quality-matrix-manager");
  } finally {
    cleanup();
  }
});

test("writeNewsCache drops stale entries from its own file on next write", () => {
  const { root, cleanup } = makeRoot();
  try {
    const ttl = 30 * 60 * 1000;
    const old = Date.now() - 5 * 60 * 60 * 1000; // way past 30min TTL
    writeNewsCache({
      agentName: "mining-manager",
      entries: { "STALE.V": [{ title: "stale" }] },
      projectRoot: root,
      now: old,
      ttlMs: ttl,
    });

    const now = Date.now();
    writeNewsCache({
      agentName: "mining-manager",
      entries: { "FRESH.V": [{ title: "fresh" }] },
      projectRoot: root,
      now,
      ttlMs: ttl,
    });

    const file = resolve(sharedMemoryDir(root), "news-cache.mining-manager.json");
    const data = JSON.parse(readFileSync(file, "utf8"));
    assert.ok(!data.entries["STALE.V"], "stale entry should be evicted on next write");
    assert.ok(data.entries["FRESH.V"], "fresh entry should persist");
  } finally {
    cleanup();
  }
});

test("recordRecentlyClosed + checkChurnGuard flag in-window closures", () => {
  const { root, cleanup } = makeRoot();
  try {
    const vault = "0x0000000000000000000000000000000000000001";
    const assetId = "0x" + "ab".repeat(32);
    recordRecentlyClosed({
      vault,
      assetId,
      ticker: "GSR.V",
      isLong: true,
      closedReason: "rank_swap: rotated to higher-ranked pick",
      projectRoot: root,
    });

    const guard = checkChurnGuard({
      vault,
      assetId,
      projectRoot: root,
    });
    assert.equal(guard.inCooldown, true);
    assert.equal(guard.ticker, "GSR.V");
    assert.match(guard.closedReason, /rank_swap/);
    assert.ok(guard.cooldownEndsAtMs > Date.now());
  } finally {
    cleanup();
  }
});

test("checkChurnGuard returns inCooldown:false past CHURN_GUARD_WINDOW_MS", () => {
  const { root, cleanup } = makeRoot();
  try {
    const vault = "0x0000000000000000000000000000000000000002";
    const assetId = "0x" + "cd".repeat(32);
    const ancient = Date.now() - (CHURN_GUARD_WINDOW_MS + 60_000);
    recordRecentlyClosed({
      vault,
      assetId,
      ticker: "PWM.V",
      isLong: true,
      closedReason: "rank_swap: old",
      projectRoot: root,
      now: ancient,
    });
    const guard = checkChurnGuard({
      vault,
      assetId,
      projectRoot: root,
    });
    assert.equal(guard.inCooldown, false, "expired closure should not trigger churn guard");
  } finally {
    cleanup();
  }
});

test("readRecentlyClosed is per-vault (no cross-vault collisions)", () => {
  const { root, cleanup } = makeRoot();
  try {
    const vaultA = "0x000000000000000000000000000000000000000a";
    const vaultB = "0x000000000000000000000000000000000000000b";
    const assetId = "0x" + "ef".repeat(32);
    recordRecentlyClosed({
      vault: vaultA,
      assetId,
      ticker: "AHR.V",
      closedReason: "vault A close",
      projectRoot: root,
    });
    const a = readRecentlyClosed({ vault: vaultA, projectRoot: root });
    const b = readRecentlyClosed({ vault: vaultB, projectRoot: root });
    assert.equal(a.size, 1);
    assert.equal(b.size, 0);

    // A new file was created on disk for vaultA only.
    const fileA = resolve(sharedMemoryDir(root), `recently-closed.${vaultA.toLowerCase()}.json`);
    assert.ok(existsSync(fileA));
  } finally {
    cleanup();
  }
});

test("recordRecentlyClosed overlays new closure on top of older entries", () => {
  const { root, cleanup } = makeRoot();
  try {
    const vault = "0x0000000000000000000000000000000000000003";
    const a1 = "0x" + "11".repeat(32);
    const a2 = "0x" + "22".repeat(32);
    recordRecentlyClosed({
      vault, assetId: a1, ticker: "A1", closedReason: "first", projectRoot: root,
    });
    recordRecentlyClosed({
      vault, assetId: a2, ticker: "A2", closedReason: "second", projectRoot: root,
    });
    const map = readRecentlyClosed({ vault, projectRoot: root });
    assert.equal(map.size, 2);
    assert.equal(map.get(a1).ticker, "A1");
    assert.equal(map.get(a2).ticker, "A2");
  } finally {
    cleanup();
  }
});
