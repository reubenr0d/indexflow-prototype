"use client";

import { AlertTriangle, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface SponsorshipErrorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  errorMessage?: string;
  onRetry?: () => void;
  actionLabel?: string;
}

const PRIVY_DASHBOARD_URL = "https://dashboard.privy.io/apps?page=gas_sponsorship";

export const SPONSORSHIP_TROUBLESHOOTING_STEPS = [
  {
    title: "Use Embedded Wallet",
    description: "Gas sponsorship only works with Privy embedded wallets. Log in with email/social, not MetaMask.",
  },
  {
    title: "Enable Gas Sponsorship",
    description: "In the Privy Dashboard, navigate to Gas Sponsorship and toggle it ON",
  },
  {
    title: "Configure Chains",
    description: "Enable native sponsorship for Sepolia and Arbitrum Sepolia. Fuji uses Smart Wallets (4337) with paymaster/bundler config.",
  },
  {
    title: "Allow Client Transactions",
    description: 'Enable "Allow transactions from the client" in sponsorship settings',
  },
  {
    title: "Check TEE Execution",
    description: "Go to Wallets > Advanced and verify TEE execution is enabled",
  },
  {
    title: "Verify Balance",
    description: "Ensure your sponsorship account has sufficient funds",
  },
  {
    title: "Fallback: Add Sepolia ETH",
    description: "If sponsorship is unavailable, fund the wallet with a small amount of Sepolia ETH for gas.",
  },
];

export function SponsorshipErrorDialog({
  open,
  onOpenChange,
  errorMessage,
  onRetry,
  actionLabel = "this transaction",
}: SponsorshipErrorDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-app-warning/10">
            <AlertTriangle className="h-6 w-6 text-app-warning" />
          </div>
          <DialogTitle className="text-center">Gas Sponsorship Failed</DialogTitle>
          <DialogDescription className="text-center">
            Gas could not be sponsored for {actionLabel}. This usually means wallet setup or Privy sponsorship settings need attention.
          </DialogDescription>
        </DialogHeader>

        {errorMessage && (
          <div className="rounded-lg border border-app-danger/30 bg-app-danger/5 px-3 py-2">
            <p className="text-xs font-medium text-app-danger">Error Details</p>
            <p className="mt-1 text-xs text-app-muted">{errorMessage}</p>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-sm font-medium text-app-text">Troubleshooting Steps</p>
          <ol className="space-y-2">
            {SPONSORSHIP_TROUBLESHOOTING_STEPS.map((step, index) => (
              <li
                key={index}
                className="flex gap-3 rounded-lg border border-app-border bg-app-bg-subtle p-2.5"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-app-accent/10 text-xs font-semibold text-app-accent">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-app-text">{step.title}</p>
                  <p className="text-xs text-app-muted">{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            variant="secondary"
            className="w-full gap-2"
            onClick={() => window.open(PRIVY_DASHBOARD_URL, "_blank")}
          >
            Open Privy Dashboard
            <ExternalLink className="h-4 w-4" />
          </Button>
          <div className="flex w-full gap-2">
            <Button
              variant="ghost"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
            {onRetry && (
              <Button className="flex-1" onClick={onRetry}>
                Retry Transaction
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function isSponsorshipError(error: unknown): boolean {
  if (!error) return false;
  
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  
  return (
    message.includes("insufficient") ||
    message.includes("gas") ||
    message.includes("sponsor") ||
    message.includes("funds") ||
    message.includes("balance")
  );
}
