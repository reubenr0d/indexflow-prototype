import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const searchMock = vi.hoisted(() => vi.fn());

vi.mock("yahoo-finance2", () => ({
  default: vi.fn().mockImplementation(() => ({
    search: searchMock,
  })),
}));

function makeRequest(query: string) {
  return new NextRequest(`http://localhost/api/yahoo-finance/search?q=${encodeURIComponent(query)}`);
}

describe("/api/yahoo-finance/search", () => {
  beforeEach(() => {
    searchMock.mockReset();
  });

  it("disables Yahoo result validation and normalizes equity rows", async () => {
    searchMock.mockResolvedValue({
      quotes: [
        {
          quoteType: "EQUITY",
          symbol: "SD",
          longname: "SandRidge Energy, Inc.",
          exchDisp: "NYSE",
          sectorDisp: "Energy",
          industryDisp: "Oil & Gas E&P",
        },
        {
          quoteType: "EQUITY",
          symbol: "SDF",
          shortname: "K+S Aktiengesellschaft",
          exchange: "GER",
        },
        { quoteType: "ETF", symbol: "SPY", longname: "SPDR S&P 500 ETF Trust" },
        { quoteType: "EQUITY", symbol: 123, longname: "Malformed Symbol" },
        null,
      ],
    });

    const response = await GET(makeRequest("sd"));
    const body = await response.json();

    expect(searchMock).toHaveBeenCalledWith(
      "sd",
      { quotesCount: 20, newsCount: 0 },
      { validateResult: false }
    );
    expect(response.status).toBe(200);
    expect(body).toEqual({
      results: [
        {
          symbol: "SD",
          name: "SandRidge Energy, Inc.",
          exchange: "NYSE",
          sector: "Energy",
          industry: "Oil & Gas E&P",
        },
        {
          symbol: "SDF",
          name: "K+S Aktiengesellschaft",
          exchange: "GER",
          sector: "",
          industry: "",
        },
      ],
    });
  });

  it("returns empty results without calling Yahoo for blank queries", async () => {
    const response = await GET(makeRequest("   "));
    const body = await response.json();

    expect(searchMock).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(body).toEqual({ results: [] });
  });

  it("preserves 502 responses for real upstream failures", async () => {
    searchMock.mockRejectedValue(new Error("upstream unavailable"));

    const response = await GET(makeRequest("sd"));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toEqual({ results: [], error: "upstream unavailable" });
  });
});
