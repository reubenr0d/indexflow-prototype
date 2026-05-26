import { NextRequest, NextResponse } from "next/server";
import { fetchBybitKlineChartPoints } from "../../../../../../shared/bybit-price-history.mjs";
import { normaliseAgentSymbolToBybit } from "../../../../../../mcps/bybit/symbol-mapping.mjs";
import { isCryptoAgentSymbol } from "../../../../../../shared/yahoo-symbol-map.mjs";

type WindowKey = "24H" | "7D" | "30D";

const WINDOW_HOURS: Record<WindowKey, number> = {
  "24H": 24,
  "7D": 168,
  "30D": 720,
};

function isWindowKey(value: string | null): value is WindowKey {
  return value === "24H" || value === "7D" || value === "30D";
}

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol")?.trim().toUpperCase();
  const windowParam = request.nextUrl.searchParams.get("window");

  if (!symbol) {
    return NextResponse.json({ error: "missing symbol" }, { status: 400 });
  }
  if (!isWindowKey(windowParam)) {
    return NextResponse.json(
      { error: "window must be one of 24H, 7D, 30D" },
      { status: 400 },
    );
  }
  if (!isCryptoAgentSymbol(symbol)) {
    return NextResponse.json(
      { error: "Bybit kline is only available for crypto BASE-USD oracle symbols" },
      { status: 400 },
    );
  }

  const bybitSymbol = normaliseAgentSymbolToBybit(symbol);
  if (!bybitSymbol) {
    return NextResponse.json({ error: "symbol not mapped to Bybit" }, { status: 400 });
  }

  const lookbackHours = WINDOW_HOURS[windowParam];
  const result = await fetchBybitKlineChartPoints(bybitSymbol, { lookbackHours });

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error ?? "kline_fetch_failed",
        symbol,
        bybitSymbol,
        window: windowParam,
        points: [],
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    symbol,
    bybitSymbol: result.bybitSymbol,
    window: windowParam,
    interval: result.interval,
    source: "bybit",
    points: result.points,
    barCount: result.barCount,
  });
}
