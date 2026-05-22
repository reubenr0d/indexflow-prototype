"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { type Address } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { useWallets } from "@privy-io/react-auth";
import { CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
  useDrawer,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { RoutingBreakdown, RoutingBar } from "./routing-breakdown";
import { ChainDepositList } from "./chain-deposit-row";
import { SponsorshipErrorDialog, isSponsorshipError } from "./sponsorship-error-dialog";
import {
  useParallelChainDeposits,
  computeDepositSplits,
  type ChainDepositStatus,
  type ChainTxStatus,
} from "@/hooks/useParallelChainDeposits";
import { useRoutingWeights } from "@/hooks/useRoutingWeights";
import { useVaultAddressByName } from "@/hooks/useVaultAddressByName";
import { useDeploymentTarget } from "@/providers/DeploymentProvider";
import { getContractsForDeploymentTarget } from "@/config/contracts";
import { CHAIN_REGISTRY, deploymentLabel } from "@/lib/deployment";
import { formatUSDC } from "@/lib/format";
import { BasketVaultABI } from "@/abi/contracts";
import {
  useOptionalTransactionStatus,
  type TxChildRecord,
  type TxStatus,
} from "@/providers/TransactionStatusProvider";

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

type DrawerPhase = "preview" | "executing" | "complete" | "error";

const DRAWER_SAFETY_TIMEOUT_MS = 160_000; // 2.67 minutes - backup safety timeout

interface MultiChainDepositDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amount: bigint;
  vaultAddress: Address;
  sharePrice: bigint;
  depositFeeBps: bigint;
  onSuccess?: () => void;
}

export function MultiChainDepositDrawer({
  open,
  onOpenChange,
  amount,
  vaultAddress,
  sharePrice,
  depositFeeBps,
  onSuccess,
}: MultiChainDepositDrawerProps) {
  const [isExecuting, setIsExecuting] = useState(false);
  
  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen && isExecuting) {
      console.log("[MultiChainDrawer] Prevented close during execution");
      return;
    }
    onOpenChange(nextOpen);
  }, [isExecuting, onOpenChange]);

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerContent data-testid="multi-chain-drawer-content">
        <MultiChainDepositDrawerContent
          amount={amount}
          vaultAddress={vaultAddress}
          sharePrice={sharePrice}
          depositFeeBps={depositFeeBps}
          onSuccess={onSuccess}
          onClose={() => handleOpenChange(false)}
          onExecutingChange={setIsExecuting}
        />
      </DrawerContent>
    </Drawer>
  );
}

interface DrawerContentProps {
  amount: bigint;
  vaultAddress: Address;
  sharePrice: bigint;
  depositFeeBps: bigint;
  onSuccess?: () => void;
  onClose: () => void;
  onExecutingChange?: (isExecuting: boolean) => void;
}

