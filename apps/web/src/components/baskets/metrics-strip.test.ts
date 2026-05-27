import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MetricsStrip } from "./metrics-strip";

describe("MetricsStrip", () => {
  it("renders metric subtext when provided", () => {
    const html = renderToStaticMarkup(
      createElement(MetricsStrip, {
        metrics: [{ label: "Net PnL", value: "+$10.00", subtext: "Since Jan 12, 2026", testId: "metric-net-pnl" }],
      })
    );

    expect(html).toContain("Net PnL");
    expect(html).toContain("+$10.00");
    expect(html).toContain("Since Jan 12, 2026");
  });

  it("does not render metric subtext when omitted", () => {
    const html = renderToStaticMarkup(
      createElement(MetricsStrip, {
        metrics: [{ label: "Net PnL", value: "+$10.00", testId: "metric-net-pnl" }],
      })
    );

    expect(html).toContain("Net PnL");
    expect(html).toContain("+$10.00");
    expect(html).not.toContain("Since ");
  });
});
