"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { type Address } from "viem";
import { useAccount } from "wagmi";
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
import { RoutingBreakdown, RoutingBar, type RoutingSplit } from "./routing-breakdown";
import { ChainDepositList } from "./chain-deposit-row";
import { SponsorshipErrorDialog, isSponsorshipError } from "./sponsorship-error-dialog";
import {
  useParallelChainDeposits,
  computeDepositSplits,
  type ChainDepositStatus,
} from "@/hooks/useParallelChainDeposits";
import { useRoutingWeights } from "@/hooks/useRoutingWeights";
import { useDeploymentTarget } from "@/providers/DeploymentProvider";
import { getContractsForDeploymentTarget, CONFIGURED_DEPLOYMENT_TARGETS } from "@/config/contracts";
import { CHAIN_REGISTRY, deploymentTargetForChainId } from "@/lib/deployment";
import { formatUSDC } from "@/lib/format";

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
  const { configuredTargets } = useDeploymentTarget();
  
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

  const splits = useMemo(() => {
    if (!routingWeights || routingWeights.length === 0) return [];
    return computeDepositSplits(amount, routingWeights);
  }, [amount, routingWeights]);

  const vaultMappings = useMemo(() => {
    return CONFIGURED_DEPLOYMENT_TARGETS.map((target) => {
      const contracts = getContractsForDeploymentTarget(target);
      const chainId = CHAIN_REGISTRY[target]?.chainId;
      if (!chainId) return null;
      return {
        chainId,
        vaultAddress: vaultAddress,
      };
    }).filter((m): m is { chainId: number; vaultAddress: Address } => m !== null);
  }, [vaultAddress]);

  const { state: depositState, execute, reset } = useParallelChainDeposits();

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

  useEffect(() => {
    if (!depositState.isExecuting && depositState.totalCount > 0) {
      if (depositState.hasErrors) {
        const failedChain = depositState.chainStatuses.find((s) => s.status === "error");
        const errorMsg = failedChain?.error;
        
        if (errorMsg && isSponsorshipError({ message: errorMsg })) {
          setSponsorshipErrorMessage(errorMsg);
          setShowSponsorshipError(true);
        }
        console.log("[MultiChainDrawer] Phase transition: executing -> error (hasErrors=true)");
        setPhase("error");
        onExecutingChange?.(false);
      } else if (depositState.completedCount === depositState.totalCount) {
        console.log("[MultiChainDrawer] Phase transition: executing -> complete");
        setPhase("complete");
        onSuccess?.();
        onExecutingChange?.(false);
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
    await execute(splits, vaultMappings);
  }, [senderAddress, splits, vaultMappings, execute, onExecutingChange]);

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

  if (weightsLoading) {
    return (
      <>
        <div data-testid="multi-chain-drawer-phase" data-phase="loading" className="hidden" />
        {sponsorshipDialog}
        <DrawerHeader>
          <DrawerTitle>Multi-Chain Deposit</DrawerTitle>
          <DrawerDescription>Loading routing weights...</DrawerDescription>
        </DrawerHeader>
        <DrawerBody className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-app-accent" />
        </DrawerBody>
      </>
    );
  }

  if (splits.length === 0) {
    return (
      <>
        <div data-testid="multi-chain-drawer-phase" data-phase="no-routing" className="hidden" />
        {sponsorshipDialog}
        <DrawerHeader>
          <DrawerTitle>Multi-Chain Deposit</DrawerTitle>
          <DrawerDescription>No routing configuration available</DrawerDescription>
        </DrawerHeader>
        <DrawerBody>
          <div className="rounded-lg border border-app-warning/30 bg-app-warning/5 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-app-warning" />
              <div>
                <p className="text-sm font-medium text-app-text">Single Chain Deposit</p>
                <p className="mt-1 text-sm text-app-muted">
                  No cross-chain routing weights are configured. Your deposit will go to the 
                  current chain only. Use the standard deposit panel for single-chain deposits.
                </p>
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
    return (
      <>
        <div data-testid="multi-chain-drawer-phase" data-phase="preview" className="hidden" />
        {sponsorshipDialog}
        <DrawerHeader>
          <DrawerTitle>Confirm Multi-Chain Deposit</DrawerTitle>
          <DrawerDescription>
            Your {formatUSDC(amount)} USDC deposit will be split across {splits.length} chains
          </DrawerDescription>
        </DrawerHeader>
        <DrawerBody>
          <RoutingBar splits={splits} className="mb-4" />
          <RoutingBreakdown
            splits={splits}
            totalAmount={amount}
            sharePrice={sharePrice}
            depositFeeBps={depositFeeBps}
          />
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
