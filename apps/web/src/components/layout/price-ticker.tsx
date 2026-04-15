"use client";

import { useReadContract } from "wagmi";
import { OracleAdapterABI } from "@/abi/OracleAdapter";
import { getContracts } from "@/config/contracts";
import { useDeploymentTarget } from "@/providers/DeploymentProvider";
import { formatPrice } from "@/lib/format";
import type { TickerAsset } from "@/lib/ticker.server";

const TICKER_REFETCH_MS = 60_000;

type TickerCellData = {
  assetId: `0x${string}`;
  label: string;
  price: bigint;
};

function useHydratedPrice(
  assetId: `0x${string}`,
  initialPrice: bigint,
): bigint {
  const { chainId } = useDeploymentTarget();
  const { oracleAdapter } = getContracts(chainId);

  const { data } = useReadContract({
    address: oracleAdapter,
    abi: OracleAdapterABI,
    functionName: "getPrice",
    args: [assetId],
    query: { refetchInterval: TICKER_REFETCH_MS },
  });

  const onChain = (data as [bigint, bigint] | undefined)?.[0];
  return onChain ?? initialPrice;
}

function TickerCellHydrated({ assetId, label, price: ssrPrice }: TickerCellData) {
  const price = useHydratedPrice(assetId, ssrPrice);

  if (price === 0n) return null;

  return (
    <div className="flex items-center gap-2 px-5 py-2">
      <span className="whitespace-nowrap text-[11px] font-medium text-app-muted">
        {label}
      </span>
      <span className="whitespace-nowrap font-mono text-[11px] font-semibold text-app-text">
        {formatPrice(price)}
      </span>
      <span className="text-app-border/60" aria-hidden>
        |
      </span>
    </div>
  );
}

function TickerCellStatic({ label, price }: TickerCellData) {
  if (price === 0n) return null;

  return (
    <div className="flex items-center gap-2 px-5 py-2">
      <span className="whitespace-nowrap text-[11px] font-medium text-app-muted">
        {label}
      </span>
      <span className="whitespace-nowrap font-mono text-[11px] font-semibold text-app-text">
        {formatPrice(price)}
      </span>
      <span className="text-app-border/60" aria-hidden>
        |
      </span>
    </div>
  );
}

export function PriceTickerHydrated({
  initialData,
}: {
  initialData: TickerAsset[];
}) {
  if (initialData.length === 0) return null;

  const cells: TickerCellData[] = initialData.map((a) => ({
    assetId: a.assetId,
    label: a.label,
    price: BigInt(a.price),
  }));

  return (
    <div className="border-b border-app-border bg-app-bg-subtle/80 backdrop-blur-sm">
      <div className="hero-ticker-wrap overflow-hidden">
        <div className="hero-ticker-track flex w-max items-center">
          <div className="flex shrink-0 items-center">
            {cells.map((cell) => (
              <TickerCellHydrated key={cell.assetId} {...cell} />
            ))}
          </div>
          <div className="flex shrink-0 items-center" aria-hidden>
            {cells.map((cell) => (
              <TickerCellStatic
                key={`dup-${cell.assetId}`}
                {...cell}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
