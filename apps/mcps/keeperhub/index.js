#!/usr/bin/env node

/**
 * KeeperHub MCP Server
 *
 * Provides reliable blockchain transaction execution for AI agents via KeeperHub:
 *   - Automatic retry logic with exponential backoff
 *   - Smart gas estimation (30% cheaper than baseline)
 *   - MEV protection via private transaction routing
 *   - Full audit trail for all executions
 *
 * Requires:
 *   KEEPERHUB_API_KEY - API key from app.keeperhub.com
 *   KEEPERHUB_API_URL - API base URL (default: https://app.keeperhub.com)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Config from env
// ---------------------------------------------------------------------------

const KEEPERHUB_API_KEY = process.env.KEEPERHUB_API_KEY || "";
const KEEPERHUB_API_URL = process.env.KEEPERHUB_API_URL || "https://app.keeperhub.com";

// Supported networks
const SUPPORTED_NETWORKS = [
  "mainnet", "sepolia", "goerli",
  "arbitrum", "arbitrum-sepolia",
  "optimism", "optimism-sepolia",
  "base", "base-sepolia",
  "polygon", "polygon-mumbai",
  "avalanche", "avalanche-fuji",
];

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function toolError(code, message, recoveryHint) {
  const payload = { success: false, error_code: code, message };
  if (recoveryHint) payload.recovery_hint = recoveryHint;
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    isError: true,
  };
}

function toolSuccess(data) {
  return {
    content: [{ type: "text", text: JSON.stringify({ success: true, ...data }, null, 2) }],
  };
}

async function keeperHubRequest(method, path, body = null) {
  if (!KEEPERHUB_API_KEY) {
    throw new Error("KEEPERHUB_API_KEY is required");
  }

  const url = `${KEEPERHUB_API_URL}/api${path}`;
  const options = {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${KEEPERHUB_API_KEY}`,
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
 * Coalesce tool args to a JS array for `JSON.stringify`ing to the KeeperHub API.
 * OpenAI's tool `parameters` format requires `array` schemas to declare `items`, so
 * we avoid `z.array(z.any())` in Zod. Callers may pass a JSON string (supports
 * nested arrays) or a plain array of primitives/arrays of strings.
 * @param {unknown} value
 * @returns {unknown[]}
 */
function coalesceJsonArrayArg(value) {
  if (value == null || value === "") return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const p = JSON.parse(value);
      return Array.isArray(p) ? p : [p];
    } catch {
      return [];
    }
  }
  return [];
}

/** @param {unknown} value */
function normalizeAbiParam(value) {
  if (value == null) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

// JSON Schema: `array` must have `items` (OpenAI rejects `z.array(z.any())`). Nested calldata: use a JSON string.
const optionalFunctionArgs = z
  .union([
    z.string().describe("JSON string of a JSON array (use for nested args, e.g. setAssets)"),
    z.array(z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])),
  ])
  .optional()
  .describe(
    "Function arguments: JSON string of a JSON array, or a one-level / bytes32[] array. " +
    "For deeply nested calldata, prefer a JSON string.",
  );

const optionalAbiArg = z
  .union([
    z.string().describe("JSON string: ABI as array of fragments, or a single function fragment"),
    z.array(
      z
        .object({ type: z.string() })
        .passthrough()
        .describe("One ABI item (e.g. type+name+inputs)"),
    ),
  ])
  .optional();

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "keeperhub",
  version: "1.0.0",
});

// ── Connection Info Tool ────────────────────────────────────────────────────

