"use client";

import { use } from "react";
import { PageWrapper } from "@/components/layout/page-wrapper";
import { Card, CardContent } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { StatusDot, getOracleStatus } from "@/components/ui/status-dot";
import { Skeleton } from "@/components/ui/skeleton";
import { DepositRedeemPanel } from "@/components/baskets/deposit-redeem-panel";
import { useBasketInfo } from "@/hooks/usePerpReader";
import { useBasketAssets, useBasketFees } from "@/hooks/useBasketVault";
import { useOracleAssetPrice, useOracleIsStale } from "@/hooks/useOracle";
import { useAccount } from "wagmi";
import { useReadContract } from "wagmi";
import { BasketShareTokenABI } from "@/abi/contracts";
import { formatUSDC, formatBps, formatAddress, formatAssetId, formatPrice } from "@/lib/format";
import { type Address } from "viem";
import { motion } from "framer-motion";
import { Copy, ExternalLink } from "lucide-react";

export default function BasketDetailPage({ params }: { params: Promise<{ address: string }> }) {
  const { address: vaultAddress } = use(params);
  const vault = vaultAddress as Address;
  const { address: userAddress } = useAccount();

  const { data: info, isLoading } = useBasketInfo(vault);
  const { data: assetsData } = useBasketAssets(vault);
  const { depositFee, redeemFee } = useBasketFees(vault);

  const basketInfo = info as {
    vault: Address;
    shareToken: Address;
    name: string;
    basketPrice: bigint;
    sharePrice: bigint;
    totalSupply: bigint;
    usdcBalance: bigint;
    perpAllocated: bigint;
    assetCount: bigint;
  } | undefined;

  const { data: shareBalance } = useReadContract({
    address: basketInfo?.shareToken,
    abi: BasketShareTokenABI,
    functionName: "balanceOf",
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: !!userAddress && !!basketInfo?.shareToken },
  });

  const tvl = basketInfo
    ? (basketInfo.usdcBalance ?? 0n) + (basketInfo.perpAllocated ?? 0n)
    : 0n;

  const assets = assetsData
    ? (assetsData as unknown as Array<{ result?: [string, bigint]; status: string }>)
        .filter((a) => a.status === "success" && a.result)
        .map((a) => ({
          assetId: a.result![0] as `0x${string}`,
          weightBps: a.result![1],
        }))
    : [];

  if (isLoading) {
    return (
      <PageWrapper>
        <div className="grid gap-8 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <Skeleton className="mb-2 h-8 w-48" />
            <Skeleton className="mb-6 h-4 w-32" />
            <Skeleton className="mb-8 h-12 w-36" />
            <Skeleton className="h-64 w-full" />
          </div>
          <div className="lg:col-span-2">
            <Skeleton className="h-80 w-full rounded-2xl" />
          </div>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <div className="grid gap-8 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <h1 className="text-3xl font-semibold tracking-tight text-app-text">
              {basketInfo?.name || "Basket"}
            </h1>
            {basketInfo?.shareToken && (
              <p className="mt-1 flex items-center gap-2 font-mono text-sm text-app-muted">
                {formatAddress(basketInfo.shareToken)}
                <button
                  onClick={() => navigator.clipboard.writeText(basketInfo.shareToken)}
                  className="text-app-muted hover:text-app-text"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </p>
            )}

            <div className="mt-6 flex items-baseline gap-3">
              <p className="text-4xl font-semibold tracking-tight text-app-text">
                {formatPrice(basketInfo?.sharePrice ?? 0n)}
              </p>
              <span className="text-sm text-app-muted">share price</span>
            </div>
            <p className="mt-1 text-sm text-app-muted">
              Basket price: {formatPrice(basketInfo?.basketPrice ?? 0n)}
            </p>
          </motion.div>

          <div className="mt-10">
            <h2 className="mb-4 text-lg font-semibold text-app-text">
              Composition
            </h2>
            <Card>
              <div className="divide-y divide-app-border">
                {assets.map((asset) => (
                  <AssetRow key={asset.assetId} assetId={asset.assetId} weightBps={asset.weightBps} />
                ))}
                {assets.length === 0 && (
                  <div className="p-6 text-center text-sm text-app-muted">
                    No assets configured
                  </div>
                )}
              </div>
            </Card>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            <StatCard label="TVL" value={formatUSDC(tvl)} />
            <StatCard
              label="Total Shares"
              value={
                basketInfo?.totalSupply
                  ? (Number(basketInfo.totalSupply) / 1e6).toLocaleString()
                  : "0"
              }
            />
            <StatCard
              label="Deposit Fee"
              value={depositFee !== undefined ? formatBps(depositFee) : "--"}
            />
            <StatCard
              label="Redeem Fee"
              value={redeemFee !== undefined ? formatBps(redeemFee) : "--"}
            />
          </div>
        </div>

        <div className="lg:col-span-2">
          <DepositRedeemPanel
            vault={vault}
            basketPrice={basketInfo?.basketPrice ?? 0n}
            sharePrice={basketInfo?.sharePrice ?? 0n}
            depositFeeBps={depositFee ?? 0n}
            redeemFeeBps={redeemFee ?? 0n}
            shareBalance={shareBalance as bigint | undefined}
          />
        </div>
      </div>
    </PageWrapper>
  );
}

function AssetRow({ assetId, weightBps }: { assetId: `0x${string}`; weightBps: bigint }) {
  const { data: priceData } = useOracleAssetPrice(assetId);
  const { data: isStale } = useOracleIsStale(assetId);

  const price = (priceData as [bigint, bigint] | undefined)?.[0] ?? 0n;
  const timestamp = Number((priceData as [bigint, bigint] | undefined)?.[1] ?? 0n);
  const status = getOracleStatus(isStale as boolean ?? false, timestamp);

  return (
    <div className="flex items-center justify-between px-6 py-4">
      <div className="flex items-center gap-3">
        <StatusDot status={status} />
        <span className="font-medium text-app-text">
          {formatAssetId(assetId)}
        </span>
      </div>
      <div className="flex items-center gap-6">
        <div className="w-32">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-app-bg-subtle">
            <div
              className="h-full rounded-full bg-app-accent"
              style={{ width: `${Number(weightBps) / 100}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-app-muted">{formatBps(weightBps)}</p>
        </div>
        <p className="w-24 text-right font-mono text-sm text-app-text">
          {formatPrice(price)}
        </p>
      </div>
    </div>
  );
}
