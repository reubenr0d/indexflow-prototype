import { type Address } from "viem";
import {
  type DeploymentTarget,
  type DeploymentConfig,
  CHAIN_REGISTRY,
} from "@/lib/deployment";
import sepoliaDeployment from "./sepolia-deployment.json";
import fujiDeployment from "./fuji-deployment.json";

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

export type ContractAddresses = {
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
  stateRelay?: Address;
};

function deploymentToAddresses(d: DeploymentConfig): ContractAddresses {
  return {
    basketFactory: (d.basketFactory ?? ZERO) as Address,
    vaultAccounting: (d.vaultAccounting ?? ZERO) as Address,
    oracleAdapter: (d.oracleAdapter ?? ZERO) as Address,
    perpReader: (d.perpReader ?? ZERO) as Address,
    pricingEngine: (d.pricingEngine ?? ZERO) as Address,
    fundingRateManager: (d.fundingRateManager ?? ZERO) as Address,
    priceSync: (d.priceSync ?? ZERO) as Address,
    usdc: (d.usdc ?? ZERO) as Address,
    gmxVault: (d.gmxVault ?? ZERO) as Address,
    assetWiring: (d.assetWiring ?? ZERO) as Address,
    stateRelay: d.stateRelay ? (d.stateRelay as Address) : undefined,
  };
}

const DEPLOYMENT_FILES: Record<string, DeploymentConfig> = {
  sepolia: sepoliaDeployment as DeploymentConfig,
  fuji: fujiDeployment as DeploymentConfig,
};

const STATIC_OVERRIDES: Record<string, Partial<DeploymentConfig>> = {
  arbitrum: { usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" },
};

const BY_DEPLOYMENT_TARGET: Record<string, ContractAddresses> = {};

for (const target of Object.keys(CHAIN_REGISTRY)) {
  const file = DEPLOYMENT_FILES[target];
  const overrides = STATIC_OVERRIDES[target];
  if (file) {
    BY_DEPLOYMENT_TARGET[target] = deploymentToAddresses(
      overrides ? { ...file, ...overrides } : file,
    );
  } else {
    BY_DEPLOYMENT_TARGET[target] = deploymentToAddresses({
      basketFactory: ZERO,
      usdc: ZERO,
      ...overrides,
    });
  }
}

export const CONTRACT_ADDRESSES: Record<number, ContractAddresses> = {};
for (const [target, cfg] of Object.entries(CHAIN_REGISTRY)) {
  const addrs = BY_DEPLOYMENT_TARGET[target];
  if (addrs) CONTRACT_ADDRESSES[cfg.chainId] = addrs;
}

export function getContractsForDeploymentTarget(target: DeploymentTarget): ContractAddresses {
  return BY_DEPLOYMENT_TARGET[target] ?? BY_DEPLOYMENT_TARGET.sepolia;
}

export function getContracts(chainId: number): ContractAddresses {
  const sepoliaChainId = CHAIN_REGISTRY.sepolia?.chainId ?? 11155111;
  return CONTRACT_ADDRESSES[chainId] ?? CONTRACT_ADDRESSES[sepoliaChainId];
}

const PLACEHOLDER_RE = /^0x0{38,}[0-9a-f]{0,2}$/i;

export function isDeploymentConfigured(target: DeploymentTarget): boolean {
  const addrs = BY_DEPLOYMENT_TARGET[target];
  if (!addrs) return false;
  return !PLACEHOLDER_RE.test(addrs.basketFactory);
}

export const CONFIGURED_DEPLOYMENT_TARGETS: DeploymentTarget[] =
  Object.keys(BY_DEPLOYMENT_TARGET).filter(isDeploymentConfigured);
