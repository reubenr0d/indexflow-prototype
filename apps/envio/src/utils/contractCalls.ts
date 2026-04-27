import { createPublicClient, http, type Address } from "viem";
import { sepolia, avalancheFuji, arbitrumSepolia } from "viem/chains";

import basketVaultAbi from "../../abis/BasketVault.json";
import basketShareTokenAbi from "../../abis/BasketShareToken.json";
import vaultAccountingAbi from "../../abis/VaultAccounting.json";
import erc20Abi from "../../abis/ERC20.json";
import stateRelayAbi from "../../abis/StateRelay.json";

type ClientChain = typeof sepolia | typeof avalancheFuji | typeof arbitrumSepolia;

type ChainConfig = {
  chain: ClientChain;
  rpcUrl?: string;
};

function envValue(key: string): string | undefined {
  return process.env[key] ?? process.env[`ENVIO_${key}`];
}

const CHAIN_CONFIG: Record<number, ChainConfig> = {
  11155111: { chain: sepolia, rpcUrl: envValue("SEPOLIA_RPC_URL") },
  43113: { chain: avalancheFuji, rpcUrl: envValue("FUJI_RPC_URL") },
  421614: { chain: arbitrumSepolia, rpcUrl: envValue("ARBITRUM_SEPOLIA_RPC_URL") },
};

const clientCache = new Map<number, ReturnType<typeof createPublicClient>>();

function getClient(chainId: number) {
  const existing = clientCache.get(chainId);
  if (existing) return existing;

  const cfg = CHAIN_CONFIG[chainId];
  if (!cfg?.rpcUrl) return null;

  const client = createPublicClient({
    chain: cfg.chain,
    transport: http(cfg.rpcUrl),
  });
  clientCache.set(chainId, client);
  return client;
}

export type BasketChainState = {
  name: string;
  shareToken: Address;
  totalSupplyShares: bigint;
  perpAllocatedUsdc: bigint;
  sharePrice: bigint;
  basketPrice: bigint;
  assetCount: bigint;
  depositFeeBps: bigint;
  redeemFeeBps: bigint;
  minReserveBps: bigint;
  maxPerpAllocation: bigint;
  usdcBalanceUsdc: bigint;
  tvlBookUsdc: bigint;
  requiredReserveUsdc: bigint;
  availableForPerpUsdc: bigint;
  collectedFeesUsdc: bigint;
  vaultAccounting: Address;
};

export type VaultAccountingState = {
  depositedCapital: bigint;
  realisedPnl: bigint;
  openInterest: bigint;
  positionCount: bigint;
  collateralLocked: bigint;
  registered: boolean;
};

export async function readBasketChainState(
  chainId: number,
  vaultAddress: Address,
): Promise<Partial<BasketChainState>> {
  const client = getClient(chainId);
  if (!client) return {};

  const result: Partial<BasketChainState> = {};

  try {
    const name = await client.readContract({
      address: vaultAddress,
      abi: basketVaultAbi,
      functionName: "name",
    });
    result.name = String(name);
  } catch {}

  try {
    const shareToken = (await client.readContract({
      address: vaultAddress,
      abi: basketVaultAbi,
      functionName: "shareToken",
    })) as Address;
    result.shareToken = shareToken;

    try {
      const totalSupply = (await client.readContract({
        address: shareToken,
        abi: basketShareTokenAbi,
        functionName: "totalSupply",
      })) as bigint;
      result.totalSupplyShares = totalSupply;
    } catch {}
  } catch {}

  try {
    result.perpAllocatedUsdc = (await client.readContract({
      address: vaultAddress,
      abi: basketVaultAbi,
      functionName: "perpAllocated",
    })) as bigint;
  } catch {}

  try {
    const sharePrice = (await client.readContract({
      address: vaultAddress,
      abi: basketVaultAbi,
      functionName: "getSharePrice",
    })) as bigint;
    result.sharePrice = sharePrice;
    result.basketPrice = sharePrice;
  } catch {}

  try {
    result.assetCount = (await client.readContract({
      address: vaultAddress,
      abi: basketVaultAbi,
      functionName: "getAssetCount",
    })) as bigint;
  } catch {}

  try {
    result.depositFeeBps = (await client.readContract({
      address: vaultAddress,
      abi: basketVaultAbi,
      functionName: "depositFeeBps",
    })) as bigint;
  } catch {}

  try {
    result.redeemFeeBps = (await client.readContract({
      address: vaultAddress,
      abi: basketVaultAbi,
      functionName: "redeemFeeBps",
    })) as bigint;
  } catch {}

  try {
    result.minReserveBps = (await client.readContract({
      address: vaultAddress,
      abi: basketVaultAbi,
      functionName: "minReserveBps",
    })) as bigint;
  } catch {}

  try {
    result.maxPerpAllocation = (await client.readContract({
      address: vaultAddress,
      abi: basketVaultAbi,
      functionName: "maxPerpAllocation",
    })) as bigint;
  } catch {}

  try {
    const usdc = (await client.readContract({
      address: vaultAddress,
      abi: basketVaultAbi,
      functionName: "usdc",
    })) as Address;
    const usdcBalance = (await client.readContract({
      address: usdc,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [vaultAddress],
    })) as bigint;
    result.usdcBalanceUsdc = usdcBalance;
    result.tvlBookUsdc = usdcBalance + (result.perpAllocatedUsdc ?? 0n);
  } catch {}

  try {
    result.requiredReserveUsdc = (await client.readContract({
      address: vaultAddress,
      abi: basketVaultAbi,
      functionName: "getRequiredReserveUsdc",
    })) as bigint;
  } catch {}

  try {
    result.availableForPerpUsdc = (await client.readContract({
      address: vaultAddress,
      abi: basketVaultAbi,
      functionName: "getAvailableForPerpUsdc",
    })) as bigint;
  } catch {}

  try {
    result.collectedFeesUsdc = (await client.readContract({
      address: vaultAddress,
      abi: basketVaultAbi,
      functionName: "collectedFees",
    })) as bigint;
  } catch {}

  try {
    result.vaultAccounting = (await client.readContract({
      address: vaultAddress,
      abi: basketVaultAbi,
      functionName: "vaultAccounting",
    })) as Address;
  } catch {}

  return result;
}

