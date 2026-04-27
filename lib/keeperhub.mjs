/**
 * KeeperHub Client Library
 *
 * Shared transaction execution layer for all keeper operations:
 *   - Price sync keeper
 *   - Cross-chain state sync keeper
 *   - Vault agent writes
 *
 * Provides:
 *   - Automatic retry logic with exponential backoff
 *   - Smart gas estimation
 *   - MEV protection
 *   - Full audit trail
 *
 * Usage:
 *   import { KeeperHubClient } from '../lib/keeperhub.mjs';
 *   const client = new KeeperHubClient(process.env.KEEPERHUB_API_KEY);
 *   const result = await client.executeContractCall({ ... });
 */

const DEFAULT_API_URL = "https://app.keeperhub.com";
const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 60; // 2 minutes max wait

// Network name mapping to KeeperHub network identifiers
const NETWORK_MAP = {
  mainnet: "ethereum",
  ethereum: "ethereum",
  sepolia: "sepolia",
  goerli: "goerli",
  arbitrum: "arbitrum",
  "arbitrum-sepolia": "arbitrum-sepolia",
  arbitrum_sepolia: "arbitrum-sepolia",
  optimism: "optimism",
  "optimism-sepolia": "optimism-sepolia",
  base: "base",
  "base-sepolia": "base-sepolia",
  polygon: "polygon",
  "polygon-mumbai": "polygon-mumbai",
  avalanche: "avalanche",
  "avalanche-fuji": "avalanche-fuji",
  fuji: "avalanche-fuji",
  local: "sepolia", // Fallback for local testing
};

/**
 * Best-effort string for failed executions when the API uses varying field names
 * (error, message, result, nested objects).
 * @param {object | null | undefined} r
 * @returns {string}
 */
export function formatKeeperHubFailureResult(r) {
  if (r == null) {
    return "Unknown error (empty response)";
  }
  for (const key of ["error", "message", "reason", "failureMessage", "failure", "statusMessage"]) {
    const v = r[key];
    if (v != null && String(v).trim() !== "") {
      return String(v);
    }
  }
  if (r.result != null) {
    if (typeof r.result === "string" && r.result.trim() !== "") {
      return r.result;
    }
    if (typeof r.result === "object" && r.result) {
      for (const key of ["error", "message", "details"]) {
        if (r.result[key] != null && String(r.result[key]).trim() !== "") {
          return String(r.result[key]);
        }
      }
      try {
        return JSON.stringify(r.result);
      } catch {
        /* fall through */
      }
    }
  }
  if (r.data && typeof r.data === "string") {
    return r.data;
  }
  if (r.data && typeof r.data === "object" && (r.data.message || r.data.error)) {
    return String(r.data.message || r.data.error);
  }
  try {
    const s = JSON.stringify(r);
    if (s && s !== "{}" && s.length <= 8000) {
      return s;
    }
    if (s && s.length > 8000) {
      return `${s.slice(0, 8000)}…`;
    }
  } catch {
    /* fall through */
  }
  return "Unknown error (no message in API response; check execution logs in KeeperHub UI)";
}

export class KeeperHubClient {
  constructor(apiKey, apiUrl = DEFAULT_API_URL) {
    if (!apiKey) {
      throw new Error("KEEPERHUB_API_KEY is required");
    }
    this.apiKey = apiKey;
    this.apiUrl = apiUrl;
    this.enabled = true;
  }

  /**
   * Check if KeeperHub is configured and enabled
   */
  static isConfigured() {
    return Boolean(process.env.KEEPERHUB_API_KEY);
  }

  /**
   * Create a client from environment variables
   */
  static fromEnv() {
    const apiKey = process.env.KEEPERHUB_API_KEY;
    const apiUrl = process.env.KEEPERHUB_API_URL || DEFAULT_API_URL;
    if (!apiKey) return null;
    return new KeeperHubClient(apiKey, apiUrl);
  }

  /**
   * Map network alias to KeeperHub network identifier
   */
  normalizeNetwork(network) {
    const normalized = NETWORK_MAP[network.toLowerCase()];
    if (!normalized) {
      throw new Error(`Unsupported network: ${network}. Supported: ${Object.keys(NETWORK_MAP).join(", ")}`);
    }
    return normalized;
  }

  /**
   * Make an authenticated request to KeeperHub API
   * Uses Authorization: Bearer header as per KeeperHub API documentation
   */
  async request(method, path, body = null) {
    const url = `${this.apiUrl}/api${path}`;
    const options = {
      method,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const res = await fetch(url, options);
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const error = new Error(data.message || data.error || `KeeperHub API error: ${res.status}`);
      error.status = res.status;
      error.response = data;
      throw error;
    }

    return data;
  }