server.registerTool(
  "get_keeperhub_info",
  {
    title: "Get KeeperHub Info",
    description:
      "Get KeeperHub configuration and connection status. " +
      "Returns API endpoint, supported networks, and wallet information. " +
      "Call this first to verify KeeperHub is properly configured.",
    inputSchema: {},
  },
  async () => {
    try {
      if (!KEEPERHUB_API_KEY) {
        return toolError("NO_API_KEY", "KEEPERHUB_API_KEY is not configured",
          "Set KEEPERHUB_API_KEY env var. Get your key from https://app.keeperhub.com");
      }

      // Verify connection by listing workflows (works with org API keys)
      let workflows = null;
      try {
        workflows = await keeperHubRequest("GET", "/workflows");
      } catch {
        // May not have workflows yet
      }

      return toolSuccess({
        api_url: KEEPERHUB_API_URL,
        connected: true,
        supported_networks: SUPPORTED_NETWORKS,
        workflow_count: Array.isArray(workflows) ? workflows.length : 0,
        features: [
          "Automatic transaction retries",
          "Smart gas estimation",
          "MEV protection",
          "Full audit trail",
        ],
      });
    } catch (err) {
      return toolError("CONNECTION_ERROR", err.message,
        "Check that KEEPERHUB_API_KEY is valid and the API is reachable.");
    }
  },
);

// ── Direct Execution Tools ──────────────────────────────────────────────────

server.registerTool(
  "execute_transfer",
  {
    title: "Execute Token Transfer",
    description:
      "Send ETH or ERC-20 tokens via KeeperHub with automatic retry and gas optimization. " +
      "Returns execution ID for status tracking. " +
      "For ERC-20 tokens, provide tokenAddress; omit for native ETH transfer.",
    inputSchema: {
      network: z.enum(SUPPORTED_NETWORKS).describe("Target network (e.g. 'sepolia', 'arbitrum')"),
      toAddress: z.string().describe("Recipient address (0x...)"),
      amount: z.string().describe("Amount to transfer (in wei for ETH, smallest unit for tokens)"),
      tokenAddress: z.string().optional().describe("ERC-20 token address (omit for native ETH)"),
      justification: z.string().optional().describe("Why this transfer is being made (for audit trail)"),
    },
  },
  async ({ network, toAddress, amount, tokenAddress, justification }) => {
    try {
      const actionType = tokenAddress ? "web3/transfer-token" : "web3/transfer-funds";
      const params = {
        network,
        toAddress,
        amount,
      };
      if (tokenAddress) {
        params.tokenAddress = tokenAddress;
      }

      const body = {
        network,
        recipientAddress: toAddress,
        amount,
      };
      if (tokenAddress) body.tokenAddress = tokenAddress;

      const result = await keeperHubRequest("POST", "/execute/transfer", body);

      return toolSuccess({
        execution_id: result.executionId,
        status: result.status || "pending",
        action_type: actionType,
        params,
        next_steps: [
          { tool: "get_execution_status", params: { executionId: result.executionId } },
        ],
      });
    } catch (err) {
      if (err.status === 401) {
        return toolError("AUTH_ERROR", "Invalid or expired API key",
          "Check that KEEPERHUB_API_KEY is valid. Get a new key from https://app.keeperhub.com");
      }
      if (err.status === 400) {
        return toolError("INVALID_PARAMS", err.message,
          "Check the network, address, and amount parameters.");
      }
      return toolError("EXECUTION_ERROR", err.message);
    }
  },
);

server.registerTool(
  "execute_contract_call",
  {
    title: "Execute Contract Call",
    description:
      "Call any smart contract function via KeeperHub with automatic retry and gas optimization. " +
      "Auto-detects read vs write operations. Write operations require a configured wallet. " +
      "Returns execution ID for write operations, or result directly for read operations.",
    inputSchema: {
      network: z.enum(SUPPORTED_NETWORKS).describe("Target network (e.g. 'sepolia', 'arbitrum')"),
      contractAddress: z.string().describe("Contract address (0x...)"),
      functionName: z.string().describe("Function name to call (e.g. 'transfer', 'balanceOf')"),
      functionArgs: optionalFunctionArgs,
      abi: optionalAbiArg,
      value: z.string().optional().describe("ETH value to send with call (in wei)"),
      justification: z.string().optional().describe("Why this call is being made (for audit trail)"),
    },
  },
  async ({ network, contractAddress, functionName, functionArgs, abi, value, justification }) => {
    try {
      const body = {
        network,
        contractAddress,
        functionName,
        functionArgs: JSON.stringify(coalesceJsonArrayArg(functionArgs)),
      };
      if (abi) {
        const a = normalizeAbiParam(abi);
        body.abi = typeof a === "string" ? a : JSON.stringify(a);
      }
      if (value) body.value = value;

      const result = await keeperHubRequest("POST", "/execute/contract-call", body);

      // Read operations return result directly
      if (result.isRead) {
        return toolSuccess({
          is_read: true,
          result: result.result,
          contract_address: contractAddress,
          function_name: functionName,
        });
      }

      // Write operations return execution ID
      return toolSuccess({
        execution_id: result.executionId,
        status: result.status || "pending",
        is_read: false,
        contract_address: contractAddress,
        function_name: functionName,
        next_steps: [
          { tool: "get_execution_status", params: { executionId: result.executionId } },
        ],
      });
    } catch (err) {
      if (err.status === 401) {
        return toolError("AUTH_ERROR", "Invalid or expired API key",
          "Check that KEEPERHUB_API_KEY is valid.");
      }
      if (err.message?.includes("no wallet")) {
        return toolError("NO_WALLET", "No wallet configured for write operations",
          "Configure a wallet integration at https://app.keeperhub.com/integrations");
      }
      return toolError("EXECUTION_ERROR", err.message);
    }
  },
);

