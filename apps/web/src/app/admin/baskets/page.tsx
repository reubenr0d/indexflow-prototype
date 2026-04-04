"use client";

import { useState } from "react";
import { PageWrapper } from "@/components/layout/page-wrapper";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAllBaskets, useCreateBasket } from "@/hooks/useBasketFactory";
import { useBasketInfoBatch } from "@/hooks/usePerpReader";
import { formatUSDC, formatBps, formatAddress } from "@/lib/format";
import { showToast } from "@/components/ui/toast";
import { Plus, X } from "lucide-react";
import Link from "next/link";
import { type Address } from "viem";
import { stringToHex } from "viem";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect } from "react";

export default function AdminBasketsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const { data: baskets, isLoading } = useAllBaskets();
  const vaultAddresses = (baskets as unknown as Address[]) ?? [];
  const { data: basketInfos } = useBasketInfoBatch(vaultAddresses);

  const infos = (basketInfos as unknown as Array<{
    vault: Address;
    name: string;
    usdcBalance: bigint;
    perpAllocated: bigint;
    assetCount: bigint;
  }>) ?? [];

  return (
    <PageWrapper>
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-white">
          Basket Management
        </h1>
        <Button onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? <X className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
          {showCreate ? "Cancel" : "Create Basket"}
        </Button>
      </div>

      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-8 overflow-hidden"
          >
            <CreateBasketForm onSuccess={() => setShowCreate(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading ? (
        <Card>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between border-b border-neutral-100 px-6 py-4 last:border-0 dark:border-neutral-800">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-5 w-20" />
            </div>
          ))}
        </Card>
      ) : (
        <Card>
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
            <div className="flex items-center gap-4 px-6 py-3 text-xs font-medium uppercase tracking-wider text-neutral-400">
              <span className="flex-1">Name</span>
              <span className="w-24 text-right">TVL</span>
              <span className="w-16 text-right">Assets</span>
              <span className="w-24 text-right">Perp</span>
              <span className="w-20 text-right">Address</span>
            </div>
            {infos.map((info) => (
              <Link key={info.vault} href={`/admin/baskets/${info.vault}`}>
                <div className="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                  <span className="flex-1 font-medium text-neutral-900 dark:text-white">
                    {info.name || "Basket"}
                  </span>
                  <span className="w-24 text-right text-sm text-neutral-600 dark:text-neutral-300">
                    {formatUSDC((info.usdcBalance ?? 0n) + (info.perpAllocated ?? 0n))}
                  </span>
                  <span className="w-16 text-right text-sm text-neutral-500">
                    {String(info.assetCount ?? 0n)}
                  </span>
                  <span className="w-24 text-right text-sm text-neutral-500">
                    {formatUSDC(info.perpAllocated ?? 0n)}
                  </span>
                  <span className="w-20 text-right font-mono text-xs text-neutral-400">
                    {formatAddress(info.vault)}
                  </span>
                </div>
              </Link>
            ))}
            {infos.length === 0 && (
              <div className="px-6 py-8 text-center text-sm text-neutral-400">
                No baskets created yet.
              </div>
            )}
          </div>
        </Card>
      )}
    </PageWrapper>
  );
}

function CreateBasketForm({ onSuccess }: { onSuccess: () => void }) {
  const [name, setName] = useState("");
  const [assets, setAssets] = useState([{ id: "", weight: "" }]);
  const [depositFee, setDepositFee] = useState("10");
  const [redeemFee, setRedeemFee] = useState("10");

  const { createBasket, receipt, isPending } = useCreateBasket();

  const totalWeight = assets.reduce((sum, a) => sum + (parseInt(a.weight) || 0), 0);

  useEffect(() => {
    if (receipt.isSuccess) {
      showToast("success", "Basket created");
      onSuccess();
    }
  }, [receipt.isSuccess, onSuccess]);

  const handleSubmit = () => {
    if (!name || totalWeight !== 10000) return;

    const assetIds = assets.map((a) =>
      stringToHex(a.id, { size: 32 }) as `0x${string}`
    );
    const weights = assets.map((a) => BigInt(a.weight));
    createBasket(name, assetIds, weights, BigInt(depositFee), BigInt(redeemFee));
    showToast("pending", "Creating basket...");
  };

  return (
    <Card className="p-6">
      <h2 className="mb-6 text-lg font-semibold text-neutral-900 dark:text-white">Create New Basket</h2>

      <div className="mb-6">
        <label className="mb-2 block text-sm font-medium text-neutral-500">Basket Name</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mining Majors" />
      </div>

      <div className="mb-6">
        <label className="mb-2 block text-sm font-medium text-neutral-500">Assets & Weights (bps)</label>
        {assets.map((asset, i) => (
          <div key={i} className="mb-2 flex gap-2">
            <Input
              placeholder="Asset ID (e.g. GOLD)"
              value={asset.id}
              onChange={(e) => {
                const next = [...assets];
                next[i] = { ...next[i], id: e.target.value };
                setAssets(next);
              }}
              className="flex-1"
            />
            <Input
              type="number"
              placeholder="Weight (bps)"
              value={asset.weight}
              onChange={(e) => {
                const next = [...assets];
                next[i] = { ...next[i], weight: e.target.value };
                setAssets(next);
              }}
              className="w-32"
            />
            {assets.length > 1 && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setAssets(assets.filter((_, j) => j !== i))}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
        <div className="mt-2 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => setAssets([...assets, { id: "", weight: "" }])}>
            <Plus className="mr-1 h-3 w-3" /> Add Asset
          </Button>
          <span className={`text-sm font-medium ${totalWeight === 10000 ? "text-emerald-500" : "text-red-500"}`}>
            {totalWeight} / 10,000 bps
          </span>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4">
        <div>
          <label className="mb-2 block text-sm font-medium text-neutral-500">Deposit Fee (bps)</label>
          <Input type="number" value={depositFee} onChange={(e) => setDepositFee(e.target.value)} />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-neutral-500">Redeem Fee (bps)</label>
          <Input type="number" value={redeemFee} onChange={(e) => setRedeemFee(e.target.value)} />
        </div>
      </div>

      <Button
        size="lg"
        className="w-full"
        disabled={!name || totalWeight !== 10000 || isPending}
        onClick={handleSubmit}
      >
        {isPending ? "Creating..." : "Create Basket"}
      </Button>
    </Card>
  );
}