  /**
   * Execute a contract write call via KeeperHub
   *
   * @param {Object} params
   * @param {string} params.network - Network name (e.g., 'sepolia', 'arbitrum')
   * @param {string} params.contractAddress - Contract address
   * @param {string} params.functionName - Function name (e.g., 'submitPrices')
   * @param {Array} params.functionArgs - Function arguments (will be JSON-stringified)
   * @param {Array|string} [params.abi] - Contract ABI (optional, auto-fetched if omitted)
   * @param {string} [params.value] - ETH value in wei (optional)
   * @param {string} [params.gasLimitMultiplier] - Gas limit multiplier (e.g., "1.2")
   * @param {string} [params.justification] - Audit trail for writes
   * @returns {Promise<{executionId: string, status: string}>}
   */
  async executeContractCall({
    network,
    contractAddress,
    functionName,
    functionArgs = [],
    abi,
    value,
    gasLimitMultiplier,
    justification,
  }) {
    const normalizedNetwork = this.normalizeNetwork(network);

    const body = {
      network: normalizedNetwork,
      contractAddress,
      functionName,
      functionArgs: JSON.stringify(functionArgs),
    };

    if (abi) {
      body.abi = typeof abi === "string" ? abi : JSON.stringify(abi);
    }
    if (value) body.value = value;
    if (gasLimitMultiplier) body.gasLimitMultiplier = gasLimitMultiplier;
    if (justification) body.justification = justification;

    const result = await this.request("POST", "/execute/contract-call", body);
    const failed = result.status === "failed" || result.status === "rejected";
    const error = failed
      ? result.error || result.message || result.failureMessage || formatKeeperHubFailureResult(result)
      : (result.error || result.message || null);

    return {
      executionId: result.executionId,
      status: result.status || "pending",
      transactionHash: result.transactionHash,
      result: result.result,
      error: error || null,
    };
  }

  /**
   * Execute multiple contract calls in sequence
   *
   * @param {Array} calls - Array of call parameters (same as executeContractCall)
   * @returns {Promise<Array<{executionId: string, status: string}>>}
   */
  async executeContractCalls(calls) {
    const results = [];
    for (const call of calls) {
      const result = await this.executeContractCall(call);
      results.push(result);
    }
    return results;
  }

  /**
   * Fetch detailed execution logs for an execution (retries, gas estimates, simulation revert reasons).
   * Uses the same endpoint as the `get_execution_logs` MCP tool.
   *
   * @param {string} executionId
   * @returns {Promise<{logs: Array<unknown>, retryCount: number, gasEstimates: Array<unknown>, raw: object}>}
   */
  async getExecutionLogs(executionId) {
    const result = await this.request("GET", `/workflows/executions/${executionId}/logs`);
    return {
      logs: Array.isArray(result.logs) ? result.logs : [],
      retryCount: typeof result.retryCount === "number" ? result.retryCount : 0,
      gasEstimates: Array.isArray(result.gasEstimates) ? result.gasEstimates : [],
      raw: result,
    };
  }

  /**
   * Get execution status
   *
   * @param {string} executionId
   * @returns {Promise<{status: string, transactionHash?: string, transactionLink?: string, error?: string}>}
   */
  async getExecutionStatus(executionId) {
    const result = await this.request("GET", `/execute/${executionId}/status`);

    const failed = result.status === "failed" || result.status === "rejected";
    return {
      executionId: result.executionId,
      status: result.status,
      type: result.type,
      transactionHash: result.transactionHash || null,
      transactionLink: result.transactionLink || null,
      gasUsedWei: result.gasUsedWei || null,
      result: result.result || null,
      error:
        result.error ||
        result.message ||
        result.failureMessage ||
        (failed ? formatKeeperHubFailureResult(result) : null),
      createdAt: result.createdAt,
      completedAt: result.completedAt,
    };
  }

  /**
   * Wait for execution to complete (polling)
   *
   * @param {string} executionId
   * @param {Object} [options]
   * @param {number} [options.maxAttempts] - Max poll attempts
   * @param {number} [options.intervalMs] - Poll interval in ms
   * @param {Function} [options.onPoll] - Callback on each poll
   * @returns {Promise<{status: string, transactionHash?: string, transactionLink?: string, error?: string}>}
   */
  async waitForExecution(executionId, options = {}) {
    const maxAttempts = options.maxAttempts || MAX_POLL_ATTEMPTS;
    const intervalMs = options.intervalMs || POLL_INTERVAL_MS;
    const onPoll = options.onPoll || (() => {});

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const status = await this.getExecutionStatus(executionId);
      onPoll(status, attempt);

      if (status.status === "completed") {
        return { ...status, success: true };
      }

      if (status.status === "failed" || status.status === "rejected") {
        return { ...status, success: false };
      }

      // Still pending/running, wait and poll again
      await new Promise((r) => setTimeout(r, intervalMs));
    }

