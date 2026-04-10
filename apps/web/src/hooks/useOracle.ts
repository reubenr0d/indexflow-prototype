"use client";

import { useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { OracleAdapterABI, VaultAccountingABI } from "@/abi/contracts";
import { ERC20ABI } from "@/abi/erc20";
import { getContracts } from "@/config/contracts";
import { useDeploymentTarget } from "@/providers/DeploymentProvider";
import { REFETCH_INTERVAL } from "@/lib/constants";
import { formatAssetId } from "@/lib/format";
import { keccak256, stringToHex, type Address, zeroAddress } from "viem";

export type OracleSourceLabel = "Chainlink" | "Custom Oracle" | "Unknown";
export type OracleSourceBadgeLabel = "Chainlink" | "Custom Oracle" | "Custom Oracle (Pyth)" | "Unknown";

const PYTH_RELAY_ASSET_IDS = new Set<`0x${string}`>(
  ["XAG", "BHP", "RIO", "VALE", "NEM", "FCX", "SCCO"].map((asset) =>
    keccak256(stringToHex(asset))
  ) as `0x${string}`[]
);

export function getOracleSourceLabel(feedType?: number | bigint | null): OracleSourceLabel {
  if (feedType === 0 || feedType === 0n) return "Chainlink";
  if (feedType === 1 || feedType === 1n) return "Custom Oracle";
  return "Unknown";
}

export function getOracleSourceBadgeLabel(
  assetId: `0x${string}` | undefined,
  feedType?: number | bigint | null
): OracleSourceBadgeLabel {
  if (feedType === 0 || feedType === 0n) return "Chainlink";
  if (feedType === 1 || feedType === 1n) {
    if (assetId && PYTH_RELAY_ASSET_IDS.has(assetId.toLowerCase() as `0x${string}`)) {
      return "Custom Oracle (Pyth)";
    }
    return "Custom Oracle";
  }
  return "Unknown";
}

export function useOracleAssetCount() {
  const { chainId } = useDeploymentTarget();
  const { oracleAdapter } = getContracts(chainId);

  return useReadContract({
    address: oracleAdapter,
    abi: OracleAdapterABI,
    functionName: "getAssetCount",
    query: { refetchInterval: REFETCH_INTERVAL },
  });
}

export function useOracleAssetPrice(assetId: `0x${string}`) {
  const { chainId } = useDeploymentTarget();
  const { oracleAdapter } = getContracts(chainId);

  return useReadContract({
    address: oracleAdapter,
    abi: OracleAdapterABI,
    functionName: "getPrice",
    args: [assetId],
    query: { refetchInterval: REFETCH_INTERVAL },
  });
}

export function useOracleIsStale(assetId: `0x${string}`) {
  const { chainId } = useDeploymentTarget();
  const { oracleAdapter } = getContracts(chainId);

  return useReadContract({
    address: oracleAdapter,
    abi: OracleAdapterABI,
    functionName: "isStale",
    args: [assetId],
    query: { refetchInterval: REFETCH_INTERVAL },
  });
}

export function useOracleAssetConfig(assetId: `0x${string}`) {
  const { chainId } = useDeploymentTarget();
  const { oracleAdapter } = getContracts(chainId);

  return useReadContract({
    address: oracleAdapter,
    abi: OracleAdapterABI,
    functionName: "getAssetConfig",
    args: [assetId],
    query: { refetchInterval: REFETCH_INTERVAL },
  });
}

export function useSupportedOracleAssets() {
  const { chainId } = useDeploymentTarget();
  const { oracleAdapter, vaultAccounting } = getContracts(chainId);

  const { data: assetCount, isLoading: isCountLoading } = useReadContract({
    address: oracleAdapter,
    abi: OracleAdapterABI,
    functionName: "getAssetCount",
    query: { refetchInterval: REFETCH_INTERVAL },
  });

  const count = assetCount ? Number(assetCount) : 0;
  const indices = Array.from({ length: count }, (_, i) => i);

  const { data: assetListData, isLoading: isListLoading } = useReadContracts({
    contracts: indices.map((i) => ({
      address: oracleAdapter,
      abi: OracleAdapterABI,
      functionName: "assetList" as const,
      args: [BigInt(i)] as const,
    })),
    query: { enabled: count > 0, refetchInterval: REFETCH_INTERVAL },
  });

  const assetIds = useMemo(
    () =>
      (assetListData ?? [])
        .map((entry) => entry.result as `0x${string}` | undefined)
        .filter((id): id is `0x${string}` => Boolean(id)),
    [assetListData]
  );

  const { data: activeData, isLoading: isActiveLoading } = useReadContracts({
    contracts: assetIds.map((id) => ({
      address: oracleAdapter,
      abi: OracleAdapterABI,
      functionName: "isAssetActive" as const,
      args: [id] as const,
    })),
    query: { enabled: assetIds.length > 0, refetchInterval: REFETCH_INTERVAL },
  });

  const { data: mappedTokenData, isLoading: isMappedTokenLoading } = useReadContracts({
    contracts: assetIds.map((id) => ({
      address: vaultAccounting,
      abi: VaultAccountingABI,
      functionName: "assetTokens" as const,
      args: [id] as const,
    })),
    query: { enabled: assetIds.length > 0, refetchInterval: REFETCH_INTERVAL },
  });

  const mappedTokenByAssetId = useMemo(() => {
    const m = new Map<`0x${string}`, Address>();
    assetIds.forEach((id, i) => {
      const token = mappedTokenData?.[i]?.result as Address | undefined;
      if (token && token !== zeroAddress) {
        m.set(id, token);
      }
    });
    return m;
  }, [assetIds, mappedTokenData]);

  const mappedTokenAddresses = useMemo(
    () => Array.from(new Set(Array.from(mappedTokenByAssetId.values()))),
    [mappedTokenByAssetId]
  );

  const { data: tokenSymbolData, isLoading: isTokenSymbolLoading } = useReadContracts({
    contracts: mappedTokenAddresses.map((token) => ({
      address: token,
      abi: ERC20ABI,
      functionName: "symbol" as const,
    })),
    query: { enabled: mappedTokenAddresses.length > 0, refetchInterval: REFETCH_INTERVAL },
  });

  const tokenSymbolByAddress = useMemo(() => {
    const m = new Map<Address, string>();
    mappedTokenAddresses.forEach((token, i) => {
      const symbol = tokenSymbolData?.[i]?.result as string | undefined;
      if (symbol) {
        m.set(token, symbol);
      }
    });
    return m;
  }, [mappedTokenAddresses, tokenSymbolData]);

  const assets = useMemo(
    () =>
      assetIds
        .filter((id, i) => Boolean(activeData?.[i]?.result))
        .map((id) => {
          const decoded = formatAssetId(id);
          const token = mappedTokenByAssetId.get(id);
          const tokenSymbol = token ? tokenSymbolByAddress.get(token) : undefined;
          const shortId = `${id.slice(0, 10)}...${id.slice(-8)}`;

          let label = decoded;
          if (tokenSymbol) {
            if (decoded.startsWith("0x")) {
              label = `${tokenSymbol} (${shortId})`;
            } else if (decoded.toLowerCase() !== tokenSymbol.toLowerCase()) {
              label = `${decoded} (${tokenSymbol})`;
            }
          }

          return {
            idHex: id,
            label,
            name: decoded.startsWith("0x") ? tokenSymbol ?? shortId : decoded,
            address: token,
          };
        }),
    [assetIds, activeData, mappedTokenByAssetId, tokenSymbolByAddress]
  );

  return {
    data: assets,
    isLoading:
      isCountLoading ||
      isListLoading ||
      isActiveLoading ||
      isMappedTokenLoading ||
      isTokenSymbolLoading,
  };
}

export function useOracleAssetLabelMap() {
  const { data, isLoading } = useSupportedOracleAssets();

  const labelMap = useMemo(() => {
    const m = new Map<`0x${string}`, string>();
    data.forEach((asset) => {
      m.set(asset.idHex, asset.label);
    });
    return m;
  }, [data]);

  return {
    data: labelMap,
    isLoading,
  };
}

export function useOracleAssetMetaMap() {
  const { data, isLoading } = useSupportedOracleAssets();

  const metaMap = useMemo(() => {
    const m = new Map<`0x${string}`, { name: string; address?: Address }>();
    data.forEach((asset) => {
      m.set(asset.idHex, { name: asset.name, address: asset.address });
    });
    return m;
  }, [data]);

  return {
    data: metaMap,
    isLoading,
  };
}
