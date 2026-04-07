import { describe, expect, it } from "vitest";
import { toAssetPricePath } from "./prices-routes";

describe("toAssetPricePath", () => {
  it("builds deep-link path for prices asset detail pages", () => {
    const assetId = "0x1111111111111111111111111111111111111111111111111111111111111111" as const;
    expect(toAssetPricePath(assetId)).toBe(`/prices/${encodeURIComponent(assetId)}`);
  });
});
