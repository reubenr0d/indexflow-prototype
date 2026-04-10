import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 1) {
    return NextResponse.json({ results: [] });
  }

  try {
    const raw = await yf.search(q, { quotesCount: 20, newsCount: 0 });
    const results = (raw.quotes ?? [])
      .filter(
        (quote) =>
          "quoteType" in quote &&
          (quote as Record<string, unknown>).quoteType === "EQUITY" &&
          "symbol" in quote
      )
      .map((quote) => {
        const q = quote as Record<string, unknown>;
        return {
          symbol: q.symbol as string,
          name: (q.longname ?? q.shortname ?? "") as string,
          exchange: (q.exchDisp ?? q.exchange ?? "") as string,
          sector: (q.sectorDisp ?? "") as string,
          industry: (q.industryDisp ?? "") as string,
        };
      });

    return NextResponse.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    return NextResponse.json({ results: [], error: message }, { status: 502 });
  }
}
