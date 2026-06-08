export const PRICE_PRECISION = 1_000_000_000_000_000_000_000_000_000_000n;
export const SECONDS_PER_DAY = 86_400;
export const GENESIS_MIN_BASKET_AGE_DAYS = 7;
export const VETERAN_MIN_BASKET_AGE_DAYS = 30;
export const MIN_ASSET_COUNT = 3;
export const CONSISTENT_CURATOR_MIN_WEEKS = 3;
export const WEEKLY_PAYOUT_USD: Record<number, number> = {
  1: 20,
  2: 12,
  3: 8,
  4: 6,
  5: 4,
};

export const OPERATOR_ACTIVITY_TYPES = new Set([
  "allocateToPerp",
  "withdrawFromPerp",
  "assetsUpdated",
  "reservePolicyUpdated",
  "reserveTopUp",
  "positionOpened",
  "positionClosed",
]);

export const WALLET_ENGAGEMENT_ACTIVITY_TYPES = new Set([
  "deposit",
  "redeem",
  ...OPERATOR_ACTIVITY_TYPES,
]);

export interface EnvioBasketRow {
  id: string;
  chainId: number;
  creator: string;
  vault: string;
  name: string;
  createdAt: string;
  assetCount: string;
  minReserveBps: string;
  sharePrice: string;
  assets: Array<{ id: string; active: boolean }>;
}

export interface EnvioBasketActivityRow {
  activityType: string;
  timestamp: string;
  user: { id: string } | null;
}

export interface EnvioSnapshotRow {
  bucketStart: string;
  sharePrice: string;
}

export interface CuratorWeeklyEntry {
  rank: number;
  address: string;
  basketId: string;
  basketName: string;
  navChangePct: number;
  payoutUsd: number;
}

export interface CuratorWeeklySnapshot {
  weekKey: string;
  snapshotAt: string;
  weekStartUnix: number;
  weekEndUnix: number;
  entries: CuratorWeeklyEntry[];
}

export interface CuratorLeaderboardSnapshot {
  version: 1;
  generatedAt: string;
  hubChainId: number;
  weeks: CuratorWeeklySnapshot[];
  genesisAddresses: string[];
  streaks: Record<
    string,
    {
      currentConsecutiveTop5: number;
      totalTop5Weeks: number;
      weeklyWins: number;
    }
  >;
}
