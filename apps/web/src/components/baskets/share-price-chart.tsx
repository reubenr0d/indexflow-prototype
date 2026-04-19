"use client";

import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionHeader } from "@/components/baskets/basket-detail-ui";
import { InfoLabel } from "@/components/ui/info-tooltip";
import {
  useSharePriceHistory,
  type SharePricePoint,
} from "@/hooks/subgraph/useSharePriceHistory";
import { PRICE_PRECISION } from "@/lib/constants";
import { TrendingUp } from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid,
} from "recharts";
import { type Address } from "viem";

function sharePriceToUsd(price: bigint): number {
  return Number((price * 1_000_000n) / PRICE_PRECISION) / 1_000_000;
}

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatDateFull(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface ChartDataPoint {
  timestamp: number;
  price: number;
  label: string;
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartDataPoint }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-lg border border-app-border bg-app-surface px-3 py-2 shadow-md">
      <p className="text-xs text-app-muted">{formatDateFull(point.timestamp)}</p>
      <p className="mt-1 font-mono text-sm font-semibold text-app-text">
        ${point.price.toFixed(6)}
      </p>
    </div>
  );
}

export function SharePriceChart({ vault, compact }: { vault: Address; compact?: boolean }) {
  const { data, isLoading } = useSharePriceHistory(vault);

  const chartData = useMemo<ChartDataPoint[]>(() => {
    if (!data?.points?.length) return [];
    return data.points.map((p: SharePricePoint) => ({
      timestamp: p.timestamp,
      price: sharePriceToUsd(p.sharePrice),
      label: formatDate(p.timestamp),
    }));
  }, [data]);

  const priceRange = useMemo(() => {
    if (chartData.length === 0) return { min: 0, max: 1 };
    const prices = chartData.map((d) => d.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const padding = (max - min) * 0.1 || 0.01;
    return { min: Math.max(0, min - padding), max: max + padding };
  }, [chartData]);

  const priceChange = useMemo(() => {
    if (chartData.length < 2) return null;
    const first = chartData[0].price;
    const last = chartData[chartData.length - 1].price;
    const change = last - first;
    const pct = first > 0 ? (change / first) * 100 : 0;
    return { change, pct, isPositive: change >= 0 };
  }, [chartData]);

  const chartHeight = compact ? "h-48" : "h-48 lg:h-80";

  if (isLoading) {
    return (
      <Card className="p-5">
        <SectionHeader
          icon={TrendingUp}
          title={<InfoLabel label="Share Price History" tooltipKey="sharePriceHistory" />}
          meta="Loading price history..."
        />
        <Skeleton className={`${chartHeight} w-full rounded-lg`} />
      </Card>
    );
  }

  if (chartData.length < 2) {
    return (
      <Card className="p-5">
        <SectionHeader
          icon={TrendingUp}
          title={<InfoLabel label="Share Price History" tooltipKey="sharePriceHistory" />}
          meta="Not enough data to display a chart yet."
        />
        <div className="flex items-center justify-center rounded-xl border border-dashed border-app-border bg-app-bg-subtle/60 p-8 text-sm text-app-muted">
          Share price history will appear after more vault activity.
        </div>
      </Card>
    );
  }

  const strokeColor = priceChange?.isPositive !== false ? "var(--success)" : "var(--danger)";

  return (
    <Card className="p-5">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-app-muted" />
          <span className="text-sm font-semibold text-app-text">
            <InfoLabel label="Share Price" tooltipKey="sharePriceHistory" />
          </span>
          {chartData.length > 0 && (
            <span className="font-mono text-lg font-bold text-app-text">
              ${chartData[chartData.length - 1].price.toFixed(4)}
            </span>
          )}
        </div>
        {priceChange && (
          <span className="text-xs text-app-muted">
            <span className={priceChange.isPositive ? "text-app-success" : "text-app-danger"}>
              {priceChange.isPositive ? "+" : ""}
              {priceChange.pct.toFixed(2)}%
            </span>
            {" "}(subgraph)
          </span>
        )}
      </div>
      <div className={`${chartHeight} w-full`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="sharePriceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={strokeColor} stopOpacity={0.18} />
                <stop offset="95%" stopColor={strokeColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-app-border, #e5e7eb)" opacity={0.3} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "var(--color-app-muted, #9ca3af)" }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[priceRange.min, priceRange.max]}
              tick={{ fontSize: 11, fill: "var(--color-app-muted, #9ca3af)" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `$${v.toFixed(4)}`}
              width={64}
            />
            <RechartsTooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="price"
              stroke={strokeColor}
              strokeWidth={2}
              fill="url(#sharePriceGradient)"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
