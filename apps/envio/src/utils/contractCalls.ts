import { createPublicClient, http, type Address, type Chain } from "viem";
import { sepolia, avalancheFuji, arbitrumSepolia } from "viem/chains";

import basketVaultAbi from "../../abis/BasketVault.json";
import basketShareTokenAbi from "../../abis/BasketShareToken.json";
import vaultAccountingAbi from "../../abis/VaultAccounting.json";
import erc20Abi from "../../abis/ERC20.json";
import stateRelayAbi from "../../abis/StateRelay.json";

const mantleSepolia: Chain = {
  id: 5003,
  name: "Mantle Sepolia",
  nativeCurrency: { name: "Mantle", symbol: "MNT", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.sepolia.mantle.xyz"] },
  },
};

const localHub: Chain = {
  id: 31337,
  name: "Local Hub",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["http://127.0.0.1:8545"] },
  },
};

const localSpoke: Chain = {
  id: 31338,
  name: "Local Spoke",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["http://127.0.0.1:8546"] },
  },
};

type ChainConfig = {
  chain: Chain;
  rpcUrl: string;
};

/**
 * Public RPC endpoints that accept anonymous `eth_call` and are good enough
 * for the low-volume reads we issue from event handlers. Override per chain
 * via `<NAME>_RPC_URL` env vars (e.g. SEPOLIA_RPC_URL). If you point one of
 * those overrides at `*.rpc.hypersync.xyz`, also set `ENVIO_API_TOKEN` so we
 * attach a Bearer auth header — those endpoints reject unauthenticated calls.
 */
const DEFAULT_RPC_URLS: Record<number, string> = {
  11155111: "https://ethereum-sepolia-rpc.publicnode.com",
  43113: "https://avalanche-fuji-c-chain-rpc.publicnode.com",
  421614: "https://arbitrum-sepolia-rpc.publicnode.com",
  5003: "https://rpc.sepolia.mantle.xyz",
  31337: "http://127.0.0.1:8545",
  31338: "http://127.0.0.1:8546",
};

const CHAIN_CONFIG: Record<number, ChainConfig> = {
  11155111: { chain: sepolia, rpcUrl: resolveRpcUrl(11155111, "SEPOLIA_RPC_URL") },
  43113: { chain: avalancheFuji, rpcUrl: resolveRpcUrl(43113, "FUJI_RPC_URL") },
  421614: { chain: arbitrumSepolia, rpcUrl: resolveRpcUrl(421614, "ARBITRUM_SEPOLIA_RPC_URL") },
  5003: { chain: mantleSepolia, rpcUrl: resolveRpcUrl(5003, "MANTLE_SEPOLIA_RPC_URL") },
  31337: { chain: localHub, rpcUrl: resolveRpcUrl(31337, "HUB_RPC_URL") },
  31338: { chain: localSpoke, rpcUrl: resolveRpcUrl(31338, "SPOKE_RPC_URL") },
};

function resolveRpcUrl(chainId: number, envVar: string): string {
  const override = process.env[envVar]?.trim();
  if (override) return override;
  return DEFAULT_RPC_URLS[chainId] ?? "";
}

const clientCache = new Map<number, ReturnType<typeof createPublicClient>>();

function getClient(chainId: number) {
  const existing = clientCache.get(chainId);
  if (existing) return existing;

  const cfg = CHAIN_CONFIG[chainId];
  if (!cfg || !cfg.rpcUrl) return null;

  const isHypersync = /\.rpc\.hypersync\.xyz/i.test(cfg.rpcUrl);
  const apiToken = process.env.ENVIO_API_TOKEN?.trim();
  const transport = http(
    cfg.rpcUrl,
    isHypersync && apiToken
      ? { fetchOptions: { headers: { Authorization: `Bearer ${apiToken}` } } }
      : undefined,
  );

  const client = createPublicClient({
    chain: cfg.chain,
    transport,
  });
  clientCache.set(chainId, client);
  return client;
}

/**
 * Single-shot warning: log the first failure for each (chainId, op) pair so
 * configuration / RPC issues surface immediately instead of silently leaving
 * entity fields at their zero defaults. Subsequent failures stay quiet to
 * avoid drowning the indexer log.
 */