    throw new Error(`Execution ${executionId} did not complete within ${maxAttempts * intervalMs / 1000}s`);
  }

  /**
   * Execute a contract call and wait for completion
   *
   * @param {Object} params - Same as executeContractCall
   * @param {Object} [waitOptions] - Same as waitForExecution options
   * @returns {Promise<{success: boolean, executionId: string, transactionHash?: string, error?: string}>}
   */
  async executeAndWait(params, waitOptions = {}) {
    const result = await this.executeContractCall(params);

    // If the call was synchronous (completed immediately), return it
    if (result.status === "completed" || result.status === "failed" || result.status === "rejected") {
      return {
        ...result,
        success: result.status === "completed",
      };
    }

    // Otherwise poll for completion
    const finalResult = await this.waitForExecution(result.executionId, waitOptions);
    return { ...finalResult, executionId: result.executionId };
  }

  /**
   * Execute multiple calls and wait for all to complete
   *
   * @param {Array} calls - Array of call parameters
   * @param {Object} [waitOptions] - Wait options
   * @returns {Promise<Array<{success: boolean, executionId: string, transactionHash?: string}>>}
   */
  async executeAllAndWait(calls, waitOptions = {}) {
    // Submit all calls first
    const submissions = await this.executeContractCalls(calls);

    // Wait for all to complete in parallel
    const results = await Promise.all(
      submissions.map(async (submission) => {
        if (submission.status === "completed" || submission.status === "failed" || submission.status === "rejected") {
          return {
            ...submission,
            success: submission.status === "completed",
          };
        }
        try {
          const result = await this.waitForExecution(submission.executionId, waitOptions);
          return { ...result, executionId: submission.executionId };
        } catch (err) {
          return { success: false, executionId: submission.executionId, error: err.message };
        }
      })
    );

    return results;
  }

  /**
   * Transfer tokens via KeeperHub
   *
   * @param {Object} params
   * @param {string} params.network - Network name
   * @param {string} params.recipientAddress - Destination address
   * @param {string} params.amount - Amount in human-readable units (e.g., "0.1")
   * @param {string} [params.tokenAddress] - ERC-20 token address (omit for native)
   * @param {string} [params.gasLimitMultiplier] - Gas limit multiplier
   */
  async executeTransfer({ network, recipientAddress, amount, tokenAddress, gasLimitMultiplier }) {
    const normalizedNetwork = this.normalizeNetwork(network);

    const body = {
      network: normalizedNetwork,
      recipientAddress,
      amount,
    };

    if (tokenAddress) {
      body.tokenAddress = tokenAddress;
    }
    if (gasLimitMultiplier) {
      body.gasLimitMultiplier = gasLimitMultiplier;
    }

    const result = await this.request("POST", "/execute/transfer", body);

    return {
      executionId: result.executionId,
      status: result.status || "pending",
      transactionHash: result.transactionHash,
    };
  }

  /**
   * Check a condition and conditionally execute
   *
   * @param {Object} params
   * @param {string} params.network - Network name
   * @param {string} params.contractAddress - Contract to read from
   * @param {string} params.functionName - Read function name
   * @param {Array} params.functionArgs - Read function arguments
   * @param {Object} params.condition - Condition object { operator, value }
   * @param {Object} params.action - Action to execute if condition met
   */
  async checkAndExecute({ network, contractAddress, functionName, functionArgs = [], abi, condition, action }) {
    const normalizedNetwork = this.normalizeNetwork(network);

    const body = {
      network: normalizedNetwork,
      contractAddress,
      functionName,
      functionArgs: JSON.stringify(functionArgs),
      condition,
      action: {
        ...action,
        functionArgs: action.functionArgs ? JSON.stringify(action.functionArgs) : undefined,
        abi: action.abi ? (typeof action.abi === "string" ? action.abi : JSON.stringify(action.abi)) : undefined,
      },
    };

    if (abi) {
      body.abi = typeof abi === "string" ? abi : JSON.stringify(abi);
    }

    return await this.request("POST", "/execute/check-and-execute", body);
  }

  /**
   * Verify API key and connection
   * @returns {Promise<{valid: boolean, workflows?: number, error?: string}>}
   */
  async verifyConnection() {
    try {
      // Use workflows endpoint which works with org API keys
      const workflows = await this.request("GET", "/workflows");
      return {
        valid: true,
        workflowCount: Array.isArray(workflows) ? workflows.length : 0,
      };
    } catch (err) {
      return {
        valid: false,
        error: err.message,
        status: err.status,
      };
    }
  }
}

/**
 * Fallback executor that uses direct ethers.js calls when KeeperHub is not configured
 * This maintains backward compatibility
 */
export class DirectExecutor {
  constructor(signer) {
    this.signer = signer;
  }

  async executeContractCall({ contractAddress, functionName, functionArgs, abi }) {
    const { ethers } = await import("ethers");

    // Build function signature
    const iface = new ethers.Interface(abi || []);
    const data = iface.encodeFunctionData(functionName, functionArgs);

    const tx = await this.signer.sendTransaction({
      to: contractAddress,
      data,
    });

    const receipt = await tx.wait();

    return {
      success: receipt.status === 1,
      transactionHash: receipt.hash,
      blockNumber: receipt.blockNumber,
    };
  }
}

/**
 * Create an executor based on environment configuration
 * Returns KeeperHubClient if configured, otherwise returns null (caller should use direct execution)
 */
export function createExecutor() {
  return KeeperHubClient.fromEnv();
}

export default KeeperHubClient;
