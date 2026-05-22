"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, useConfig } from "wagmi";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import {
  useApproveUSDC,
  useDeposit,
  useRedeem,
  useSimulateDeposit,
  useSimulateRedeem,
  useUSDCAllowance,
  useUSDCBalance,
} from "@/hooks/useBasketVault";
import { getContracts } from "@/config/contracts";
import { useDeploymentTarget } from "@/providers/DeploymentProvider";
import { formatUSDC, formatShares, parseUSDCInput } from "@/lib/format";
import { PRICE_PRECISION } from "@/lib/constants";
import { showToast } from "@/components/ui/toast";
import { useContractErrorToast } from "@/hooks/useContractErrorToast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { TrendPill } from "@/components/ui/trend-pill";
import {
  getPanelPrimaryActionMeta,
  type PanelMode,
} from "@/components/ui/icon-helpers";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  CheckCircle2,
  ExternalLink,
  Layers,
  Loader2,
  XCircle,
} from "lucide-react";
import { type Address } from "viem";
import { MultiChainDepositDrawer } from "./multi-chain-deposit-drawer";
import { SponsorshipErrorDialog, isSponsorshipError } from "./sponsorship-error-dialog";
import { isPrivyConfigured } from "@/config/privy";

type Mode = PanelMode;

interface DepositRedeemPanelProps {
  vault: Address;
  sharePrice: bigint;
  depositFeeBps: bigint;
  redeemFeeBps: bigint;
  shareBalance?: bigint;
}

export function getModeStateOnSwitch(nextMode: Mode) {
  return { mode: nextMode, amount: "" };
}

export function getQuoteAmountLabel(mode: Mode, amount: bigint) {
  return mode === "deposit" ? `${formatUSDC(amount)} USDC` : `${formatShares(amount)} shares`;
}

export function getSimulationErrorMessage(mode: Mode, error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");

  if (mode === "deposit" && raw.includes("Chain not accepting deposits")) {
    return "This chain is not accepting deposits right now. Wait for the next keeper update or deposit on another chain.";
  }
  if (mode === "redeem" && raw.includes("Insufficient liquidity")) {
    return "Not enough idle USDC is available for this redemption size. Try a smaller redeem and wait for liquidity to refill.";
  }
  if (mode === "redeem") {
    return "This redemption is likely to fail. Check your share balance and available vault liquidity.";
  }
  return "This deposit is likely to fail. Check your balance and chain routing status.";
}

