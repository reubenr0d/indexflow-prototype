"use client";

import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionHeader } from "@/components/baskets/basket-detail-ui";
import { InfoLabel } from "@/components/ui/info-tooltip";
import {
  useSharePriceHistory,
  type SharePricePoint,
} from "@/hooks/subgraph/useSubgraphQueries";
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

export function SharePriceChart({ vault }: { vault: Address }) {
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

  if (isLoading) {
    return (
      <Card className="p-5">
        <SectionHeader
          icon={TrendingUp}
          title={<InfoLabel label="Share Price History" tooltipKey="sharePriceHistory" />}
          meta="Loading price history..."
        />
        <Skeleton className="h-48 w-full rounded-lg" />
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

  return (
    <Card className="p-5">
      <SectionHeader
        icon={TrendingUp}
        title={<InfoLabel label="Share Price History" tooltipKey="sharePriceHistory" />}
        meta={
          priceChange ? (
            <span>
              <span className={priceChange.isPositive ? "text-app-success" : "text-app-danger"}>
                {priceChange.isPositive ? "+" : ""}
                {priceChange.pct.toFixed(2)}%
              </span>
              {" "}over the displayed period ({data?.source === "rpc" ? "RPC" : "subgraph"})
            </span>
          ) : undefined
        }
      />
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="sharePriceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor={priceChange?.isPositive !== false ? "rgb(13,148,136)" : "rgb(239,68,68)"}
                  stopOpacity={0.2}
                />
                <stop
                  offset="95%"
                  stopColor={priceChange?.isPositive !== false ? "rgb(13,148,136)" : "rgb(239,68,68)"}
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-app-border, #e5e7eb)" opacity={0.4} />
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
              tickFormatter={(v: number) => `$${v.toFixed(2)}`}
              width={60}
            />
            <RechartsTooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="price"
              stroke={priceChange?.isPositive !== false ? "rgb(13,148,136)" : "rgb(239,68,68)"}
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
