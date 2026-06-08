import fs from "node:fs/promises";
import path from "node:path";
import type { CuratorLeaderboardSnapshot } from "./types";

let cachedSnapshot: CuratorLeaderboardSnapshot | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60_000;

function parseSnapshotJson(raw: string): CuratorLeaderboardSnapshot {
  const parsed = JSON.parse(raw) as CuratorLeaderboardSnapshot;
  if (parsed.version !== 1) {
    throw new Error(`Unsupported curator snapshot version: ${String((parsed as { version?: unknown }).version)}`);
  }
  return parsed;
}

function defaultSnapshotUrl(): string | null {
  const site =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
  if (!site) return null;
  return `${site.replace(/\/$/, "")}/curator-leaderboard.snapshot.json`;
}

async function fetchSnapshotFromUrl(url: string): Promise<CuratorLeaderboardSnapshot> {
  const response = await fetch(url, {
    next: { revalidate: 60 },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch curator snapshot (${response.status})`);
  }
  const text = await response.text();
  return parseSnapshotJson(text);
}

async function loadSnapshotFromPublicFile(): Promise<CuratorLeaderboardSnapshot | null> {
  try {
    const filePath = path.join(process.cwd(), "public", "curator-leaderboard.snapshot.json");
    const text = await fs.readFile(filePath, "utf8");
    return parseSnapshotJson(text);
  } catch {
    return null;
  }
}

export async function loadCuratorLeaderboardSnapshot(): Promise<CuratorLeaderboardSnapshot | null> {
  if (cachedSnapshot && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedSnapshot;
  }

  const inline = process.env.CURATOR_LEADERBOARD_SNAPSHOT_JSON?.trim();
  if (inline) {
    cachedSnapshot = parseSnapshotJson(inline);
    cachedAt = Date.now();
    return cachedSnapshot;
  }

  const snapshotUrl =
    process.env.CURATOR_LEADERBOARD_SNAPSHOT_URL?.trim() || defaultSnapshotUrl();
  if (snapshotUrl) {
    try {
      cachedSnapshot = await fetchSnapshotFromUrl(snapshotUrl);
      cachedAt = Date.now();
      return cachedSnapshot;
    } catch {
      // Fall through to bundled public snapshot (local dev / deploy fallback).
    }
  }

  cachedSnapshot = await loadSnapshotFromPublicFile();
  cachedAt = Date.now();
  return cachedSnapshot;
}

export function resetCuratorSnapshotCacheForTests(): void {
  cachedSnapshot = null;
  cachedAt = 0;
}
