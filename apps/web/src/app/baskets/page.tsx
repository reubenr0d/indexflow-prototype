"use client";

import { useMemo, useState } from "react";
import { useReadContracts } from "wagmi";
import { type Address } from "viem";
import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { BasketVaultABI } from "@/abi/BasketVault";
import { BasketCard } from "@/components/baskets/basket-card";
import {
  getBasketSortTimestamp,
  getBasketTvl,
  getHighTvlThreshold,
  matchesBasketFilters,
  type BasketListFilterKey,
  type BasketListItem,
} from "@/components/baskets/basket-list-utils";
import { BasketIcon } from "@/components/baskets/basket-icons";
import { PageWrapper } from "@/components/layout/page-wrapper";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FilterChipGroup } from "@/components/ui/filter-chip-group";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { useAllBaskets } from "@/hooks/useBasketFactory";
import { useBasketInfoBatch, useVaultStateBatch } from "@/hooks/usePerpReader";
import { useBasketsOverviewQuery } from "@/hooks/subgraph/useBasketOverview";
import { useMultiChainBaskets } from "@/hooks/useMultiChainBaskets";
import { computeBlendedComposition } from "@/lib/blendedComposition";
import { useDeploymentTarget } from "@/providers/DeploymentProvider";
import { type ComponentType } from "react";

type SortKey = "tvl" | "price" | "newest";

const FILTER_OPTIONS: Array<{
  value: BasketListFilterKey;
  label: string;
  icon: ComponentType<{ className?: string }>;
}> = [
  { value: "hasPerp", label: "Has Perp", icon: ({ className }) => <BasketIcon name="hasPerp" className={className} /> },
  { value: "noPerp", label: "No Perp", icon: ({ className }) => <BasketIcon name="noPerp" className={className} /> },
  { value: "lowFee", label: "Low Fee", icon: ({ className }) => <BasketIcon name="lowFee" className={className} /> },
  { value: "highTvl", label: "High TVL", icon: ({ className }) => <BasketIcon name="highTvl" className={className} /> },
];

type BasketInfoRow = BasketListItem;

