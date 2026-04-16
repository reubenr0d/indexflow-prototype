"use client";

import { useMemo } from "react";
import { PageWrapper } from "@/components/layout/page-wrapper";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { InfoLabel } from "@/components/ui/info-tooltip";
import { useAccount, usePublicClient, useReadContracts } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { useAllBaskets } from "@/hooks/useBasketFactory";
import { useBasketInfoBatch, useVaultStateBatch } from "@/hooks/usePerpReader";
import { useUserPortfolioQuery } from "@/hooks/subgraph/useUserPortfolio";
import { useMultiChainPortfolio } from "@/hooks/useMultiChainPortfolio";
import { useBasketTrendSnapshots } from "@/hooks/subgraph/useBasketTrends";
import { CHAIN_META } from "@/components/chains/chain-icons";
import { BasketShareTokenABI } from "@/abi/BasketShareToken";
import { formatUSDC, formatShares, formatCompact, formatBps } from "@/lib/format";
import { computeApy, formatApy } from "@/lib/apy";
import { PRICE_PRECISION, USDC_PRECISION } from "@/lib/constants";
import { computeBlendedComposition } from "@/lib/blendedComposition";
import { useDeploymentTarget } from "@/providers/DeploymentProvider";
import Link from "next/link";
import { motion } from "framer-motion";
import { Wallet, ArrowUpRight, TrendingUp, TrendingDown } from "lucide-react";
import { type Address, parseAbiItem } from "viem";

function useUserCostBasisFallback(vaults: Address[], userAddress: Address | undefined, enabled: boolean) {
  const { chainId } = useDeploymentTarget();
  const publicClient = usePublicClient({ chainId });

  return useQuery({
    queryKey: ["user-cost-basis-rpc", chainId, userAddress, vaults.join(",")],
    enabled: enabled && !!publicClient && !!userAddress && vaults.length > 0,
    queryFn: async (): Promise<Map<Address, bigint>> => {
      if (!publicClient || !userAddress) return new Map();

      const results = await Promise.all(
        vaults.map(async (vault) => {
          const [deposits, redeems] = await Promise.all([
            publicClient.getLogs({
              address: vault,
              event: parseAbiItem("event Deposited(address indexed user, uint256 usdcAmount, uint256 sharesMinted)"),
              args: { user: userAddress },
              fromBlock: 0n,
              toBlock: "latest",
            }),
            publicClient.getLogs({
              address: vault,
              event: parseAbiItem("event Redeemed(address indexed user, uint256 sharesBurned, uint256 usdcReturned)"),
              args: { user: userAddress },
              fromBlock: 0n,
              toBlock: "latest",
            }),
          ]);

          const totalDeposited = deposits.reduce((sum, l) => sum + (l.args.usdcAmount ?? 0n), 0n);
          const totalRedeemed = redeems.reduce((sum, l) => sum + (l.args.usdcReturned ?? 0n), 0n);
          return [vault, totalDeposited - totalRedeemed] as const;
        })
      );

      return new Map(results);
    },
    staleTime: 30_000,
    retry: 1,
  });
}