export async function readBasketAssetAt(
  chainId: number,
  vaultAddress: Address,
  index: bigint,
): Promise<`0x${string}` | null> {
  const client = getClient(chainId);
  if (!client) return null;

  try {
    return (await client.readContract({
      address: vaultAddress,
      abi: basketVaultAbi,
      functionName: "getAssetAt",
      args: [index],
    })) as `0x${string}`;
  } catch {
    return null;
  }
}

export async function readVaultAccountingState(
  chainId: number,
  vaultAccountingAddress: Address,
  vaultAddress: Address,
): Promise<Partial<VaultAccountingState>> {
  const client = getClient(chainId);
  if (!client) return {};

  try {
    const state = await client.readContract({
      address: vaultAccountingAddress,
      abi: vaultAccountingAbi,
      functionName: "getVaultState",
      args: [vaultAddress],
    });

    const value = state as {
      depositedCapital: bigint;
      realisedPnL: bigint;
      openInterest: bigint;
      positionCount: bigint;
      collateralLocked: bigint;
      registered: boolean;
    };

    return {
      depositedCapital: value.depositedCapital,
      realisedPnl: value.realisedPnL,
      openInterest: value.openInterest,
      positionCount: value.positionCount,
      collateralLocked: value.collateralLocked,
      registered: value.registered,
    };
  } catch {
    return {};
  }
}

export async function readPositionExposureSize(
  chainId: number,
  vaultAccountingAddress: Address,
  vaultAddress: Address,
  assetId: `0x${string}`,
  isLong: boolean,
): Promise<bigint | null> {
  const client = getClient(chainId);
  if (!client) return null;

  try {
    const key = (await client.readContract({
      address: vaultAccountingAddress,
      abi: vaultAccountingAbi,
      functionName: "getPositionKey",
      args: [vaultAddress, assetId, isLong],
    })) as `0x${string}`;

    const tracking = await client.readContract({
      address: vaultAccountingAddress,
      abi: vaultAccountingAbi,
      functionName: "getPositionTracking",
      args: [key],
    });

    const value = tracking as { exists: boolean; size: bigint };
    return value.exists ? value.size : 0n;
  } catch {
    return null;
  }
}

export async function readRoutingWeights(
  chainId: number,
  stateRelayAddress: Address,
): Promise<{ selectors: bigint[]; weights: bigint[]; amounts: bigint[] } | null> {
  const client = getClient(chainId);
  if (!client) return null;

  try {
    const routing = await client.readContract({
      address: stateRelayAddress,
      abi: stateRelayAbi,
      functionName: "getRoutingWeights",
    });

    const value = routing as [bigint[], bigint[], bigint[]];
    return {
      selectors: value[0] ?? [],
      weights: value[1] ?? [],
      amounts: value[2] ?? [],
    };
  } catch {
    return null;
  }
}
