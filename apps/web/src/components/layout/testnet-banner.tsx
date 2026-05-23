"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "indexflow.testnet-banner.dismissed";
const BANNER_HEIGHT = "28px";

function setBannerHeightVar(value: string) {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("--testnet-banner-h", value);
}

export function TestnetBanner() {
  const [dismissed, setDismissed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const pathname = usePathname();
  const isLanding = pathname === "/";

  useEffect(() => {
    setHydrated(true);
    let alreadyDismissed = false;
    try {
      alreadyDismissed = sessionStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      alreadyDismissed = false;
    }
    setDismissed(alreadyDismissed);
    setBannerHeightVar(alreadyDismissed ? "0px" : BANNER_HEIGHT);
    return () => {
      // Reset to default on unmount so non-banner contexts (e.g. tests) don't
      // inherit a stale height.
      setBannerHeightVar(BANNER_HEIGHT);
    };
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // No-op: dismissal still works in-memory for this session.
    }
    setBannerHeightVar("0px");
  };

  if (hydrated && dismissed) return null;

  return (
    <div
      className={cn(
        "sticky top-0 z-50 w-full border-b border-amber-500/30 bg-amber-500/10 text-amber-700 backdrop-blur-md dark:text-amber-300",
        isLanding && "testnet-banner-landing",
      )}
      role="status"
      aria-live="polite"
      data-testid="testnet-banner"
    >
      <div className="mx-auto flex h-7 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.18em]">
          <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500/70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
          </span>
          <span className="truncate">
            <span className="hidden sm:inline">
              Testnet · prototype interface · no real funds
            </span>
            <span className="sm:hidden">Testnet · no real funds</span>
          </span>
          <Link
            href="/docs"
            className="hidden shrink-0 normal-case tracking-normal text-amber-800 underline-offset-2 hover:underline dark:text-amber-200 sm:inline"
          >
            Learn more →
          </Link>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss testnet banner"
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-amber-700/80 transition-colors hover:bg-amber-500/20 hover:text-amber-900 dark:text-amber-300/80 dark:hover:text-amber-100"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export default TestnetBanner;
