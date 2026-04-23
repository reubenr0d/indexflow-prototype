import { describe, expect, it } from "vitest";
import {
  SPONSORSHIP_TROUBLESHOOTING_STEPS,
  isSponsorshipError,
} from "./sponsorship-error-dialog";

describe("SponsorshipErrorDialog", () => {
  it("includes Sepolia ETH fallback guidance in troubleshooting steps", () => {
    const fallbackStep = SPONSORSHIP_TROUBLESHOOTING_STEPS.find((step) =>
      step.title.includes("Fallback")
    );

    expect(fallbackStep).toBeDefined();
    expect(fallbackStep?.description.toLowerCase()).toContain("sepolia eth");
  });

  it("detects gas sponsorship-related errors", () => {
    expect(isSponsorshipError(new Error("insufficient funds for gas"))).toBe(true);
    expect(isSponsorshipError(new Error("sponsor quota exceeded"))).toBe(true);
    expect(isSponsorshipError(new Error("execution reverted: paused"))).toBe(false);
  });
});
