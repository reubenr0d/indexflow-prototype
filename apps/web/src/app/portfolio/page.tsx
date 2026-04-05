"use client";

import { PageWrapper } from "@/components/layout/page-wrapper";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useAccount, useReadContracts } from "wagmi";
import { useAllBaskets } from "@/hooks/useBasketFactory";
import { useBasketInfoBatch, useVaultStateBatch } from "@/hooks/usePerpReader";
import { useUserPortfolioQuery } from "@/hooks/subgraph/useSubgraphQueries";
import { BasketShareTokenABI } from "@/abi/contracts";
import { formatUSDC, formatShares, formatCompact, formatBps } from "@/lib/format";
import { PRICE_PRECISION, USDC_PRECISION } from "@/lib/constants";
import { computeBlendedComposition } from "@/lib/blendedComposition";
import Link from "next/link";
import { motion } from "framer-motion";
import { Wallet, ArrowUpRight } from "lucide-react";
import { type Address } from "viem";

export default function PortfolioPage() {
  const { address, isConnected } = useAccount();
  const subgraph = useUserPortfolioQuery(address);
  const { data: baskets, isLoading: basketsLoading } = useAllBaskets();
  const vaultAddresses = (baskets as unknown as Address[]) ?? [];
  const { data: basketInfos, isLoading: infosLoading } = useBasketInfoBatch(vaultAddresses);
  const { data: vaultStates } = useVaultStateBatch(vaultAddresses);

  const infos = (basketInfos as unknown as Array<{
    vault: Address;
    shareToken: Address;
    name: string;
    sharePrice: bigint;
    usdcBalance: bigint;
    perpAllocated: bigint;
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

  const hasSubgraphData = Boolean(subgraph.data && !subgraph.isError);
  const subgraphData = hasSubgraphData ? subgraph.data : null;
  const rpcIsLoading = basketsLoading || infosLoading || balanceQueries.isLoading;

  const rpcHoldings = infos
    .map((info, i) => {
      const balance = balanceQueries.data?.[i]?.result as bigint | undefined;
      const value = balance && info.sharePrice ? (balance * info.sharePrice) / PRICE_PRECISION : 0n;
      return { ...info, balance: balance ?? 0n, value };
    })
    .filter((h) => h.balance > 0n);

  const hasRpcHoldings = rpcHoldings.length > 0;
  const isLoading = hasRpcHoldings ? rpcIsLoading : hasSubgraphData ? subgraph.isLoading : rpcIsLoading;

  const holdings = hasRpcHoldings
    ? rpcHoldings
    : hasSubgraphData
    ? (subgraphData?.holdings ?? []).map((h) => ({
        vault: h.vault,
        name: h.name,
        sharePrice: h.sharePrice,
        balance: h.shareBalance,
        value: h.valueUsdc,
      }))
    : rpcHoldings;

  const totalValue = hasRpcHoldings
    ? rpcHoldings.reduce((sum, h) => sum + h.value, 0n)
    : hasSubgraphData
      ? (subgraphData?.totalValueUsdc ?? 0n)
      : rpcHoldings.reduce((sum, h) => sum + h.value, 0n);

  const infoByVault = new Map(infos.map((info) => [info.vault, info]));
  const openInterestByVault = new Map(
    ((vaultStates as Array<{ result?: { openInterest: bigint }; status: string }> | undefined) ?? []).map((s, i) => [
      vaultAddresses[i],
      s.status === "success" ? s.result?.openInterest ?? 0n : 0n,
    ])
  );

  if (!isConnected) {
    return (
      <PageWrapper>
        <div className="flex flex-col items-center justify-center py-32">
          <Wallet className="mb-4 h-12 w-12 text-app-border-strong" />
          <p className="text-lg font-medium text-app-muted">Connect your wallet</p>
          <p className="mt-2 text-sm text-app-muted">
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
        <p className="text-sm font-medium text-app-muted">Portfolio Value</p>
        <div className="mt-1 text-5xl font-semibold tracking-tight text-app-text">
          {isLoading ? (
            <Skeleton className="mx-auto h-14 w-48" />
          ) : (
            formatCompact(Number(totalValue / USDC_PRECISION))
          )}
        </div>
      </motion.div>

      <h2 className="mb-4 text-lg font-semibold text-app-text">
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
            (() => {
              const info = infoByVault.get(h.vault as Address);
              const perpBlendBps = computeBlendedComposition(
                info?.usdcBalance ?? 0n,
                info?.perpAllocated ?? 0n,
                openInterestByVault.get(h.vault as Address) ?? 0n,
                []
              ).perpBlendBps;
              return (
            <motion.div
              key={h.vault}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
            >
              <Link href={`/baskets/${h.vault}`}>
                <Card className="flex items-center justify-between p-6 transition-shadow hover:shadow-md">
                  <div>
                    <p className="font-semibold text-app-text">
                      {h.name || "Basket"}
                    </p>
                    <p className="mt-0.5 text-sm text-app-muted">
                      {formatShares(h.balance)} shares
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="font-semibold text-app-text">
                        {formatUSDC(h.value)}
                      </p>
                      <p className="text-sm text-app-muted">
                        {formatUSDC(h.sharePrice)} / share
                      </p>
                      <p className="text-xs text-app-muted">Perp sleeve {formatBps(perpBlendBps)}</p>
                    </div>
                    <ArrowUpRight className="h-4 w-4 text-app-muted" />
                  </div>
                </Card>
              </Link>
            </motion.div>
              );
            })()
          ))}
        </div>
      ) : (
        <div className="py-20 text-center">
          <p className="text-lg font-medium text-app-muted">No baskets yet</p>
          <p className="mt-2 text-sm text-app-muted">
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
