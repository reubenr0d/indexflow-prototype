import { describe, expect, it } from "vitest";
import { buildDigestSummary, deriveRealtimeSignals } from "../src/dispatch.js";

describe("deriveRealtimeSignals", () => {
  it("maps deposit and redeem events", () => {
    const signals = deriveRealtimeSignals({
      basketActivities: [
        {
          id: "a",
          activityType: "deposit",
          timestamp: "100",
          txHash: "0x1",
          amountUsdc: "2000000",
          user: { id: "0xabc" },
          basket: { id: "0xvault", name: "Core" },
        },
        {
          id: "b",
          activityType: "redeem",
          timestamp: "101",
          txHash: "0x2",
          amountUsdc: "1200000",
          user: { id: "0xabc" },
          basket: { id: "0xvault", name: "Core" },
        },
      ],
      vaultStateCurrents: [],
      oraclePriceUpdates: [],
    });

    expect(signals.some((s) => s.eventType === "deposit")).toBe(true);
    expect(signals.some((s) => s.eventType === "redeem")).toBe(true);
  });
});

describe("buildDigestSummary", () => {
  it("groups activity by wallet", () => {
    const summaries = buildDigestSummary([
      { activityType: "deposit", user: { id: "0xabc" } },
      { activityType: "redeem", user: { id: "0xabc" } },
    ]);

    expect(summaries).toHaveLength(1);
    expect(summaries[0].wallet).toBe("0xabc");
    expect(summaries[0].body).toContain("deposits");
  });
});
