import { type Address } from "viem";
import { anvil, avalancheFuji } from "viem/chains";
import { arbitrum, arbitrumSepolia, sepolia } from "wagmi/chains";
import { type DeploymentTarget } from "@/lib/deployment";
import localDeployment from "./local-deployment.json";
import sepoliaDeployment from "./sepolia-deployment.json";
import fujiDeployment from "./fuji-deployment.json";

type ContractAddresses = {
  basketFactory: Address;
  vaultAccounting: Address;
  oracleAdapter: Address;
  perpReader: Address;
  pricingEngine: Address;
  fundingRateManager: Address;
  priceSync: Address;
  usdc: Address;
  gmxVault: Address;
  assetWiring: Address;
  poolReserveRegistry: Address;
  intentRouter: Address;
};

type DeploymentFile = {
  basketFactory: string;
  vaultAccounting: string;
  oracleAdapter: string;
  perpReader: string;
  pricingEngine: string;
  fundingRateManager: string;
  priceSync?: string;
  usdc: string;
  gmxVault: string;
  assetWiring?: string;
  poolReserveRegistry?: string;
  intentRouter?: string;
};

const ld = localDeployment as DeploymentFile;
const sd = sepoliaDeployment as DeploymentFile;
const fd = fujiDeployment as DeploymentFile;

const BY_DEPLOYMENT_TARGET: Record<DeploymentTarget, ContractAddresses> = {
  anvil: {
    basketFactory: ld.basketFactory as Address,
    vaultAccounting: ld.vaultAccounting as Address,
    oracleAdapter: ld.oracleAdapter as Address,
    perpReader: ld.perpReader as Address,
    pricingEngine: ld.pricingEngine as Address,
    fundingRateManager: ld.fundingRateManager as Address,
    priceSync: (ld.priceSync ?? "0x0000000000000000000000000000000000000000") as Address,
    usdc: ld.usdc as Address,
    gmxVault: ld.gmxVault as Address,
    assetWiring: (ld.assetWiring ?? "0x0000000000000000000000000000000000000000") as Address,
    poolReserveRegistry: (ld.poolReserveRegistry ?? "0x0000000000000000000000000000000000000000") as Address,
    intentRouter: (ld.intentRouter ?? "0x0000000000000000000000000000000000000000") as Address,
  },
  sepolia: {
    basketFactory: sd.basketFactory as Address,
    vaultAccounting: sd.vaultAccounting as Address,
    oracleAdapter: sd.oracleAdapter as Address,
    perpReader: sd.perpReader as Address,
    pricingEngine: sd.pricingEngine as Address,
    fundingRateManager: sd.fundingRateManager as Address,
    priceSync: (sd.priceSync ?? "0x0000000000000000000000000000000000000000") as Address,
    usdc: sd.usdc as Address,
    gmxVault: sd.gmxVault as Address,
    assetWiring: (sd.assetWiring ?? "0x0000000000000000000000000000000000000000") as Address,
    poolReserveRegistry: (sd.poolReserveRegistry ?? "0x0000000000000000000000000000000000000000") as Address,
    intentRouter: (sd.intentRouter ?? "0x0000000000000000000000000000000000000000") as Address,
  },
  "arbitrum-sepolia": {
    basketFactory: "0x0000000000000000000000000000000000000001" as Address,
    vaultAccounting: "0x0000000000000000000000000000000000000002" as Address,
    oracleAdapter: "0x0000000000000000000000000000000000000003" as Address,
    perpReader: "0x0000000000000000000000000000000000000004" as Address,
    pricingEngine: "0x0000000000000000000000000000000000000005" as Address,
    fundingRateManager: "0x0000000000000000000000000000000000000006" as Address,
    priceSync: "0x0000000000000000000000000000000000000007" as Address,
    usdc: "0x0000000000000000000000000000000000000008" as Address,
    gmxVault: "0x0000000000000000000000000000000000000009" as Address,
    assetWiring: "0x0000000000000000000000000000000000000000" as Address,
    poolReserveRegistry: "0x0000000000000000000000000000000000000000" as Address,
    intentRouter: "0x0000000000000000000000000000000000000000" as Address,
  },
  fuji: {
    basketFactory: fd.basketFactory as Address,
    vaultAccounting: fd.vaultAccounting as Address,
    oracleAdapter: fd.oracleAdapter as Address,
    perpReader: fd.perpReader as Address,
    pricingEngine: fd.pricingEngine as Address,
    fundingRateManager: fd.fundingRateManager as Address,
    priceSync: (fd.priceSync ?? "0x0000000000000000000000000000000000000000") as Address,
    usdc: fd.usdc as Address,
    gmxVault: fd.gmxVault as Address,
    assetWiring: (fd.assetWiring ?? "0x0000000000000000000000000000000000000000") as Address,
    poolReserveRegistry: (fd.poolReserveRegistry ?? "0x0000000000000000000000000000000000000000") as Address,
    intentRouter: (fd.intentRouter ?? "0x0000000000000000000000000000000000000000") as Address,
  },
  arbitrum: {
    basketFactory: "0x0000000000000000000000000000000000000001" as Address,
    vaultAccounting: "0x0000000000000000000000000000000000000002" as Address,
    oracleAdapter: "0x0000000000000000000000000000000000000003" as Address,
    perpReader: "0x0000000000000000000000000000000000000004" as Address,
    pricingEngine: "0x0000000000000000000000000000000000000005" as Address,
    fundingRateManager: "0x0000000000000000000000000000000000000006" as Address,
    priceSync: "0x0000000000000000000000000000000000000007" as Address,
    usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" as Address,
    gmxVault: "0x0000000000000000000000000000000000000008" as Address,
    assetWiring: "0x0000000000000000000000000000000000000000" as Address,
    poolReserveRegistry: "0x0000000000000000000000000000000000000000" as Address,
    intentRouter: "0x0000000000000000000000000000000000000000" as Address,
  },
};

