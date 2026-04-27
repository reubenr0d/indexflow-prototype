import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { KeeperHubClient } from "../keeperhub.mjs";

const API_KEY = process.env.KEEPERHUB_API_KEY || "test_key";
const SKIP_LIVE_TESTS = !process.env.KEEPERHUB_API_KEY;

describe("KeeperHubClient", () => {
  describe("static methods", () => {
    it("isConfigured returns false when env var not set", () => {
      const original = process.env.KEEPERHUB_API_KEY;
      delete process.env.KEEPERHUB_API_KEY;
      expect(KeeperHubClient.isConfigured()).toBe(false);
      if (original) process.env.KEEPERHUB_API_KEY = original;
    });

    it("isConfigured returns true when env var is set", () => {
      const original = process.env.KEEPERHUB_API_KEY;
      process.env.KEEPERHUB_API_KEY = "test_key";
      expect(KeeperHubClient.isConfigured()).toBe(true);
      if (original) {
        process.env.KEEPERHUB_API_KEY = original;
      } else {
        delete process.env.KEEPERHUB_API_KEY;
      }
    });

    it("fromEnv returns null when not configured", () => {
      const original = process.env.KEEPERHUB_API_KEY;
      delete process.env.KEEPERHUB_API_KEY;
      expect(KeeperHubClient.fromEnv()).toBe(null);
      if (original) process.env.KEEPERHUB_API_KEY = original;
    });
  });

  describe("network normalization", () => {
    let client;

    beforeAll(() => {
      client = new KeeperHubClient("test_key");
    });

    it("normalizes mainnet", () => {
      expect(client.normalizeNetwork("mainnet")).toBe("ethereum");
    });

    it("normalizes sepolia", () => {
      expect(client.normalizeNetwork("sepolia")).toBe("sepolia");
    });

    it("normalizes arbitrum-sepolia variants", () => {
      expect(client.normalizeNetwork("arbitrum-sepolia")).toBe("arbitrum-sepolia");
      expect(client.normalizeNetwork("arbitrum_sepolia")).toBe("arbitrum-sepolia");
    });

    it("throws for unsupported networks", () => {
      expect(() => client.normalizeNetwork("unknown-chain")).toThrow("Unsupported network");
    });

    it("is case insensitive", () => {
      expect(client.normalizeNetwork("SEPOLIA")).toBe("sepolia");
      expect(client.normalizeNetwork("Mainnet")).toBe("ethereum");
    });
  });

  describe("constructor", () => {
    it("throws when API key is missing", () => {
      expect(() => new KeeperHubClient("")).toThrow("KEEPERHUB_API_KEY is required");
      expect(() => new KeeperHubClient(null)).toThrow("KEEPERHUB_API_KEY is required");
      expect(() => new KeeperHubClient(undefined)).toThrow("KEEPERHUB_API_KEY is required");
    });

    it("accepts valid API key", () => {
      const client = new KeeperHubClient("kh_test_key");
      expect(client.enabled).toBe(true);
    });

    it("uses default API URL", () => {
      const client = new KeeperHubClient("test_key");
      expect(client.apiUrl).toBe("https://app.keeperhub.com");
    });

    it("accepts custom API URL", () => {
      const client = new KeeperHubClient("test_key", "https://custom.api.com");
      expect(client.apiUrl).toBe("https://custom.api.com");
    });
  });

  describe.skipIf(SKIP_LIVE_TESTS)("live API tests", () => {
    let client;

    beforeAll(() => {
      client = new KeeperHubClient(API_KEY);
    });

    it("verifyConnection returns valid result", async () => {
      const result = await client.verifyConnection();
      expect(result.valid).toBe(true);
      expect(typeof result.workflowCount).toBe("number");
    });

    it("can execute a read-only contract call", async () => {
      const wethAbi = [{
        inputs: [{ name: "account", type: "address" }],
        name: "balanceOf",
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function"
      }];

      const result = await client.executeContractCall({
        network: "sepolia",
        contractAddress: "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9", // WETH on Sepolia
        functionName: "balanceOf",
        functionArgs: ["0x0000000000000000000000000000000000000001"],
        abi: wethAbi,
      });

      expect(result.status).toBeDefined();
      expect(["pending", "completed"]).toContain(result.status);
    });
  });
});
