"use client";

import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useOraclePriceHistory } from "@/hooks/useOraclePriceHistory";
import { useOracleAssetMetaMap, useOracleAssetPrice } from "@/hooks/useOracle";
import {
  historyChartPoints,
  type PriceHistoryWindow,
} from "@/lib/oracle-price-history";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  YAxis,
  Tooltip as RechartsTooltip,
} from "recharts";

const WINDOW_OPTIONS: { value: PriceHistoryWindow; label: string }[] = [
  { value: "24H", label: "24H" },
  { value: "7D", label: "7D" },
  { value: "30D", label: "30D" },
];

interface AssetPricePanelProps {
  assetIds: `0x${string}`[];
  className?: string;
}

export function AssetPricePanel({ assetIds, className }: AssetPricePanelProps) {
  const [window, setWindow] = useState<PriceHistoryWindow>("7D");
  const { data: assetMeta } = useOracleAssetMetaMap();

  if (assetIds.length === 0) return null;

  return (
    <div className={className}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-app-muted">
          Asset Prices
        </h2>
        <SegmentedControl
          options={WINDOW_OPTIONS}
          value={window}
          onChange={setWindow}
          ariaLabel="Price history window"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {assetIds.map((assetId) => (
          <AssetMiniChart
            key={assetId}
            assetId={assetId}
            label={assetMeta.get(assetId)?.name ?? assetId.slice(0, 10)}
            window={window}
          />
        ))}
      </div>
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: { timestamp: number; priceUsd: number } }>;
}) {
  if (!active || !payload?.length) return null;
  const pt = payload[0].payload;
  return (
    <div className="rounded-md border border-app-border bg-app-surface px-2 py-1 text-xs shadow">
      <span className="font-mono font-semibold text-app-text">
        ${pt.priceUsd.toLocaleString(undefined, { maximumFractionDigits: 4 })}
      </span>
      <span className="ml-2 text-app-muted">
        {new Date(pt.timestamp * 1000).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </span>
    </div>
  );
}

function AssetMiniChart({
  assetId,
  label,
  window,
}: {
  assetId: `0x${string}`;
  label: string;
  window: PriceHistoryWindow;
}) {
  const { data: priceData } = useOracleAssetPrice(assetId);
  const { data: history, isLoading } = useOraclePriceHistory(assetId, window);

  const currentPrice = (priceData as [bigint, bigint] | undefined)?.[0] ?? 0n;
  const chartData = useMemo(() => historyChartPoints(history), [history]);

  const change = useMemo(() => {
    if (chartData.length < 2) return null;
    const first = chartData[0].priceUsd;
    const last = chartData[chartData.length - 1].priceUsd;
    if (first === 0) return null;
    const pct = ((last - first) / first) * 100;
    return { pct, positive: pct >= 0 };
  }, [chartData]);

  const priceRange = useMemo(() => {
    if (chartData.length === 0) return { min: 0, max: 1 };
    const prices = chartData.map((d) => d.priceUsd);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const pad = (max - min) * 0.1 || 0.01;
    return { min: Math.max(0, min - pad), max: max + pad };
  }, [chartData]);

  const strokeColor = change === null || change.positive ? "var(--success)" : "var(--danger)";

  return (
    <Card className="flex flex-col p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="truncate text-xs font-semibold text-app-text">{label}</span>
        {change !== null && (
          <span
            className={cn(
              "shrink-0 font-mono text-[11px] font-semibold",
              change.positive ? "text-app-success" : "text-app-danger",
            )}
          >
            {change.positive ? "+" : ""}
            {change.pct.toFixed(2)}%
          </span>
        )}
      </div>
      <span className="mb-2 font-mono text-sm font-semibold text-app-text">
        {formatPrice(currentPrice)}
      </span>
      {isLoading ? (
        <Skeleton className="h-[100px] w-full rounded" />
      ) : chartData.length < 2 ? (
        <div className="flex h-[100px] items-center justify-center text-[11px] text-app-muted">
          Not enough data
        </div>
      ) : (
        <div className="h-[100px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={`grad-${assetId.slice(2, 10)}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={strokeColor} stopOpacity={0.18} />
                  <stop offset="95%" stopColor={strokeColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <YAxis domain={[priceRange.min, priceRange.max]} hide />
              <RechartsTooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="priceUsd"
                stroke={strokeColor}
                strokeWidth={1.5}
                fill={`url(#grad-${assetId.slice(2, 10)})`}
                dot={false}
                activeDot={{ r: 3, strokeWidth: 1.5 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
