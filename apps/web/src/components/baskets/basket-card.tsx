"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { InfoLabel } from "@/components/ui/info-tooltip";
import { TrendPill } from "@/components/ui/trend-pill";
import { formatBps, formatPrice, formatUSDC } from "@/lib/format";
import { computeApy, formatApy } from "@/lib/apy";
import { type Address } from "viem";
import { Bot } from "lucide-react";
import { BasketIcon } from "./basket-icons";
import { useBasketTrendSnapshots } from "@/hooks/subgraph/useBasketTrends";
import { useAgentMetadata } from "@/hooks/useAgentMetadata";
import { CHAIN_META } from "@/components/chains/chain-icons";

interface BasketCardProps {
  vault: Address;
  name: string;
  sharePrice: bigint;
  basketPrice: bigint;
  usdcBalance: bigint;
  perpAllocated: bigint;
  totalSupply: bigint;
  assetCount: number;
  perpBlendBps?: bigint;
  depositFee?: bigint;
  redeemFee?: bigint;
  trend24h?: bigint | null;
  trend7d?: bigint | null;
  index?: number;
  chainId?: number;
}

export function BasketCard({
  vault,
  name,
  sharePrice,
  usdcBalance,
  perpAllocated,
  assetCount,
  perpBlendBps,
  depositFee,
  trend24h: trend24hProp,
  trend7d: trend7dProp,
  index = 0,
  chainId,
}: BasketCardProps) {
  const chainMeta = chainId != null ? CHAIN_META[String(chainId)] : undefined;
  const ChainIcon = chainMeta?.icon;
  const { data: agentMeta } = useAgentMetadata(vault);
  const { data: trendData } = useBasketTrendSnapshots(vault);
  const trend24h = trend24hProp ?? trendData?.day?.delta?.sharePrice ?? null;
  const trend7d = trend7dProp ?? trendData?.week?.delta?.sharePrice ?? null;

  const apy =
    trendData?.week?.current && trendData?.week?.previous
      ? computeApy(trendData.week.current.sharePrice, trendData.week.previous.sharePrice, 7)
      : null;

  const tvl = usdcBalance + perpAllocated;
  const perpShare = tvl > 0n ? `${Number((perpAllocated * 100n) / tvl)}% in perp` : "No perp allocation";
  const formatTrendText = (label: "24h" | "7d", delta?: bigint | null) => {
    if (delta === undefined || delta === null) return `${label} --`;
    const abs = delta < 0n ? -delta : delta;
    const value = formatPrice(abs);
    return `${label} ${delta > 0n ? "+" : delta < 0n ? "-" : ""}${value}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay: index * 0.04 }}
    >
      <Link href={`/baskets/${vault}`}>
        <Card className="group flex h-full flex-col p-5 transition-colors hover:border-app-border-strong hover:bg-app-surface-hover">
          <div className="mb-3 flex items-start justify-between gap-3">
            <h3 className="min-w-0 text-sm font-semibold text-app-text">
              <InfoLabel label={name || "Basket"} tooltipKey="tableName" />
            </h3>
            <div className="flex shrink-0 items-center gap-1.5">
              {ChainIcon && (
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-app-border bg-app-bg-subtle px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-app-muted"
                  title={chainMeta?.name}
                >
                  <ChainIcon size={12} />
                </span>
              )}
              {agentMeta?.isAiManaged && (
                <span className="inline-flex items-center gap-1 rounded-full border border-app-accent/25 bg-app-accent/10 px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-app-accent">
                  <Bot className="h-3 w-3" />
                  AI
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 rounded-full border border-app-border bg-app-bg-subtle px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-app-muted">
                <BasketIcon name="fee" className="text-app-accent" />
                {depositFee !== undefined ? `${formatBps(depositFee)} fee` : "Fee --"}
              </span>
            </div>
          </div>

          <div className="flex items-end justify-between gap-3">
            <div className="space-y-1">
              <p className="font-mono text-2xl font-semibold tracking-tight text-app-text">
                {formatUSDC(tvl)}
              </p>
              <div className="flex items-center gap-2 text-xs text-app-muted">
                <BasketIcon name="tvl" className="text-app-accent" />
                <span>TVL</span>
              </div>
            </div>
            <div className="text-right">
              <p className={`font-mono text-lg font-semibold ${apy !== null && apy > 0 ? "text-app-success" : apy !== null && apy < 0 ? "text-app-danger" : "text-app-muted"}`}>
                {formatApy(apy)}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-app-muted">APY (7d)</p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-app-border bg-app-bg-subtle/60 p-3">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-app-muted">
                <BasketIcon name="sharePrice" />
                <span>Share price</span>
              </div>
              <p className="mt-2 font-mono text-sm font-semibold text-app-text">{formatPrice(sharePrice)}</p>
            </div>
            <div className="rounded-lg border border-app-border bg-app-bg-subtle/60 p-3">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-app-muted">
                <BasketIcon name="assets" />
                <span>Assets</span>
              </div>
              <p className="mt-2 font-mono text-sm font-semibold text-app-text">{assetCount}</p>
            </div>
            <div className="rounded-lg border border-app-border bg-app-bg-subtle/60 p-3">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-app-muted">
                <BasketIcon name="perp" />
                <span>Perp sleeve</span>
              </div>
              <p className="mt-2 font-mono text-sm font-semibold text-app-text">
                {perpBlendBps !== undefined ? formatBps(perpBlendBps) : perpShare}
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <TrendPill direction={trend24h === undefined || trend24h === null || trend24h === 0n ? "flat" : trend24h > 0n ? "up" : "down"}>
              {formatTrendText("24h", trend24h)}
            </TrendPill>
            <TrendPill direction={trend7d === undefined || trend7d === null || trend7d === 0n ? "flat" : trend7d > 0n ? "up" : "down"}>
              {formatTrendText("7d", trend7d)}
            </TrendPill>
          </div>

          <div className="mt-4 flex-1">
            <div className="mb-1 h-1.5 w-full overflow-hidden rounded-full bg-app-bg-subtle">
              <div
                className="h-full rounded-full bg-app-accent transition-all"
                style={{
                  width: perpAllocated > 0n ? `${Number((perpAllocated * 100n) / (tvl || 1n))}%` : "0%",
                }}
              />
            </div>
            <p className="text-xs text-app-muted">
              {perpBlendBps !== undefined
                ? `${formatBps(perpBlendBps)} perp sleeve`
                : perpAllocated > 0n
                  ? `${Number((perpAllocated * 100n) / (tvl || 1n))}% in perp`
                  : "No perp allocation"}
            </p>
          </div>
        </Card>
      </Link>
    </motion.div>
  );
}
