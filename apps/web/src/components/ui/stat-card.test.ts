import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StatCard } from "./stat-card";

describe("StatCard tooltip wiring", () => {
  it("renders info trigger when tooltipKey is provided", () => {
    const html = renderToStaticMarkup(
      createElement(StatCard, {
        label: "TVL",
        value: "$1,000",
        tooltipKey: "tvl",
      })
    );

    expect(html).toContain("Show info for TVL");
    expect(html).toContain("aria-expanded=\"false\"");
  });

  it("does not render info trigger without tooltipKey", () => {
    const html = renderToStaticMarkup(
      createElement(StatCard, {
        label: "TVL",
        value: "$1,000",
      })
    );

    expect(html).not.toContain("Show info for TVL");
  });
});
