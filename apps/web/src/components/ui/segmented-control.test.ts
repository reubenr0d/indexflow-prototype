import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SegmentedControl } from "./segmented-control";

describe("SegmentedControl", () => {
  it("applies equal-width button classes when enabled", () => {
    const html = renderToStaticMarkup(
      createElement(SegmentedControl, {
        options: [
          { value: "deposit", label: "Deposit" },
          { value: "redeem", label: "Redeem" },
        ],
        value: "deposit",
        onChange: () => undefined,
        equalWidth: true,
        ariaLabel: "Deposit and redeem tabs",
      })
    );

    expect(html).toContain("role=\"tablist\"");
    expect(html).toContain("role=\"tab\"");
    expect(html).toContain("flex-1");
  });
});