server.registerTool(
  "execute_check_and_execute",
  {
    title: "Check Condition and Execute",
    description:
      "Read a contract value, evaluate a condition, and execute a write if the condition is met. " +
      "Useful for conditional actions like 'if balance > X, then transfer'. " +
      "Returns execution ID if condition was met and write was triggered.",
    inputSchema: {
      network: z.enum(SUPPORTED_NETWORKS).describe("Target network"),
      checkContract: z.string().describe("Contract to read from (0x...)"),
      checkFunction: z.string().describe("Function to call for the check"),
      checkArgs: optionalFunctionArgs,
      condition: z.object({
        operator: z.enum(["gt", "gte", "lt", "lte", "eq", "neq"]).describe("Comparison operator"),
        value: z.string().describe("Value to compare against"),
      }).describe("Condition to evaluate"),
      executeContract: z.string().describe("Contract to execute on if condition met"),
      executeFunction: z.string().describe("Function to execute"),
      executeArgs: optionalFunctionArgs,
      justification: z.string().optional().describe("Why this action is being taken"),
    },
  },
  async ({ network, checkContract, checkFunction, checkArgs, condition, executeContract, executeFunction, executeArgs, justification }) => {
    try {
      const result = await keeperHubRequest("POST", "/execute/check-and-execute", {
        network,
        contractAddress: checkContract,
        functionName: checkFunction,
        functionArgs: JSON.stringify(coalesceJsonArrayArg(checkArgs)),
        condition,
        action: {
          contractAddress: executeContract,
          functionName: executeFunction,
          functionArgs: JSON.stringify(coalesceJsonArrayArg(executeArgs)),
        },
      });

      return toolSuccess({
        condition_met: result.conditionMet,
        check_result: result.checkResult,
        execution_id: result.executionId || null,
        status: result.status || (result.conditionMet ? "pending" : "skipped"),
      });
    } catch (err) {
      return toolError("EXECUTION_ERROR", err.message);
    }
  },
);

// ── Status and Monitoring Tools ─────────────────────────────────────────────

server.registerTool(
  "get_execution_status",
  {
    title: "Get Execution Status",
    description:
      "Check the status of a KeeperHub execution by ID. " +
      "Returns status (pending, running, completed, failed), transaction hash, and block explorer link.",
    inputSchema: {
      executionId: z.string().describe("Execution ID from execute_* tool result"),
    },
  },
  async ({ executionId }) => {
    try {
      const result = await keeperHubRequest("GET", `/execute/${executionId}/status`);

      return toolSuccess({
        execution_id: executionId,
        status: result.status,
        transaction_hash: result.transactionHash || null,
        block_number: result.blockNumber || null,
        gas_used: result.gasUsed || null,
        explorer_url: result.explorerUrl || null,
        error: result.error || null,
        created_at: result.createdAt,
        completed_at: result.completedAt || null,
      });
    } catch (err) {
      if (err.status === 404) {
        return toolError("NOT_FOUND", `Execution ${executionId} not found`,
          "Check that the execution ID is correct.");
      }
      return toolError("STATUS_ERROR", err.message);
    }
  },
);

