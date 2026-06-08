import { describe, expect, it } from "vitest";
import {
  deriveCuratorBadges,
  formatNavChangePct,
  getLatestWeek,
  vaultFromBasketId,
} from "./leaderboard-display";
import type { CuratorLeaderboardSnapshot } from "./types";

const baseSnapshot: CuratorLeaderboardSnapshot = {
  version: 1,
  generatedAt: "2026-06-08T00:00:00.000Z",
  hubChainId: 11155111,
  weeks: [
    {
      weekKey: "2026-W23",
      snapshotAt: "2026-06-08T23:59:00.000Z",
      weekStartUnix: 1_749_369_600,
      weekEndUnix: 1_749_456_000,
      entries: [
        {
          rank: 1,
          address: "0xabcdef0123456789abcdef0123456789abcdef01",
          basketId: "11155111-0xvault1",
          basketName: "Alpha Basket",
          navChangePct: 12.5,
          payoutUsd: 20,
        },
      ],
    },
  ],
  genesisAddresses: ["0xAbCdEf0123456789ABcDeF0123456789ABcDeF01"],
  streaks: {
    "0xabcdef0123456789abcdef0123456789abcdef01": {
      currentConsecutiveTop5: 1,
      totalTop5Weeks: 3,
      weeklyWins: 1,
    },
  },
};

describe("leaderboard display helpers", () => {
  it("extracts vault address from envio basket id", () => {
    expect(vaultFromBasketId("11155111-0xvault1")).toBe("0xvault1");
    expect(vaultFromBasketId("invalid")).toBeNull();
  });

  it("formats NAV change with sign", () => {
    expect(formatNavChangePct(5.2)).toBe("+5.20%");
    expect(formatNavChangePct(-1.5)).toBe("-1.50%");
  });

  it("returns the newest week", () => {
    expect(getLatestWeek(baseSnapshot)?.weekKey).toBe("2026-W23");
  });

  it("derives genesis, champion, and consistent badges", () => {
    const address = "0x1111111111111111111111111111111111111111";
    const snapshot: CuratorLeaderboardSnapshot = {
      ...baseSnapshot,
      streaks: {
        [address]: {
          currentConsecutiveTop5: 1,
          totalTop5Weeks: 3,
          weeklyWins: 1,
        },
      },
    };
    expect(deriveCuratorBadges(address, snapshot)).toEqual(["champion", "consistent"]);

    expect(
      deriveCuratorBadges("0xAbCdEf0123456789ABcDeF0123456789ABcDeF01", baseSnapshot),
    ).toEqual(["genesis", "champion", "consistent"]);
  });
});
