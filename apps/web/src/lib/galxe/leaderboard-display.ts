import { CONSISTENT_CURATOR_MIN_WEEKS } from "./types";
import type { CuratorLeaderboardSnapshot, CuratorWeeklySnapshot } from "./types";
import { normalizeAddress } from "./curator-quests";

export type CuratorBadgeKind = "genesis" | "champion" | "consistent";

export const CURATOR_BADGE_META: Record<
  CuratorBadgeKind,
  { label: string; shortLabel: string; className: string }
> = {
  genesis: {
    label: "Genesis Curator — completed the Season 1 entry quest and joined the Curators Guild",
    shortLabel: "Genesis",
    className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  champion: {
    label: "Weekly Champion — finished #1 in at least one weekly ranking",
    shortLabel: "Champion",
    className: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  consistent: {
    label: "Consistent Curator — placed in the weekly top 5 at least three times",
    shortLabel: "Consistent",
    className: "border-slate-400/40 bg-slate-400/10 text-slate-700 dark:text-slate-300",
  },
};

export function vaultFromBasketId(basketId: string): string | null {
  const dash = basketId.indexOf("-");
  if (dash === -1) return null;
  const vault = basketId.slice(dash + 1);
  return vault.length > 0 ? vault : null;
}

export function formatNavChangePct(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function formatWeekLabel(week: CuratorWeeklySnapshot): string {
  const start = new Date(week.weekStartUnix * 1000).toISOString().slice(0, 10);
  const end = new Date(week.weekEndUnix * 1000).toISOString().slice(0, 10);
  return `${week.weekKey} (${start} → ${end})`;
}

export function sortWeeksNewestFirst(weeks: CuratorWeeklySnapshot[]): CuratorWeeklySnapshot[] {
  return [...weeks].sort((a, b) => b.weekStartUnix - a.weekStartUnix);
}

export function getLatestWeek(snapshot: CuratorLeaderboardSnapshot): CuratorWeeklySnapshot | null {
  const sorted = sortWeeksNewestFirst(snapshot.weeks);
  return sorted[0] ?? null;
}

export function deriveCuratorBadges(
  address: string,
  snapshot: CuratorLeaderboardSnapshot,
): CuratorBadgeKind[] {
  const normalized = normalizeAddress(address);
  const badges: CuratorBadgeKind[] = [];

  if (snapshot.genesisAddresses.some((entry) => normalizeAddress(entry) === normalized)) {
    badges.push("genesis");
  }

  const streak = snapshot.streaks[normalized];
  if (streak) {
    if (streak.weeklyWins >= 1) badges.push("champion");
    if (streak.totalTop5Weeks >= CONSISTENT_CURATOR_MIN_WEEKS) badges.push("consistent");
  }

  return badges;
}

export function collectCuratorAddresses(snapshot: CuratorLeaderboardSnapshot): string[] {
  const addresses = new Set<string>();

  for (const address of snapshot.genesisAddresses) {
    addresses.add(normalizeAddress(address));
  }
  for (const address of Object.keys(snapshot.streaks)) {
    addresses.add(normalizeAddress(address));
  }
  for (const week of snapshot.weeks) {
    for (const entry of week.entries) {
      addresses.add(normalizeAddress(entry.address));
    }
  }

  return [...addresses].sort();
}

export function getStreakMetrics(snapshot: CuratorLeaderboardSnapshot, address: string) {
  return snapshot.streaks[normalizeAddress(address)] ?? null;
}
