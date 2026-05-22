"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Address } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { useWallets } from "@privy-io/react-auth";
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Fuel,
  Loader2,
  RotateCcw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RoutingBar } from "./routing-breakdown";
import { SponsorshipErrorDialog, isSponsorshipError } from "./sponsorship-error-dialog";
import {
  computeDepositSplits,
  computeNeedsApprovalPerChain,
  useAllowancesPerChain,
  useParallelChainDeposits,
  type ChainDepositStatus,
  type ChainTxStatus,
  type DepositSplit,
} from "@/hooks/useParallelChainDeposits";
import { useChainGasEstimates } from "@/hooks/useChainGasEstimates";
import { useRoutingWeights } from "@/hooks/useRoutingWeights";
import { useVaultAddressByName } from "@/hooks/useVaultAddressByName";
import { useDeploymentTarget } from "@/providers/DeploymentProvider";
import { getContractsForDeploymentTarget } from "@/config/contracts";
import { CHAIN_REGISTRY, deploymentLabel } from "@/lib/deployment";
import { getChainMeta } from "@/components/chains/chain-icons";
import { formatUSDC, formatShares } from "@/lib/format";
import { PRICE_PRECISION } from "@/lib/constants";
import { BasketVaultABI } from "@/abi/contracts";
import {
  useOptionalTransactionStatus,
  type TxChildRecord,
  type TxStatus,
} from "@/providers/TransactionStatusProvider";
import { isPrivyConfigured } from "@/config/privy";

function mapChainStatusToTxStatus(status: ChainTxStatus): TxStatus {
  switch (status) {
    case "idle":
    case "switching":
    case "approving":
      return "signing";
    case "depositing":
      return "submitted";
    case "success":
      return "confirmed";
    case "error":
      return "failed";
  }
}

type ModalPhase = "preview" | "executing" | "complete" | "error";

const MODAL_SAFETY_TIMEOUT_MS = 160_000;

interface DepositConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amount: bigint;
  vaultAddress: Address;
  sharePrice: bigint;
  depositFeeBps: bigint;
  onSuccess?: () => void;
}

export function DepositConfirmModal({
  open,
  onOpenChange,
  amount,
  vaultAddress,
  sharePrice,
  depositFeeBps,
  onSuccess,
}: DepositConfirmModalProps) {
  const [isExecuting, setIsExecuting] = useState(false);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && isExecuting) {
        console.log("[DepositConfirmModal] Prevented close during execution");
        return;
      }
      onOpenChange(nextOpen);
    },
    [isExecuting, onOpenChange]
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        data-testid="deposit-confirm-modal-content"
        className="max-w-2xl"
      >
        <DepositConfirmModalContent
          amount={amount}
          vaultAddress={vaultAddress}
          sharePrice={sharePrice}
          depositFeeBps={depositFeeBps}
          onSuccess={onSuccess}
          onClose={() => handleOpenChange(false)}
          onExecutingChange={setIsExecuting}
        />
      </DialogContent>
    </Dialog>
  );
}

interface DepositConfirmModalContentProps {
  amount: bigint;
  vaultAddress: Address;
  sharePrice: bigint;
  depositFeeBps: bigint;
  onSuccess?: () => void;
  onClose: () => void;
  onExecutingChange?: (isExecuting: boolean) => void;
}

