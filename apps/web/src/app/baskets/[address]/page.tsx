"use client";

import { use, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageWrapper } from "@/components/layout/page-wrapper";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoLabel } from "@/components/ui/info-tooltip";
import { DepositRedeemPanel } from "@/components/baskets/deposit-redeem-panel";
import { useBasketInfo, useVaultState } from "@/hooks/usePerpReader";
import {
  useBasketFees,
  useMinReserveBps,
  useRequiredReserveUsdc,
  useAvailableForPerpUsdc,
  useCollectedFees,
  useBasketAssets,
} from "@/hooks/useBasketVault";
import { useOracleAssetMetaMap } from "@/hooks/useOracle";
import {
  type BasketActivityRow,
  useBasketActivitiesQuery,
  useBasketDetailQuery,
} from "@/hooks/subgraph/useSubgraphQueries";
import { useAccount, useChainId, useConfig, usePublicClient, useReadContract, useReadContracts } from "wagmi";
import { BasketShareTokenABI, OracleAdapterABI } from "@/abi/contracts";
import {
  formatUSDC,
  formatBps,
  formatAddress,
  formatAssetId,
  formatPrice,
  formatRelativeTime,
} from "@/lib/format";
import { computeBlendedComposition, type PerpExposureAsset } from "@/lib/blendedComposition";
import { type Address, parseAbiItem } from "viem";
import { motion } from "framer-motion";
import { Copy } from "lucide-react";
import { getContracts } from "@/config/contracts";
import { REFETCH_INTERVAL } from "@/lib/constants";

const HISTORY_PAGE_SIZE = 20;

type HistoryRow = {
  id: string;
  activityType: string;
  timestamp: bigint;
  txHash: `0x${string}`;
  amountUsdc?: bigint;
  size?: bigint;
  pnl?: bigint;
  assetId?: `0x${string}`;
  isLong?: boolean;
};

