"use client";

import { useEffect } from "react";
import { useTour, type TourStep } from "./tour-provider";
import { TourTooltip } from "./tour-tooltip";

const BASKET_TOUR_STEPS: TourStep[] = [
  {
    target: "metrics",
    title: "Vault metrics at a glance",
    content:
      "This strip shows the vault's TVL, share price, APY, fees, and PnL. Scroll horizontally on mobile to see all metrics.",
    placement: "bottom",
  },
  {
    target: "deposit-panel",
    title: "Deposit or redeem",
    content:
      "Switch between Deposit and Redeem tabs. Enter a USDC amount (or share count for redemptions), review the estimated output and fee, then submit. You'll need to approve USDC on your first deposit.",
    placement: "left",
  },
  {
    target: "share-chart",
    title: "Track share price over time",
    content:
      "This chart shows how the vault's share price has moved. A rising price means the vault's NAV (including perp PnL) is growing relative to shares outstanding.",
    placement: "top",
  },
  {
    target: "positions",
    title: "Open perp positions",
    content:
      "See the vault's active perpetual positions. These are managed by the vault operator, not individual depositors. Your exposure is proportional to your share balance.",
    placement: "top",
  },
];

export function BasketTour() {
  const { start, isActive } = useTour();

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isActive) start(BASKET_TOUR_STEPS);
    }, 1500);
    return () => clearTimeout(timer);
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <TourTooltip />;
}
