"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { motion } from "framer-motion";
import { formatUSDC, formatBps } from "@/lib/format";
import { type Address } from "viem";

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
  index?: number;
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
  index = 0,
}: BasketCardProps) {
  const tvl = usdcBalance + perpAllocated;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay: index * 0.04 }}
    >
      <Link href={`/baskets/${vault}`}>
        <Card className="group h-full p-5 transition-colors hover:border-app-border-strong hover:bg-app-surface-hover">
          <div className="mb-3 flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold text-app-text">{name || "Basket"}</h3>
            {depositFee !== undefined && (
              <span className="shrink-0 rounded-md bg-app-accent-dim px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-app-accent">
                {formatBps(depositFee)} fee
              </span>
            )}
          </div>

          <p className="font-mono text-2xl font-semibold tracking-tight text-app-text">
            {formatUSDC(tvl)}
          </p>
          <p className="mt-0.5 font-mono text-xs text-app-muted">TVL</p>

          <div className="mt-4 flex gap-6">
            <div>
              <p className="font-mono text-sm font-medium text-app-text">{formatUSDC(sharePrice)}</p>
              <p className="text-xs text-app-muted">Share price</p>
            </div>
            <div>
              <p className="font-mono text-sm font-medium text-app-text">{assetCount}</p>
              <p className="text-xs text-app-muted">Assets</p>
            </div>
          </div>

          <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-app-bg-subtle">
            <div
              className="h-full rounded-full bg-app-accent transition-all"
              style={{
                width: perpAllocated > 0n ? `${Number((perpAllocated * 100n) / (tvl || 1n))}%` : "0%",
              }}
            />
          </div>
          <p className="mt-1 text-xs text-app-muted">
            {perpBlendBps !== undefined
              ? `${formatBps(perpBlendBps)} perp sleeve`
              : perpAllocated > 0n
                ? `${Number((perpAllocated * 100n) / (tvl || 1n))}% in perp`
                : "No perp allocation"}
          </p>
        </Card>
      </Link>
    </motion.div>
  );
}
