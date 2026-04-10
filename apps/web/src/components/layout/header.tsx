"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import {
  useAccount,
  useChainId,
  useConnect,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { anvil } from "viem/chains";
import { getContracts } from "@/config/contracts";
import { isPrivyConfigured } from "@/config/privy";
import { useDeploymentTarget } from "@/providers/DeploymentProvider";
import { ERC20ABI } from "@/abi/erc20";
import { showToast } from "@/components/ui/toast";
import { useContractErrorToast } from "@/hooks/useContractErrorToast";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";
import { Sun, Moon, Menu, X, LogOut } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { NetworkSelector } from "@/components/layout/network-selector";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/baskets", label: "Baskets" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/prices", label: "Prices" },
  { href: "/docs", label: "Docs" },
  { href: "/admin", label: "Admin" },
];

function isNavActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function PrivyConnectButton() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { address } = useAccount();
  const [showMenu, setShowMenu] = useState(false);

  if (!ready) {
    return (
      <div className="h-9 w-24 animate-pulse rounded-md border border-app-border bg-app-surface" />
    );
  }

  if (!authenticated) {
    return (
      <button
        type="button"
        onClick={login}
        className="h-9 rounded-md bg-app-accent px-4 text-sm font-medium text-white transition-colors hover:bg-app-accent/90"
      >
        Log in
      </button>
    );
  }

  const displayLabel =
    address
      ? truncateAddress(address)
      : user?.email?.address ?? user?.google?.email ?? "Connected";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setShowMenu((v) => !v)}
        className="flex h-9 items-center gap-2 rounded-md border border-app-border bg-app-surface px-3 text-sm font-medium text-app-text transition-colors hover:border-app-border-strong hover:bg-app-surface-hover"
      >
        <span className="h-2 w-2 rounded-full bg-emerald-400" />
        {displayLabel}
      </button>
      {showMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 min-w-[10rem] overflow-hidden rounded-lg border border-app-border bg-app-surface shadow-lg">
            {address && (
              <div className="border-b border-app-border px-3 py-2 text-xs text-app-muted">
                {truncateAddress(address)}
              </div>
            )}
            {user?.email?.address && (
              <div className="border-b border-app-border px-3 py-2 text-xs text-app-muted">
                {user.email.address}
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                setShowMenu(false);
                logout();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-app-text transition-colors hover:bg-app-bg-subtle"
            >
              <LogOut className="h-3.5 w-3.5" />
              Log out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ConnectWalletButton() {
  if (!isPrivyConfigured) return null;
  return <PrivyConnectButton />;
}

export function Header() {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { address } = useAccount();
  const { connect, connectors, isPending: isConnectPending } = useConnect();
  const walletChainId = useChainId();
  const { chainId: deploymentChainId } = useDeploymentTarget();
  const { usdc } = getContracts(deploymentChainId);
  const { writeContract, data: hash, isPending, error, isError } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });
  const isLocalChain = walletChainId === anvil.id;
  const isE2ETestMode = process.env.NEXT_PUBLIC_E2E_TEST_MODE === "1";

  const onHome = pathname === "/";
  const canMint = Boolean(address) && !isPending;

  useEffect(() => {
    if (receipt.isSuccess) {
      showToast("success", "Minted 10,000 USDC");
    }
  }, [receipt.isSuccess]);

  useContractErrorToast({
    writeError: error,
    writeIsError: isError,
    receiptError: receipt.error,
    receiptIsError: receipt.isError,
    fallbackMessage: "Mint failed",
  });

  const handleMint = () => {
    if (!address || !isLocalChain) return;
    writeContract({
      address: usdc,
      abi: ERC20ABI,
      functionName: "mint",
      args: [address, 10_000n * 1_000_000n],
    });
    showToast("pending", "Minting 10,000 USDC...");
  };

  const handleE2EConnect = () => {
    const preferred =
      connectors.find((c) => c.id === "metaMask") ??
      connectors.find((c) => c.id === "injected") ??
      connectors[0];
    if (!preferred) return;
    connect({ connector: preferred });
  };

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-40 border-b border-app-border bg-app-bg/90 backdrop-blur-md",
          onHome && "border-transparent bg-app-bg/70"
        )}
      >
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-8">
            <Link
              href="/"
              className="flex items-center gap-2 font-semibold tracking-tight text-app-text"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 32 32"
                className="shrink-0"
                aria-hidden
              >
                <circle cx="16" cy="16" r="16" fill="currentColor" className="text-app-text" />
                <polygon points="16,8 8,24 24,24" fill="currentColor" className="text-app-bg" />
              </svg>
              IndexFlow
            </Link>
            <nav className="hidden items-center gap-0.5 md:flex">
              <Link
                href="/"
                className={cn(
                  "px-3 py-1.5 text-sm font-medium transition-colors",
                  pathname === "/"
                    ? "text-app-accent"
                    : "text-app-muted hover:text-app-text"
                )}
              >
                Home
              </Link>
              {navItems.map((item) => {
                const active = isNavActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex flex-col items-center gap-1 px-3 py-1.5 text-sm font-medium transition-colors",
                      active
                        ? "text-app-text"
                        : "text-app-muted hover:text-app-text"
                    )}
                  >
                    <span>{item.label}</span>
                    <span
                      className={cn(
                        "h-0.5 w-full max-w-[2rem] rounded-full transition-colors",
                        active ? "bg-app-accent" : "bg-transparent"
                      )}
                    />
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            {isLocalChain && (
              <button
                type="button"
                onClick={handleMint}
                disabled={!canMint}
                data-testid="mint-10k-usdc"
                className="hidden h-9 rounded-md border border-app-border bg-app-surface px-3 text-sm font-medium text-app-text transition-colors hover:border-app-border-strong hover:bg-app-surface-hover disabled:pointer-events-none disabled:opacity-45 sm:inline-flex sm:items-center"
              >
                {isPending ? "Minting..." : "Mint 10k USDC"}
              </button>
            )}
            {isE2ETestMode && !address && (
              <button
                type="button"
                onClick={handleE2EConnect}
                disabled={isConnectPending}
                data-testid="e2e-connect-wallet"
                className="hidden h-9 rounded-md border border-app-border bg-app-surface px-3 text-sm font-medium text-app-text transition-colors hover:border-app-border-strong hover:bg-app-surface-hover disabled:pointer-events-none disabled:opacity-45 sm:inline-flex sm:items-center"
              >
                {isConnectPending ? "Connecting..." : "E2E Connect"}
              </button>
            )}
            <div className="hidden sm:block">
              <NetworkSelector />
            </div>
            <button
              type="button"
              onClick={toggle}
              className="flex h-9 w-9 items-center justify-center rounded-md border border-app-border bg-app-surface text-app-muted transition-colors hover:border-app-border-strong hover:text-app-text"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <div className="hidden sm:block">
              <ConnectWalletButton />
            </div>
            <button
              type="button"
              onClick={() => setMobileOpen(!mobileOpen)}
              className="flex h-9 w-9 items-center justify-center rounded-md border border-app-border text-app-muted md:hidden"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="fixed inset-x-0 top-14 z-30 overflow-hidden border-b border-app-border bg-app-surface md:hidden"
          >
            <nav className="space-y-0.5 p-3">
              {isLocalChain && (
                <button
                  type="button"
                  onClick={handleMint}
                  disabled={!canMint}
                  data-testid="mint-10k-usdc-mobile"
                  className="mb-2 w-full rounded-md border border-app-border bg-app-bg-subtle px-3 py-2.5 text-left text-sm font-medium text-app-text disabled:pointer-events-none disabled:opacity-45"
                >
                  {isPending ? "Minting..." : "Mint 10k USDC"}
                </button>
              )}
              {isE2ETestMode && !address && (
                <button
                  type="button"
                  onClick={handleE2EConnect}
                  disabled={isConnectPending}
                  data-testid="e2e-connect-wallet-mobile"
                  className="mb-2 w-full rounded-md border border-app-border bg-app-bg-subtle px-3 py-2.5 text-left text-sm font-medium text-app-text disabled:pointer-events-none disabled:opacity-45"
                >
                  {isConnectPending ? "Connecting..." : "E2E Connect"}
                </button>
              )}
              <Link
                href="/"
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "block rounded-md px-3 py-2.5 text-sm font-medium",
                  pathname === "/" ? "bg-app-accent-dim text-app-accent" : "text-app-muted"
                )}
              >
                Home
              </Link>
              {navItems.map((item) => {
                const active = isNavActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "block rounded-md px-3 py-2.5 text-sm font-medium",
                      active ? "bg-app-bg-subtle text-app-text" : "text-app-muted"
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
              <div className="pt-2 sm:hidden">
                <NetworkSelector />
              </div>
              <div className="pt-2 sm:hidden">
                <ConnectWalletButton />
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
