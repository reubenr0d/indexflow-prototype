"use client";

import { useCallback, useRef, useState } from "react";
import {
  decodeEventLog,
  encodeFunctionData,
  keccak256,
  toBytes,
  type Abi,
  type Address,
  type Hash,
} from "viem";
import { useConfig } from "wagmi";
import { getPublicClient } from "@wagmi/core";

import { BasketFactoryABI } from "@/abi/BasketFactory";
import { BasketVaultABI } from "@/abi/BasketVault";
import {
  CONFIGURED_DEPLOYMENT_TARGETS,
  getContractsForDeploymentTarget,
} from "@/config/contracts";
import {
  CHAIN_REGISTRY,
  deploymentLabel,
  type DeploymentTarget,
} from "@/lib/deployment";
import { useSponsoredTransactionAdapter } from "@/hooks/useSponsoredTransactionAdapter";

// keccak256("USDC") — stub asset id used to satisfy `BasketVault.deposit`'s
// `require(assets.length > 0)` check on spokes that have no OracleAdapter.
// Same value as `apps/mcps/vault-manager/multichain-create.mjs::SPOKE_STUB_ASSET_ID`
// and `script/DeploySpoke.s.sol::_maybeBootstrapSpokeBasket`. Computed at
// module load so any drift in the keccak implementation surfaces immediately.
const SPOKE_STUB_ASSET_ID = keccak256(toBytes("USDC"));

export type CreateBasketChainStatus =
  | "idle"
  | "creating"
  | "wiring_state_relay"
  | "wiring_assets"
  | "success"
  | "error"
  | "skipped";

export interface CreateBasketChainEntry {
  target: DeploymentTarget;
  chainId: number;
  label: string;
  isHub: boolean;
  status: CreateBasketChainStatus;
  vaultAddress?: Address;
  createTxHash?: Hash;
  setStateRelayTxHash?: Hash;
  setAssetsTxHash?: Hash;
  error?: string;
}

export interface CreateMultichainBasketState {
  isExecuting: boolean;
  entries: CreateBasketChainEntry[];
  hubVaultAddress: Address | null;
  hasErrors: boolean;
  completedCount: number;
  totalCount: number;
}

export interface CreateMultichainBasketOptions {
  name: string;
  depositFeeBps: bigint;
  redeemFeeBps: bigint;
  hubTarget: DeploymentTarget;
  // When omitted, every CONFIGURED_DEPLOYMENT_TARGETS != hubTarget is
  // included. Pass an explicit list to opt selected chains in/out.
  spokeTargets?: DeploymentTarget[];
}

const RECEIPT_TIMEOUT_MS = 120_000;

function emptyEntry(target: DeploymentTarget, isHub: boolean): CreateBasketChainEntry {
  return {
    target,
    chainId: CHAIN_REGISTRY[target]?.chainId ?? 0,
    label: deploymentLabel(target),
    isHub,
    status: "idle",
  };
}

/**
 * Returns the spoke targets that the admin form would create twins on by
 * default for a given hub: every CONFIGURED_DEPLOYMENT_TARGETS chain whose
 * BasketFactory + stateRelay are both configured.
 *
 * Exposed for the admin form so the checkbox section can list the chains
 * without having to recompute the same filter.
 */
export function defaultSpokeTargetsForHub(
  hubTarget: DeploymentTarget,
): DeploymentTarget[] {
  return CONFIGURED_DEPLOYMENT_TARGETS.filter((t) => {
    if (t === hubTarget) return false;
    const contracts = getContractsForDeploymentTarget(t);
    return Boolean(contracts.basketFactory) && Boolean(contracts.stateRelay);
  });
}

