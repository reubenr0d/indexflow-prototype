import { describe, expect, it } from "vitest";
import {
  isoWeekKey,
  navChangePct,
  normalizeAddress,
  rankWeeklyCandidates,
  sharePriceToNumber,
  weekBoundsFromKey,
} from "./curator-quests";
import { PRICE_PRECISION } from "./types";

describe("curator quest math", () => {
  it("computes share price as a float", () => {
    expect(sharePriceToNumber(String(PRICE_PRECISION))).toBeCloseTo(1);
  });

  it("computes NAV change percentage", () => {
    const start = String(PRICE_PRECISION);
    const end = String(PRICE_PRECISION * 2n);
    expect(navChangePct(start, end)).toBeCloseTo(100);
  });
});

describe("curator quest ranking", () => {
  it("ranks candidates and assigns payout tiers", () => {
    const entries = rankWeeklyCandidates([
      {
        address: "0x0000000000000000000000000000000000000001",
        navChangePct: 5,
        basket: {
          id: "1-a",
          chainId: 11155111,
          creator: "0x0000000000000000000000000000000000000001",
          vault: "0x1",
          name: "Alpha",
          createdAt: "100",
          assetCount: "3",
          minReserveBps: "1000",
          sharePrice: "1",
          assets: [],
        },
      },
      {
        address: "0x0000000000000000000000000000000000000002",
        navChangePct: 10,
        basket: {
          id: "1-b",
          chainId: 11155111,
          creator: "0x0000000000000000000000000000000000000002",
          vault: "0x2",
          name: "Beta",
          createdAt: "200",
          assetCount: "3",
          minReserveBps: "1000",
          sharePrice: "1",
          assets: [],
        },
      },
    ]);

    expect(entries).toHaveLength(2);
    expect(entries[0]?.rank).toBe(1);
    expect(entries[0]?.payoutUsd).toBe(20);
    expect(entries[0]?.address).toBe(normalizeAddress("0x0000000000000000000000000000000000000002"));
  });
});

describe("iso week helpers", () => {
  it("formats week keys", () => {
    expect(isoWeekKey(Date.parse("2026-06-08T12:00:00Z") / 1000)).toBe("2026-W24");
  });

  it("derives week bounds", () => {
    const bounds = weekBoundsFromKey("2026-W24");
    expect(bounds.end - bounds.start + 1).toBe(7 * 86_400);
  });
});
