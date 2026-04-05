"use client";

import { useEffect, useMemo, useState } from "react";
import { usePublicClient, useWriteContract } from "wagmi";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { PageWrapper } from "@/components/layout/page-wrapper";
import { showToast } from "@/components/ui/toast";
import { useAllBaskets } from "@/hooks/useBasketFactory";
import { useBasketInfoBatch, useVaultStateBatch } from "@/hooks/usePerpReader";
import { useAvailableForPerpBatch } from "@/hooks/useBasketVault";
import {
  useClosePosition,
  useMaxOpenInterest,
  useMaxPositionSize,
  useOpenPosition,
  usePositionTracking,
} from "@/hooks/useVaultAccounting";
import { usePostTxRefresh } from "@/hooks/usePostTxRefresh";
import {
  computeCurrentSplits,
  computeMaxDistributedTopUps,
  computeTargetSplitTopUps,
} from "@/lib/perpAllocation";
import { formatAddress, formatBps, formatUSDC, parseUSDCInput } from "@/lib/format";
import { useSupportedOracleAssets } from "@/hooks/useOracle";
import { BasketVaultABI } from "@/abi/contracts";
import { type AdminPortfolioBasketRow, type BatchTopUpStatus } from "@/types/adminPortfolio";
import { type Address, type Hex } from "viem";

type Side = "long" | "short";

const BPS_DENOM = 10_000n;

function bpsInputToBigInt(value: string): bigint {
  const parsed = Number.parseFloat(value || "0");
  if (!Number.isFinite(parsed) || parsed < 0) return 0n;
  const clamped = Math.min(parsed, 100);
  return BigInt(Math.round(clamped * 100));
}

function bpsToInputValue(value: bigint): string {
  return (Number(value) / 100).toFixed(2);
}

function usdcToInputValue(amount: bigint): string {
  const whole = amount / 1_000_000n;
  const frac = amount % 1_000_000n;
  if (frac === 0n) return whole.toString();
  return `${whole.toString()}.${frac.toString().padStart(6, "0").replace(/0+$/, "")}`;
}