function DepositConfirmModalContent({
  amount,
  vaultAddress,
  sharePrice,
  depositFeeBps,
  onSuccess,
  onClose,
  onExecutingChange,
}: DepositConfirmModalContentProps) {
  const { address } = useAccount();
  const { wallets } = useWallets();
  const embeddedAddress = wallets.find((w) => w.walletClientType === "privy")?.address;
  const senderAddress = (address ?? embeddedAddress) as Address | undefined;
  const { configuredTargets, chainId: referenceChainId, viewMode } = useDeploymentTarget();
  const isMultiChainEnabled = isPrivyConfigured && viewMode === "all";

  const [phase, setPhase] = useState<ModalPhase>("preview");
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [showSponsorshipError, setShowSponsorshipError] = useState(false);
  const [sponsorshipErrorMessage, setSponsorshipErrorMessage] = useState<string | undefined>();

  // Resolve the StateRelay address (lives on the hub chain) so we can read
  // current cross-chain routing weights.
  const stateRelayAddress = useMemo(() => {
    const hubTarget = configuredTargets.find((t) => CHAIN_REGISTRY[t]?.role === "hub");
    if (!hubTarget) return undefined;
    return getContractsForDeploymentTarget(hubTarget).stateRelay;
  }, [configuredTargets]);

  const { data: routingWeights, isLoading: weightsLoading } = useRoutingWeights(stateRelayAddress);

  // Read the basket name from the reference vault so we can resolve per-chain
  // twin addresses by name.
  const { data: vaultNameRaw, isLoading: nameLoading } = useReadContract({
    address: vaultAddress,
    abi: BasketVaultABI,
    functionName: "name",
    chainId: referenceChainId,
    query: { staleTime: 60_000 },
  });
  const vaultName = typeof vaultNameRaw === "string" ? vaultNameRaw : undefined;

  const { data: vaultMatches, isLoading: vaultMatchesLoading } = useVaultAddressByName(
    vaultName,
    referenceChainId,
    vaultAddress
  );

  const vaultMappings = useMemo(() => {
    if (!vaultMatches) return [];
    return vaultMatches
      .filter((m) => m.vaultAddress !== null)
      .map((m) => ({ chainId: m.chainId, vaultAddress: m.vaultAddress as Address }));
  }, [vaultMatches]);

  const supportedChainIds = useMemo(
    () => new Set(vaultMappings.map((m) => m.chainId)),
    [vaultMappings]
  );

  const missingTwinTargets = useMemo(() => {
    if (!vaultMatches) return [] as { target: string; chainId: number }[];
    return vaultMatches
      .filter((m) => m.vaultAddress === null)
      .map((m) => ({ target: m.target, chainId: m.chainId }));
  }, [vaultMatches]);

  // Compute the planned per-chain split. For single-chain mode (or when no
  // routing weights are configured) fall back to a single split on the
  // reference chain so the modal works uniformly for both flows.
  const splits = useMemo<DepositSplit[]>(() => {
    if (vaultMatchesLoading || !vaultMatches) return [];

    if (!isMultiChainEnabled) {
      const singleChainMapping = vaultMappings.find((m) => m.chainId === referenceChainId);
      if (!singleChainMapping) return [];
      const selectorEntry = Object.entries(CHAIN_REGISTRY).find(
        ([, cfg]) => cfg.chainId === referenceChainId
      );
      const selector = selectorEntry ? BigInt(selectorEntry[1].ccipChainSelector) : 0n;
      const chainName = selectorEntry ? selectorEntry[0] : `chain-${referenceChainId}`;
      return [
        {
          chainId: referenceChainId,
          chainSelector: selector,
          chainName,
          amount,
          percentage: 100,
        },
      ];
    }

    if (!routingWeights || routingWeights.length === 0) return [];
    const eligibleWeights = routingWeights.filter((w) => {
      const target = Object.entries(CHAIN_REGISTRY).find(
        ([, cfg]) => cfg.ccipChainSelector === w.chainSelector.toString()
      );
      if (!target) return false;
      const chainId = CHAIN_REGISTRY[target[0]]?.chainId;
      return chainId !== undefined && supportedChainIds.has(chainId);
    });
    if (eligibleWeights.length === 0) return [];
    return computeDepositSplits(amount, eligibleWeights);
  }, [
    amount,
    isMultiChainEnabled,
    referenceChainId,
    routingWeights,
    supportedChainIds,
    vaultMappings,
    vaultMatches,
    vaultMatchesLoading,
  ]);

  // Build the per-chain vault map for execution. For single-chain mode this is
  // just the reference vault; for multi-chain it's the twin map.
  const executionVaultMappings = useMemo(() => {
    if (!isMultiChainEnabled) {
      return splits
        .map((s) => {
          const match = vaultMappings.find((m) => m.chainId === s.chainId);
          return match ? { chainId: s.chainId, vaultAddress: match.vaultAddress } : null;
        })
        .filter((m): m is { chainId: number; vaultAddress: Address } => m !== null);
    }
    return vaultMappings;
  }, [isMultiChainEnabled, splits, vaultMappings]);

  // Pre-flight allowance read per chain so the modal can show approve steps up
  // front and the execution hook can skip approvals that aren't needed.
  const allowanceInputs = useMemo(
    () =>
      executionVaultMappings.filter((m) =>
        splits.some((s) => s.chainId === m.chainId)
      ),
    [executionVaultMappings, splits]
  );
  const { data: allowancesByChain } = useAllowancesPerChain(senderAddress, allowanceInputs);

  const needsApprovalPerChain = useMemo(
    () => computeNeedsApprovalPerChain(splits, allowancesByChain ?? {}),
    [splits, allowancesByChain]
  );

  // Live gas estimate per chain — only fetched while preview is showing, so we
  // stop polling once the user confirms.
  const gasInputs = useMemo(
    () =>
      splits.map((s) => {
        const vault = executionVaultMappings.find((m) => m.chainId === s.chainId)?.vaultAddress;
        return {
          chainId: s.chainId,
          vaultAddress: vault ?? vaultAddress,
          amount: s.amount,
          account: senderAddress,
          needsApproval: needsApprovalPerChain[s.chainId] ?? true,
        };
      }),
    [executionVaultMappings, needsApprovalPerChain, senderAddress, splits, vaultAddress]
  );
  const { data: gasEstimates } = useChainGasEstimates(gasInputs, {
    enabled: phase === "preview",
  });

  const gasByChain = useMemo(() => {
    const map = new Map<number, (typeof gasEstimates extends (infer T)[] | undefined ? T : never)>();
    for (const g of gasEstimates ?? []) {
      map.set(g.chainId, g);
    }
    return map;
  }, [gasEstimates]);

  const { state: depositState, execute, reset } = useParallelChainDeposits();
  const txStatus = useOptionalTransactionStatus();
  const parentTxIdRef = useRef<string | null>(null);

  // Mirror per-chain progress into the global transaction store so the
  // TransactionDock keeps showing this deposit even after the modal is closed.
  useEffect(() => {
    const parentId = parentTxIdRef.current;
    if (!txStatus || !parentId) return;
    if (depositState.chainStatuses.length === 0) return;

    for (const child of depositState.chainStatuses) {
      const patch: Partial<TxChildRecord> = {
        status: mapChainStatusToTxStatus(child.status),
        hash: child.depositTxHash ?? child.approveTxHash,
        error: child.error,
      };
      txStatus.updateChild(parentId, `chain-${child.chainId}`, patch);
    }

    const allConfirmed =
      depositState.totalCount > 0 &&
      depositState.completedCount === depositState.totalCount &&
      !depositState.hasErrors;
    if (allConfirmed) {
      txStatus.completeTx(parentId, {});
      parentTxIdRef.current = null;
    } else if (!depositState.isExecuting && depositState.hasErrors) {
      const firstError =
        depositState.chainStatuses.find((s) => s.status === "error")?.error ??
        "One or more chain deposits failed";
      txStatus.failTx(parentId, firstError);
      parentTxIdRef.current = null;
    }
  }, [
    depositState.chainStatuses,
    depositState.completedCount,
    depositState.hasErrors,
    depositState.isExecuting,
    depositState.totalCount,
    txStatus,
  ]);

  useEffect(() => {
    if (!depositState.isExecuting && depositState.totalCount > 0) {
      if (depositState.hasErrors) {
        const failedChain = depositState.chainStatuses.find((s) => s.status === "error");
        const errorMsg = failedChain?.error;

        if (errorMsg && isSponsorshipError({ message: errorMsg })) {
          queueMicrotask(() => {
            setSponsorshipErrorMessage(errorMsg);
            setShowSponsorshipError(true);
          });
        }
        console.log("[DepositConfirmModal] Phase transition: executing -> error");
        queueMicrotask(() => {
          setPhase("error");
          onExecutingChange?.(false);
        });
      } else if (depositState.completedCount === depositState.totalCount) {
        console.log("[DepositConfirmModal] Phase transition: executing -> complete");
        queueMicrotask(() => {
          setPhase("complete");
          onSuccess?.();
          onExecutingChange?.(false);
        });
      }
    }
  }, [
    depositState.isExecuting,
    depositState.completedCount,
    depositState.totalCount,
    depositState.hasErrors,
    depositState.chainStatuses,
    onSuccess,
    onExecutingChange,
  ]);

  useEffect(() => {
    if (phase === "executing") {
      const safetyTimeout = setTimeout(() => {
        console.warn("[DepositConfirmModal] Safety timeout reached - forcing error phase");
        setPhase("error");
      }, MODAL_SAFETY_TIMEOUT_MS);
      return () => clearTimeout(safetyTimeout);
    }
  }, [phase]);

  const handleConfirm = useCallback(async () => {
    if (!senderAddress || splits.length === 0) return;
    console.log("[DepositConfirmModal] Phase transition: preview -> executing");
    setPhase("executing");
    setDetailsExpanded(true);
    onExecutingChange?.(true);

    if (txStatus) {
      const children: TxChildRecord[] = splits.map((split) => ({
        id: `chain-${split.chainId}`,
        chainId: split.chainId,
        chainName: split.chainName,
        label: `${formatUSDC(split.amount)} USDC on ${split.chainName}`,
        status: "signing",
      }));
      parentTxIdRef.current = txStatus.startTx({
        kind: splits.length > 1 ? "multi-chain-deposit" : "deposit",
        label:
          splits.length > 1
            ? `Multi-chain deposit · ${formatUSDC(amount)} USDC`
            : `Deposit · ${formatUSDC(amount)} USDC`,
        children,
      });
    }

    await execute(splits, executionVaultMappings, { needsApprovalPerChain });
  }, [
    amount,
    executionVaultMappings,
    execute,
    needsApprovalPerChain,
    onExecutingChange,
    senderAddress,
    splits,
    txStatus,
  ]);

  const handleRetry = useCallback(() => {
    reset();
    setShowSponsorshipError(false);
    setSponsorshipErrorMessage(undefined);
    setPhase("preview");
  }, [reset]);

  const handleSponsorshipRetry = useCallback(() => {
    setShowSponsorshipError(false);
    handleRetry();
  }, [handleRetry]);

  const handleClose = useCallback(() => {
    reset();
    setPhase("preview");
    onClose();
  }, [reset, onClose]);

  const sponsorshipDialog = (
    <SponsorshipErrorDialog
      open={showSponsorshipError}
      onOpenChange={setShowSponsorshipError}
      errorMessage={sponsorshipErrorMessage}
      onRetry={handleSponsorshipRetry}
    />
  );

  if (weightsLoading || nameLoading || vaultMatchesLoading) {
    return (
      <>
        <div data-testid="deposit-confirm-modal-phase" data-phase="loading" className="hidden" />
        {sponsorshipDialog}
        <DialogHeader>
          <DialogTitle>Confirm deposit</DialogTitle>
          <DialogDescription>Resolving per-chain vault deployments...</DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-app-accent" />
        </div>
      </>
    );
  }

  if (splits.length === 0) {
    const hasRoutingWeights = (routingWeights?.length ?? 0) > 0;
    const hasAnyTwin = vaultMappings.length > 0;
    const message = !hasRoutingWeights
      ? "No cross-chain routing weights are configured. This basket can only accept deposits on its native chain."
      : hasAnyTwin
        ? `Routing weights are live, but ${vaultName ?? "this basket"} only exists on the chain you have selected.`
        : `${vaultName ?? "This basket"} is not deployed on any configured chain.`;
    return (
      <>
        <div data-testid="deposit-confirm-modal-phase" data-phase="no-routing" className="hidden" />
        {sponsorshipDialog}
        <DialogHeader>
          <DialogTitle>Deposit unavailable</DialogTitle>
          <DialogDescription>No eligible chain for this deposit.</DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border border-app-warning/30 bg-app-warning/5 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-app-warning" />
            <p className="text-sm text-app-muted">{message}</p>
          </div>
        </div>
        <div className="mt-6 flex justify-end">
          <Button variant="secondary" onClick={handleClose}>
            Close
          </Button>
        </div>
      </>
    );
  }

  const totalEstimatedShares =
    sharePrice > 0n
      ? (amount * (10000n - depositFeeBps) * PRICE_PRECISION) / (10000n * sharePrice)
      : 0n;

  const totalNativeCostByChain = new Map<number, string>();
  for (const [chainId, est] of Array.from(
    gasByChain.entries() as IterableIterator<[number, NonNullable<ReturnType<typeof gasByChain.get>>]>
  )) {
    totalNativeCostByChain.set(chainId, est.nativeCostFormatted);
  }

  return (
    <>
      <div
        data-testid="deposit-confirm-modal-phase"
        data-phase={phase}
        className="hidden"
      />
      {sponsorshipDialog}

      <DialogHeader>
        <DialogTitle className="flex items-center gap-3">
          {phase === "complete" ? (
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-app-success/10">
              <CheckCircle2 className="h-5 w-5 text-app-success" />
            </span>
          ) : phase === "error" ? (
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-app-danger/10">
              <AlertTriangle className="h-5 w-5 text-app-danger" />
            </span>
          ) : null}
          <span>
            {phase === "complete"
              ? "Deposit complete"
              : phase === "error"
                ? "Deposit incomplete"
                : phase === "executing"
                  ? `Depositing ${formatUSDC(amount)} USDC`
                  : `Confirm deposit · ${formatUSDC(amount)} USDC`}
          </span>
        </DialogTitle>
        <DialogDescription>
          {phase === "preview" &&
            (splits.length > 1
              ? `Your deposit will be split across ${splits.length} chains based on current routing weights.`
              : `Your deposit will go to ${splits[0]?.chainName ?? "the available chain"}.`)}
          {phase === "executing" &&
            `${depositState.completedCount} of ${depositState.totalCount} chains complete.`}
          {phase === "complete" &&
            `Successfully deposited ${formatUSDC(amount)} USDC across ${splits.length} chain${
              splits.length > 1 ? "s" : ""
            }.`}
          {phase === "error" &&
            "Some chain deposits failed. You can retry the failed chains or close and try again later."}
        </DialogDescription>
      </DialogHeader>

      <div className="mt-4 space-y-4">
        <RoutingBar splits={splits} />

        <RoutingSummary
          splits={splits}
          statuses={phase === "preview" ? null : depositState.chainStatuses}
          needsApprovalPerChain={needsApprovalPerChain}
          gasByChain={gasByChain}
        />

        <DetailsPanel
          expanded={detailsExpanded || phase === "executing" || phase === "complete" || phase === "error"}
          onToggle={() => setDetailsExpanded((v) => !v)}
          forceExpanded={phase !== "preview"}
        >
          <PerChainDetails
            splits={splits}
            statuses={phase === "preview" ? null : depositState.chainStatuses}
            needsApprovalPerChain={needsApprovalPerChain}
            gasByChain={gasByChain}
            sharePrice={sharePrice}
            depositFeeBps={depositFeeBps}
          />

          <div className="mt-4 grid gap-2 rounded-md border border-app-border bg-app-bg-subtle p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-app-muted">Total estimated shares</span>
              <span className="font-semibold text-app-text">{formatShares(totalEstimatedShares)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-app-muted">Deposit fee</span>
              <span className="text-app-text">{Number(depositFeeBps) / 100}%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-app-muted">
                <Fuel className="h-3.5 w-3.5" />
                Total network cost
              </span>
              <NetworkCostTotal estimates={gasEstimates ?? []} />
            </div>
          </div>
        </DetailsPanel>

        {missingTwinTargets.length > 0 && phase === "preview" && (
          <div
            data-testid="deposit-confirm-missing-twin-note"
            className="rounded-lg border border-app-warning/30 bg-app-warning/5 p-3 text-sm"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-app-warning" />
              <p className="text-app-muted">
                <span className="font-medium text-app-text">{vaultName ?? "This basket"}</span> is not
                deployed on {missingTwinTargets.map((m) => deploymentLabel(m.target)).join(", ")}.
                Those chains are skipped from this routing split.
              </p>
            </div>
          </div>
        )}
      </div>

      <ModalFooter
        phase={phase}
        canConfirm={Boolean(senderAddress) && splits.length > 0}
        onConfirm={handleConfirm}
        onRetry={handleRetry}
        onClose={handleClose}
      />
    </>
  );
}

interface RoutingSummaryProps {
  splits: DepositSplit[];
  statuses: ChainDepositStatus[] | null;
  needsApprovalPerChain: Record<number, boolean>;
  gasByChain: Map<number, NonNullable<ReturnType<typeof useChainGasEstimates>["data"]>[number]>;
}

function RoutingSummary({ splits, statuses, needsApprovalPerChain, gasByChain }: RoutingSummaryProps) {
  return (
    <div
      className="space-y-2"
      data-testid="deposit-confirm-routing-summary"
    >
      {splits.map((split) => {
        const meta = getChainMeta(split.chainSelector);
        const Icon = meta.icon;
        const status = statuses?.find((s) => s.chainId === split.chainId);
        const needsApproval = needsApprovalPerChain[split.chainId] ?? true;
        const gas = gasByChain.get(split.chainId);

        return (
          <div
            key={split.chainId}
            data-testid={`deposit-confirm-row-${split.chainId}`}
            data-chain-name={meta.name}
            data-status={status?.status ?? "idle"}
            className={cn(
              "flex items-center justify-between rounded-lg border bg-app-bg-subtle p-3 transition-colors",
              status && (status.status === "approving" || status.status === "depositing" || status.status === "switching")
                ? "border-app-accent/50 ring-1 ring-app-accent/20"
                : "border-app-border",
              status?.status === "success" && "border-app-success/30 bg-app-success/5",
              status?.status === "error" && "border-app-danger/30 bg-app-danger/5"
            )}
          >
            <div className="flex items-center gap-3">
              <div className="relative">
                <Icon size={28} />
                <div className="absolute -bottom-1 -right-1 rounded-full bg-app-surface p-0.5">
                  <RowStatusIcon status={status?.status ?? "idle"} />
                </div>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-app-text">{meta.name}</p>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-app-muted">
                  <span>{split.percentage.toFixed(1)}%</span>
                  {needsApproval && !status && (
                    <span className="inline-flex items-center gap-1 text-app-accent">
                      <ShieldCheck className="h-3 w-3" />
                      Approve + Deposit
                    </span>
                  )}
                  {!needsApproval && !status && <span>Deposit only</span>}
                  {status && <RowStatusLabel status={status.status} />}
                </div>
              </div>
            </div>

            <div className="text-right">
              <p className="text-sm font-semibold text-app-text">{formatUSDC(split.amount)} USDC</p>
              {gas && (
                <p className="flex items-center justify-end gap-1 text-xs text-app-muted">
                  <Fuel className="h-3 w-3" />
                  {gas.nativeCostFormatted}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RowStatusIcon({ status }: { status: ChainTxStatus }) {
  switch (status) {
    case "idle":
      return <div className="h-3.5 w-3.5 rounded-full border-2 border-app-muted" />;
    case "switching":
      return <ArrowRightLeft className="h-3.5 w-3.5 animate-pulse text-app-accent" />;
    case "approving":
      return <ShieldCheck className="h-3.5 w-3.5 animate-pulse text-app-accent" />;
    case "depositing":
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-app-accent" />;
    case "success":
      return <CheckCircle2 className="h-3.5 w-3.5 text-app-success" />;
    case "error":
      return <XCircle className="h-3.5 w-3.5 text-app-danger" />;
  }
}

function RowStatusLabel({ status }: { status: ChainTxStatus }) {
  const tone =
    status === "success"
      ? "text-app-success"
      : status === "error"
        ? "text-app-danger"
        : status === "idle"
          ? "text-app-muted"
          : "text-app-accent";
  const label =
    status === "idle"
      ? "Pending"
      : status === "switching"
        ? "Switching chain..."
        : status === "approving"
          ? "Approving USDC..."
          : status === "depositing"
            ? "Depositing..."
            : status === "success"
              ? "Complete"
              : "Failed";
  return <span className={cn("font-medium", tone)}>{label}</span>;
}

interface DetailsPanelProps {
  expanded: boolean;
  forceExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function DetailsPanel({ expanded, forceExpanded, onToggle, children }: DetailsPanelProps) {
  return (
    <div className="rounded-lg border border-app-border bg-app-surface" data-testid="deposit-confirm-details">
      <button
        type="button"
        onClick={onToggle}
        disabled={forceExpanded}
        className={cn(
          "flex w-full items-center justify-between px-4 py-2.5 text-sm font-medium text-app-text transition-colors hover:bg-app-bg-subtle disabled:cursor-default disabled:hover:bg-transparent",
          expanded && "border-b border-app-border"
        )}
        data-testid="deposit-confirm-details-toggle"
        aria-expanded={expanded}
      >
        <span className="inline-flex items-center gap-2">
          <Fuel className="h-4 w-4 text-app-muted" />
          Routing &amp; network details
        </span>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-app-muted" />
        ) : (
          <ChevronDown className="h-4 w-4 text-app-muted" />
        )}
      </button>
      {expanded && <div className="px-4 py-3">{children}</div>}
    </div>
  );
}

interface PerChainDetailsProps {
  splits: DepositSplit[];
  statuses: ChainDepositStatus[] | null;
  needsApprovalPerChain: Record<number, boolean>;
  gasByChain: Map<number, NonNullable<ReturnType<typeof useChainGasEstimates>["data"]>[number]>;
  sharePrice: bigint;
  depositFeeBps: bigint;
}

function PerChainDetails({
  splits,
  statuses,
  needsApprovalPerChain,
  gasByChain,
  sharePrice,
  depositFeeBps,
}: PerChainDetailsProps) {
  return (
    <div className="space-y-3">
      {splits.map((split) => {
        const meta = getChainMeta(split.chainSelector);
        const Icon = meta.icon;
        const status = statuses?.find((s) => s.chainId === split.chainId);
        const needsApproval = needsApprovalPerChain[split.chainId] ?? true;
        const gas = gasByChain.get(split.chainId);
        const estimatedShares =
          sharePrice > 0n
            ? (split.amount * (10000n - depositFeeBps) * PRICE_PRECISION) / (10000n * sharePrice)
            : 0n;

        const approveStatus: "pending" | "active" | "complete" | "skipped" =
          !needsApproval
            ? "skipped"
            : status?.status === "approving"
              ? "active"
              : status?.approveTxHash || status?.status === "depositing" || status?.status === "success"
                ? "complete"
                : "pending";
        const depositStatus: "pending" | "active" | "complete" | "failed" =
          status?.status === "depositing"
            ? "active"
            : status?.status === "success"
              ? "complete"
              : status?.status === "error"
                ? "failed"
                : "pending";

        return (
          <div
            key={split.chainId}
            className="rounded-md border border-app-border bg-app-bg-subtle p-3"
            data-testid={`deposit-confirm-details-${split.chainId}`}
          >
            <div className="mb-2 flex items-center gap-2">
              <Icon size={20} />
              <span className="text-sm font-semibold text-app-text">{meta.name}</span>
              <span className="text-xs text-app-muted">· {split.percentage.toFixed(1)}%</span>
            </div>

            <StepRow
              label="Approve USDC"
              status={approveStatus}
              gasUnits={gas?.approveGas}
              txHash={status?.approveTxHash}
            />
            <StepRow
              label="Deposit"
              status={depositStatus}
              gasUnits={gas?.depositGas}
              gasIsFallback={gas?.depositEstimateIsFallback}
              txHash={status?.depositTxHash}
            />

            <div className="mt-2 grid grid-cols-2 gap-2 border-t border-app-border pt-2 text-xs">
              <div>
                <p className="text-app-muted">Network cost</p>
                <p className="font-medium text-app-text">{gas?.nativeCostFormatted ?? "—"}</p>
              </div>
              <div className="text-right">
                <p className="text-app-muted">Estimated shares</p>
                <p className="font-medium text-app-text">~{formatShares(estimatedShares)}</p>
              </div>
            </div>

            {status?.error && (
              <div className="mt-2 rounded-md bg-app-danger/10 px-2 py-1">
                <p className="text-xs text-app-danger">{status.error}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface StepRowProps {
  label: string;
  status: "pending" | "active" | "complete" | "failed" | "skipped";
  gasUnits?: bigint;
  gasIsFallback?: boolean;
  txHash?: `0x${string}`;
}

function StepRow({ label, status, gasUnits, gasIsFallback, txHash }: StepRowProps) {
  return (
    <div className="flex items-center justify-between py-1 text-xs">
      <div className="flex items-center gap-2">
        <StepIcon status={status} />
        <span
          className={cn(
            "font-medium",
            status === "active" && "text-app-accent",
            status === "complete" && "text-app-success",
            status === "failed" && "text-app-danger",
            status === "pending" && "text-app-muted",
            status === "skipped" && "text-app-muted line-through"
          )}
        >
          {label}
        </span>
        {status === "skipped" && (
          <span className="text-app-muted">(approval already in place)</span>
        )}
      </div>
      <div className="flex items-center gap-2 text-app-muted">
        {gasUnits && gasUnits > 0n && status !== "skipped" && (
          <span>
            ~{Number(gasUnits).toLocaleString()} gas
            {gasIsFallback ? " (est.)" : ""}
          </span>
        )}
        {txHash && (
          <span className="font-mono">
            {txHash.slice(0, 6)}...{txHash.slice(-4)}
          </span>
        )}
      </div>
    </div>
  );
}

function StepIcon({ status }: { status: StepRowProps["status"] }) {
  if (status === "active") return <Loader2 className="h-3 w-3 animate-spin text-app-accent" />;
  if (status === "complete") return <CheckCircle2 className="h-3 w-3 text-app-success" />;
  if (status === "failed") return <XCircle className="h-3 w-3 text-app-danger" />;
  if (status === "skipped") return <CheckCircle2 className="h-3 w-3 text-app-muted" />;
  return <div className="h-3 w-3 rounded-full border border-app-muted" />;
}

function NetworkCostTotal({
  estimates,
}: {
  estimates: NonNullable<ReturnType<typeof useChainGasEstimates>["data"]>;
}) {
  if (!estimates || estimates.length === 0) {
    return <span className="text-app-muted">—</span>;
  }

  const bySymbol = new Map<string, bigint>();
  for (const est of estimates) {
    bySymbol.set(est.nativeSymbol, (bySymbol.get(est.nativeSymbol) ?? 0n) + est.nativeCostWei);
  }

  const parts = Array.from(bySymbol.entries() as IterableIterator<[string, bigint]>).map(
    ([symbol, wei]) => {
      const formatted = formatTotalWei(wei);
      return `${formatted} ${symbol}`;
    }
  );

  return <span className="font-medium text-app-text">{parts.join(" + ")}</span>;
}

function formatTotalWei(wei: bigint): string {
  if (wei === 0n) return "0";
  const eth = Number(wei) / 1e18;
  if (eth < 0.000001) return "<0.000001";
  if (eth < 1) return eth.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  return eth.toFixed(4);
}

interface ModalFooterProps {
  phase: ModalPhase;
  canConfirm: boolean;
  onConfirm: () => void;
  onRetry: () => void;
  onClose: () => void;
}

function ModalFooter({ phase, canConfirm, onConfirm, onRetry, onClose }: ModalFooterProps) {
  if (phase === "preview") {
    return (
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          data-testid="deposit-confirm-submit"
          onClick={onConfirm}
          disabled={!canConfirm}
        >
          Confirm deposit
        </Button>
      </div>
    );
  }

  if (phase === "executing") {
    return (
      <div className="mt-6">
        <p className="text-xs text-app-muted">
          Transactions will continue in the background. You can close this dialog and the dock
          will keep showing progress.
        </p>
      </div>
    );
  }

  if (phase === "complete") {
    return (
      <div className="mt-6 flex justify-end">
        <Button onClick={onClose}>Done</Button>
      </div>
    );
  }

  return (
    <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button variant="secondary" onClick={onClose}>
        Close
      </Button>
      <Button onClick={onRetry} data-testid="deposit-confirm-retry">
        <RotateCcw className="mr-1 h-3.5 w-3.5" />
        Retry failed
      </Button>
    </div>
  );
}