export function DepositRedeemPanel({
  vault,
  sharePrice,
  depositFeeBps,
  redeemFeeBps,
  shareBalance,
}: DepositRedeemPanelProps) {
  const [mode, setMode] = useState<Mode>("deposit");
  const [amount, setAmount] = useState("");
  const [isMultiChainDrawerOpen, setIsMultiChainDrawerOpen] = useState(false);
  const [showSponsorshipError, setShowSponsorshipError] = useState(false);
  const [sponsorshipErrorMessage, setSponsorshipErrorMessage] = useState<string | undefined>();
  const [approvalInFlightAmount, setApprovalInFlightAmount] = useState<bigint>(0n);
  const { address } = useAccount();
  const wagmiConfig = useConfig();
  const { client: smartWalletClient } = useSmartWallets();
  const { chainId, viewMode } = useDeploymentTarget();
  const { usdc } = getContracts(chainId);
  const activeAddress =
    chainId === 43113 ? (smartWalletClient?.account?.address as Address | undefined) : address;
  const explorerBase = useMemo(
    () => wagmiConfig.chains.find((c) => c.id === chainId)?.blockExplorers?.default?.url,
    [chainId, wagmiConfig.chains]
  );
  const explorerUrl = (hash?: `0x${string}`) => (hash && explorerBase ? `${explorerBase}/tx/${hash}` : undefined);

  const isMultiChainEnabled = isPrivyConfigured && viewMode === "all";

  const { data: usdcBalance } = useUSDCBalance(usdc, activeAddress);
  const { data: allowance, refetch: refetchAllowance } = useUSDCAllowance(
    usdc,
    activeAddress,
    vault
  );

  const {
    approve,
    hash: approveHash,
    receipt: approveReceipt,
    isPending: isApproving,
    error: approveError,
    isError: isApproveError,
  } = useApproveUSDC();
  const {
    deposit,
    hash: depositHash,
    receipt: depositReceipt,
    isPending: isDepositing,
    error: depositError,
    isError: isDepositError,
  } = useDeposit();
  const {
    redeem,
    hash: redeemHash,
    receipt: redeemReceipt,
    isPending: isRedeeming,
    error: redeemError,
    isError: isRedeemError,
  } = useRedeem();

  const parsedAmount = amount ? parseUSDCInput(amount) : 0n;

  const { error: simDepositError, refetch: refetchSimDeposit } = useSimulateDeposit(
    vault,
    mode === "deposit" ? parsedAmount : 0n,
    mode === "deposit" ? activeAddress : undefined
  );
  const { error: simRedeemError } = useSimulateRedeem(
    vault,
    mode === "redeem" ? parsedAmount : 0n,
    mode === "redeem" ? activeAddress : undefined
  );
  const simulationError = mode === "deposit" ? simDepositError : simRedeemError;
  const simulationErrorMessage = simulationError ? getSimulationErrorMessage(mode, simulationError) : null;

  const needsApproval =
    mode === "deposit" &&
    parsedAmount > 0n &&
    (allowance ?? 0n) < parsedAmount;

  const estimatedShares =
    mode === "deposit" && sharePrice > 0n
      ? (parsedAmount * (10000n - depositFeeBps) * PRICE_PRECISION) / (10000n * sharePrice)
      : 0n;

  const estimatedUSDC =
    mode === "redeem" && sharePrice > 0n
      ? (parsedAmount * sharePrice * (10000n - redeemFeeBps)) / (10000n * PRICE_PRECISION)
      : 0n;

  const isApprovalConfirming =
    isApproving || approveReceipt.isLoading || approvalInFlightAmount > 0n;
  const isDepositConfirming = isDepositing || depositReceipt.isLoading;
  const isRedeemConfirming = isRedeeming || redeemReceipt.isLoading;
  const isProcessing = isApprovalConfirming || isDepositConfirming || isRedeemConfirming;

  const processingAction: "approve" | "deposit" | "redeem" | null = isApprovalConfirming
    ? "approve"
    : isDepositConfirming
      ? "deposit"
      : isRedeemConfirming
        ? "redeem"
        : null;

  const blockedBySimulation =
    parsedAmount > 0n &&
    !needsApproval &&
    Boolean(simulationError) &&
    !(mode === "deposit" && isMultiChainEnabled);
  const balance = mode === "deposit" ? usdcBalance : shareBalance;
  const hasAmount = parsedAmount > 0n;
  const actionMeta = getPanelPrimaryActionMeta({
    hasAddress: Boolean(activeAddress),
    mode,
    needsApproval,
    isProcessing,
    processingAction,
  });

  useEffect(() => {
    if (approveReceipt.isSuccess) {
      refetchAllowance();
      refetchSimDeposit();
    }
  }, [approveReceipt.isSuccess, refetchAllowance, refetchSimDeposit]);

  useEffect(() => {
    if (approvalInFlightAmount === 0n) return;
    if ((allowance ?? 0n) >= approvalInFlightAmount) {
      setApprovalInFlightAmount(0n);
    }
  }, [allowance, approvalInFlightAmount]);

  useEffect(() => {
    if (isApproveError || approveReceipt.isError) {
      setApprovalInFlightAmount(0n);
    }
  }, [isApproveError, approveReceipt.isError]);

  useContractErrorToast({
    writeError: approveError,
    writeIsError: isApproveError,
    receiptError: approveReceipt.error,
    receiptIsError: approveReceipt.isError,
    fallbackMessage: "USDC approval failed",
  });

  useContractErrorToast({
    writeError: depositError,
    writeIsError: isDepositError,
    receiptError: depositReceipt.error,
    receiptIsError: depositReceipt.isError,
    fallbackMessage: "Deposit failed",
  });

  useEffect(() => {
    if (isDepositError && depositError && isSponsorshipError(depositError)) {
      const msg = depositError instanceof Error ? depositError.message : String(depositError);
      setSponsorshipErrorMessage(msg);
      setShowSponsorshipError(true);
    }
  }, [isDepositError, depositError]);

  useEffect(() => {
    if (isApproveError && approveError && isSponsorshipError(approveError)) {
      const msg = approveError instanceof Error ? approveError.message : String(approveError);
      setSponsorshipErrorMessage(msg);
      setShowSponsorshipError(true);
    }
  }, [isApproveError, approveError]);

  useContractErrorToast({
    writeError: redeemError,
    writeIsError: isRedeemError,
    receiptError: redeemReceipt.error,
    receiptIsError: redeemReceipt.isError,
    fallbackMessage: "Redemption failed",
  });

  useEffect(() => {
    if (depositReceipt.isSuccess) {
      setAmount("");
    }
  }, [depositReceipt.isSuccess]);

  useEffect(() => {
    if (redeemReceipt.isSuccess) {
      setAmount("");
    }
  }, [redeemReceipt.isSuccess]);

  const handleModeChange = (nextMode: Mode) => {
    const nextState = getModeStateOnSwitch(nextMode);
    setMode(nextState.mode);
    setAmount(nextState.amount);
  };

  const handleAmountChange = (value: string) => {
    setAmount(value);
    setApprovalInFlightAmount(0n);
  };

  const handleSubmit = () => {
    if (!activeAddress || parsedAmount === 0n) return;
    if (isProcessing) return;

    if (blockedBySimulation) {
      showToast("error", simulationErrorMessage ?? "Transaction is likely to fail.");
      return;
    }

    if (mode === "deposit" && isMultiChainEnabled) {
      setIsMultiChainDrawerOpen(true);
      return;
    }

    if (mode === "deposit" && needsApproval) {
      setApprovalInFlightAmount(parsedAmount);
      approve(usdc, vault, parsedAmount, {
        kind: "approve",
        chainId,
        label: `Approve ${formatUSDC(parsedAmount)} USDC`,
      });
      return;
    }

    if (mode === "deposit") {
      deposit(vault, parsedAmount, {
        kind: "deposit",
        chainId,
        label: `Deposit ${formatUSDC(parsedAmount)} USDC`,
      });
      return;
    }

    redeem(vault, parsedAmount, {
      kind: "redeem",
      chainId,
      label: `Redeem ${formatShares(parsedAmount)} shares`,
    });
  };

  const handleMultiChainDepositSuccess = () => {
    setAmount("");
  };

  // Derived inline stepper phase. The Privy popup is gone (showWalletUIs=false), so
  // this card tells the user what is happening while the dock holds long-term state.
  type StepperPhase = "idle" | "signing" | "submitted" | "confirmed" | "failed";
  const activeHash: `0x${string}` | undefined =
    processingAction === "approve"
      ? approveHash
      : processingAction === "deposit"
        ? depositHash
        : processingAction === "redeem"
          ? redeemHash
          : undefined;

  const [showConfirmedFlash, setShowConfirmedFlash] = useState<{
    action: "approve" | "deposit" | "redeem";
    hash?: `0x${string}`;
  } | null>(null);
  useEffect(() => {
    if (depositReceipt.isSuccess) {
      setShowConfirmedFlash({ action: "deposit", hash: depositHash });
      const t = setTimeout(() => setShowConfirmedFlash(null), 2_500);
      return () => clearTimeout(t);
    }
  }, [depositReceipt.isSuccess, depositHash]);
  useEffect(() => {
    if (redeemReceipt.isSuccess) {
      setShowConfirmedFlash({ action: "redeem", hash: redeemHash });
      const t = setTimeout(() => setShowConfirmedFlash(null), 2_500);
      return () => clearTimeout(t);
    }
  }, [redeemReceipt.isSuccess, redeemHash]);
  useEffect(() => {
    if (approveReceipt.isSuccess) {
      setShowConfirmedFlash({ action: "approve", hash: approveHash });
      const t = setTimeout(() => setShowConfirmedFlash(null), 2_000);
      return () => clearTimeout(t);
    }
  }, [approveReceipt.isSuccess, approveHash]);

  const failedAction: "approve" | "deposit" | "redeem" | null =
    isApproveError || approveReceipt.isError
      ? "approve"
      : isDepositError || depositReceipt.isError
        ? "deposit"
        : isRedeemError || redeemReceipt.isError
          ? "redeem"
          : null;

  let stepperPhase: StepperPhase = "idle";
  let stepperAction: "approve" | "deposit" | "redeem" | null = processingAction;
  let stepperHash: `0x${string}` | undefined = activeHash;
  if (isProcessing) {
    stepperPhase = activeHash ? "submitted" : "signing";
  } else if (showConfirmedFlash) {
    stepperPhase = "confirmed";
    stepperAction = showConfirmedFlash.action;
    stepperHash = showConfirmedFlash.hash;
  } else if (failedAction) {
    stepperPhase = "failed";
    stepperAction = failedAction;
  }

  return (
    <Card className="p-5">
      <SegmentedControl
        options={[
          { value: "deposit", label: "Deposit", icon: <ArrowDownToLine className="h-4 w-4" /> },
          { value: "redeem", label: "Redeem", icon: <ArrowUpToLine className="h-4 w-4" /> },
        ]}
        value={mode}
        onChange={handleModeChange}
        equalWidth
        ariaLabel="Deposit and redeem tabs"
        className="mb-6 w-full"
      />

      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between">
          <label htmlFor="deposit-redeem-amount" className="text-sm font-medium text-app-muted">
            {mode === "deposit" ? "USDC amount" : "Shares"}
          </label>
          {balance !== undefined && (
            <button
              type="button"
              onClick={() =>
                handleAmountChange(
                  mode === "deposit"
                    ? (Number(balance) / 1e6).toString()
                    : (Number(balance) / 1e6).toString()
                )
              }
              className="font-mono text-xs font-semibold text-app-accent hover:underline"
            >
              Max: {mode === "deposit" ? formatUSDC(balance) : formatShares(balance)}
            </button>
          )}
        </div>
        <Input
          id="deposit-redeem-amount"
          type="number"
          placeholder="0.00"
          value={amount}
          onChange={(e) => handleAmountChange(e.target.value)}
          data-testid="deposit-redeem-amount"
          className="text-xl font-semibold"
        />
      </div>

      <div className="mb-4 min-h-[118px] rounded-md border border-app-border bg-app-bg-subtle p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-app-muted">You receive</span>
          <TrendPill direction={hasAmount ? "up" : "flat"} tone={hasAmount ? "success" : "neutral"}>
            {hasAmount
              ? `${mode === "deposit" ? formatShares(estimatedShares) : formatUSDC(estimatedUSDC)} ${
                  mode === "deposit" ? "shares" : "USDC"
                }`
              : "--"}
          </TrendPill>
        </div>
        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="text-app-muted">Fee</span>
          <TrendPill direction={hasAmount ? "down" : "flat"} tone={hasAmount ? "danger" : "neutral"}>
            {hasAmount
              ? `${mode === "deposit"
                  ? `${Number(depositFeeBps) / 100}%`
                  : `${Number(redeemFeeBps) / 100}%`}`
              : "--"}
          </TrendPill>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-app-muted">
          {mode === "deposit"
            ? "Deposit quotes use the current share price and fee setting."
            : "Redeem quotes estimate the cash you will receive after fee impact."}
        </p>
      </div>

      {blockedBySimulation && (
        <p className="mb-3 rounded-md border border-app-danger/30 bg-app-danger/5 px-3 py-2 text-xs text-app-danger">
          {simulationErrorMessage}
        </p>
      )}

      {mode === "deposit" && isMultiChainEnabled && (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-app-accent/30 bg-app-accent/5 px-3 py-2">
          <Layers className="h-4 w-4 text-app-accent" />
          <p className="text-xs text-app-muted">
            Multi-chain deposit enabled. Your deposit will be automatically routed across chains.
          </p>
        </div>
      )}

      {!activeAddress ? (
        <Button variant="secondary" size="lg" className="w-full" disabled>
          <span className="inline-flex items-center gap-2">
            {actionMeta.icon}
            {actionMeta.label}
          </span>
        </Button>
      ) : stepperPhase === "idle" ? (
        <Button
          size="lg"
          className="w-full"
          disabled={parsedAmount === 0n || blockedBySimulation}
          onClick={handleSubmit}
          data-testid="deposit-redeem-submit"
        >
          <span className="inline-flex items-center gap-2">
            {mode === "deposit" && isMultiChainEnabled ? (
              <>
                <Layers className="h-4 w-4" />
                Multi-Chain Deposit
              </>
            ) : (
              <>
                {actionMeta.icon}
                {actionMeta.label}
              </>
            )}
          </span>
        </Button>
      ) : (
        <InlineTxStepper
          phase={stepperPhase}
          action={stepperAction}
          hash={stepperHash}
          explorerUrl={explorerUrl(stepperHash)}
          onRetry={() => handleSubmit()}
        />
      )}

      <MultiChainDepositDrawer
        open={isMultiChainDrawerOpen}
        onOpenChange={setIsMultiChainDrawerOpen}
        amount={parsedAmount}
        vaultAddress={vault}
        sharePrice={sharePrice}
        depositFeeBps={depositFeeBps}
        onSuccess={handleMultiChainDepositSuccess}
      />

      <SponsorshipErrorDialog
        open={showSponsorshipError}
        onOpenChange={setShowSponsorshipError}
        errorMessage={sponsorshipErrorMessage}
        onRetry={() => {
          setShowSponsorshipError(false);
          handleSubmit();
        }}
      />
    </Card>
  );
}