export default function AdminPositionsPage() {
  const publicClient = usePublicClient();
  const refreshAfterTx = usePostTxRefresh();
  const { writeContractAsync } = useWriteContract();

  const { data: baskets } = useAllBaskets();
  const vaults = ((baskets as unknown as Address[]) ?? []).filter(Boolean);

  const { data: basketInfos } = useBasketInfoBatch(vaults);
  const { data: availableBatch } = useAvailableForPerpBatch(vaults);
  const { data: vaultStates } = useVaultStateBatch(vaults);

  const rows = useMemo<AdminPortfolioBasketRow[]>(() => {
    const infoRows = (basketInfos as Array<{ vault: Address; name: string; perpAllocated: bigint }> | undefined) ?? [];
    const perpAllocated = infoRows.map((row) => row.perpAllocated ?? 0n);
    const currentSplits = computeCurrentSplits(perpAllocated);

    return infoRows.map((row, i) => ({
      vault: row.vault,
      name: row.name || "Basket",
      perpAllocated: row.perpAllocated ?? 0n,
      availableForPerp:
        (availableBatch as Array<{ result?: bigint; status: string }> | undefined)?.[i]?.status === "success"
          ? ((availableBatch as Array<{ result?: bigint }>)[i].result ?? 0n)
          : 0n,
      currentSplitBps: currentSplits[i] ?? 0n,
      targetSplitBps: currentSplits[i] ?? 0n,
      proposedTopUp: 0n,
    }));
  }, [basketInfos, availableBatch]);

  const [targetSplitByVault, setTargetSplitByVault] = useState<Record<string, bigint>>({});
  const [proposedTopUpByVault, setProposedTopUpByVault] = useState<Record<string, bigint>>({});
  const [withdrawByVault, setWithdrawByVault] = useState<Record<string, bigint>>({});
  const [batchStatuses, setBatchStatuses] = useState<BatchTopUpStatus[]>([]);
  const [isBatchRunning, setIsBatchRunning] = useState(false);

  const [selectedVault, setSelectedVault] = useState<Address | "">("");
  const [openAssetFilter, setOpenAssetFilter] = useState("");
  const [closeAssetFilter, setCloseAssetFilter] = useState("");
  const [openAsset, setOpenAsset] = useState<Hex | "">("");
  const [openSide, setOpenSide] = useState<Side>("long");
  const [openSize, setOpenSize] = useState("");
  const [openCollateral, setOpenCollateral] = useState("");

  const [closeAsset, setCloseAsset] = useState<Hex | "">("");
  const [closeSide, setCloseSide] = useState<Side>("long");
  const [closeSizeDelta, setCloseSizeDelta] = useState("");
  const [closeCollateralDelta, setCloseCollateralDelta] = useState("");

  const { data: supportedAssets } = useSupportedOracleAssets();
  const { data: maxOpenInterest } = useMaxOpenInterest(selectedVault || undefined);
  const { data: maxPositionSize } = useMaxPositionSize(selectedVault || undefined);
  const { data: closeTracking } = usePositionTracking(
    selectedVault || undefined,
    closeAsset || undefined,
    closeSide === "long"
  );

  const { openPosition, receipt: openReceipt, isPending: isOpenPending } = useOpenPosition();
  const { closePosition, receipt: closeReceipt, isPending: isClosePending } = useClosePosition();

  useEffect(() => {
    if (!selectedVault && rows.length > 0) setSelectedVault(rows[0].vault);
  }, [rows, selectedVault]);

  const filteredAssets = (supportedAssets ?? []).filter((asset) =>
    asset.label.toLowerCase().includes(openAssetFilter.toLowerCase())
  );
  const closeFilteredAssets = (supportedAssets ?? []).filter((asset) =>
    asset.label.toLowerCase().includes(closeAssetFilter.toLowerCase())
  );

  useEffect(() => {
    if (!openAsset && filteredAssets.length > 0) {
      setOpenAsset(filteredAssets[0].idHex as Hex);
    }
  }, [openAsset, filteredAssets]);

  useEffect(() => {
    if (!closeAsset && closeFilteredAssets.length > 0) {
      setCloseAsset(closeFilteredAssets[0].idHex as Hex);
    }
  }, [closeAsset, closeFilteredAssets]);

  useEffect(() => {
    if (rows.length === 0) return;
    setTargetSplitByVault((prev) => {
      const next = { ...prev };
      for (const row of rows) {
        if (next[row.vault] === undefined) next[row.vault] = row.currentSplitBps;
      }
      return next;
    });
  }, [rows]);

  useEffect(() => {
    if (openReceipt.isSuccess) {
      showToast("success", "Position opened");
      refreshAfterTx();
    }
  }, [openReceipt.isSuccess, refreshAfterTx]);

  useEffect(() => {
    if (closeReceipt.isSuccess) {
      showToast("success", "Position closed");
      refreshAfterTx();
    }
  }, [closeReceipt.isSuccess, refreshAfterTx]);

  const totalPerpAllocated = rows.reduce((sum, row) => sum + row.perpAllocated, 0n);
  const totalAllocatable = rows.reduce((sum, row) => sum + row.availableForPerp, 0n);

  const splitTotal = rows.reduce(
    (sum, row) => sum + (targetSplitByVault[row.vault] ?? row.currentSplitBps),
    0n
  );

  const splitHealthLabel = splitTotal === BPS_DENOM ? "Healthy" : "Unbalanced";

  const topUpAmountForVault = (vault: Address): bigint => proposedTopUpByVault[vault] ?? 0n;
  const withdrawAmountForVault = (vault: Address): bigint => withdrawByVault[vault] ?? 0n;

  const applySplitPlan = () => {
    const perp = rows.map((row) => row.perpAllocated);
    const available = rows.map((row) => row.availableForPerp);
    const target = rows.map((row) => targetSplitByVault[row.vault] ?? row.currentSplitBps);

    const { topUps, withdraws } = computeTargetSplitTopUps(perp, available, target);

    const nextTopUps: Record<string, bigint> = {};
    const nextWithdraws: Record<string, bigint> = {};
    rows.forEach((row, i) => {
      nextTopUps[row.vault] = topUps[i] ?? 0n;
      nextWithdraws[row.vault] = withdraws[i] ?? 0n;
    });

    setProposedTopUpByVault(nextTopUps);
    setWithdrawByVault(nextWithdraws);
    showToast("success", "Split targets applied");
  };

  const applyMaxPlan = () => {
    const available = rows.map((row) => row.availableForPerp);
    const currentSplit = rows.map((row) => row.currentSplitBps);
    const topUps = computeMaxDistributedTopUps(available, currentSplit);

    const nextTopUps: Record<string, bigint> = {};
    rows.forEach((row, i) => {
      nextTopUps[row.vault] = topUps[i] ?? 0n;
    });

    setProposedTopUpByVault(nextTopUps);
    setWithdrawByVault({});
    showToast("success", "Max distribution calculated");
  };

  const runTopUp = async (vault: Address, amount: bigint) => {
    if (!publicClient || amount <= 0n) return;
    const hash = await writeContractAsync({
      address: vault,
      abi: BasketVaultABI,
      functionName: "allocateToPerp",
      args: [amount],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    await refreshAfterTx();
  };

  const runWithdraw = async (vault: Address, amount: bigint) => {
    if (!publicClient || amount <= 0n) return;
    const hash = await writeContractAsync({
      address: vault,
      abi: BasketVaultABI,
      functionName: "withdrawFromPerp",
      args: [amount],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    await refreshAfterTx();
  };

  const handleTopUpAll = async () => {
    if (!publicClient || isBatchRunning) return;

    const queue = rows
      .map((row) => ({ vault: row.vault, amount: topUpAmountForVault(row.vault) }))
      .filter((item) => item.amount > 0n);

    if (queue.length === 0) {
      showToast("error", "No top-up amounts to execute");
      return;
    }

    setIsBatchRunning(true);
    setBatchStatuses(queue.map((item) => ({ vault: item.vault, amount: item.amount, status: "idle" })));

    let successCount = 0;
    let failCount = 0;

    for (const item of queue) {
      setBatchStatuses((prev) =>
        prev.map((s) => (s.vault === item.vault ? { ...s, status: "pending" } : s))
      );

      try {
        const hash = await writeContractAsync({
          address: item.vault,
          abi: BasketVaultABI,
          functionName: "allocateToPerp",
          args: [item.amount],
        });
        await publicClient.waitForTransactionReceipt({ hash });

        setBatchStatuses((prev) =>
          prev.map((s) =>
            s.vault === item.vault ? { ...s, status: "success", txHash: hash as Hex } : s
          )
        );
        successCount += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Transaction failed";
        setBatchStatuses((prev) =>
          prev.map((s) =>
            s.vault === item.vault ? { ...s, status: "failed", error: message } : s
          )
        );
        failCount += 1;
      }
    }

    await refreshAfterTx();
    setIsBatchRunning(false);

    showToast("success", `Top-up queue complete: ${successCount} success, ${failCount} failed`);
  };

  const openInterestByVault = new Map(
    rows.map((row, i) => {
      const state =
        (vaultStates as Array<{
          result?: {
            depositedCapital: bigint;
            realisedPnL: bigint;
            openInterest: bigint;
            collateralLocked: bigint;
            positionCount: bigint;
            registered: boolean;
          };
          status: string;
        }> | undefined)?.[i];
      const openInterest = state?.status === "success" ? state.result?.openInterest ?? 0n : 0n;
      return [row.vault, openInterest];
    })
  );

  const selectedVaultState =
    selectedVault
      ? (vaultStates as Array<{
          result?: {
            depositedCapital: bigint;
            realisedPnL: bigint;
            openInterest: bigint;
            collateralLocked: bigint;
            positionCount: bigint;
            registered: boolean;
          };
          status: string;
        }> | undefined)?.[rows.findIndex((row) => row.vault === selectedVault)]?.result
      : undefined;

  const availableCapital = selectedVaultState
    ? (() => {
        const total =
          selectedVaultState.depositedCapital +
          selectedVaultState.realisedPnL -
          selectedVaultState.collateralLocked;
        return total > 0n ? total : 0n;
      })()
    : 0n;

  const openInterestCap = (maxOpenInterest as bigint | undefined) ?? 0n;
  const positionSizeCap = (maxPositionSize as bigint | undefined) ?? 0n;
  const currentOpenInterest = selectedVaultState?.openInterest ?? 0n;
  const remainingOpenInterest =
    openInterestCap > 0n && openInterestCap > currentOpenInterest
      ? openInterestCap - currentOpenInterest
      : 0n;

  const openSizeMax =
    openInterestCap > 0n && positionSizeCap > 0n
      ? (remainingOpenInterest < positionSizeCap ? remainingOpenInterest : positionSizeCap)
      : openInterestCap > 0n
        ? remainingOpenInterest
        : positionSizeCap > 0n
          ? positionSizeCap
          : 0n;

  const closePos = closeTracking as {
    size: bigint;
    collateralUsdc: bigint;
    exists: boolean;
  } | undefined;
  const closeSizeMax = closePos?.exists ? closePos.size : 0n;
  const closeCollateralMax = closePos?.exists ? closePos.collateralUsdc : 0n;

  return (
    <PageWrapper>
      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-app-text">Portfolio Position Manager</h1>
        <p className="mt-1 text-sm text-app-muted">Manage basket perp allocation splits and execute basket-level perp actions.</p>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-app-muted">Current Perp Allocated</p>
          <p className="mt-2 font-mono text-xl font-semibold text-app-text">{formatUSDC(totalPerpAllocated)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-app-muted">Total Allocatable</p>
          <p className="mt-2 font-mono text-xl font-semibold text-app-text">{formatUSDC(totalAllocatable)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-app-muted">Split Health</p>
          <p className="mt-2 text-xl font-semibold text-app-text">{splitHealthLabel}</p>
          <p className="text-xs text-app-muted">Target split total: {formatBps(splitTotal)}</p>
        </Card>
      </div>

      <Card className="mb-6 overflow-x-auto">
        <div className="min-w-[920px] divide-y divide-app-border">
          <div className="grid grid-cols-[1.6fr_1fr_1fr_0.8fr_1fr_1fr_0.8fr_1.2fr] items-center gap-3 px-4 py-3 text-xs uppercase tracking-wide text-app-muted">
            <span>Basket</span>
            <span className="text-right">Perp Allocated</span>
            <span className="text-right">Available</span>
            <span className="text-right">Open Int</span>
            <span className="text-right">Current Split</span>
            <span className="text-right">Target Split</span>
            <span className="text-right">Top Up</span>
            <span className="text-right">Actions</span>
          </div>

          {rows.map((row) => {
            const targetSplit = targetSplitByVault[row.vault] ?? row.currentSplitBps;
            const proposedTopUp = topUpAmountForVault(row.vault);
            const withdrawAmount = withdrawAmountForVault(row.vault);
            const openInterest = openInterestByVault.get(row.vault) ?? 0n;

            return (
              <div key={row.vault} className="grid grid-cols-[1.6fr_1fr_1fr_0.8fr_1fr_1fr_0.8fr_1.2fr] items-center gap-3 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-app-text">{row.name}</p>
                  <p className="font-mono text-xs text-app-muted">{formatAddress(row.vault)}</p>
                </div>
                <p className="text-right font-mono text-app-text">{formatUSDC(row.perpAllocated)}</p>
                <p className="text-right font-mono text-app-text">{formatUSDC(row.availableForPerp)}</p>
                <p className="text-right font-mono text-app-text">{formatUSDC(openInterest)}</p>
                <p className="text-right font-mono text-app-text">{formatBps(row.currentSplitBps)}</p>
                <div className="flex justify-end">
                  <Input
                    type="number"
                    value={bpsToInputValue(targetSplit)}
                    onChange={(e) =>
                      setTargetSplitByVault((prev) => ({
                        ...prev,
                        [row.vault]: bpsInputToBigInt(e.target.value),
                      }))
                    }
                    className="h-9 w-24 text-right"
                    disabled={isBatchRunning}
                  />
                </div>
                <p className="text-right font-mono text-app-text">{formatUSDC(proposedTopUp)}</p>
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    disabled={proposedTopUp === 0n || isBatchRunning}
                    onClick={async () => {
                      try {
                        await runTopUp(row.vault, proposedTopUp);
                        showToast("success", `Top-up complete for ${row.name}`);
                      } catch (error) {
                        showToast("error", error instanceof Error ? error.message : "Top-up failed");
                      }
                    }}
                  >
                    Top Up
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={withdrawAmount === 0n || isBatchRunning}
                    onClick={async () => {
                      try {
                        await runWithdraw(row.vault, withdrawAmount);
                        showToast("success", `Withdraw complete for ${row.name}`);
                      } catch (error) {
                        showToast("error", error instanceof Error ? error.message : "Withdraw failed");
                      }
                    }}
                  >
                    Withdraw
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="mb-8 flex flex-wrap gap-2">
        <Button onClick={applySplitPlan} disabled={rows.length === 0 || isBatchRunning}>Apply Split</Button>
        <Button variant="secondary" onClick={applyMaxPlan} disabled={rows.length === 0 || isBatchRunning}>Max</Button>
        <Button variant="danger" onClick={handleTopUpAll} disabled={rows.length === 0 || isBatchRunning}>
          {isBatchRunning ? "Running Queue..." : "Top Up All"}
        </Button>
      </div>

      {batchStatuses.length > 0 && (
        <Card className="mb-8 p-4">
          <h2 className="mb-3 text-base font-semibold text-app-text">Top Up Queue Status</h2>
          <div className="space-y-2 text-sm">
            {batchStatuses.map((status) => (
              <div key={status.vault} className="flex items-center justify-between rounded-md border border-app-border px-3 py-2">
                <div>
                  <p className="font-medium text-app-text">{formatAddress(status.vault)}</p>
                  <p className="font-mono text-xs text-app-muted">{formatUSDC(status.amount)}</p>
                </div>
                <p
                  className={
                    status.status === "success"
                      ? "text-app-success"
                      : status.status === "failed"
                        ? "text-app-danger"
                        : status.status === "pending"
                          ? "text-app-accent"
                          : "text-app-muted"
                  }
                >
                  {status.status}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-5">
        <h2 className="mb-4 text-lg font-semibold text-app-text">Position Controls</h2>

        <div className="mb-5">
          <label className="mb-2 block text-sm font-medium text-app-muted">Basket</label>
          <select
            value={selectedVault}
            onChange={(e) => setSelectedVault(e.target.value as Address)}
            className="h-11 w-full rounded-xl border border-app-border bg-app-bg px-3 text-app-text"
          >
            {rows.map((row) => (
              <option key={row.vault} value={row.vault}>
                {row.name} ({formatAddress(row.vault)})
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-app-border p-4">
            <h3 className="mb-3 text-sm font-semibold text-app-text">Open Position</h3>
            <div className="grid gap-3">
              <Input
                placeholder="Filter assets..."
                value={openAssetFilter}
                onChange={(e) => setOpenAssetFilter(e.target.value)}
              />
              <select
                value={openAsset}
                onChange={(e) => setOpenAsset(e.target.value as Hex)}
                className="h-11 w-full rounded-xl border border-app-border bg-app-bg px-3 text-app-text"
              >
                {filteredAssets.map((asset) => (
                  <option key={asset.idHex} value={asset.idHex}>
                    {asset.label}
                  </option>
                ))}
              </select>
              <SegmentedControl
                options={[
                  { value: "long", label: "Long" },
                  { value: "short", label: "Short" },
                ]}
                value={openSide}
                onChange={(value) => setOpenSide(value as Side)}
              />
              <Input type="number" placeholder="Size (USDC)" value={openSize} onChange={(e) => setOpenSize(e.target.value)} />
              <div className="flex items-center justify-between text-xs text-app-muted">
                <span>Max Size: {openSizeMax > 0n ? formatUSDC(openSizeMax) : "Unlimited"}</span>
                {openSizeMax > 0n && (
                  <button className="underline" onClick={() => setOpenSize(usdcToInputValue(openSizeMax))}>
                    Use max
                  </button>
                )}
              </div>
              <Input
                type="number"
                placeholder="Collateral (USDC)"
                value={openCollateral}
                onChange={(e) => setOpenCollateral(e.target.value)}
              />
              <div className="flex items-center justify-between text-xs text-app-muted">
                <span>Max Collateral: {formatUSDC(availableCapital)}</span>
                <button className="underline" onClick={() => setOpenCollateral(usdcToInputValue(availableCapital))}>
                  Use max
                </button>
              </div>
              <Button
                disabled={!selectedVault || !openAsset || !openSize || !openCollateral || isOpenPending || isBatchRunning}
                onClick={() => {
                  openPosition(
                    selectedVault as Address,
                    openAsset as Hex,
                    openSide === "long",
                    parseUSDCInput(openSize),
                    parseUSDCInput(openCollateral)
                  );
                  showToast("pending", "Opening position...");
                }}
              >
                {isOpenPending ? "Processing..." : "Open"}
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-app-border p-4">
            <h3 className="mb-3 text-sm font-semibold text-app-text">Close Position</h3>
            <div className="grid gap-3">
              <Input
                placeholder="Filter assets..."
                value={closeAssetFilter}
                onChange={(e) => setCloseAssetFilter(e.target.value)}
              />
              <select
                value={closeAsset}
                onChange={(e) => setCloseAsset(e.target.value as Hex)}
                className="h-11 w-full rounded-xl border border-app-border bg-app-bg px-3 text-app-text"
              >
                {closeFilteredAssets.map((asset) => (
                  <option key={asset.idHex} value={asset.idHex}>
                    {asset.label}
                  </option>
                ))}
              </select>
              <SegmentedControl
                options={[
                  { value: "long", label: "Long" },
                  { value: "short", label: "Short" },
                ]}
                value={closeSide}
                onChange={(value) => setCloseSide(value as Side)}
              />
              <Input
                type="number"
                placeholder="Size Delta (USDC)"
                value={closeSizeDelta}
                onChange={(e) => setCloseSizeDelta(e.target.value)}
              />
              <div className="flex items-center justify-between text-xs text-app-muted">
                <span>Max Size Delta: {formatUSDC(closeSizeMax)}</span>
                {closeSizeMax > 0n && (
                  <button className="underline" onClick={() => setCloseSizeDelta(usdcToInputValue(closeSizeMax))}>
                    Use max
                  </button>
                )}
              </div>
              <Input
                type="number"
                placeholder="Collateral Delta (USDC)"
                value={closeCollateralDelta}
                onChange={(e) => setCloseCollateralDelta(e.target.value)}
              />
              <div className="flex items-center justify-between text-xs text-app-muted">
                <span>Max Collateral Delta: {formatUSDC(closeCollateralMax)}</span>
                {closeCollateralMax > 0n && (
                  <button className="underline" onClick={() => setCloseCollateralDelta(usdcToInputValue(closeCollateralMax))}>
                    Use max
                  </button>
                )}
              </div>
              <Button
                variant="danger"
                disabled={!selectedVault || !closeAsset || !closeSizeDelta || isClosePending || isBatchRunning}
                onClick={() => {
                  closePosition(
                    selectedVault as Address,
                    closeAsset as Hex,
                    closeSide === "long",
                    parseUSDCInput(closeSizeDelta),
                    parseUSDCInput(closeCollateralDelta || "0")
                  );
                  showToast("pending", "Closing position...");
                }}
              >
                {isClosePending ? "Processing..." : "Close"}
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </PageWrapper>
  );
}
