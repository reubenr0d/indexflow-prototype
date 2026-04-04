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
  depositFee,
  index = 0,
}: BasketCardProps) {
  const tvl = usdcBalance + perpAllocated;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
    >
      <Link href={`/baskets/${vault}`}>
        <Card className="group p-6 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
          <div className="mb-4 flex items-start justify-between">
            <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
              {name || "Basket"}
            </h3>
            {depositFee !== undefined && (
              <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                {formatBps(depositFee)} fee
              </span>
            )}
          </div>

          <p className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-white">
            {formatUSDC(tvl)}
          </p>
          <p className="mt-0.5 text-sm text-neutral-400">TVL</p>

          <div className="mt-4 flex items-center gap-4">
            <div>
              <p className="text-sm font-medium text-neutral-900 dark:text-white">
                {formatUSDC(sharePrice)}
              </p>
              <p className="text-xs text-neutral-400">Share Price</p>
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-900 dark:text-white">
                {assetCount}
              </p>
              <p className="text-xs text-neutral-400">Assets</p>
            </div>
          </div>

          <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
            <div
              className="h-full rounded-full bg-blue-500 transition-all"
              style={{
                width: perpAllocated > 0n ? `${Number((perpAllocated * 100n) / (tvl || 1n))}%` : "0%",
              }}
            />
          </div>
          <p className="mt-1 text-xs text-neutral-400">
            {perpAllocated > 0n
              ? `${Number((perpAllocated * 100n) / (tvl || 1n))}% allocated to perp`
              : "No perp allocation"}
          </p>
        </Card>
      </Link>
    </motion.div>
  );
}