export const CONTRACT_ADDRESSES: Record<number, ContractAddresses> = {
  [anvil.id]: BY_DEPLOYMENT_TARGET.anvil,
  [sepolia.id]: BY_DEPLOYMENT_TARGET.sepolia,
  [arbitrum.id]: {
    basketFactory: "0x0000000000000000000000000000000000000001" as Address,
    vaultAccounting: "0x0000000000000000000000000000000000000002" as Address,
    oracleAdapter: "0x0000000000000000000000000000000000000003" as Address,
    perpReader: "0x0000000000000000000000000000000000000004" as Address,
    pricingEngine: "0x0000000000000000000000000000000000000005" as Address,
    fundingRateManager: "0x0000000000000000000000000000000000000006" as Address,
    priceSync: "0x0000000000000000000000000000000000000007" as Address,
    usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" as Address,
    gmxVault: "0x0000000000000000000000000000000000000008" as Address,
    assetWiring: "0x0000000000000000000000000000000000000000" as Address,
    poolReserveRegistry: "0x0000000000000000000000000000000000000000" as Address,
    intentRouter: "0x0000000000000000000000000000000000000000" as Address,
  },
  [arbitrumSepolia.id]: {
    basketFactory: "0x0000000000000000000000000000000000000001" as Address,
    vaultAccounting: "0x0000000000000000000000000000000000000002" as Address,
    oracleAdapter: "0x0000000000000000000000000000000000000003" as Address,
    perpReader: "0x0000000000000000000000000000000000000004" as Address,
    pricingEngine: "0x0000000000000000000000000000000000000005" as Address,
    fundingRateManager: "0x0000000000000000000000000000000000000006" as Address,
    priceSync: "0x0000000000000000000000000000000000000007" as Address,
    usdc: "0x0000000000000000000000000000000000000008" as Address,
    gmxVault: "0x0000000000000000000000000000000000000009" as Address,
    assetWiring: "0x0000000000000000000000000000000000000000" as Address,
    poolReserveRegistry: "0x0000000000000000000000000000000000000000" as Address,
    intentRouter: "0x0000000000000000000000000000000000000000" as Address,
  },
  [avalancheFuji.id]: BY_DEPLOYMENT_TARGET.fuji,
};

export function getContractsForDeploymentTarget(target: DeploymentTarget): ContractAddresses {
  return BY_DEPLOYMENT_TARGET[target] ?? BY_DEPLOYMENT_TARGET.sepolia;
}

export function getContracts(chainId: number): ContractAddresses {
  return CONTRACT_ADDRESSES[chainId] ?? CONTRACT_ADDRESSES[sepolia.id];
}

const PLACEHOLDER_RE = /^0x0{38,}[0-9a-f]{0,2}$/i;

export function isDeploymentConfigured(target: DeploymentTarget): boolean {
  const addrs = BY_DEPLOYMENT_TARGET[target];
  if (!addrs) return false;
  return !PLACEHOLDER_RE.test(addrs.basketFactory);
}

export const CONFIGURED_DEPLOYMENT_TARGETS: DeploymentTarget[] =
  (Object.keys(BY_DEPLOYMENT_TARGET) as DeploymentTarget[]).filter(isDeploymentConfigured);
