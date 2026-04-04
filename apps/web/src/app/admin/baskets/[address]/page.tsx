"use client";

import { use, useState, useEffect } from "react";
import { PageWrapper } from "@/components/layout/page-wrapper";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBasketInfo, useVaultState } from "@/hooks/usePerpReader";
import { useBasketAssets, useBasketFees, useMaxPerpAllocation, useSetMaxPerpAllocation } from "@/hooks/useBasketVault";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { BasketVaultABI } from "@/abi/contracts";
import { formatUSDC, formatBps, formatAssetId, formatAddress } from "@/lib/format";
import { showToast } from "@/components/ui/toast";
import { type Address } from "viem";
import { parseUSDCInput } from "@/lib/format";

export default function AdminBasketDetailPage({ params }: { params: Promise<{ address: string }> }) {
  const { address: vaultAddress } = use(params);
  const vault = vaultAddress as Address;

  const { data: info } = useBasketInfo(vault);
  const { data: vaultState } = useVaultState(vault);
  const { depositFee, redeemFee } = useBasketFees(vault);
  const { data: assetsData } = useBasketAssets(vault);

  const basketInfo = info as {
    name: string;
    usdcBalance: bigint;
    perpAllocated: bigint;
    totalSupply: bigint;
    assetCount: bigint;
  } | undefined;

  const state = vaultState as {
    depositedCapital: bigint;
    realisedPnL: bigint;
    openInterest: bigint;
    positionCount: bigint;
    registered: boolean;
  } | undefined;

  const tvl = (basketInfo?.usdcBalance ?? 0n) + (basketInfo?.perpAllocated ?? 0n);

  const assets = assetsData
    ? (assetsData as unknown as Array<{ result?: [string, bigint]; status: string }>)
        .filter((a) => a.status === "success" && a.result)
        .map((a) => ({
          assetId: a.result![0] as `0x${string}`,
          weightBps: a.result![1],
        }))
    : [];

  return (
    <PageWrapper>
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-app-text">
          {basketInfo?.name || "Basket"}
        </h1>
        <p className="mt-1 font-mono text-sm text-app-muted">{formatAddress(vault)}</p>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="TVL" value={formatUSDC(tvl)} />
        <StatCard label="Perp Allocated" value={formatUSDC(basketInfo?.perpAllocated ?? 0n)} />
        <StatCard label="Deposit Fee" value={depositFee !== undefined ? formatBps(depositFee) : "--"} />
        <StatCard label="Redeem Fee" value={redeemFee !== undefined ? formatBps(redeemFee) : "--"} />
      </div>

      {state?.registered && (
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Deposited Capital" value={formatUSDC(state.depositedCapital)} />
          <StatCard
            label="Realised PnL"
            value={formatUSDC(state.realisedPnL)}
          />
          <StatCard label="Open Interest" value={formatUSDC(state.openInterest)} />
          <StatCard label="Positions" value={String(state.positionCount)} />
        </div>
      )}

      <div className="mb-8">
        <h2 className="mb-4 text-lg font-semibold text-app-text">Composition</h2>
        <Card>
          <div className="divide-y divide-app-border">
            {assets.map((a) => (
              <div key={a.assetId} className="flex items-center justify-between px-6 py-4">
                <span className="font-medium text-app-text">
                  {formatAssetId(a.assetId)}
                </span>
                <span className="text-sm text-app-muted">{formatBps(a.weightBps)}</span>
              </div>
            ))}
            {assets.length === 0 && (
              <div className="px-6 py-4 text-center text-sm text-app-muted">No assets</div>
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <PerpAllocationCard vault={vault} currentAllocation={basketInfo?.perpAllocated ?? 0n} />
        <MaxPerpAllocationCard vault={vault} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <FeeCollectionCard vault={vault} />
      </div>
    </PageWrapper>
  );
}

function PerpAllocationCard({ vault, currentAllocation }: { vault: Address; currentAllocation: bigint }) {
  const [amount, setAmount] = useState("");
  const { writeContract, data: hash, isPending } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (receipt.isSuccess) {
      showToast("success", "Allocation updated");
      setAmount("");
    }
  }, [receipt.isSuccess]);

  return (
    <Card className="p-6">
      <h3 className="mb-4 text-base font-semibold text-app-text">Perp Allocation</h3>
      <p className="mb-4 text-sm text-app-muted">Current: {formatUSDC(currentAllocation)}</p>
      <Input
        type="number"
        placeholder="USDC amount"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="mb-3"
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={!amount || isPending}
          onClick={() => {
            writeContract({
              address: vault,
              abi: BasketVaultABI,
              functionName: "allocateToPerp",
              args: [parseUSDCInput(amount)],
            });
            showToast("pending", "Allocating...");
          }}
        >
          Allocate
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={!amount || isPending}
          onClick={() => {
            writeContract({
              address: vault,
              abi: BasketVaultABI,
              functionName: "withdrawFromPerp",
              args: [parseUSDCInput(amount)],
            });
            showToast("pending", "Withdrawing...");
          }}
        >
          Withdraw
        </Button>
      </div>
    </Card>
  );
}

function MaxPerpAllocationCard({ vault }: { vault: Address }) {
  const [amount, setAmount] = useState("");
  const { data: currentCap } = useMaxPerpAllocation(vault);
  const { setMaxPerpAllocation, receipt, isPending } = useSetMaxPerpAllocation();

  const capValue = currentCap as bigint | undefined;

  useEffect(() => {
    if (receipt.isSuccess) {
      showToast("success", "Max perp allocation updated");
      setAmount("");
    }
  }, [receipt.isSuccess]);

  return (
    <Card className="p-6">
      <h3 className="mb-2 text-base font-semibold text-app-text">
        Max Perp Allocation
      </h3>
      <p className="mb-4 text-sm text-app-muted">
        Current:{" "}
        {capValue === undefined
          ? "--"
          : capValue === 0n
            ? "Unlimited"
            : formatUSDC(capValue)}
      </p>
      <Input
        type="number"
        placeholder="USDC cap (0 = unlimited)"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="mb-3"
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={!amount || isPending}
          onClick={() => {
            setMaxPerpAllocation(vault, parseUSDCInput(amount));
            showToast("pending", "Setting cap...");
          }}
        >
          Set Cap
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={isPending}
          onClick={() => {
            setMaxPerpAllocation(vault, 0n);
            showToast("pending", "Removing cap...");
          }}
        >
          Clear
        </Button>
      </div>
    </Card>
  );
}

function FeeCollectionCard({ vault }: { vault: Address }) {
  const { writeContract, data: hash, isPending } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });
  const [recipient, setRecipient] = useState("");

  useEffect(() => {
    if (receipt.isSuccess) {
      showToast("success", "Fees collected");
    }
  }, [receipt.isSuccess]);

  return (
    <Card className="p-6">
      <h3 className="mb-4 text-base font-semibold text-app-text">Collect Fees</h3>
      <Input
        placeholder="Recipient address"
        value={recipient}
        onChange={(e) => setRecipient(e.target.value)}
        className="mb-3"
      />
      <Button
        size="sm"
        disabled={!recipient || isPending}
        onClick={() => {
          writeContract({
            address: vault,
            abi: BasketVaultABI,
            functionName: "collectFees",
            args: [recipient as Address],
          });
          showToast("pending", "Collecting fees...");
        }}
      >
        Collect Fees
      </Button>
    </Card>
  );
}
