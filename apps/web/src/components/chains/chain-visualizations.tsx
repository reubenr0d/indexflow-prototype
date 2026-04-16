"use client";

import { useMemo, type ComponentProps } from "react";
import { Clock } from "lucide-react";
import { getChainMeta } from "@/components/chains/chain-icons";
import { InfoLabel } from "@/components/ui/info-tooltip";
import { USDC_PRECISION } from "@/lib/constants";
import { formatBps, formatUSDC } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ChainState } from "@/hooks/usePoolReserveRegistry";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
} from "recharts";

function bigintToMillions(value: bigint): number {
  return Number(value / USDC_PRECISION) / 1_000_000;
}

function formatM(value: number): string {
  if (value >= 1) return `$${value.toFixed(1)}M`;
  return `$${(value * 1000).toFixed(0)}K`;
}

interface RingDataPoint {
  name: string;
  value: number;
  color: string;
  pct: number;
  formattedValue: string;
}

type PieLabelProp = ComponentProps<typeof Pie>["label"];
type PieLabelFn = Extract<NonNullable<PieLabelProp>, (...args: never) => unknown>;
type PieLabelArg = Parameters<PieLabelFn>[0];

function renderSegmentLabel(raw: PieLabelArg) {
  const { cx, cy, midAngle, innerRadius, outerRadius, percent, payload } = raw;
  if (
    cx == null ||
    cy == null ||
    midAngle == null ||
    innerRadius == null ||
    outerRadius == null
  ) {
    return null;
  }

  const ringPayload = payload as RingDataPoint | undefined;
  const pct =
    typeof ringPayload?.pct === "number"
      ? ringPayload.pct
      : percent != null
        ? percent * 100
        : 0;
  if (pct < 8) return null;

  const RADIAN = Math.PI / 180;
  const r = (innerRadius + outerRadius) / 2;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);

  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      dominantBaseline="central"
      fill="#fff"
      fontSize={10}
      fontWeight={600}
      fontFamily="var(--font-mono, monospace)"
    >
      {pct.toFixed(0)}%
    </text>
  );
}

function LayeredTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: RingDataPoint; name: string }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-app-accent/20 bg-app-surface px-3 py-2 shadow-lg">
      <p className="text-xs font-semibold text-app-text">{d.name}</p>
      <p className="mt-1 font-mono text-xs text-app-muted">
        {d.pct.toFixed(1)}% &middot; {d.formattedValue}
      </p>
    </div>
  );
}

function stalenessColor(seconds: number): string {
  if (seconds < 30) return "text-app-success";
  if (seconds < 120) return "text-app-warning";
  return "text-app-danger";
}

