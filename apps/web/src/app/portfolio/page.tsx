"use client";

import { PageWrapper } from "@/components/layout/page-wrapper";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useAccount, useReadContracts } from "wagmi";
import { useAllBaskets } from "@/hooks/useBasketFactory";
import { useBasketInfoBatch } from "@/hooks/usePerpReader";
import { BasketShareTokenABI } from "@/abi/contracts";
import { formatUSDC, formatShares, formatCompact } from "@/lib/format";
import { PRICE_PRECISION, USDC_PRECISION } from "@/lib/constants";
import Link from "next/link";
import { motion } from "framer-motion";
import { Wallet, ArrowUpRight } from "lucide-react";
import { type Address } from "viem";

export default function PortfolioPage() {
  const { address, isConnected } = useAccount();
  const { data: baskets, isLoading: basketsLoading } = useAllBaskets();
  const vaultAddresses = (baskets as unknown as Address[]) ?? [];
  const { data: basketInfos, isLoading: infosLoading } = useBasketInfoBatch(vaultAddresses);

  const infos = (basketInfos as unknown as Array<{
    vault: Address;
    shareToken: Address;
    name: string;
    sharePrice: bigint;
  }>) ?? [];

  const balanceQueries = useReadContracts({
    contracts: infos.map((info) => ({
      address: info.shareToken,
      abi: BasketShareTokenABI,
      functionName: "balanceOf" as const,
      args: address ? [address] as const : undefined,
    })),
    query: { enabled: isConnected && infos.length > 0 },
  });

  const isLoading = basketsLoading || infosLoading || balanceQueries.isLoading;

  const holdings = infos.map((info, i) => {
    const balance = balanceQueries.data?.[i]?.result as bigint | undefined;
    const value = balance && info.sharePrice
      ? (balance * info.sharePrice) / PRICE_PRECISION
      : 0n;
    return { ...info, balance: balance ?? 0n, value };
  }).filter((h) => h.balance > 0n);

  const totalValue = holdings.reduce((sum, h) => sum + h.value, 0n);

  if (!isConnected) {
    return (
      <PageWrapper>
        <div className="flex flex-col items-center justify-center py-32">
          <Wallet className="mb-4 h-12 w-12 text-neutral-300" />
          <p className="text-lg font-medium text-neutral-400">Connect your wallet</p>
          <p className="mt-2 text-sm text-neutral-400">
            View your basket holdings by connecting a wallet.
          </p>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-12 text-center"
      >
        <p className="text-sm font-medium text-neutral-400">Portfolio Value</p>
        <p className="mt-1 text-5xl font-semibold tracking-tight text-neutral-900 dark:text-white">
          {isLoading ? (
            <Skeleton className="mx-auto h-14 w-48" />
          ) : (
            formatCompact(Number(totalValue / USDC_PRECISION))
          )}
        </p>
      </motion.div>

      <h2 className="mb-4 text-lg font-semibold text-neutral-900 dark:text-white">
        Holdings
      </h2>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-6">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-5 w-24" />
              </div>
            </Card>
          ))}
        </div>
      ) : holdings.length > 0 ? (
        <div className="space-y-3">
          {holdings.map((h, i) => (
            <motion.div
              key={h.vault}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
            >
              <Link href={`/baskets/${h.vault}`}>
                <Card className="flex items-center justify-between p-6 transition-shadow hover:shadow-md">
                  <div>
                    <p className="font-semibold text-neutral-900 dark:text-white">
                      {h.name || "Basket"}
                    </p>
                    <p className="mt-0.5 text-sm text-neutral-400">
                      {formatShares(h.balance)} shares
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="font-semibold text-neutral-900 dark:text-white">
                        {formatUSDC(h.value)}
                      </p>
                      <p className="text-sm text-neutral-400">
                        {formatUSDC(h.sharePrice)} / share
                      </p>
                    </div>
                    <ArrowUpRight className="h-4 w-4 text-neutral-400" />
                  </div>
                </Card>
              </Link>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="py-20 text-center">
          <p className="text-lg font-medium text-neutral-400">No baskets yet</p>
          <p className="mt-2 text-sm text-neutral-400">
            Deposit into a basket to start building your portfolio.
          </p>
          <Link href="/baskets">
            <Button className="mt-6">Browse Baskets</Button>
          </Link>
        </div>
      )}
    </PageWrapper>
  );
}
