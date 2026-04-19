import { describe, expect, it } from "vitest";
import { CHAIN_REGISTRY } from "@/lib/deployment";
import sepoliaDeployment from "./sepolia-deployment.json";
import fujiDeployment from "./fuji-deployment.json";
import {
  getContracts,
  getContractsForDeploymentTarget,
  isDeploymentConfigured,
  CONFIGURED_DEPLOYMENT_TARGETS,
} from "./contracts";

describe("contract address resolution", () => {
  it("resolves sepolia deployment addresses from sepolia deployment config", () => {
    const contracts = getContractsForDeploymentTarget("sepolia");
    expect(contracts.basketFactory.toLowerCase()).toBe(sepoliaDeployment.basketFactory.toLowerCase());
    expect(contracts.usdc.toLowerCase()).toBe(sepoliaDeployment.usdc.toLowerCase());
  });

  it("resolves fuji deployment addresses from fuji deployment config", () => {
    const contracts = getContractsForDeploymentTarget("fuji");
    expect(contracts.basketFactory.toLowerCase()).toBe(fujiDeployment.basketFactory.toLowerCase());
    expect(contracts.usdc.toLowerCase()).toBe(fujiDeployment.usdc.toLowerCase());
  });

  it("keeps compatibility chain resolver behavior via chain id", () => {
    expect(getContracts(CHAIN_REGISTRY.sepolia.chainId).usdc.toLowerCase()).toBe(sepoliaDeployment.usdc.toLowerCase());
    expect(getContracts(CHAIN_REGISTRY.fuji.chainId).usdc.toLowerCase()).toBe(fujiDeployment.usdc.toLowerCase());
  });

  it("falls back to sepolia for unknown target", () => {
    const contracts = getContractsForDeploymentTarget("unknown-chain");
    expect(contracts.basketFactory.toLowerCase()).toBe(sepoliaDeployment.basketFactory.toLowerCase());
  });

  it("falls back to sepolia for unknown chain id", () => {
    const contracts = getContracts(999999);
    expect(contracts.basketFactory.toLowerCase()).toBe(sepoliaDeployment.basketFactory.toLowerCase());
  });
});

describe("deployment configuration detection", () => {
  it("reports configured targets as configured", () => {
    expect(isDeploymentConfigured("sepolia")).toBe(true);
    expect(isDeploymentConfigured("fuji")).toBe(true);
  });

  it("reports unconfigured targets as not configured", () => {
    expect(isDeploymentConfigured("arbitrum-sepolia")).toBe(false);
  });

  it("CONFIGURED_DEPLOYMENT_TARGETS includes only targets with real addresses", () => {
    expect(CONFIGURED_DEPLOYMENT_TARGETS).toContain("sepolia");
    expect(CONFIGURED_DEPLOYMENT_TARGETS).toContain("fuji");
    expect(CONFIGURED_DEPLOYMENT_TARGETS).not.toContain("arbitrum-sepolia");
  });
});
