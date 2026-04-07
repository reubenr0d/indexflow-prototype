import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SegmentedControl } from "./segmented-control";
import { ArrowDownToLine } from "lucide-react";

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

  it("supports icon-only tabs with accessible labels", () => {
    const html = renderToStaticMarkup(
      createElement(SegmentedControl, {
        options: [
          { value: "deposit", label: "Deposit", icon: createElement(ArrowDownToLine, { className: "h-4 w-4" }), iconOnly: true },
          { value: "redeem", label: "Redeem", iconOnly: true },
        ],
        value: "deposit",
        onChange: () => undefined,
        ariaLabel: "Deposit and redeem tabs",
      })
    );

    expect(html).toContain("aria-label=\"Deposit\"");
    expect(html).toContain("aria-label=\"Redeem\"");
    expect(html).toContain("sr-only");
  });
});
