"use client";

import {
  Activity,
  ChartColumnIncreasing,
  CircleDollarSign,
  Layers3,
  Percent,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASKET_ICON_MAP = {
  tvl: CircleDollarSign,
  sharePrice: ChartColumnIncreasing,
  assets: Layers3,
  perp: Activity,
  fee: Percent,
  hasPerp: TrendingUp,
  noPerp: TrendingDown,
  lowFee: Percent,
  highTvl: Sparkles,
} as const;

export type BasketIconName = keyof typeof BASKET_ICON_MAP;

interface BasketIconProps {
  name: BasketIconName;
  className?: string;
}

export function BasketIcon({ name, className }: BasketIconProps) {
  const Icon = BASKET_ICON_MAP[name];
  return <Icon aria-hidden="true" className={cn("h-3.5 w-3.5 shrink-0", className)} />;
}