export default function BasketsPage() {
  const [sort, setSort] = useState<SortKey>("tvl");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Set<BasketListFilterKey>>(new Set());
  const { isSubgraphEnabled, viewMode } = useDeploymentTarget();
  const isAllChains = viewMode === "all";

  const multiChain = useMultiChainBaskets();
  const subgraph = useBasketsOverviewQuery({ first: 500, skip: 0 });
  const { data: baskets, isLoading: basketsLoading } = useAllBaskets();
  const vaultAddresses = useMemo(() => (baskets as unknown as Address[]) ?? [], [baskets]);
  const { data: basketInfos, isLoading: infosLoading } = useBasketInfoBatch(vaultAddresses);
  const { data: vaultStates, isLoading: vaultStatesLoading } = useVaultStateBatch(vaultAddresses);
  const { data: feeRows, isLoading: feesLoading } = useReadContracts({
    contracts: vaultAddresses.map((vault) => ({
      address: vault,
      abi: BasketVaultABI,
      functionName: "depositFeeBps" as const,
    })),
    query: { enabled: vaultAddresses.length > 0 },
  });

  const subgraphData = useMemo(
    () => (Array.isArray(subgraph.data) ? subgraph.data : []),
    [subgraph.data]
  );

  const rpcInfos = useMemo(
    () =>
      ((basketInfos as unknown as Array<{
        vault: Address;
        name: string;
        sharePrice: bigint;
        basketPrice: bigint;
        totalSupply: bigint;
        usdcBalance: bigint;
        perpAllocated: bigint;
        assetCount: bigint;
      }>) ?? []),
    [basketInfos]
  );
  const hasRpcData = rpcInfos.length > 0;
  const shouldUseRpcFallback =
    !isSubgraphEnabled || subgraph.isError || (subgraph.isSuccess && subgraphData.length === 0 && hasRpcData);

  const infoRows = useMemo<(BasketInfoRow & { chainId?: number })[]>(() => {
    if (isAllChains && multiChain.data) {
      return multiChain.data.map((item) => ({
        vault: item.vault,
        name: item.name,
        sharePrice: item.sharePrice,
        basketPrice: item.basketPrice,
        totalSupply: item.totalSupply,
        usdcBalance: item.usdcBalance,
        perpAllocated: item.perpAllocated,
        assetCount: Number(item.assetCount ?? 0n),
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        chainId: item.chainId,
      }));
    }
    return shouldUseRpcFallback
      ? rpcInfos.map((item) => ({
          vault: item.vault,
          name: item.name,
          sharePrice: item.sharePrice,
          basketPrice: item.basketPrice,
          totalSupply: item.totalSupply,
          usdcBalance: item.usdcBalance,
          perpAllocated: item.perpAllocated,
          assetCount: Number(item.assetCount ?? 0n),
        }))
      : subgraphData.map((item) => ({
          vault: item.vault,
          name: item.name,
          sharePrice: item.sharePrice,
          basketPrice: item.basketPrice,
          totalSupply: item.totalSupply,
          usdcBalance: item.usdcBalance,
          perpAllocated: item.perpAllocated,
          assetCount: Number(item.assetCount ?? 0n),
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        }));
  }, [isAllChains, multiChain.data, rpcInfos, shouldUseRpcFallback, subgraphData]);

  const openInterestByVault = useMemo(() => {
    const states = (vaultStates as Array<{ result?: { openInterest: bigint }; status: string }> | undefined) ?? [];
    return new Map(
      vaultAddresses.map((vault, i) => [
        vault,
        states[i]?.status === "success" ? states[i]?.result?.openInterest ?? 0n : 0n,
      ])
    );
  }, [vaultAddresses, vaultStates]);

  const feeByVault = useMemo(() => {
    const rows = (feeRows as Array<{ result?: bigint; status: string }> | undefined) ?? [];
    return new Map(
      vaultAddresses.map((vault, i) => [
        vault,
        rows[i]?.status === "success" ? rows[i]?.result : undefined,
      ])
    );
  }, [feeRows, vaultAddresses]);

  const rows = useMemo(
    () =>
      infoRows.map((info) => ({
        ...info,
        depositFeeBps: feeByVault.get(info.vault),
        openInterest: openInterestByVault.get(info.vault) ?? 0n,
      })),
    [feeByVault, infoRows, openInterestByVault]
  );

  const highTvlThreshold = useMemo(() => getHighTvlThreshold(rows), [rows]);
  const searchTerm = search.trim().toLowerCase();

  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        const matchesSearch = !searchTerm || row.name.toLowerCase().includes(searchTerm);
        return matchesSearch && matchesBasketFilters(row, filters, highTvlThreshold);
      }),
    [filters, highTvlThreshold, rows, searchTerm]
  );

  const sortedRows = useMemo(() => {
    const items = [...filteredRows];
    items.sort((a, b) => {
      if (sort === "tvl") {
        return getBasketTvl(b) > getBasketTvl(a) ? 1 : -1;
      }
      if (sort === "price") {
        return (b.sharePrice ?? 0n) > (a.sharePrice ?? 0n) ? 1 : -1;
      }
      return getBasketSortTimestamp(b) > getBasketSortTimestamp(a) ? 1 : -1;
    });
    return items;
  }, [filteredRows, sort]);

  const isLoading = isAllChains
    ? multiChain.isLoading
    : (shouldUseRpcFallback ? basketsLoading || infosLoading : subgraph.isLoading) ||
      vaultStatesLoading ||
      feesLoading;

  const toggleFilter = (value: BasketListFilterKey) => {
    setFilters((current) => {
      const next = new Set(current);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  return (
    <PageWrapper>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-semibold tracking-tight text-app-text">Baskets</h1>
        <Link href="/admin/baskets">
          <Button size="md">
            <Plus className="mr-2 h-4 w-4" />
            Create Basket
          </Button>
        </Link>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-app-muted" />
              <Input
                placeholder="Search baskets..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10"
              />
            </div>
            <div className="flex items-center gap-2">
              {filters.size > 0 && (
                <button
                  type="button"
                  onClick={() => setFilters(new Set())}
                  className="text-sm font-medium text-app-muted hover:text-app-text"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>

          <FilterChipGroup
            ariaLabel="Basket quick filters"
            options={FILTER_OPTIONS}
            selected={filters}
            onToggle={toggleFilter}
          />
        </div>

        <SegmentedControl
          options={[
            { value: "tvl", label: "TVL" },
            { value: "price", label: "Price" },
            { value: "newest", label: "Newest" },
          ]}
          value={sort}
          onChange={setSort}
          ariaLabel="Basket sort order"
        />
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="p-6">
              <Skeleton className="mb-4 h-5 w-32" />
              <Skeleton className="mb-2 h-8 w-24" />
              <Skeleton className="mb-4 h-4 w-16" />
              <Skeleton className="h-1.5 w-full" />
            </Card>
          ))}
        </div>
      ) : sortedRows.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sortedRows.map((info, i) => (
            <BasketCard
              key={`${info.chainId ?? "default"}-${info.vault}`}
              vault={info.vault}
              name={info.name}
              sharePrice={info.sharePrice ?? 0n}
              basketPrice={info.basketPrice ?? 0n}
              usdcBalance={info.usdcBalance ?? 0n}
              perpAllocated={info.perpAllocated ?? 0n}
              totalSupply={info.totalSupply ?? 0n}
              assetCount={Number(info.assetCount ?? 0)}
              depositFee={info.depositFeeBps}
              perpBlendBps={
                computeBlendedComposition(
                  info.usdcBalance ?? 0n,
                  info.perpAllocated ?? 0n,
                  openInterestByVault.get(info.vault) ?? 0n,
                  []
                ).perpBlendBps
              }
              trend24h={undefined}
              trend7d={undefined}
              index={i}
              chainId={info.chainId}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-app-border bg-app-surface">
            <BasketIcon name="highTvl" className="h-5 w-5 text-app-accent" />
          </div>
          <p className="text-lg font-medium text-app-text">No baskets found</p>
          <p className="max-w-md text-sm text-app-muted">
            {search || filters.size > 0
              ? "Try a different search term or clear filters to widen the results."
              : "Create your first basket to get started."}
          </p>
        </div>
      )}
    </PageWrapper>
  );
}
