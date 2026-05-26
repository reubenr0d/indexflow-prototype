#!/usr/bin/env node
/**
 * Bucket historical quality-matrix opens by signal age at entry and summarize
 * forward PnL from run-log closed positions. Feeds timing-calibration.json
 * tuning (P2.3). Run:
 *   node scripts/broker-mirror-timing-calibration.mjs
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");
const RUN_LOG = resolve(
  PROJECT_ROOT,
  "agents/memory/quality-matrix-manager/run-log.sepolia.jsonl",
);
const CALIBRATION_PATH = resolve(
  PROJECT_ROOT,
  "apps/mcps/atlas-quality/timing/timing-calibration.json",
);

const BUCKETS = [
  { label: "0-30d", maxDays: 30 },
  { label: "31-90d", minDays: 31, maxDays: 90 },
  { label: "91-180d", minDays: 91, maxDays: 180 },
  { label: "180d+", minDays: 181 },
];

function loadJsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function bucketForDays(days) {
  if (days === null || !Number.isFinite(days)) return "unknown";
  for (const b of BUCKETS) {
    if (b.minDays !== undefined && days < b.minDays) continue;
    if (b.maxDays !== undefined && days > b.maxDays) continue;
    return b.label;
  }
  return "unknown";
}

function main() {
  const runs = loadJsonl(RUN_LOG);
  const stats = Object.fromEntries(BUCKETS.map((b) => [b.label, { count: 0, pnlSum: 0 }]));
  stats.unknown = { count: 0, pnlSum: 0 };

  for (const run of runs) {
    const closed = Array.isArray(run.closedPositions) ? run.closedPositions : [];
    for (const cp of closed) {
      if (cp.isLong !== true) continue;
      const days =
        cp.daysSinceLastMaterialEvent ??
        cp.timing?.freshness?.daysSinceLastMaterialEvent ??
        cp.daysSinceLastDrillRelease ??
        null;
      const bucket = bucketForDays(days);
      const pnl = Number(cp.realizedPnlPctOfCollateral ?? cp.realizedPnlPct ?? 0);
      if (!stats[bucket]) stats[bucket] = { count: 0, pnlSum: 0 };
      stats[bucket].count += 1;
      if (Number.isFinite(pnl)) stats[bucket].pnlSum += pnl;
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    runLog: RUN_LOG,
    buckets: Object.fromEntries(
      Object.entries(stats).map(([k, v]) => [
        k,
        {
          count: v.count,
          avgPnlPct: v.count > 0 ? v.pnlSum / v.count : null,
        },
      ]),
    ),
    note:
      "Tune entryRecencyHalfLifeDays / maxStaleMaterialEventDays in timing-calibration.json when fresher buckets outperform stale buckets.",
  };

  console.log(JSON.stringify(report, null, 2));

  if (existsSync(CALIBRATION_PATH)) {
    const cal = JSON.parse(readFileSync(CALIBRATION_PATH, "utf8"));
    cal.lastCalibrationReport = report;
    cal.calibratedAt = report.generatedAt;
    writeFileSync(CALIBRATION_PATH, JSON.stringify(cal, null, 2) + "\n");
    console.error(`Updated ${CALIBRATION_PATH} with lastCalibrationReport.`);
  }
}

main();
