import { describe, expect, it } from "vitest";
import { defaultPreferences, isEventAllowed, normalizePreferences } from "../src/preferences.js";

describe("normalizePreferences", () => {
  it("returns defaults for empty input", () => {
    expect(normalizePreferences(null)).toEqual(defaultPreferences());
  });

  it("merges partial event preferences", () => {
    const normalized = normalizePreferences({ events: { depositConfirmed: false } });
    expect(normalized.events.depositConfirmed).toBe(false);
    expect(normalized.events.redeemConfirmed).toBe(true);
  });

  it("respects master toggle", () => {
    const prefs = normalizePreferences({ masterEnabled: false });
    expect(isEventAllowed(prefs, "depositConfirmed")).toBe(false);
  });
});