function stalenessLabel(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

function ChainDetailRow({ chain, poolPct }: { chain: ChainState; poolPct: number }) {
  const meta = getChainMeta(chain.chainSelector);
  const Icon = meta.icon;
  const utilPct = Math.min(100, Math.max(0, chain.utilizationBps / 100));

  const poolNum = Number(chain.poolDepth);
  const availNum = Number(chain.availableLiquidity);
  const totalForBar = poolNum > 0 ? poolNum : 1;
  const availPct = (availNum / totalForBar) * 100;

  return (
    <div
      className="rounded-lg border border-app-border/60 bg-app-bg/40 px-4 py-3"
      style={{ borderLeftWidth: "3px", borderLeftColor: meta.accent }}
    >
      {/* Header: chain name + staleness */}
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Icon size={22} className="shrink-0" />
          <span className="text-sm font-semibold text-app-text">{meta.name}</span>
          <span
            className="rounded-full px-1.5 py-0.5 font-mono text-[10px] font-semibold"
            style={{ backgroundColor: `${meta.accent}18`, color: meta.accent }}
          >
            {poolPct.toFixed(1)}%
          </span>
        </div>
        <div className={cn("flex items-center gap-1 text-[11px]", stalenessColor(chain.staleness))}>
          <Clock className="h-3 w-3" />
          <span>{stalenessLabel(chain.staleness)}</span>
        </div>
      </div>

      {/* Metrics row */}
      <div className="mb-2.5 grid grid-cols-3 gap-x-4 gap-y-1 text-xs">
        <div className="flex items-center justify-between gap-1">
          <span className="text-app-muted">
            <InfoLabel label="Pool" tooltipKey="chainPoolDepth" />
          </span>
          <span className="font-mono font-medium text-app-text">{formatUSDC(chain.poolDepth)}</span>
        </div>
        <div className="flex items-center justify-between gap-1">
          <span className="text-app-muted">
            <InfoLabel label="Avail." tooltipKey="chainAvailableLiquidity" />
          </span>
          <span className="font-mono font-medium text-app-text">{formatUSDC(chain.availableLiquidity)}</span>
        </div>
        <div className="flex items-center justify-between gap-1">
          <span className="text-app-muted">
            <InfoLabel label="Weight" tooltipKey="chainRoutingWeight" />
          </span>
          <span className="font-mono font-medium text-app-text">{formatBps(chain.routingWeight)}</span>
        </div>
      </div>

      {/* Utilization bar */}
      <div>
        <div className="mb-1 flex items-center justify-between text-[10px] text-app-muted">
          <span>Reserved {formatUSDC(chain.reservedAmount)}</span>
          <span className="font-mono font-medium">{utilPct.toFixed(1)}% util.</span>
          <span>Available {formatUSDC(chain.availableLiquidity)}</span>
        </div>
        <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-app-bg-subtle">
          <div
            className="h-full transition-all"
            style={{
              width: `${100 - availPct}%`,
              backgroundColor: meta.accent,
              opacity: 0.7,
            }}
          />
          <div
            className="h-full transition-all"
            style={{
              width: `${availPct}%`,
              backgroundColor: meta.accent,
              opacity: 0.25,
            }}
          />
        </div>
      </div>
    </div>
  );
}

export function ChainDistributionChart({ chains }: { chains: ChainState[] }) {
  const { outerData, innerData, poolPctMap } = useMemo(() => {
    let totalPool = 0;
    let totalWeight = 0;

    const raw = chains.map((c) => {
      const meta = getChainMeta(c.chainSelector);
      const pool = bigintToMillions(c.poolDepth);
      const weight = c.routingWeight;
      totalPool += pool;
      totalWeight += weight;
      return { meta, pool, weight, selector: c.chainSelector.toString() };
    });

    const outer: RingDataPoint[] = raw.map((r) => ({
      name: r.meta.name,
      value: r.pool,
      color: r.meta.accent,
      pct: totalPool > 0 ? (r.pool / totalPool) * 100 : 0,
      formattedValue: formatM(r.pool),
    }));

    const inner: RingDataPoint[] = raw.map((r) => ({
      name: r.meta.name,
      value: r.weight,
      color: r.meta.accent,
      pct: totalWeight > 0 ? (r.weight / totalWeight) * 100 : 0,
      formattedValue: `${(r.weight / 100).toFixed(1)}%`,
    }));

    const pctMap = new Map<string, number>();
    raw.forEach((r, i) => pctMap.set(r.selector, outer[i].pct));

    return { outerData: outer, innerData: inner, poolPctMap: pctMap };
  }, [chains]);

  if (outerData.length === 0) return null;

  return (
    <div className="rounded-xl border border-app-accent/20 bg-app-surface p-6 shadow-[0_0_24px_-4px_var(--color-app-accent-dim)]">
      <p className="mb-5 text-sm font-semibold tracking-tight text-app-text">
        Chain Distribution
      </p>

      <div className="flex flex-col items-center gap-6 lg:flex-row lg:items-center lg:gap-8">
        {/* Donut chart */}
        <div className="relative mx-auto w-full max-w-[220px] shrink-0 lg:mx-0">
          <div className="aspect-square w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={outerData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius="56%"
                  outerRadius="80%"
                  paddingAngle={2}
                  strokeWidth={0}
                  label={renderSegmentLabel}
                  labelLine={false}
                  isAnimationActive={false}
                >
                  {outerData.map((d, i) => (
                    <Cell key={i} fill={d.color} fillOpacity={0.9} />
                  ))}
                </Pie>

                <Pie
                  data={innerData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius="34%"
                  outerRadius="48%"
                  paddingAngle={2}
                  strokeWidth={0}
                  label={renderSegmentLabel}
                  labelLine={false}
                  isAnimationActive={false}
                >
                  {innerData.map((d, i) => (
                    <Cell key={i} fill={d.color} fillOpacity={0.4} />
                  ))}
                </Pie>

                <RechartsTooltip content={<LayeredTooltip />} />
              </PieChart>
            </ResponsiveContainer>

            {/* Center label */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-mono text-2xl font-semibold text-app-text">
                {chains.length}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-app-muted">
                chains
              </span>
            </div>
          </div>

          {/* Ring legend */}
          <div className="mt-2 flex items-center justify-center gap-4 text-[10px] text-app-muted">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-app-accent opacity-90" />
              Liquidity
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-app-accent opacity-40" />
              Routing
            </span>
          </div>
        </div>

        {/* Chain detail list */}
        <div className="flex w-full flex-1 flex-col gap-3">
          {chains.map((chain) => (
            <ChainDetailRow
              key={chain.chainSelector.toString()}
              chain={chain}
              poolPct={poolPctMap.get(chain.chainSelector.toString()) ?? 0}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