export default function BasketDetailPage({ params }: { params: Promise<{ address: string }> }) {
  const { address: vaultAddress } = use(params);
  const vault = vaultAddress as Address;
  const { address: userAddress } = useAccount();
  const chainId = useChainId();
  const { oracleAdapter } = getContracts(chainId);

  const { data: info, isLoading } = useBasketInfo(vault);
  const { data: vaultState } = useVaultState(vault);
  const { depositFee, redeemFee } = useBasketFees(vault);
  const { data: minReserveBps } = useMinReserveBps(vault);
  const { data: requiredReserveUsdc } = useRequiredReserveUsdc(vault);
  const { data: availableForPerpUsdc } = useAvailableForPerpUsdc(vault);
  const { data: collectedFees } = useCollectedFees(vault);
  const { data: assetMeta } = useOracleAssetMetaMap();
  const {
    data: onchainBasketAssets,
    isLoading: isOnchainAssetsLoading,
    isFetching: isOnchainAssetsFetching,
  } = useBasketAssets(vault);

  const basketDetail = useBasketDetailQuery(vault, 1, 0);
  const [historySkip, setHistorySkip] = useState(0);
  const subgraphHistory = useBasketActivitiesQuery(vault, HISTORY_PAGE_SIZE, historySkip);
  const fallbackHistory = useVaultHistoryFallback(vault, !subgraphHistory.data && !subgraphHistory.isLoading);

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

  const state = vaultState as { openInterest: bigint } | undefined;
  const subgraphConfiguredAssetIds = (basketDetail.data?.basket?.assets ?? [])
    .filter((asset) => asset.active)
    .map((asset) => asset.assetId);
  const exposures = (basketDetail.data?.basket?.exposures ?? []) as PerpExposureAsset[];
  const onchainConfiguredAssetIds = useMemo(
    () =>
      (onchainBasketAssets ?? [])
        .map((entry) => entry.result as `0x${string}` | undefined)
        .filter((id): id is `0x${string}` => Boolean(id)),
    [onchainBasketAssets]
  );
  const configuredAssetIds = useMemo(
    () =>
      Array.from(
        new Set(
          (onchainConfiguredAssetIds.length > 0 ? onchainConfiguredAssetIds : subgraphConfiguredAssetIds).map((id) =>
            id.toLowerCase()
          )
        )
      ) as `0x${string}`[],
    [onchainConfiguredAssetIds, subgraphConfiguredAssetIds]
  );
  const isConfiguredAssetsLoading =
    (isOnchainAssetsLoading || isOnchainAssetsFetching) &&
    onchainConfiguredAssetIds.length === 0 &&
    subgraphConfiguredAssetIds.length === 0;
  const { data: configuredAssetPriceRows } = useReadContracts({
    contracts: configuredAssetIds.map((assetId) => ({
      address: oracleAdapter,
      abi: OracleAdapterABI,
      functionName: "getPrice" as const,
      args: [assetId] as const,
    })),
    query: {
      enabled: configuredAssetIds.length > 0,
      refetchInterval: REFETCH_INTERVAL,
    },
  });
  const configuredAssetPriceById = useMemo(() => {
    const m = new Map<`0x${string}`, { price: bigint; timestamp: bigint }>();
    configuredAssetIds.forEach((assetId, i) => {
      const row = configuredAssetPriceRows?.[i]?.result as [bigint, bigint] | undefined;
      m.set(assetId, {
        price: row?.[0] ?? 0n,
        timestamp: row?.[1] ?? 0n,
      });
    });
    return m;
  }, [configuredAssetIds, configuredAssetPriceRows]);

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
  const idleUsdc = (basketInfo?.usdcBalance ?? 0n) - ((collectedFees as bigint | undefined) ?? 0n);
  const requiredReserve = (requiredReserveUsdc as bigint | undefined) ?? 0n;
  const availableForPerp = (availableForPerpUsdc as bigint | undefined) ?? 0n;
  const reserveHealthy = idleUsdc >= requiredReserve;

  const blended = computeBlendedComposition(
    basketInfo?.usdcBalance ?? 0n,
    basketInfo?.perpAllocated ?? 0n,
    state?.openInterest ?? 0n,
    exposures
  );
  const hasListedAssets = configuredAssetIds.length > 0;
  const hasExposureRows = exposures.length > 0;
  const hasNonZeroAllocation = blended.assetBlend.some((asset) => asset.blendBps > 0n);
  const hasPerpActivitySignal =
    (state?.openInterest ?? 0n) > 0n ||
    (basketInfo?.perpAllocated ?? 0n) > 0n ||
    hasExposureRows;
  const showAllocatedComposition = hasExposureRows && hasNonZeroAllocation;
  const showAssetsAddedNoPerpActivity = hasListedAssets && !hasPerpActivitySignal;
  const showNoAssetsAllocatedYet =
    hasListedAssets && !showAllocatedComposition && !showAssetsAddedNoPerpActivity;
  const showNoAssetsListedYet = !hasListedAssets && !isConfiguredAssetsLoading;

  const historyRows = (subgraphHistory.data ?? fallbackHistory.data ?? []) as HistoryRow[];
  const canLoadMore = (subgraphHistory.data?.length ?? 0) === HISTORY_PAGE_SIZE;

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
          </motion.div>

          {showAllocatedComposition ? (
            <div className="mt-10">
              <h2 className="mb-4 text-lg font-semibold text-app-text">
                <InfoLabel label="Perp-Driven Composition" tooltipKey="perpDrivenComposition" />
              </h2>
              <Card>
                <div className="divide-y divide-app-border">
                  {blended.assetBlend.map((asset) => (
                    <div key={asset.assetId} className="flex items-center justify-between px-6 py-4">
                      <div>
                        <p className="font-medium text-app-text">{formatAssetId(asset.assetId)}</p>
                        <p className="text-xs text-app-muted">
                          Net: {formatUSDC(asset.netSize >= 0n ? asset.netSize : -asset.netSize)} ({asset.netSize >= 0n ? "Long" : "Short"})
                        </p>
                        <p className="text-xs text-app-muted">
                          Long {formatUSDC(asset.longSize)} / Short {formatUSDC(asset.shortSize)}
                        </p>
                      </div>
                      <div className="w-36">
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-app-bg-subtle">
                          <div
                            className="h-full rounded-full bg-app-accent"
                            style={{ width: `${Number(asset.blendBps) / 100}%` }}
                          />
                        </div>
                        <p className="mt-1 text-right text-xs text-app-muted">{formatBps(asset.blendBps)}</p>
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center justify-between px-6 py-4">
                    <div>
                      <p className="font-medium text-app-text">
                        <InfoLabel label="Aggregate Perp Exposure" tooltipKey="perpExposure" />
                      </p>
                      <p className="text-xs text-app-muted">Open interest sleeve</p>
                    </div>
                    <p className="text-sm text-app-text">{formatBps(blended.perpBlendBps)}</p>
                  </div>
                </div>
              </Card>
            </div>
          ) : showAssetsAddedNoPerpActivity ? (
            <div className="mt-10">
              <Card className="p-6">
                <p className="font-medium text-app-text">Assets added, no perp activity yet</p>
                <p className="mt-1 text-sm text-app-muted">
                  This basket already has configured assets. Perp activity has not started yet.
                </p>
                <div className="mt-4 divide-y divide-app-border rounded-lg border border-app-border">
                  {configuredAssetIds.map((assetId) => {
                    const meta = assetMeta.get(assetId);
                    const priceRow = configuredAssetPriceById.get(assetId);
                    const updatedTs = Number(priceRow?.timestamp ?? 0n);
                    return (
                      <div key={assetId} className="flex items-center justify-between px-4 py-3">
                        <div>
                          <p className="font-medium text-app-text">
                            {meta?.name ?? formatAssetId(assetId)}
                          </p>
                          <p className="font-mono text-xs text-app-muted">
                            {meta?.address ? formatAddress(meta.address) : formatAssetId(assetId)}
                          </p>
                          <p className="text-xs text-app-muted">
                            Price: {formatPrice(priceRow?.price ?? 0n)} · Updated:{" "}
                            {updatedTs > 0 ? formatRelativeTime(updatedTs) : "--"}
                          </p>
                        </div>
                        <p className="text-sm text-app-text">{formatBps(0n)}</p>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          ) : showNoAssetsAllocatedYet ? (
            <div className="mt-10">
              <Card className="p-6">
                <p className="font-medium text-app-text">No assets allocated yet</p>
                <p className="mt-1 text-sm text-app-muted">
                  Assets are configured, but current composition allocation is {formatBps(0n)}.
                </p>
                <div className="mt-4 divide-y divide-app-border rounded-lg border border-app-border">
                  {configuredAssetIds.map((assetId) => {
                    const meta = assetMeta.get(assetId);
                    const priceRow = configuredAssetPriceById.get(assetId);
                    const updatedTs = Number(priceRow?.timestamp ?? 0n);
                    return (
                      <div key={assetId} className="flex items-center justify-between px-4 py-3">
                        <div>
                          <p className="font-medium text-app-text">
                            {meta?.name ?? formatAssetId(assetId)}
                          </p>
                          <p className="font-mono text-xs text-app-muted">
                            {meta?.address ? formatAddress(meta.address) : formatAssetId(assetId)}
                          </p>
                          <p className="text-xs text-app-muted">
                            Price: {formatPrice(priceRow?.price ?? 0n)} · Updated:{" "}
                            {updatedTs > 0 ? formatRelativeTime(updatedTs) : "--"}
                          </p>
                        </div>
                        <p className="text-sm text-app-text">{formatBps(0n)}</p>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          ) : showNoAssetsListedYet ? (
            <div className="mt-10">
              <Card className="p-6">
                <p className="font-medium text-app-text">No assets listed yet</p>
                <p className="mt-1 text-sm text-app-muted">
                  Add assets to this basket to enable per-asset composition tracking.
                </p>
              </Card>
            </div>
          ) : (
            <div className="mt-10">
              <Card className="p-6">
                <p className="font-medium text-app-text">Loading latest asset configuration...</p>
                <p className="mt-1 text-sm text-app-muted">
                  Syncing onchain basket assets before determining composition state.
                </p>
              </Card>
            </div>
          )}

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            <StatCard label="TVL" value={formatUSDC(tvl)} tooltipKey="tvl" />
            <StatCard
              label="Total Shares"
              value={
                basketInfo?.totalSupply
                  ? (Number(basketInfo.totalSupply) / 1e6).toLocaleString()
                  : "0"
              }
              tooltipKey="totalShares"
            />
            <StatCard
              label="Deposit Fee"
              value={depositFee !== undefined ? formatBps(depositFee) : "--"}
              tooltipKey="depositFee"
            />
            <StatCard
              label="Redeem Fee"
              value={redeemFee !== undefined ? formatBps(redeemFee) : "--"}
              tooltipKey="redeemFee"
            />
          </div>

          <div className="mt-6">
            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold text-app-text">
                  <InfoLabel label="Reserve Status" tooltipKey="reserveStatus" />
                </h3>
                <span className={`text-xs font-semibold ${reserveHealthy ? "text-app-success" : "text-app-danger"}`}>
                  {reserveHealthy ? "Healthy" : "Below Target"}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <StatCard label="Target Reserve" value={formatBps((minReserveBps as bigint | undefined) ?? 0n)} tooltipKey="targetReserve" />
                <StatCard label="Required Reserve" value={formatUSDC(requiredReserve)} tooltipKey="requiredReserve" />
                <StatCard label="Idle USDC (ex fees)" value={formatUSDC(idleUsdc > 0n ? idleUsdc : 0n)} tooltipKey="idleUsdcExFees" />
                <StatCard label="Available For Perp" value={formatUSDC(availableForPerp)} tooltipKey="availableForPerp" />
              </div>
            </Card>
          </div>

          <div className="mt-6">
            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold text-app-text">
                  <InfoLabel label="Vault History" tooltipKey="vaultHistory" />
                </h3>
                <span className="text-xs text-app-muted">{historyRows.length} shown</span>
              </div>
              <div className="divide-y divide-app-border">
                {historyRows.length === 0 && (
                  <div className="py-4 text-sm text-app-muted">No vault activity indexed yet.</div>
                )}
                {historyRows.map((row) => (
                  <HistoryRowView key={row.id} row={row} />
                ))}
              </div>
              {subgraphHistory.data && canLoadMore && (
                <button
                  className="mt-4 text-sm font-medium text-app-accent hover:underline"
                  onClick={() => setHistorySkip((s) => s + HISTORY_PAGE_SIZE)}
                >
                  Load more
                </button>
              )}
            </Card>
          </div>
        </div>

        <div className="lg:col-span-2">
          <DepositRedeemPanel
            vault={vault}
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

function useVaultHistoryFallback(vault: Address, enabled: boolean) {
  const publicClient = usePublicClient();
  const chainId = useChainId();
  const { vaultAccounting } = getContracts(chainId);

  return useQuery({
    queryKey: ["vault-history-rpc", chainId, vault],
    enabled: enabled && !!publicClient,
    queryFn: async (): Promise<HistoryRow[]> => {
      if (!publicClient) return [];

      const [deposits, redeems, allocations, withdrawals, opens, closes, pnls] = await Promise.all([
        publicClient.getLogs({
          address: vault,
          event: parseAbiItem("event Deposited(address indexed user, uint256 usdcAmount, uint256 sharesMinted)"),
          fromBlock: 0n,
          toBlock: "latest",
        }),
        publicClient.getLogs({
          address: vault,
          event: parseAbiItem("event Redeemed(address indexed user, uint256 sharesBurned, uint256 usdcReturned)"),
          fromBlock: 0n,
          toBlock: "latest",
        }),
        publicClient.getLogs({
          address: vault,
          event: parseAbiItem("event AllocatedToPerp(uint256 amount)"),
          fromBlock: 0n,
          toBlock: "latest",
        }),
        publicClient.getLogs({
          address: vault,
          event: parseAbiItem("event WithdrawnFromPerp(uint256 amount)"),
          fromBlock: 0n,
          toBlock: "latest",
        }),
        publicClient.getLogs({
          address: vaultAccounting,
          event: parseAbiItem(
            "event PositionOpened(address indexed vault, bytes32 indexed asset, bool isLong, uint256 size, uint256 collateral)"
          ),
          args: { vault },
          fromBlock: 0n,
          toBlock: "latest",
        }),
        publicClient.getLogs({
          address: vaultAccounting,
          event: parseAbiItem(
            "event PositionClosed(address indexed vault, bytes32 indexed asset, bool isLong, int256 realisedPnL)"
          ),
          args: { vault },
          fromBlock: 0n,
          toBlock: "latest",
        }),
        publicClient.getLogs({
          address: vaultAccounting,
          event: parseAbiItem("event PnLRealized(address indexed vault, int256 amount)"),
          args: { vault },
          fromBlock: 0n,
          toBlock: "latest",
        }),
      ]);

      const rows: HistoryRow[] = [];

      for (const l of deposits) {
        rows.push({
          id: `${l.transactionHash}-${l.logIndex}`,
          activityType: "deposit",
          timestamp: 0n,
          txHash: l.transactionHash,
          amountUsdc: l.args.usdcAmount,
        });
      }
      for (const l of redeems) {
        rows.push({
          id: `${l.transactionHash}-${l.logIndex}`,
          activityType: "redeem",
          timestamp: 0n,
          txHash: l.transactionHash,
          amountUsdc: l.args.usdcReturned,
        });
      }
      for (const l of allocations) {
        rows.push({
          id: `${l.transactionHash}-${l.logIndex}`,
          activityType: "allocateToPerp",
          timestamp: 0n,
          txHash: l.transactionHash,
          amountUsdc: l.args.amount,
        });
      }
      for (const l of withdrawals) {
        rows.push({
          id: `${l.transactionHash}-${l.logIndex}`,
          activityType: "withdrawFromPerp",
          timestamp: 0n,
          txHash: l.transactionHash,
          amountUsdc: l.args.amount,
        });
      }
      for (const l of opens) {
        rows.push({
          id: `${l.transactionHash}-${l.logIndex}`,
          activityType: "positionOpened",
          timestamp: 0n,
          txHash: l.transactionHash,
          size: l.args.size,
          amountUsdc: l.args.collateral,
          assetId: l.args.asset,
          isLong: l.args.isLong,
        });
      }
      for (const l of closes) {
        rows.push({
          id: `${l.transactionHash}-${l.logIndex}`,
          activityType: "positionClosed",
          timestamp: 0n,
          txHash: l.transactionHash,
          pnl: l.args.realisedPnL,
          assetId: l.args.asset,
          isLong: l.args.isLong,
        });
      }
      for (const l of pnls) {
        rows.push({
          id: `${l.transactionHash}-${l.logIndex}`,
          activityType: "pnlRealized",
          timestamp: 0n,
          txHash: l.transactionHash,
          pnl: l.args.amount,
        });
      }

      const blockNumbers = Array.from(new Set([...deposits, ...redeems, ...allocations, ...withdrawals, ...opens, ...closes, ...pnls].map((l) => l.blockNumber)));
      const blocks = await Promise.all(blockNumbers.map((blockNumber) => publicClient.getBlock({ blockNumber })));
      const tsByBlock = new Map(blocks.map((b) => [b.number, b.timestamp]));

      const logEntries = [
        ...deposits,
        ...redeems,
        ...allocations,
        ...withdrawals,
        ...opens,
        ...closes,
        ...pnls,
      ];

      for (const row of rows) {
        const log = logEntries.find((entry) => `${entry.transactionHash}-${entry.logIndex}` === row.id);
        if (log) {
          row.timestamp = tsByBlock.get(log.blockNumber) ?? 0n;
        }
      }

      rows.sort((a, b) => Number(b.timestamp - a.timestamp));
      return rows.slice(0, HISTORY_PAGE_SIZE);
    },
    staleTime: 15_000,
    retry: 1,
  });
}

function HistoryRowView({ row }: { row: HistoryRow | BasketActivityRow }) {
  const config = useConfig();
  const chainId = useChainId();
  const explorer = config.chains.find((c) => c.id === chainId)?.blockExplorers?.default?.url;
  const txHref = explorer ? `${explorer}/tx/${row.txHash}` : "#";

  return (
    <div className="flex items-center justify-between py-3 text-sm">
      <div>
        <p className="font-medium text-app-text">{row.activityType}</p>
        <p className="text-xs text-app-muted">
          {new Date(Number(row.timestamp) * 1000).toLocaleString()} {row.assetId ? `• ${formatAssetId(row.assetId)}` : ""}
        </p>
      </div>
      <div className="text-right">
        <p className="font-mono text-app-text">
          {row.amountUsdc !== undefined
            ? formatUSDC(row.amountUsdc)
            : row.size !== undefined
              ? formatUSDC(row.size)
              : row.pnl !== undefined
                ? formatUSDC(row.pnl >= 0n ? row.pnl : -row.pnl)
                : "--"}
        </p>
        <a
          className="font-mono text-xs text-app-accent hover:underline"
          href={txHref}
          target="_blank"
          rel="noreferrer"
        >
          {`${row.txHash.slice(0, 6)}...${row.txHash.slice(-4)}`}
        </a>
      </div>
    </div>
  );
}
