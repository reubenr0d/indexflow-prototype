import { describe, expect, it } from "vitest";
import {
  CHAIN_REGISTRY,
  DEFAULT_DEPLOYMENT_TARGET,
  chainIdForDeploymentTarget,
  getSubgraphUrlForTarget,
  isHubChain,
  isSpokeChain,
  parseDeploymentTarget,
} from "./deployment";
import { SUBGRAPH_URL_BY_TARGET } from "@/config/subgraphs";

describe("deployment target helpers", () => {
  it("defaults to sepolia", () => {
    expect(DEFAULT_DEPLOYMENT_TARGET).toBe("sepolia");
  });

  it("parses supported targets", () => {
    expect(parseDeploymentTarget("sepolia")).toBe("sepolia");
    expect(parseDeploymentTarget("fuji")).toBe("fuji");
    expect(parseDeploymentTarget("mainnet")).toBeNull();
  });

  it("returns expected chain ids", () => {
    expect(chainIdForDeploymentTarget("sepolia")).toBe(11155111);
    expect(chainIdForDeploymentTarget("fuji")).toBe(43113);
  });

  it("returns 0 for unknown targets", () => {
    expect(chainIdForDeploymentTarget("unknown-chain")).toBe(0);
  });

  it("returns null for sepolia in e2e test mode even with configured URL", () => {
    const originalE2E = process.env.NEXT_PUBLIC_E2E_TEST_MODE;
    process.env.NEXT_PUBLIC_E2E_TEST_MODE = "1";
    expect(getSubgraphUrlForTarget("sepolia")).toBeNull();
    process.env.NEXT_PUBLIC_E2E_TEST_MODE = originalE2E;
  });

  it("returns configured subgraph URL for sepolia", () => {
    expect(getSubgraphUrlForTarget("sepolia")).toBe(
      SUBGRAPH_URL_BY_TARGET.sepolia
    );
  });

  it("returns null for targets with missing or blank config URLs", () => {
    expect(getSubgraphUrlForTarget("fuji")).toBeNull();
    expect(getSubgraphUrlForTarget("arbitrum-sepolia")).toBeNull();
  });
});

describe("chain registry", () => {
  it("includes all testnet chains", () => {
    expect(CHAIN_REGISTRY.sepolia).toBeDefined();
    expect(CHAIN_REGISTRY.fuji).toBeDefined();
    expect(CHAIN_REGISTRY["arbitrum-sepolia"]).toBeDefined();
  });

  it("identifies hub and spoke chains correctly", () => {
    expect(isHubChain("sepolia")).toBe(true);
    expect(isSpokeChain("fuji")).toBe(true);
    expect(isSpokeChain("arbitrum-sepolia")).toBe(true);
    expect(isHubChain("fuji")).toBe(false);
    expect(isSpokeChain("sepolia")).toBe(false);
  });

  it("returns false for unknown chain roles", () => {
    expect(isHubChain("nonexistent")).toBe(false);
    expect(isSpokeChain("nonexistent")).toBe(false);
  });
});