function MultiChainDepositDrawerContent({
  amount,
  vaultAddress,
  sharePrice,
  depositFeeBps,
  onSuccess,
  onClose,
  onExecutingChange,
}: DrawerContentProps) {
  const { setMinimizedContent } = useDrawer();
  const { address } = useAccount();
  const { wallets } = useWallets();
  const embeddedAddress = wallets.find((wallet) => wallet.walletClientType === "privy")?.address;
  const senderAddress = address ?? embeddedAddress;
  const { configuredTargets, chainId: referenceChainId } = useDeploymentTarget();
  
  const [phase, setPhase] = useState<DrawerPhase>("preview");
  const [showSponsorshipError, setShowSponsorshipError] = useState(false);
  const [sponsorshipErrorMessage, setSponsorshipErrorMessage] = useState<string | undefined>();

  const stateRelayAddress = useMemo(() => {
    const hubTarget = configuredTargets.find((t) => CHAIN_REGISTRY[t]?.role === "hub");
    if (!hubTarget) return undefined;
    const contracts = getContractsForDeploymentTarget(hubTarget);
    return contracts.stateRelay;
  }, [configuredTargets]);

  const { data: routingWeights, isLoading: weightsLoading } = useRoutingWeights(stateRelayAddress);

  // Read the basket name from the reference vault so we can resolve the per-chain twin
  // addresses by name. The reference vault lives on `referenceChainId` (the currently
  // selected single-chain target, or the default if the user is in "All Chains").
  const { data: vaultNameRaw, isLoading: nameLoading } = useReadContract({
    address: vaultAddress,
    abi: BasketVaultABI,
    functionName: "name",
    chainId: referenceChainId,
    query: { staleTime: 60_000 },
  });
  const vaultName = typeof vaultNameRaw === "string" ? vaultNameRaw : undefined;

  const {
    data: vaultMatches,
    isLoading: vaultMatchesLoading,
  } = useVaultAddressByName(vaultName, referenceChainId, vaultAddress);

  // Build the chainId -> vaultAddress map used by the parallel-deposits hook,
  // limited to chains that actually have a deployed twin of this basket.
  const vaultMappings = useMemo(() => {
    if (!vaultMatches) return [];
    return vaultMatches
      .filter((m) => m.vaultAddress !== null)
      .map((m) => ({ chainId: m.chainId, vaultAddress: m.vaultAddress as Address }));
  }, [vaultMatches]);

  const supportedChainIds = useMemo(
    () => new Set(vaultMappings.map((m) => m.chainId)),
    [vaultMappings],
  );

  const missingTwinTargets = useMemo(() => {
    if (!vaultMatches) return [] as { target: string; chainId: number }[];
    return vaultMatches
      .filter((m) => m.vaultAddress === null)
      .map((m) => ({ target: m.target, chainId: m.chainId }));
  }, [vaultMatches]);

  // Filter the routing splits to chains where a deployed twin exists. If the
  // current basket is single-chain only (e.g. an agent-created vault that has
  // no Fuji counterpart), routing collapses to a single chain rather than
  // attempting a Fuji deposit against a Sepolia-only address.
  const splits = useMemo(() => {
    if (!routingWeights || routingWeights.length === 0) return [];
    if (vaultMatchesLoading || !vaultMatches) return [];
    const eligibleWeights = routingWeights.filter((w) => {
      const target = Object.entries(CHAIN_REGISTRY).find(
        ([, cfg]) => cfg.ccipChainSelector === w.chainSelector.toString(),
      );
      if (!target) return false;
      const chainId = CHAIN_REGISTRY[target[0]]?.chainId;
      return chainId !== undefined && supportedChainIds.has(chainId);
    });
    if (eligibleWeights.length === 0) return [];
    return computeDepositSplits(amount, eligibleWeights);
  }, [amount, routingWeights, vaultMatches, vaultMatchesLoading, supportedChainIds]);

  const { state: depositState, execute, reset } = useParallelChainDeposits();
  const txStatus = useOptionalTransactionStatus();
  const parentTxIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (depositState.isExecuting) {
      const completed = depositState.completedCount;
      const total = depositState.totalCount;
      setMinimizedContent(
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-app-accent" />
          <span className="text-sm font-medium text-app-text">
            Depositing... {completed}/{total} chains
          </span>
        </div>
      );
    } else if (phase === "complete") {
      setMinimizedContent(
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-app-success" />
          <span className="text-sm font-medium text-app-text">
            Deposit complete
          </span>
        </div>
      );
    }
  }, [depositState.isExecuting, depositState.completedCount, depositState.totalCount, phase, setMinimizedContent]);

  // Mirror per-chain progress into the global transaction store so the
  // TransactionDock keeps showing this multi-chain deposit even after the
  // drawer is closed/minimized or the user navigates away.
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
        console.log("[MultiChainDrawer] Phase transition: executing -> error (hasErrors=true)");
        queueMicrotask(() => {
          setPhase("error");
          onExecutingChange?.(false);
        });
      } else if (depositState.completedCount === depositState.totalCount) {
        console.log("[MultiChainDrawer] Phase transition: executing -> complete");
        queueMicrotask(() => {
          setPhase("complete");
          onSuccess?.();
          onExecutingChange?.(false);
        });
      }
    }
  }, [depositState.isExecuting, depositState.completedCount, depositState.totalCount, depositState.hasErrors, depositState.chainStatuses, onSuccess, onExecutingChange]);

  useEffect(() => {
    if (phase === "executing") {
      console.log("[MultiChainDrawer] Executing phase started - safety timeout armed");
      const safetyTimeout = setTimeout(() => {
        console.warn("[MultiChainDrawer] Safety timeout reached - forcing error phase");
        setPhase("error");
      }, DRAWER_SAFETY_TIMEOUT_MS);
      return () => {
        console.log("[MultiChainDrawer] Safety timeout cleared");
        clearTimeout(safetyTimeout);
      };
    }
  }, [phase]);

  const handleConfirm = useCallback(async () => {
    if (!senderAddress || splits.length === 0) return;
    console.log("[MultiChainDrawer] Phase transition: preview -> executing");
    setPhase("executing");
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
        kind: "multi-chain-deposit",
        label: `Multi-chain deposit · ${formatUSDC(amount)} USDC`,
        children,
      });
    }

    await execute(splits, vaultMappings);
  }, [amount, senderAddress, splits, vaultMappings, execute, onExecutingChange, txStatus]);

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
        <div data-testid="multi-chain-drawer-phase" data-phase="loading" className="hidden" />
        {sponsorshipDialog}
        <DrawerHeader>
          <DrawerTitle>Multi-Chain Deposit</DrawerTitle>
          <DrawerDescription>Resolving per-chain vault deployments...</DrawerDescription>
        </DrawerHeader>
        <DrawerBody className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-app-accent" />
        </DrawerBody>
      </>
    );
  }

  if (splits.length === 0) {
    const hasRoutingWeights = (routingWeights?.length ?? 0) > 0;
    const hasAnyTwin = vaultMappings.length > 0;
    const title = !hasRoutingWeights ? "No routing configuration available" : "No multi-chain deployment for this basket";
    const message = !hasRoutingWeights
      ? "No cross-chain routing weights are configured. Your deposit will go to the current chain only. Use the standard deposit panel for single-chain deposits."
      : hasAnyTwin
        ? `Routing weights are live, but ${vaultName ?? "this basket"} only exists on the chain you have selected. Use the standard deposit panel — multi-chain split is unavailable until a twin basket is deployed on another chain.`
        : `${vaultName ?? "This basket"} is not deployed on any configured chain. Make sure the basket address matches a vault returned by BasketFactory.getAllBaskets() on at least one chain.`;
    return (
      <>
        <div data-testid="multi-chain-drawer-phase" data-phase="no-routing" className="hidden" />
        {sponsorshipDialog}
        <DrawerHeader>
          <DrawerTitle>Multi-Chain Deposit</DrawerTitle>
          <DrawerDescription>{title}</DrawerDescription>
        </DrawerHeader>
        <DrawerBody>
          <div className="rounded-lg border border-app-warning/30 bg-app-warning/5 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-app-warning" />
              <div>
                <p className="text-sm font-medium text-app-text">Single Chain Deposit</p>
                <p className="mt-1 text-sm text-app-muted">{message}</p>
              </div>
            </div>
          </div>
        </DrawerBody>
        <DrawerFooter>
          <Button variant="secondary" onClick={handleClose}>
            Close
          </Button>
        </DrawerFooter>
      </>
    );
  }

  if (phase === "preview") {
    const description =
      splits.length === 1
        ? `Your ${formatUSDC(amount)} USDC deposit will go to ${splits[0]?.chainName ?? "the available chain"}`
        : `Your ${formatUSDC(amount)} USDC deposit will be split across ${splits.length} chains`;
    return (
      <>
        <div data-testid="multi-chain-drawer-phase" data-phase="preview" className="hidden" />
        {sponsorshipDialog}
        <DrawerHeader>
          <DrawerTitle>Confirm Multi-Chain Deposit</DrawerTitle>
          <DrawerDescription>{description}</DrawerDescription>
        </DrawerHeader>
        <DrawerBody>
          <RoutingBar splits={splits} className="mb-4" />
          <RoutingBreakdown
            splits={splits}
            totalAmount={amount}
            sharePrice={sharePrice}
            depositFeeBps={depositFeeBps}
          />
          {missingTwinTargets.length > 0 && (
            <div
              data-testid="multi-chain-missing-twin-note"
              className="mt-4 rounded-lg border border-app-warning/30 bg-app-warning/5 p-3 text-sm"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-app-warning" />
                <p className="text-app-muted">
                  <span className="font-medium text-app-text">
                    {vaultName ?? "This basket"}
                  </span>{" "}
                  is not deployed on{" "}
                  {missingTwinTargets
                    .map((m) => deploymentLabel(m.target))
                    .join(", ")}
                  . Those chains are skipped from this routing split. Deposit only goes
                  to chains where a twin basket exists.
                </p>
              </div>
            </div>
          )}
        </DrawerBody>
        <DrawerFooter>
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button data-testid="multi-chain-confirm-deposit" onClick={handleConfirm} disabled={!senderAddress}>
            Confirm Deposit
          </Button>
        </DrawerFooter>
      </>
    );
  }

  if (phase === "executing") {
    return (
      <>
        <div data-testid="multi-chain-drawer-phase" data-phase="executing" className="hidden" />
        {sponsorshipDialog}
        <DrawerHeader>
          <DrawerTitle>Depositing...</DrawerTitle>
          <DrawerDescription>
            {depositState.completedCount} of {depositState.totalCount} chains complete
          </DrawerDescription>
        </DrawerHeader>
        <DrawerBody>
          <RoutingBar splits={splits} className="mb-4" />
          <ChainDepositList
            statuses={depositState.chainStatuses.map((s) => ({
              ...s,
              chainName: s.chainName,
            }))}
          />
        </DrawerBody>
        <DrawerFooter>
          <p className="text-xs text-app-muted">
            You can minimize this drawer. Transactions will continue in the background.
          </p>
        </DrawerFooter>
      </>
    );
  }

  if (phase === "complete") {
    return (
      <>
        <div data-testid="multi-chain-drawer-phase" data-phase="complete" className="hidden" />
        {sponsorshipDialog}
        <DrawerHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-app-success/10">
            <CheckCircle2 className="h-6 w-6 text-app-success" />
          </div>
          <DrawerTitle className="text-center">Deposit Complete!</DrawerTitle>
          <DrawerDescription className="text-center">
            Successfully deposited {formatUSDC(amount)} USDC across {splits.length} chains
          </DrawerDescription>
        </DrawerHeader>
        <DrawerBody>
          <ChainDepositList
            statuses={depositState.chainStatuses.map((s) => ({
              ...s,
              chainName: s.chainName,
            }))}
          />
        </DrawerBody>
        <DrawerFooter>
          <Button onClick={handleClose} className="w-full">
            Done
          </Button>
        </DrawerFooter>
      </>
    );
  }

  return (
    <>
      <div data-testid="multi-chain-drawer-phase" data-phase="error" className="hidden" />
      {sponsorshipDialog}
      <DrawerHeader>
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-app-danger/10">
          <AlertTriangle className="h-6 w-6 text-app-danger" />
        </div>
        <DrawerTitle className="text-center">Deposit Incomplete</DrawerTitle>
        <DrawerDescription className="text-center">
          Some chain deposits failed. You can retry or close and try again later.
        </DrawerDescription>
      </DrawerHeader>
      <DrawerBody>
        <ChainDepositList
          statuses={depositState.chainStatuses.map((s) => ({
            ...s,
            chainName: s.chainName,
          }))}
        />
      </DrawerBody>
      <DrawerFooter>
        <Button variant="secondary" onClick={handleClose}>
          Close
        </Button>
        <Button onClick={handleRetry}>Retry Failed</Button>
      </DrawerFooter>
    </>
  );
}
