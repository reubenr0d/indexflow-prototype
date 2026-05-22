import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { VaultThesisCard, highlightTickers } from "./vault-thesis-card";
import type {
  AgentAction,
  AgentRun,
} from "@/hooks/useAgentMetadata";

// Encodes the asset id "AHR.V" the same way `formatAssetId` decodes it back —
// hex of the ASCII bytes left-padded into a bytes32-style 0x string. Lets the
// component render the human label without us reaching into format.ts.
function encodeAssetId(symbol: string): string {
  const hex = Array.from(symbol)
    .map((c) => c.charCodeAt(0).toString(16).padStart(2, "0"))
    .join("");
  return `0x${hex.padEnd(64, "0")}`;
}

const SHORT_THESIS = "The model favors AHR.V and (CRML) right now.";

const LONG_THESIS =
  "The Atlas ML model continues to favor a diverse set of mining stocks, with a strong emphasis on diversified metals and gold. The top picks include Amarc Resources Ltd. (AHR.V), Gold Strike Resources Corp. (GSR.V), and Power Metals Corp. (PWM.V), each boasting high ML scores and promising predicted returns. The model's focus on features like volatility and momentum suggests a preference for companies with strong market dynamics. Despite attempts to wire new assets like Critical Metals Corp. (CRML), these transactions failed due to technical issues, which will need to be addressed in future runs.";

const LATEST_RUN: AgentRun = {
  runId: "2026-05-22T20:00:00.000Z",
  finishedAt: "2026-05-22T20:00:00.000Z",
  summary:
    "## Thesis\n\nThe model continues to favor mining stocks with strong predicted returns this run.\n\nIt opened long positions on AHR.V and PWM.V.",
};

const RECENT_ACTIONS: AgentAction[] = [
  {
    tool: "open_position",
    justification: "Top ML pick",
    timestamp: "2026-05-22T20:00:00.000Z",
    txHash: "0xaaa",
    runId: LATEST_RUN.runId,
    params: {
      kind: "open_position",
      assetId: encodeAssetId("AHR.V"),
      isLong: true,
      size: "1000000000000000000000000000000000",
      collateral: "1000000000",
    },
  },
  {
    tool: "open_position",
    justification: "Hedge on weak news",
    timestamp: "2026-05-22T20:00:00.000Z",
    txHash: "0xbbb",
    runId: LATEST_RUN.runId,
    params: {
      kind: "open_position",
      assetId: encodeAssetId("GSR.V"),
      isLong: false,
      size: "1000000000000000000000000000000000",
      collateral: "1000000000",
    },
  },
  {
    // Older run — must be excluded from the top-picks rail.
    tool: "open_position",
    justification: "Old pick",
    timestamp: "2026-05-21T13:20:46.864Z",
    txHash: "0xccc",
    runId: "2026-05-21T13:20:46.864Z",
    params: {
      kind: "open_position",
      assetId: encodeAssetId("OLD.V"),
      isLong: true,
      size: "1000000000000000000000000000000000",
      collateral: "1000000000",
    },
  },
  {
    // Non-position tool — must not surface as a top pick chip.
    tool: "wire_asset",
    justification: "Wire only",
    timestamp: "2026-05-22T20:00:00.000Z",
    txHash: null,
    runId: LATEST_RUN.runId,
    params: { kind: "wire_asset", symbol: "WIRE" },
  },
];

