"use client";

import { useState } from "react";
import { PageWrapper } from "@/components/layout/page-wrapper";
import { BasketCard } from "@/components/baskets/basket-card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAllBaskets } from "@/hooks/useBasketFactory";
import { useBasketInfoBatch } from "@/hooks/usePerpReader";
import { Search, Plus } from "lucide-react";
import Link from "next/link";
import { type Address } from "viem";

type SortKey = "tvl" | "price" | "newest";

export default function BasketsPage() {
  const [sort, setSort] = useState<SortKey>("tvl");
  const [search, setSearch] = useState("");

  const { data: baskets, isLoading: basketsLoading } = useAllBaskets();
  const vaultAddresses = (baskets as unknown as Address[]) ?? [];
  const { data: basketInfos, isLoading: infosLoading } = useBasketInfoBatch(vaultAddresses);

  const isLoading = basketsLoading || infosLoading;

  const infos = (basketInfos as unknown as Array<{
    vault: Address;
    name: string;
    sharePrice: bigint;
    basketPrice: bigint;
    totalSupply: bigint;
    usdcBalance: bigint;
    perpAllocated: bigint;
    assetCount: bigint;
  }>) ?? [];

  const filtered = infos.filter((info) =>
    !search || (info.name || "").toLowerCase().includes(search.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => {
    if (sort === "tvl") {
      const tvlA = (a.usdcBalance ?? 0n) + (a.perpAllocated ?? 0n);
      const tvlB = (b.usdcBalance ?? 0n) + (b.perpAllocated ?? 0n);
      return tvlB > tvlA ? 1 : -1;
    }
    if (sort === "price") {
      return (b.sharePrice ?? 0n) > (a.sharePrice ?? 0n) ? 1 : -1;
    }
    return 0;
  });

  return (
    <PageWrapper>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-semibold tracking-tight text-app-text">
          Baskets
        </h1>
        <Link href="/admin/baskets">
          <Button size="md">
            <Plus className="mr-2 h-4 w-4" />
            Create Basket
          </Button>
        </Link>
      </div>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-app-muted" />
          <Input
            placeholder="Search baskets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 sm:w-72"
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
      ) : sorted.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((info, i) => (
            <BasketCard
              key={info.vault}
              vault={info.vault}
              name={info.name}
              sharePrice={info.sharePrice ?? 0n}
              basketPrice={info.basketPrice ?? 0n}
              usdcBalance={info.usdcBalance ?? 0n}
              perpAllocated={info.perpAllocated ?? 0n}
              totalSupply={info.totalSupply ?? 0n}
              assetCount={Number(info.assetCount ?? 0n)}
              index={i}
            />
          ))}
        </div>
      ) : (
        <div className="py-20 text-center">
          <p className="text-lg font-medium text-app-muted">No baskets found</p>
          <p className="mt-2 text-sm text-app-muted">
            {search ? "Try a different search term." : "Create your first basket to get started."}
          </p>
        </div>
      )}
    </PageWrapper>
  );
}
