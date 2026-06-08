import {
  fetchAllCuratorBaskets,
  fetchBasketActivitiesSince,
  fetchBasketWeekSnapshots,
  fetchWalletActivities,
  type EnvioClientLike,
} from "./envio-curator-queries";
import {
  GENESIS_MIN_BASKET_AGE_DAYS,
  MIN_ASSET_COUNT,
  OPERATOR_ACTIVITY_TYPES,
  PRICE_PRECISION,
  SECONDS_PER_DAY,
  VETERAN_MIN_BASKET_AGE_DAYS,
  WALLET_ENGAGEMENT_ACTIVITY_TYPES,
  WEEKLY_PAYOUT_USD,
  type CuratorLeaderboardSnapshot,
  type CuratorWeeklyEntry,
  type CuratorWeeklySnapshot,
  type EnvioBasketRow,
} from "./types";

export const DEFAULT_HUB_CHAIN_ID = 11_155_111;

export function normalizeAddress(value: string): string {
  return value.trim().toLowerCase();
}

export function userIdFor(chainId: number, address: string): string {
  return `${chainId}-${normalizeAddress(address)}`;
}

export function isoWeekKey(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000);
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((target.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function weekBoundsFromKey(weekKey: string): { start: number; end: number } {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekKey);
  if (!match) throw new Error(`Invalid week key: ${weekKey}`);
  const year = Number(match[1]);
  const week = Number(match[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const day = jan4.getUTCDay() || 7;
  const weekStart = new Date(jan4);
  weekStart.setUTCDate(jan4.getUTCDate() - day + 1 + (week - 1) * 7);
  const start = Math.floor(weekStart.getTime() / 1000);
  return { start, end: start + 7 * SECONDS_PER_DAY - 1 };
}

export function activeAssetCount(basket: EnvioBasketRow): number {
  if (basket.assets?.length) {
    return basket.assets.filter((asset) => asset.active).length;
  }
  return Number(basket.assetCount ?? 0);
}

export function basketAgeDays(basket: EnvioBasketRow, nowUnix = Math.floor(Date.now() / 1000)): number {
  const createdAt = Number(basket.createdAt);
  return (nowUnix - createdAt) / SECONDS_PER_DAY;
}

export function sharePriceToNumber(raw: string): number {
  const value = BigInt(raw);
  if (value <= 0n) return 0;
  return Number(value) / Number(PRICE_PRECISION);
}

export function navChangePct(startSharePrice: string, endSharePrice: string): number {
  const start = sharePriceToNumber(startSharePrice);
  const end = sharePriceToNumber(endSharePrice);
  if (start <= 0 || end <= 0) return 0;
  return ((end - start) / start) * 100;
}

export function hasOperatorActivityThisWeek(
  activities: Array<{ activityType: string; timestamp: string }>,
  weekStart: number,
): boolean {
  return activities.some((activity) => {
    if (!OPERATOR_ACTIVITY_TYPES.has(activity.activityType)) return false;
    return Number(activity.timestamp) >= weekStart;
  });
}

export async function walletHasEngagement(
  client: EnvioClientLike,
  chainId: number,
  address: string,
): Promise<boolean> {
  const activities = await fetchWalletActivities(client, chainId, address, 10);
  return activities.some((activity) => WALLET_ENGAGEMENT_ACTIVITY_TYPES.has(activity.activityType));
}

export async function qualifiesForGenesis(
  client: EnvioClientLike,
  basket: EnvioBasketRow,
  nowUnix = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (activeAssetCount(basket) < MIN_ASSET_COUNT) return false;
  if (Number(basket.minReserveBps ?? 0) <= 0) return false;
  if (basketAgeDays(basket, nowUnix) < GENESIS_MIN_BASKET_AGE_DAYS) return false;
  const creator = normalizeAddress(basket.creator);
  return walletHasEngagement(client, basket.chainId, creator);
}

export async function computeBasketNavChangePct(
  client: EnvioClientLike,
  basket: EnvioBasketRow,
  weekStart: number,
): Promise<number> {
  const snapshots = await fetchBasketWeekSnapshots(client, basket.id);
  if (snapshots.length >= 2) {
    return navChangePct(snapshots[1].sharePrice, snapshots[0].sharePrice);
  }
  if (snapshots.length === 1 && Number(basket.createdAt) <= weekStart) {
    return navChangePct(snapshots[0].sharePrice, basket.sharePrice);
  }
  return 0;
}

export interface CuratorCandidate {
  address: string;
  basket: EnvioBasketRow;
  navChangePct: number;
}

export async function collectQualifiedCuratorCandidates(
  client: EnvioClientLike,
  weekKey: string,
  nowUnix = Math.floor(Date.now() / 1000),
): Promise<CuratorCandidate[]> {
  const { start: weekStart } = weekBoundsFromKey(weekKey);
  const baskets = await fetchAllCuratorBaskets(client);
  const bestByCurator = new Map<string, CuratorCandidate>();

  for (const basket of baskets) {
    if (activeAssetCount(basket) < MIN_ASSET_COUNT) continue;
    if (basketAgeDays(basket, nowUnix) < GENESIS_MIN_BASKET_AGE_DAYS) continue;
    if (!(await qualifiesForGenesis(client, basket, nowUnix))) continue;

    const activities = await fetchBasketActivitiesSince(client, basket.id, weekStart);
    if (!hasOperatorActivityThisWeek(activities, weekStart)) continue;

    const changePct = await computeBasketNavChangePct(client, basket, weekStart);
    const address = normalizeAddress(basket.creator);
    const existing = bestByCurator.get(address);
    if (!existing || changePct > existing.navChangePct) {
      bestByCurator.set(address, { address, basket, navChangePct: changePct });
    } else if (existing && changePct === existing.navChangePct) {
      const existingAge = Number(existing.basket.createdAt);
      const challengerAge = Number(basket.createdAt);
      if (challengerAge < existingAge) {
        bestByCurator.set(address, { address, basket, navChangePct: changePct });
      }
    }
  }

  return [...bestByCurator.values()];
}

export function rankWeeklyCandidates(candidates: CuratorCandidate[]): CuratorWeeklyEntry[] {
  const sorted = [...candidates].sort((a, b) => {
    if (b.navChangePct !== a.navChangePct) return b.navChangePct - a.navChangePct;
    return Number(a.basket.createdAt) - Number(b.basket.createdAt);
  });

  return sorted.slice(0, 5).map((candidate, index) => ({
    rank: index + 1,
    address: candidate.address,
    basketId: candidate.basket.id,
    basketName: candidate.basket.name,
    navChangePct: candidate.navChangePct,
    payoutUsd: WEEKLY_PAYOUT_USD[index + 1] ?? 0,
  }));
}

function updateStreakMetrics(
  streaks: CuratorLeaderboardSnapshot["streaks"],
  week: CuratorWeeklySnapshot,
): void {
  const ranked = new Set(week.entries.map((entry) => normalizeAddress(entry.address)));

  for (const address of ranked) {
    const current = streaks[address] ?? {
      currentConsecutiveTop5: 0,
      totalTop5Weeks: 0,
      weeklyWins: 0,
    };
    current.currentConsecutiveTop5 += 1;
    current.totalTop5Weeks += 1;
    if (week.entries.some((entry) => entry.rank === 1 && normalizeAddress(entry.address) === address)) {
      current.weeklyWins += 1;
    }
    streaks[address] = current;
  }

  for (const [address, metrics] of Object.entries(streaks)) {
    if (!ranked.has(address)) {
      metrics.currentConsecutiveTop5 = 0;
    }
  }
}

export async function buildWeeklySnapshot(
  client: EnvioClientLike,
  weekKey: string,
  options: {
    hubChainId?: number;
    nowUnix?: number;
  } = {},
): Promise<CuratorWeeklySnapshot> {
  const nowUnix = options.nowUnix ?? Math.floor(Date.now() / 1000);
  const { start, end } = weekBoundsFromKey(weekKey);

  const candidates = await collectQualifiedCuratorCandidates(client, weekKey, nowUnix);
  const entries = rankWeeklyCandidates(candidates);

  return {
    weekKey,
    snapshotAt: new Date(nowUnix * 1000).toISOString(),
    weekStartUnix: start,
    weekEndUnix: end,
    entries,
  };
}

export async function buildLeaderboardSnapshot(
  client: EnvioClientLike,
  weekKeys: string[],
  options: {
    hubChainId?: number;
    nowUnix?: number;
  } = {},
): Promise<CuratorLeaderboardSnapshot> {
  const hubChainId = options.hubChainId ?? DEFAULT_HUB_CHAIN_ID;
  const nowUnix = options.nowUnix ?? Math.floor(Date.now() / 1000);

  const weeks: CuratorWeeklySnapshot[] = [];
  for (const weekKey of weekKeys) {
    weeks.push(await buildWeeklySnapshot(client, weekKey, { hubChainId, nowUnix }));
  }

  const streaks: CuratorLeaderboardSnapshot["streaks"] = {};
  for (const week of weeks.sort((a, b) => a.weekStartUnix - b.weekStartUnix)) {
    updateStreakMetrics(streaks, week);
  }

  const baskets = await fetchAllCuratorBaskets(client);
  const genesisAddresses = new Set<string>();
  for (const basket of baskets) {
    if (await qualifiesForGenesis(client, basket, nowUnix)) {
      genesisAddresses.add(normalizeAddress(basket.creator));
    }
  }

  return {
    version: 1,
    generatedAt: new Date(nowUnix * 1000).toISOString(),
    hubChainId,
    weeks,
    genesisAddresses: [...genesisAddresses].sort(),
    streaks,
  };
}

export async function addressQualifiesForVeteran(
  client: EnvioClientLike,
  address: string,
  nowUnix = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  const normalized = normalizeAddress(address);
  const baskets = await fetchAllCuratorBaskets(client);
  return baskets.some((basket) => {
    if (normalizeAddress(basket.creator) !== normalized) return false;
    if (activeAssetCount(basket) < MIN_ASSET_COUNT) return false;
    return basketAgeDays(basket, nowUnix) >= VETERAN_MIN_BASKET_AGE_DAYS;
  });
}

export async function addressQualifiesForGenesisLive(
  client: EnvioClientLike,
  address: string,
  nowUnix = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  const normalized = normalizeAddress(address);
  const baskets = await fetchAllCuratorBaskets(client);
  for (const basket of baskets) {
    if (normalizeAddress(basket.creator) !== normalized) continue;
    if (await qualifiesForGenesis(client, basket, nowUnix)) return true;
  }
  return false;
}
