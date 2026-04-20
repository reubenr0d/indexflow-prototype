"use client";

import { AdminSidebar } from "@/components/layout/admin-sidebar";
import { isPrivyConfigured } from "@/config/privy";
import { usePrivy, useConnectWallet, useWallets } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import { Shield, Wallet } from "lucide-react";

function AdminWalletConnect() {
  const { connectWallet } = useConnectWallet();
  const { wallets } = useWallets();
  const externalWallet = wallets.find((w) => w.walletClientType !== "privy");

  if (externalWallet) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-app-border bg-app-surface px-3 py-1.5 text-sm">
        <Wallet className="h-4 w-4 text-app-accent" />
        <span className="text-app-muted">Admin:</span>
        <span className="font-mono text-app-text">
          {externalWallet.address.slice(0, 6)}...{externalWallet.address.slice(-4)}
        </span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => connectWallet()}
      className="flex items-center gap-2 rounded-md border border-app-border bg-app-surface px-3 py-1.5 text-sm font-medium text-app-text transition-colors hover:border-app-border-strong hover:bg-app-surface-hover"
    >
      <Wallet className="h-4 w-4" />
      Connect Admin Wallet
    </button>
  );
}

function PrivyAdminGate({ children }: { children: React.ReactNode }) {
  const { ready, authenticated } = usePrivy();

  if (!ready) return null;

  if (!authenticated) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <Shield className="mb-4 h-12 w-12 text-app-border-strong" />
        <p className="text-lg font-medium text-app-muted">Access restricted</p>
        <p className="mt-2 text-sm text-app-muted">
          Log in to access this panel.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}

function WagmiAdminGate({ children }: { children: React.ReactNode }) {
  const { isConnected } = useAccount();

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <Shield className="mb-4 h-12 w-12 text-app-border-strong" />
        <p className="text-lg font-medium text-app-muted">Access restricted</p>
        <p className="mt-2 text-sm text-app-muted">
          Connect an admin wallet to access this panel.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const Gate = isPrivyConfigured ? PrivyAdminGate : WagmiAdminGate;

  return (
    <Gate>
      <div className="flex min-h-[calc(100vh-3.5rem)]">
        <AdminSidebar />
        <div className="flex-1 pb-20 lg:pb-0">
          {isPrivyConfigured && (
            <div className="flex justify-end border-b border-app-border bg-app-bg-subtle px-4 py-2">
              <AdminWalletConnect />
            </div>
          )}
          {children}
        </div>
      </div>
    </Gate>
  );
}
