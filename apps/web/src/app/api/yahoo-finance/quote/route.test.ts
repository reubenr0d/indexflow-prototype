import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const searchMock = vi.hoisted(() => vi.fn());
const quoteMock = vi.hoisted(() => vi.fn());

vi.mock("yahoo-finance2", () => ({
  default: vi.fn().mockImplementation(() => ({
    search: searchMock,
    quote: quoteMock,
  })),
}));

function makeRequest(symbols: string) {
  return new NextRequest(`http://localhost/api/yahoo-finance/quote?symbols=${encodeURIComponent(symbols)}`);
}

describe("/api/yahoo-finance/quote", () => {
  beforeEach(() => {
    searchMock.mockReset();
    quoteMock.mockReset();
  });

  it("disables search validation and converts GBp live quotes as pence", async () => {
    searchMock.mockResolvedValue({
      quotes: [
        {
          quoteType: "EQUITY",
          symbol: "IRON.L",
          longname: "Ironveld Plc",
          exchDisp: "London",
          typeDisp: "Equity",
        },
      ],
    });
    quoteMock.mockImplementation(async (symbol: string) => {
      if (symbol === "IRON.L") {
        return {
          symbol: "IRON.L",
          regularMarketPrice: 0.023,
          currency: "GBp",
          fullExchangeName: "LSE",
          marketState: "REGULAR",
          longName: "Ironveld Plc",
        };
      }
      if (symbol === "GBPUSD=X") {
        return { symbol: "GBPUSD=X", regularMarketPrice: 1.347, currency: "USD" };
      }
      throw new Error(`unexpected quote ${symbol}`);
    });

    const response = await GET(makeRequest("IRON.L"));
    const body = await response.json();

    expect(searchMock).toHaveBeenCalledWith(
      "IRON.L",
      { quotesCount: 20, newsCount: 0 },
      { validateResult: false },
    );
    expect(quoteMock).toHaveBeenCalledWith("GBPUSD=X");
    expect(response.status).toBe(200);
    expect(body.quotes[0]).toMatchObject({
      requestedSymbol: "IRON.L",
      resolvedSymbol: "IRON.L",
      symbol: "IRON.L",
      name: "Ironveld Plc",
      price: 0.023,
      currency: "GBp",
      exchange: "LSE",
      isAmbiguous: false,
      candidates: ["IRON.L"],
    });
    expect(body.quotes[0].priceUsd).toBeCloseTo(0.00030981, 10);
  });
});