export default function PortfolioPage() {
  const { address, isConnected } = useAccount();
  const { viewMode } = useDeploymentTarget();
  const isAllChains = viewMode === "all";
  const multiChainPortfolio = useMultiChainPortfolio(address);
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

  const multiHoldings = isAllChains && multiChainPortfolio.data
    ? multiChainPortfolio.data.holdings.map((h) => ({
        vault: h.vault,
        name: h.name,
        sharePrice: h.sharePrice,
        balance: h.shareBalance,
        value: h.valueUsdc,
        chainId: h.chainId,
      }))
    : null;

  const isLoading = isAllChains
    ? multiChainPortfolio.isLoading
    : hasRpcHoldings ? rpcIsLoading : hasSubgraphData ? subgraph.isLoading : rpcIsLoading;

  const holdings: Array<{ vault: Address | string; name: string; sharePrice: bigint; balance: bigint; value: bigint; chainId?: number }> = multiHoldings
    ?? (hasRpcHoldings
      ? rpcHoldings
      : hasSubgraphData
      ? (subgraphData?.holdings ?? []).map((h) => ({
          vault: h.vault,
          name: h.name,
          sharePrice: h.sharePrice,
          balance: h.shareBalance,
          value: h.valueUsdc,
        }))
      : rpcHoldings);

  const totalValue = isAllChains
    ? (multiChainPortfolio.data?.totalValueUsdc ?? 0n)
    : hasRpcHoldings
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

  const holdingVaults = useMemo(() => holdings.map((h) => h.vault as Address), [holdings]);
  const shouldUseCostBasisFallback =
    !subgraph.isLoading && (subgraph.isError || !subgraphData || (subgraphData.holdings ?? []).length === 0);
  const costBasisFallback = useUserCostBasisFallback(holdingVaults, address, shouldUseCostBasisFallback);

  const costBasisByVault = useMemo(() => {
    if (hasSubgraphData && subgraphData?.holdings) {
      const m = new Map<string, bigint>();
      for (const h of subgraphData.holdings) {
        m.set(h.vault, h.netDepositedUsdc - h.netRedeemedUsdc);
      }
      return m;
    }
    return costBasisFallback.data ?? new Map<string, bigint>();
  }, [costBasisFallback.data, hasSubgraphData, subgraphData]);

  const totalCostBasis = useMemo(
    () => holdings.reduce((sum, h) => sum + (costBasisByVault.get(h.vault) ?? 0n), 0n),
    [costBasisByVault, holdings]
  );
  const totalPnL = totalValue - totalCostBasis;
  const totalRoiPct = totalCostBasis > 0n ? Number((totalPnL * 10000n) / totalCostBasis) / 100 : 0;

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
        {!isLoading && totalCostBasis > 0n && (
          <div className="mt-3 flex items-center justify-center gap-4 text-sm">
            <span className="text-app-muted">Cost basis {formatUSDC(totalCostBasis)}</span>
            <span className={totalPnL >= 0n ? "text-app-success" : "text-app-danger"}>
              {totalPnL >= 0n ? <TrendingUp className="mr-1 inline h-3.5 w-3.5" /> : <TrendingDown className="mr-1 inline h-3.5 w-3.5" />}
              {totalPnL >= 0n ? "+" : "-"}{formatUSDC(totalPnL >= 0n ? totalPnL : -totalPnL)} ({totalRoiPct >= 0 ? "+" : ""}{totalRoiPct.toFixed(2)}%)
            </span>
          </div>
        )}
      </motion.div>

      <h2 className="mb-4 text-lg font-semibold text-app-text">
        <InfoLabel label="Holdings" tooltipKey="holdings" />
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
          {holdings.map((h, i) => {
              const info = infoByVault.get(h.vault as Address);
              const perpBlendBps = computeBlendedComposition(
                info?.usdcBalance ?? 0n,
                info?.perpAllocated ?? 0n,
                openInterestByVault.get(h.vault as Address) ?? 0n,
                []
              ).perpBlendBps;
              const holdingCostBasis = costBasisByVault.get(h.vault) ?? 0n;
              const holdingPnL = h.value - holdingCostBasis;
              const holdingRoiPct = holdingCostBasis > 0n ? Number((holdingPnL * 10000n) / holdingCostBasis) / 100 : 0;
              return (
            <HoldingCard
              key={`${h.chainId ?? "default"}-${h.vault}`}
              vault={h.vault as Address}
              name={h.name}
              balance={h.balance}
              value={h.value}
              sharePrice={h.sharePrice}
              holdingCostBasis={holdingCostBasis}
              holdingPnL={holdingPnL}
              holdingRoiPct={holdingRoiPct}
              perpBlendBps={perpBlendBps}
              index={i}
              chainId={h.chainId}
            />
              );
          })}
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

function HoldingCard({
  vault,
  name,
  balance,
  value,
  sharePrice,
  holdingCostBasis,
  holdingPnL,
  holdingRoiPct,
  perpBlendBps,
  index,
  chainId,
}: {
  vault: Address;
  name: string;
  balance: bigint;
  value: bigint;
  sharePrice: bigint;
  holdingCostBasis: bigint;
  holdingPnL: bigint;
  holdingRoiPct: number;
  perpBlendBps: bigint;
  index: number;
  chainId?: number;
}) {
  const chainMeta = chainId != null ? CHAIN_META[String(chainId)] : undefined;
  const ChainIcon = chainMeta?.icon;
  const { data: trendData } = useBasketTrendSnapshots(vault);
  const apy =
    trendData?.week?.current && trendData?.week?.previous
      ? computeApy(trendData.week.current.sharePrice, trendData.week.previous.sharePrice, 7)
      : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
    >
      <Link href={`/baskets/${vault}`}>
        <Card className="flex items-center justify-between p-6 transition-shadow hover:shadow-md">
          <div>
            <div className="flex items-center gap-2">
              {ChainIcon && (
                <span title={chainMeta?.name}>
                  <ChainIcon size={16} />
                </span>
              )}
              <p className="font-semibold text-app-text">
                <InfoLabel label={name || "Basket"} tooltipKey="tableName" />
              </p>
            </div>
            <p className="mt-0.5 text-sm text-app-muted">
              {formatShares(balance)} shares
            </p>
            {holdingCostBasis > 0n && (
              <p className="mt-0.5 text-xs text-app-muted">
                Cost basis {formatUSDC(holdingCostBasis)}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="font-semibold text-app-text">
                {formatUSDC(value)}
              </p>
              {holdingCostBasis > 0n && (
                <p className={`text-sm font-medium ${holdingPnL >= 0n ? "text-app-success" : "text-app-danger"}`}>
                  {holdingPnL >= 0n ? "+" : "-"}{formatUSDC(holdingPnL >= 0n ? holdingPnL : -holdingPnL)} ({holdingRoiPct >= 0 ? "+" : ""}{holdingRoiPct.toFixed(2)}%)
                </p>
              )}
              <p className={`text-xs font-semibold ${apy !== null && apy > 0 ? "text-app-success" : apy !== null && apy < 0 ? "text-app-danger" : "text-app-muted"}`}>
                APY {formatApy(apy)}
              </p>
              <p className="text-xs text-app-muted">
                {formatUSDC(sharePrice)} / share
              </p>
              <p className="text-xs text-app-muted">Perp sleeve {formatBps(perpBlendBps)}</p>
            </div>
            <ArrowUpRight className="h-4 w-4 text-app-muted" />
          </div>
        </Card>
      </Link>
    </motion.div>
  );
}
