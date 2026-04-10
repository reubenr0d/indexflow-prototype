import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("symbols")?.trim();
  if (!raw) {
    return NextResponse.json({ quotes: [] });
  }

  const symbols = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (symbols.length === 0) {
    return NextResponse.json({ quotes: [] });
  }

  try {
    const quotes = await Promise.all(
      symbols.map(async (symbol) => {
        try {
          const q = await yf.quote(symbol);
          return {
            symbol: q.symbol,
            name: (q as Record<string, unknown>).longName ?? (q as Record<string, unknown>).shortName ?? "",
            price: q.regularMarketPrice ?? null,
            currency: q.currency ?? "USD",
            exchange: q.fullExchangeName ?? "",
            marketState: q.marketState ?? "CLOSED",
          };
        } catch {
          return { symbol, name: "", price: null, currency: "USD", exchange: "", marketState: "ERROR" };
        }
      })
    );

    return NextResponse.json({ quotes });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Quote failed";
    return NextResponse.json({ quotes: [], error: message }, { status: 502 });
  }
}
