"use client";

import { use, useState, useEffect } from "react";
import { PageWrapper } from "@/components/layout/page-wrapper";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBasketInfo, useVaultState } from "@/hooks/usePerpReader";
import {
  useBasketAssets,
  useBasketFees,
  useMaxPerpAllocation,
  useSetMaxPerpAllocation,
  useMinReserveBps,
  useRequiredReserveUsdc,
  useAvailableForPerpUsdc,
  useCollectedFees,
  useSetMinReserveBps,
  useTopUpReserve,
  useUSDCAllowance,
  useApproveUSDC,
} from "@/hooks/useBasketVault";
import { useOracleAssetMetaMap } from "@/hooks/useOracle";
import { useWriteContract, useWaitForTransactionReceipt, useAccount, useChainId } from "wagmi";
import { BasketVaultABI } from "@/abi/contracts";
import { formatUSDC, formatBps, formatAssetId, formatAddress } from "@/lib/format";
import { showToast } from "@/components/ui/toast";
import { type Address } from "viem";
import { parseUSDCInput } from "@/lib/format";
import { getContracts } from "@/config/contracts";

export default function AdminBasketDetailPage({ params }: { params: Promise<{ address: string }> }) {
  const { address: vaultAddress } = use(params);
  const vault = vaultAddress as Address;

  const { data: info } = useBasketInfo(vault);
  const { data: vaultState } = useVaultState(vault);
  const { depositFee, redeemFee } = useBasketFees(vault);
  const { data: minReserveBps } = useMinReserveBps(vault);
  const { data: requiredReserveUsdc } = useRequiredReserveUsdc(vault);
  const { data: availableForPerpUsdc } = useAvailableForPerpUsdc(vault);
  const { data: collectedFees } = useCollectedFees(vault);
  const { data: assetMeta } = useOracleAssetMetaMap();
  const { data: assetsData } = useBasketAssets(vault);
  const chainId = useChainId();
  const { usdc } = getContracts(chainId);

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
  const idleUsdc = (basketInfo?.usdcBalance ?? 0n) - ((collectedFees as bigint | undefined) ?? 0n);
  const requiredReserve = (requiredReserveUsdc as bigint | undefined) ?? 0n;
  const availableForPerp = (availableForPerpUsdc as bigint | undefined) ?? 0n;
  const reserveHealthy = idleUsdc >= requiredReserve;

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

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Reserve Target" value={formatBps((minReserveBps as bigint | undefined) ?? 0n)} />
        <StatCard label="Required Reserve" value={formatUSDC(requiredReserve)} />
        <StatCard label="Idle USDC (ex fees)" value={formatUSDC(idleUsdc > 0n ? idleUsdc : 0n)} />
        <StatCard label="Available For Perp" value={formatUSDC(availableForPerp)} />
      </div>
      <p className={`mb-8 text-sm font-medium ${reserveHealthy ? "text-app-success" : "text-app-danger"}`}>
        Reserve Health: {reserveHealthy ? "Healthy" : "Below Target"}
      </p>

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
            {assets.map((a) => {
              const meta = assetMeta.get(a.assetId);
              return (
                <div key={a.assetId} className="flex items-center justify-between px-6 py-4">
                  <div>
                    <p className="font-medium text-app-text">
                      {meta?.name ?? formatAssetId(a.assetId)}
                    </p>
                    <p className="font-mono text-xs text-app-muted">
                      {meta?.address ? formatAddress(meta.address) : formatAssetId(a.assetId)}
                    </p>
                  </div>
                  <span className="text-sm text-app-muted">{formatBps(a.weightBps)}</span>
                </div>
              );
            })}
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
        <ReservePolicyCard vault={vault} />
        <ReserveTopUpCard vault={vault} usdc={usdc} />
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

function ReservePolicyCard({ vault }: { vault: Address }) {
  const [bpsInput, setBpsInput] = useState("");
  const { data: currentBps } = useMinReserveBps(vault);
  const { setMinReserveBps, receipt, isPending } = useSetMinReserveBps();

  useEffect(() => {
    if (receipt.isSuccess) {
      showToast("success", "Reserve policy updated");
    }
  }, [receipt.isSuccess]);

  return (
    <Card className="p-6">
      <h3 className="mb-2 text-base font-semibold text-app-text">Reserve Policy</h3>
      <p className="mb-4 text-sm text-app-muted">
        Current target: {formatBps((currentBps as bigint | undefined) ?? 0n)}
      </p>
      <Input
        type="number"
        min="0"
        max="10000"
        placeholder="BPS (0 - 10000)"
        value={bpsInput}
        onChange={(e) => setBpsInput(e.target.value)}
        className="mb-3"
      />
      <Button
        size="sm"
        disabled={!bpsInput || isPending}
        onClick={() => {
          setMinReserveBps(vault, BigInt(bpsInput));
          showToast("pending", "Updating reserve policy...");
        }}
      >
        Set Reserve Target
      </Button>
    </Card>
  );
}

function ReserveTopUpCard({ vault, usdc }: { vault: Address; usdc: Address }) {
  const [amount, setAmount] = useState("");
  const { address } = useAccount();
  const { data: allowance } = useUSDCAllowance(usdc, address, vault);
  const { approve, receipt: approveReceipt, isPending: isApproving } = useApproveUSDC();
  const { topUpReserve, receipt: topUpReceipt, isPending: isToppingUp } = useTopUpReserve();

  const parsedAmount = amount ? parseUSDCInput(amount) : 0n;
  const needsApproval = parsedAmount > 0n && (allowance ?? 0n) < parsedAmount;
  const isProcessing = isApproving || isToppingUp;

  useEffect(() => {
    if (approveReceipt.isSuccess) {
      showToast("success", "USDC approved");
    }
  }, [approveReceipt.isSuccess]);

  useEffect(() => {
    if (topUpReceipt.isSuccess) {
      showToast("success", "Reserve topped up");
    }
  }, [topUpReceipt.isSuccess]);

  return (
    <Card className="p-6">
      <h3 className="mb-2 text-base font-semibold text-app-text">Top Up Reserve</h3>
      <p className="mb-4 text-sm text-app-muted">
        Transfer USDC into the vault without minting shares.
      </p>
      <Input
        type="number"
        placeholder="USDC amount"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="mb-3"
      />
      <Button
        size="sm"
        disabled={!address || parsedAmount === 0n || isProcessing}
        onClick={() => {
          if (needsApproval) {
            approve(usdc, vault, parsedAmount);
            showToast("pending", "Approving USDC...");
            return;
          }
          topUpReserve(vault, parsedAmount);
          showToast("pending", "Topping up reserve...");
        }}
      >
        {isProcessing ? "Processing..." : needsApproval ? "Approve USDC" : "Top Up Reserve"}
      </Button>
    </Card>
  );
}