function extractVaultAddressFromCreateBasketReceipt(
  logs: { address: Address; data: `0x${string}`; topics: readonly `0x${string}`[] }[],
  factoryAddress: Address,
): Address | null {
  for (const log of logs) {
    if (log.address.toLowerCase() !== factoryAddress.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: BasketFactoryABI as Abi,
        data: log.data,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
      });
      if (decoded.eventName === "BasketCreated") {
        const args = decoded.args as unknown as { vault?: Address };
        if (args?.vault) return args.vault;
      }
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Orchestrates creation of a basket on the hub chain followed by
 * deploy-and-wire of a name-matched twin on every selected spoke chain.
 *
 * This is the web-side counterpart to the vault-manager MCP's `create_vault`
 * spoke fan-out (`apps/mcps/vault-manager/multichain-create.mjs`). Keeping
 * the two flows in lock-step means the multi-chain deposit drawer (which
 * resolves twins via `useVaultAddressByName`) finds a per-chain match for
 * every basket the admin creates — regardless of whether the basket was
 * created via the admin UI or via the agent's MCP.
 *
 * Failures on individual spokes do NOT roll back: the hub vault is already
 * on-chain and the operator can retry the failed spoke separately. The hook
 * surfaces every per-chain step so the form can show exactly which chain +
 * step failed.
 */
export function useCreateMultichainBasket() {
  const wagmiConfig = useConfig();
  const { sendSponsoredTx } = useSponsoredTransactionAdapter();
  const abortRef = useRef<AbortController | null>(null);

  const [state, setState] = useState<CreateMultichainBasketState>({
    isExecuting: false,
    entries: [],
    hubVaultAddress: null,
    hasErrors: false,
    completedCount: 0,
    totalCount: 0,
  });

  const setEntry = useCallback(
    (target: DeploymentTarget, update: Partial<CreateBasketChainEntry>) => {
      setState((prev) => {
        const entries = prev.entries.map((e) => (e.target === target ? { ...e, ...update } : e));
        const completedCount = entries.filter(
          (e) => e.status === "success" || e.status === "error" || e.status === "skipped",
        ).length;
        const hasErrors = entries.some((e) => e.status === "error");
        return { ...prev, entries, completedCount, hasErrors };
      });
    },
    [],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState({
      isExecuting: false,
      entries: [],
      hubVaultAddress: null,
      hasErrors: false,
      completedCount: 0,
      totalCount: 0,
    });
  }, []);

  const createOnChain = useCallback(
    async (
      target: DeploymentTarget,
      params: { name: string; depositFeeBps: bigint; redeemFeeBps: bigint },
    ): Promise<{ vaultAddress: Address; createTxHash: Hash }> => {
      const chainId = CHAIN_REGISTRY[target]?.chainId;
      if (!chainId) throw new Error(`No chainId for ${target}`);
      const contracts = getContractsForDeploymentTarget(target);
      if (!contracts.basketFactory) {
        throw new Error(`No basketFactory configured for ${deploymentLabel(target)}`);
      }
      const data = encodeFunctionData({
        abi: BasketFactoryABI as Abi,
        functionName: "createBasket",
        args: [params.name, params.depositFeeBps, params.redeemFeeBps],
      });
      const { hash } = await sendSponsoredTx({
        chainId,
        to: contracts.basketFactory as Address,
        data,
        sponsor: true,
      });
      const client = getPublicClient(wagmiConfig, { chainId });
      if (!client) throw new Error(`No public client for chain ${chainId}`);
      const receipt = await client.waitForTransactionReceipt({
        hash,
        timeout: RECEIPT_TIMEOUT_MS,
      });
      const vaultAddress = extractVaultAddressFromCreateBasketReceipt(
        receipt.logs.map((l) => ({
          address: l.address as Address,
          data: l.data as `0x${string}`,
          topics: l.topics as `0x${string}`[],
        })),
        contracts.basketFactory as Address,
      );
      if (!vaultAddress) {
        throw new Error(
          `createBasket succeeded on ${deploymentLabel(target)} (tx ${hash}) but the BasketCreated log could not be decoded`,
        );
      }
      return { vaultAddress, createTxHash: hash };
    },
    [sendSponsoredTx, wagmiConfig],
  );

  const sendWriteToVault = useCallback(
    async (
      target: DeploymentTarget,
      vault: Address,
      functionName: "setStateRelay" | "setAssets",
      args: unknown[],
    ): Promise<Hash> => {
      const chainId = CHAIN_REGISTRY[target]?.chainId;
      if (!chainId) throw new Error(`No chainId for ${target}`);
      const data = encodeFunctionData({
        abi: BasketVaultABI as Abi,
        functionName,
        args,
      });
      const { hash } = await sendSponsoredTx({
        chainId,
        to: vault,
        data,
        sponsor: true,
      });
      const client = getPublicClient(wagmiConfig, { chainId });
      if (!client) throw new Error(`No public client for chain ${chainId}`);
      await client.waitForTransactionReceipt({ hash, timeout: RECEIPT_TIMEOUT_MS });
      return hash;
    },
    [sendSponsoredTx, wagmiConfig],
  );

  const createMultichainBasket = useCallback(
    async (opts: CreateMultichainBasketOptions): Promise<CreateMultichainBasketState> => {
      const spokes = (opts.spokeTargets ?? defaultSpokeTargetsForHub(opts.hubTarget)).filter(
        (t) => t !== opts.hubTarget,
      );
      const entries: CreateBasketChainEntry[] = [
        emptyEntry(opts.hubTarget, true),
        ...spokes.map((t) => emptyEntry(t, false)),
      ];

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState({
        isExecuting: true,
        entries,
        hubVaultAddress: null,
        hasErrors: false,
        completedCount: 0,
        totalCount: entries.length,
      });

      // Step 1 — Hub. If this fails we abort the whole flow: there's no point
      // creating twin baskets for a hub vault that does not exist.
      setEntry(opts.hubTarget, { status: "creating" });
      let hubVault: Address;
      let hubCreateTxHash: Hash;
      try {
        const hubResult = await createOnChain(opts.hubTarget, opts);
        hubVault = hubResult.vaultAddress;
        hubCreateTxHash = hubResult.createTxHash;
        setEntry(opts.hubTarget, {
          status: "success",
          vaultAddress: hubVault,
          createTxHash: hubCreateTxHash,
        });
        setState((prev) => ({ ...prev, hubVaultAddress: hubVault }));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setEntry(opts.hubTarget, { status: "error", error: message });
        for (const spoke of spokes) {
          setEntry(spoke, {
            status: "skipped",
            error: `Skipped because hub create failed on ${deploymentLabel(opts.hubTarget)}`,
          });
        }
        setState((prev) => ({ ...prev, isExecuting: false }));
        return {
          isExecuting: false,
          entries,
          hubVaultAddress: null,
          hasErrors: true,
          completedCount: entries.length,
          totalCount: entries.length,
        };
      }

      // Step 2 — Spokes (sequential so we never race the deployer-wallet nonce
      // across two simultaneous writes to the same EOA).
      for (const spoke of spokes) {
        if (controller.signal.aborted) {
          setEntry(spoke, { status: "skipped", error: "Aborted by user" });
          continue;
        }
        const contracts = getContractsForDeploymentTarget(spoke);
        if (!contracts.stateRelay) {
          setEntry(spoke, {
            status: "skipped",
            error: `${deploymentLabel(spoke)} has no stateRelay configured — multi-chain wiring requires StateRelay on every spoke`,
          });
          continue;
        }
        try {
          setEntry(spoke, { status: "creating" });
          const { vaultAddress: twinVault, createTxHash } = await createOnChain(spoke, opts);
          setEntry(spoke, { vaultAddress: twinVault, createTxHash });

          setEntry(spoke, { status: "wiring_state_relay" });
          const setStateRelayTxHash = await sendWriteToVault(
            spoke,
            twinVault,
            "setStateRelay",
            [contracts.stateRelay as Address],
          );
          setEntry(spoke, { setStateRelayTxHash });

          setEntry(spoke, { status: "wiring_assets" });
          const setAssetsTxHash = await sendWriteToVault(
            spoke,
            twinVault,
            "setAssets",
            [[SPOKE_STUB_ASSET_ID]],
          );
          setEntry(spoke, { setAssetsTxHash, status: "success" });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          setEntry(spoke, { status: "error", error: message });
        }
      }

      setState((prev) => ({ ...prev, isExecuting: false }));
      return {
        ...state,
        isExecuting: false,
        entries,
        hubVaultAddress: hubVault,
        completedCount: entries.length,
        totalCount: entries.length,
      };
    },
    [createOnChain, sendWriteToVault, setEntry, state],
  );

  return {
    state,
    createMultichainBasket,
    reset,
    SPOKE_STUB_ASSET_ID,
  };
}