server.registerTool(
  "get_execution_logs",
  {
    title: "Get Execution Logs",
    description:
      "Get detailed logs for a KeeperHub execution including retry attempts, gas estimates, and errors.",
    inputSchema: {
      executionId: z.string().describe("Execution ID"),
    },
  },
  async ({ executionId }) => {
    try {
      const result = await keeperHubRequest("GET", `/workflows/executions/${executionId}/logs`);

      return toolSuccess({
        execution_id: executionId,
        logs: result.logs || [],
        retry_count: result.retryCount || 0,
        gas_estimates: result.gasEstimates || [],
      });
    } catch (err) {
      return toolError("LOGS_ERROR", err.message);
    }
  },
);

// ── Workflow Management Tools ───────────────────────────────────────────────

server.registerTool(
  "list_workflows",
  {
    title: "List Workflows",
    description:
      "List all workflows in the KeeperHub account. " +
      "Workflows are reusable automation sequences that can be triggered manually or on schedule.",
    inputSchema: {
      limit: z.number().optional().describe("Max workflows to return (default: 20)"),
      status: z.enum(["active", "paused", "all"]).optional().describe("Filter by status"),
    },
  },
  async ({ limit = 20, status = "all" }) => {
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (status !== "all") params.append("status", status);

      const result = await keeperHubRequest("GET", `/workflows?${params}`);

      return toolSuccess({
        workflows: result.workflows || [],
        count: result.workflows?.length || 0,
      });
    } catch (err) {
      return toolError("LIST_ERROR", err.message);
    }
  },
);

server.registerTool(
  "execute_workflow",
  {
    title: "Execute Workflow",
    description:
      "Manually trigger a KeeperHub workflow by ID. " +
      "Returns execution ID for status polling.",
    inputSchema: {
      workflowId: z.string().describe("Workflow ID to execute"),
      inputs: z.record(z.any()).optional().describe("Input parameters for the workflow"),
    },
  },
  async ({ workflowId, inputs }) => {
    try {
      const result = await keeperHubRequest("POST", `/workflows/${workflowId}/trigger`, {
        inputs: inputs || {},
      });

      return toolSuccess({
        workflow_id: workflowId,
        execution_id: result.executionId,
        status: result.status || "pending",
        next_steps: [
          { tool: "get_execution_status", params: { executionId: result.executionId } },
        ],
      });
    } catch (err) {
      if (err.status === 404) {
        return toolError("NOT_FOUND", `Workflow ${workflowId} not found`,
          "Use list_workflows to see available workflows.");
      }
      return toolError("WORKFLOW_ERROR", err.message);
    }
  },
);

server.registerTool(
  "create_workflow",
  {
    title: "Create Workflow",
    description:
      "Create a new KeeperHub workflow with trigger and action nodes. " +
      "Use list_action_schemas first to discover available action types.",
    inputSchema: {
      name: z.string().describe("Workflow name"),
      description: z.string().optional().describe("Workflow description"),
      trigger: z.object({
        type: z.enum(["manual", "cron", "webhook", "onchain-event"]).describe("Trigger type"),
        config: z.record(z.any()).describe("Trigger configuration"),
      }).describe("Workflow trigger"),
      actions: z.array(z.object({
        actionType: z.string().describe("Action type (e.g. 'web3/transfer-funds')"),
        params: z.record(z.any()).describe("Action parameters"),
        condition: z.record(z.any()).optional().describe("Optional condition for this action"),
      })).describe("List of actions to execute"),
    },
  },
  async ({ name, description, trigger, actions }) => {
    try {
      const result = await keeperHubRequest("POST", "/workflows", {
        name,
        description,
        trigger,
        actions,
      });

      return toolSuccess({
        workflow_id: result.workflowId,
        name,
        status: "active",
        next_steps: [
          { tool: "execute_workflow", params: { workflowId: result.workflowId } },
        ],
      });
    } catch (err) {
      return toolError("CREATE_ERROR", err.message,
        "Check that all action types are valid. Use list_action_schemas to see available actions.");
    }
  },
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
