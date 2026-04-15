"use client";

import { useMemo } from "react";
import {
  useSupportedOracleAssets,
  useOracleAssetPrice,
} from "@/hooks/useOracle";
import { useOraclePriceHistory } from "@/hooks/useOraclePriceHistory";
import { formatPrice } from "@/lib/format";
import { PRICE_PRECISION, USDC_PRECISION } from "@/lib/constants";

const MAX_TICKER_ASSETS = 8;

export function PriceTicker() {
  const { data: assets, isLoading } = useSupportedOracleAssets();

  const displayAssets = useMemo(
    () => assets.slice(0, MAX_TICKER_ASSETS),
    [assets],
  );

  if (isLoading || displayAssets.length === 0) return null;

  return (
    <div className="border-b border-app-border bg-app-bg-subtle/80 backdrop-blur-sm">
      <div className="hero-ticker-wrap overflow-hidden">
        <div className="hero-ticker-track flex w-max items-center">
          {[0, 1].map((copy) => (
            <div
              key={copy}
              className="flex shrink-0 items-center"
              aria-hidden={copy === 1}
            >
              {displayAssets.map((asset) => (
                <TickerCell
                  key={`${copy}-${asset.idHex}`}
                  assetId={asset.idHex}
                  label={asset.name}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function price1e30ToNumber(price: bigint): number {
  return Number((price * USDC_PRECISION) / PRICE_PRECISION) / Number(USDC_PRECISION);
}

function TickerCell({
  assetId,
  label,
}: {
  assetId: `0x${string}`;
  label: string;
}) {
  const { data: priceData } = useOracleAssetPrice(assetId);
  const { data: history } = useOraclePriceHistory(assetId, "24H");

  const price = (priceData as [bigint, bigint] | undefined)?.[0] ?? 0n;

  const change24h = useMemo(() => {
    if (!history?.length || price === 0n) return null;
    const sorted = [...history].sort(
      (a, b) => Number(a.priceTimestamp - b.priceTimestamp),
    );
    const oldest = sorted[0];
    if (!oldest || oldest.price === 0n) return null;
    const oldUsd = price1e30ToNumber(oldest.price);
    const curUsd = price1e30ToNumber(price);
    if (oldUsd === 0) return null;
    const pct = ((curUsd - oldUsd) / oldUsd) * 100;
    return { pct, positive: pct >= 0 };
  }, [history, price]);

  if (price === 0n) return null;

  return (
    <div className="flex items-center gap-2 px-5 py-2">
      <span className="whitespace-nowrap text-[11px] font-medium text-app-muted">
        {label}
      </span>
      <span className="whitespace-nowrap font-mono text-[11px] font-semibold text-app-text">
        {formatPrice(price)}
      </span>
      {change24h && (
        <span
          className={`whitespace-nowrap font-mono text-[10px] font-semibold ${change24h.positive ? "text-app-success" : "text-app-danger"}`}
        >
          {change24h.positive ? "+" : ""}
          {change24h.pct.toFixed(2)}%
        </span>
      )}
      <span className="text-app-border/60" aria-hidden>
        |
      </span>
    </div>
  );
}