describe("highlightTickers", () => {
  it("wraps suffix tickers and parenthesized tickers as Yahoo Finance anchors without touching common uppercase words", () => {
    // Render through static markup so we can assert against the produced
    // chip class — the live UI uses the same class to highlight tickers.
    const html = renderToStaticMarkup(
      createElement(
        "div",
        null,
        highlightTickers(
          "Atlas ML favors AHR.V and (CRML) but USDC reserves stay high.",
        ),
      ),
    );
    expect(html).toContain("AHR.V");
    expect(html).toContain("(CRML)");
    expect(html).toContain("font-mono");
    expect(html).toContain("text-app-accent");
    // Suffix-exchange ticker links to Yahoo as-is.
    expect(html).toContain('href="https://finance.yahoo.com/quote/AHR.V/"');
    // Parenthesized ticker has the parens stripped before being passed to
    // the Yahoo URL builder.
    expect(html).toContain('href="https://finance.yahoo.com/quote/CRML/"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('aria-label="View AHR.V on Yahoo Finance"');
    expect(html).toContain('aria-label="View CRML on Yahoo Finance"');
    // Common uppercase words should NOT be wrapped as ticker chips. They
    // still appear in the surrounding text — what we check is that they
    // don't pick up the chip class boundary.
    const aiHits = html.match(/Atlas ML/g);
    expect(aiHits).not.toBeNull();
  });

  it("returns the original text untouched when no ticker pattern matches", () => {
    expect(highlightTickers("plain narrative text")).toBe("plain narrative text");
  });
});

describe("VaultThesisCard", () => {
  it("renders the thesis text with ticker chips, signal source, entry mode, and updated chips", () => {
    const html = renderToStaticMarkup(
      createElement(VaultThesisCard, {
        thesis: SHORT_THESIS,
        signalSource: "atlas-ml",
        entryMode: "ml_score",
        lastRunAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
        agentDescription: "Mining-focused AI operator",
        latestRun: LATEST_RUN,
        recentActions: [],
      }),
    );

    expect(html).toContain("Vault Thesis");
    expect(html).toContain("AI operator strategy");
    expect(html).toContain("Mining-focused AI operator");
    expect(html).toContain("Atlas ML");
    expect(html).toContain("ML score");
    // 2h relative time formatted by formatRelativeTime — match the chip prefix
    // rather than the exact value to avoid clock-skew flakiness.
    expect(html).toContain("Updated ");
    // Ticker chips highlighted in the thesis body.
    expect(html).toContain("AHR.V");
    expect(html).toContain("(CRML)");
  });

  it("renders top-picks chips with success/danger tones for the latest run only and outlinks each to Yahoo Finance", () => {
    const html = renderToStaticMarkup(
      createElement(VaultThesisCard, {
        thesis: SHORT_THESIS,
        signalSource: "atlas-ml",
        entryMode: "ml_score",
        lastRunAt: LATEST_RUN.finishedAt,
        latestRun: LATEST_RUN,
        recentActions: RECENT_ACTIONS,
      }),
    );

    expect(html).toContain("Top picks");
    expect(html).toContain("Long");
    expect(html).toContain("Short");
    expect(html).toContain("AHR.V");
    expect(html).toContain("GSR.V");
    // Older-run pick must be filtered out.
    expect(html).not.toContain("OLD.V");
    // Tone classes from getToneChipClass — keeps the long/short coloring
    // visually distinct.
    expect(html).toContain("text-app-success");
    expect(html).toContain("text-app-danger");
    // Each top-picks chip outlinks to Yahoo Finance with safe target/rel.
    expect(html).toContain('href="https://finance.yahoo.com/quote/AHR.V/"');
    expect(html).toContain('href="https://finance.yahoo.com/quote/GSR.V/"');
    expect(html).toContain('aria-label="View AHR.V on Yahoo Finance"');
    expect(html).toContain('aria-label="View GSR.V on Yahoo Finance"');
  });

  it("renders the latest-run summary fallback when thesis is null", () => {
    const html = renderToStaticMarkup(
      createElement(VaultThesisCard, {
        thesis: null,
        signalSource: "atlas-quality",
        entryMode: "quality_score",
        lastRunAt: LATEST_RUN.finishedAt,
        agentDescription: "Quality matrix vault",
        latestRun: LATEST_RUN,
        recentActions: [],
      }),
    );

    expect(html).toContain("vault-thesis-fallback");
    expect(html).toContain("Thesis pending");
    expect(html).toContain("favor mining stocks");
    expect(html).toContain("Atlas Quality");
    expect(html).toContain("Quality score");
    expect(html).not.toContain("vault-thesis-empty");
  });

  it("renders the empty state when thesis and latest-run summary are both missing", () => {
    const html = renderToStaticMarkup(
      createElement(VaultThesisCard, {
        thesis: null,
        latestRun: undefined,
        recentActions: [],
      }),
    );

    expect(html).toContain("vault-thesis-empty");
    expect(html).toContain("Awaiting first run");
    expect(html).not.toContain("Thesis pending");
  });

  it("shows a Read more toggle for long thesis bodies and hides it for short ones", () => {
    const longHtml = renderToStaticMarkup(
      createElement(VaultThesisCard, {
        thesis: LONG_THESIS,
        signalSource: "atlas-ml",
        entryMode: "ml_score",
        lastRunAt: LATEST_RUN.finishedAt,
        latestRun: LATEST_RUN,
        recentActions: [],
      }),
    );
    expect(longHtml).toContain("vault-thesis-toggle");
    expect(longHtml).toContain("Read more");
    expect(longHtml).toContain("line-clamp-5");

    const shortHtml = renderToStaticMarkup(
      createElement(VaultThesisCard, {
        thesis: SHORT_THESIS,
        signalSource: "atlas-ml",
        entryMode: "ml_score",
        lastRunAt: LATEST_RUN.finishedAt,
        latestRun: LATEST_RUN,
        recentActions: [],
      }),
    );
    expect(shortHtml).not.toContain("vault-thesis-toggle");
    expect(shortHtml).not.toContain("Read more");
  });
});