interface InlineTxStepperProps {
  phase: "signing" | "submitted" | "confirmed" | "failed";
  action: "approve" | "deposit" | "redeem" | null;
  hash?: `0x${string}`;
  explorerUrl?: string;
  onRetry: () => void;
}

function actionVerb(action: InlineTxStepperProps["action"]): string {
  if (action === "approve") return "Approval";
  if (action === "deposit") return "Deposit";
  if (action === "redeem") return "Redemption";
  return "Transaction";
}

/**
 * Uniswap-style three-state stepper that replaces the submit button while a
 * transaction is in flight. Because Privy's confirmation popup is hidden
 * (`embeddedWallets.showWalletUIs: false`), this row is the user's only
 * inline signal that something is happening. The global TransactionDock keeps
 * the longer-term progress as the user navigates around.
 */
function InlineTxStepper({ phase, action, hash, explorerUrl, onRetry }: InlineTxStepperProps) {
  const verb = actionVerb(action);

  if (phase === "signing") {
    return (
      <div
        data-testid="deposit-redeem-stepper"
        data-phase="signing"
        className="flex items-center gap-3 rounded-md border border-app-accent/30 bg-app-accent/5 px-4 py-3"
      >
        <Loader2 className="h-4 w-4 animate-spin text-app-accent" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-app-text">{verb} pending</p>
          <p className="text-xs text-app-muted">
            Signed silently by your embedded wallet. No popup needed.
          </p>
        </div>
      </div>
    );
  }

  if (phase === "submitted") {
    return (
      <div
        data-testid="deposit-redeem-stepper"
        data-phase="submitted"
        className="flex items-center gap-3 rounded-md border border-app-accent/30 bg-app-accent/5 px-4 py-3"
      >
        <Loader2 className="h-4 w-4 animate-spin text-app-accent" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-app-text">{verb} submitted</p>
          <p className="truncate text-xs text-app-muted">
            Waiting for confirmation
            {hash ? ` · ${hash.slice(0, 10)}...` : ""}
          </p>
        </div>
        {explorerUrl && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-app-border bg-app-surface px-2 py-1 text-xs font-medium text-app-text hover:bg-app-bg-subtle"
          >
            View <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    );
  }

  if (phase === "confirmed") {
    return (
      <div
        data-testid="deposit-redeem-stepper"
        data-phase="confirmed"
        className="flex items-center gap-3 rounded-md border border-app-success/30 bg-app-success/5 px-4 py-3"
      >
        <CheckCircle2 className="h-4 w-4 text-app-success" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-app-text">{verb} confirmed</p>
          <p className="truncate text-xs text-app-muted">
            On-chain success{hash ? ` · ${hash.slice(0, 10)}...` : ""}
          </p>
        </div>
        {explorerUrl && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-app-border bg-app-surface px-2 py-1 text-xs font-medium text-app-text hover:bg-app-bg-subtle"
          >
            View <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    );
  }

  return (
    <div
      data-testid="deposit-redeem-stepper"
      data-phase="failed"
      className="flex items-center gap-3 rounded-md border border-app-danger/30 bg-app-danger/5 px-4 py-3"
    >
      <XCircle className="h-4 w-4 text-app-danger" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-app-text">{verb} failed</p>
        <p className="text-xs text-app-muted">
          The transaction didn&apos;t go through. You can try again.
        </p>
      </div>
      <Button
        size="sm"
        variant="secondary"
        onClick={onRetry}
        data-testid="deposit-redeem-stepper-retry"
      >
        Try again
      </Button>
    </div>
  );
}