const warned = new Set<string>();
function warnOnce(chainId: number, op: string, error: unknown): void {
  const key = `${chainId}:${op}`;
  if (warned.has(key)) return;
  warned.add(key);
  const message = error instanceof Error ? error.message : String(error);
  // eslint-disable-next-line no-console
  console.warn(
    `[envio:contractCalls] read failed for chain=${chainId} op=${op}: ${message}. ` +
      `Set <NAME>_RPC_URL (or ENVIO_API_TOKEN for hypersync URLs) so handlers can populate live state.`,
  );
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
  } catch (error) {
    warnOnce(chainId, "BasketVault.name", error);
  }

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
    } catch (error) {
      warnOnce(chainId, "BasketShareToken.totalSupply", error);
    }
  } catch (error) {
    warnOnce(chainId, "BasketVault.shareToken", error);
  }

  try {
    result.perpAllocatedUsdc = (await client.readContract({
      address: vaultAddress,
      abi: basketVaultAbi,
      functionName: "perpAllocated",
    })) as bigint;
  } catch (error) {
    warnOnce(chainId, "BasketVault.perpAllocated", error);
  }

  try {
    const sharePrice = (await client.readContract({
      address: vaultAddress,
      abi: basketVaultAbi,
      functionName: "getSharePrice",
    })) as bigint;
    result.sharePrice = sharePrice;
    result.basketPrice = sharePrice;
  } catch (error) {
    warnOnce(chainId, "BasketVault.getSharePrice", error);
  }

  try {
    result.assetCount = (await client.readContract({
      address: vaultAddress,
      abi: basketVaultAbi,
      functionName: "getAssetCount",
    })) as bigint;
  } catch (error) {
    warnOnce(chainId, "BasketVault.getAssetCount", error);
  }

  try {
    result.depositFeeBps = (await client.readContract({
      address: vaultAddress,
      abi: basketVaultAbi,
      functionName: "depositFeeBps",
    })) as bigint;
  } catch (error) {
    warnOnce(chainId, "BasketVault.depositFeeBps", error);
  }

  try {
    result.redeemFeeBps = (await client.readContract({
      address: vaultAddress,
      abi: basketVaultAbi,
      functionName: "redeemFeeBps",
    })) as bigint;
  } catch (error) {
    warnOnce(chainId, "BasketVault.redeemFeeBps", error);
  }

  try {
    result.minReserveBps = (await client.readContract({
      address: vaultAddress,
      abi: basketVaultAbi,
      functionName: "minReserveBps",
    })) as bigint;
  } catch (error) {
    warnOnce(chainId, "BasketVault.minReserveBps", error);
  }

  try {
    result.maxPerpAllocation = (await client.readContract({
      address: vaultAddress,
      abi: basketVaultAbi,
      functionName: "maxPerpAllocation",
    })) as bigint;
  } catch (error) {
    warnOnce(chainId, "BasketVault.maxPerpAllocation", error);
  }

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
  } catch (error) {
    warnOnce(chainId, "BasketVault.usdc/balanceOf", error);
  }

  try {
    result.requiredReserveUsdc = (await client.readContract({
      address: vaultAddress,
      abi: basketVaultAbi,
      functionName: "getRequiredReserveUsdc",
    })) as bigint;
  } catch (error) {
    warnOnce(chainId, "BasketVault.getRequiredReserveUsdc", error);
  }

  try {
    result.availableForPerpUsdc = (await client.readContract({
      address: vaultAddress,
      abi: basketVaultAbi,
      functionName: "getAvailableForPerpUsdc",
    })) as bigint;
  } catch (error) {
    warnOnce(chainId, "BasketVault.getAvailableForPerpUsdc", error);
  }

  try {
    result.collectedFeesUsdc = (await client.readContract({
      address: vaultAddress,
      abi: basketVaultAbi,
      functionName: "collectedFees",
    })) as bigint;
  } catch (error) {
    warnOnce(chainId, "BasketVault.collectedFees", error);
  }

  try {
    result.vaultAccounting = (await client.readContract({
      address: vaultAddress,
      abi: basketVaultAbi,
      functionName: "vaultAccounting",
    })) as Address;
  } catch (error) {
    warnOnce(chainId, "BasketVault.vaultAccounting", error);
  }

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
  } catch (error) {
    warnOnce(chainId, "BasketVault.getAssetAt", error);
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
  } catch (error) {
    warnOnce(chainId, "VaultAccounting.getVaultState", error);
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
  } catch (error) {
    warnOnce(chainId, "VaultAccounting.getPositionTracking", error);
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
  } catch (error) {
    warnOnce(chainId, "StateRelay.getRoutingWeights", error);
    return null;
  }
}
