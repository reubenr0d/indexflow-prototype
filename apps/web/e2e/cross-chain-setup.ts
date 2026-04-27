/**
 * Cross-chain E2E test fixtures.
 *
 * Infrastructure requirement: two Anvil nodes must be running — hub on 8545
 * and spoke on 8546 — with the protocol deployed to both. The keeper service
 * (or manual calls) must keep StateRelay updated on each chain.
 *
 * These helpers are consumed by cross-chain-*.spec.ts files.
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { type Page } from '@playwright/test';

// ─── Chain RPCs ──────────────────────────────────────────────────────────────

export const HUB_RPC = process.env.E2E_HUB_RPC_URL ?? 'http://127.0.0.1:8545';
export const SPOKE_RPC = process.env.E2E_SPOKE_RPC_URL ?? 'http://127.0.0.1:8546';

export const HUB_CHAIN_ID = parseInt(process.env.E2E_HUB_CHAIN_ID ?? '31337', 10);
export const SPOKE_CHAIN_ID = parseInt(process.env.E2E_SPOKE_CHAIN_ID ?? '31338', 10);

export const E2E_DEPLOYER = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';

// CCIP chain selectors — should match values passed to StateRelay constructor
export const HUB_CHAIN_SELECTOR = 1n;
export const SPOKE_CHAIN_SELECTOR = 2n;

// ─── Deployment configs ──────────────────────────────────────────────────────

export type ChainDeployment = Record<string, string>;

function tryLoadDeployment(relativePath: string): ChainDeployment | null {
  const resolved = path.resolve(__dirname, '..', relativePath);
  if (!existsSync(resolved)) return null;
  return JSON.parse(readFileSync(resolved, 'utf8')) as ChainDeployment;
}

export function loadHubDeployment(): ChainDeployment {
  const d = tryLoadDeployment('src/config/local-deployment.json');
  if (!d) throw new Error('Hub deployment config not found at src/config/local-deployment.json');
  return d;
}

export function loadSpokeDeployment(): ChainDeployment {
  const d =
    tryLoadDeployment('src/config/local-spoke-deployment.json') ??
    tryLoadDeployment('src/config/spoke-deployment.json') ??
    tryLoadDeployment('src/config/local-deployment-spoke.json');
  if (!d) throw new Error('Spoke deployment config not found');
  return d;
}

// ─── Low-level RPC helpers ───────────────────────────────────────────────────

async function rpcCall<T>(rpcUrl: string, method: string, params: unknown[] = []): Promise<T> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
  });
  const json = (await res.json()) as { result?: T; error?: { message?: string } };
  if (json.error) throw new Error(json.error.message ?? `RPC error: ${method}`);
  return json.result as T;
}

export async function sendTx(
  rpcUrl: string,
  to: string,
  data: string,
  from = E2E_DEPLOYER,
): Promise<string> {
  const hash = await rpcCall<string>(rpcUrl, 'eth_sendTransaction', [
    { from, to, data, value: '0x0' },
  ]);
  for (let i = 0; i < 30; i++) {
    const receipt = await rpcCall<{ status?: string } | null>(rpcUrl, 'eth_getTransactionReceipt', [
      hash,
    ]);
    if (receipt) return hash;
    await new Promise((r) => setTimeout(r, 250));
  }
  return hash;
}

function pad32(hex: string): string {
  return hex.replace('0x', '').toLowerCase().padStart(64, '0');
}

function encodeUint256(value: bigint): string {
  return pad32(value.toString(16));
}

// ─── ERC-20 helpers ──────────────────────────────────────────────────────────

export async function mintMockUsdcOnChain(
  rpcUrl: string,
  tokenAddress: string,
  to: string,
  amount: bigint,
) {
  const selector = '40c10f19'; // mint(address,uint256)
  const data = `0x${selector}${pad32(to)}${encodeUint256(amount)}`;
  return sendTx(rpcUrl, tokenAddress, data);
}

export async function getERC20BalanceOnChain(
  rpcUrl: string,
  tokenAddress: string,
  owner: string,
): Promise<bigint> {
  const ownerArg = pad32(owner);
  const callData = `0x70a08231${ownerArg}`;
  const result = await rpcCall<string>(rpcUrl, 'eth_call', [
    { to: tokenAddress, data: callData },
    'latest',
  ]);
  return result === '0x' ? 0n : BigInt(result);
}

// ─── StateRelay keeper helper ────────────────────────────────────────────────

/**
 * Posts a weight-table update to the StateRelay contract on a given chain.
 *
 * Encodes a call to:
 *   updateState(uint64[] chains, uint256[] weights, address[] vaults, int256[] pnlAdj, uint48 ts)
 *
 * This mirrors what the keeper service does each epoch.
 */
export async function keeperPostWeights(
  rpcUrl: string,
  stateRelayAddress: string,
  chains: bigint[],
  weights: bigint[],
  vaults: string[] = [],
  pnlAdjustments: bigint[] = [],
  timestamp?: number,
) {
  const ts = BigInt(timestamp ?? Math.floor(Date.now() / 1000));
  // updateState selector
  const selector = 'a3607045';

  // ABI-encode dynamic arrays manually
  // Layout: offset(chains) | offset(weights) | offset(vaults) | offset(pnlAdj) | ts
  //         then each array: length | elements...
  const headSlots = 5; // 5 params → 5 head slots
  let offset = headSlots * 32;

  const chainsEncoded = encodeArray(chains.map(encodeUint256));
  const weightsEncoded = encodeArray(weights.map(encodeUint256));
  const vaultsEncoded = encodeArray(vaults.map((v) => pad32(v)));
  const pnlEncoded = encodeArray(
    pnlAdjustments.map((p) => (p >= 0n ? encodeUint256(p) : encodeInt256(p))),
  );

  const offsets: string[] = [];

  offsets.push(encodeUint256(BigInt(offset)));
  offset += chainsEncoded.length / 2;

  offsets.push(encodeUint256(BigInt(offset)));
  offset += weightsEncoded.length / 2;

  offsets.push(encodeUint256(BigInt(offset)));
  offset += vaultsEncoded.length / 2;

  offsets.push(encodeUint256(BigInt(offset)));
  // offset += pnlEncoded.length / 2; // not needed for last

  offsets.push(encodeUint256(ts));

  const data = `0x${selector}${offsets.join('')}${chainsEncoded}${weightsEncoded}${vaultsEncoded}${pnlEncoded}`;
  return sendTx(rpcUrl, stateRelayAddress, data, E2E_DEPLOYER);
}

function encodeArray(elements: string[]): string {
  const lengthSlot = encodeUint256(BigInt(elements.length));
  return `${lengthSlot}${elements.join('')}`;
}

function encodeInt256(value: bigint): string {
  if (value >= 0n) return encodeUint256(value);
  // Two's complement for negative
  const twos = (1n << 256n) + value;
  return twos.toString(16).padStart(64, '0');
}

// ─── Page / MetaMask helpers ─────────────────────────────────────────────────

/**
 * Installs a MetaMask-like provider shim that talks to a specific RPC endpoint
 * and reports a specific chain id. Must be called before the first page.goto().
 */
export async function installChainShim(
  page: Page,
  opts: { rpcUrl: string; chainIdHex: string; account?: string },
) {
  const account = opts.account ?? E2E_DEPLOYER;
  await page.addInitScript(
    ({ account: a, rpcUrl, chainIdHex }) => {
      type Listener = (...args: unknown[]) => void;
      const handlers: Record<string, Listener[]> = {};
      let selectedAddress: string | null = null;

      const emit = (event: string, ...args: unknown[]) => {
        for (const h of handlers[event] ?? []) h(...args);
      };

      const rpc = async (method: string, params: unknown[] = []) => {
        const res = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
        });
        const json = await res.json();
        if (json.error) throw new Error(json.error.message ?? 'RPC error');
        return json.result;
      };

      const provider = {
        isMetaMask: true,
        isConnected: () => true,
        selectedAddress,
        chainId: chainIdHex,
        providers: [] as unknown[],
        request: async ({ method, params = [] }: { method: string; params?: unknown[] }) => {
          switch (method) {
            case 'eth_chainId':
              return chainIdHex;
            case 'net_version':
              return String(parseInt(chainIdHex, 16));
            case 'eth_requestAccounts':
              selectedAddress = a;
              provider.selectedAddress = selectedAddress;
              emit('accountsChanged', [selectedAddress]);
              return [selectedAddress];
            case 'eth_accounts':
              return selectedAddress ? [selectedAddress] : [];
            case 'wallet_switchEthereumChain':
              return null;
            case 'wallet_addEthereumChain':
              return null;
            case 'wallet_requestPermissions':
              selectedAddress = a;
              provider.selectedAddress = selectedAddress;
              emit('accountsChanged', [selectedAddress]);
              return [{ parentCapability: 'eth_accounts' }];
            case 'wallet_getPermissions':
              return [{ parentCapability: 'eth_accounts' }];
            default:
              return rpc(method, params as unknown[]);
          }
        },
        on: (event: string, handler: Listener) => {
          handlers[event] = handlers[event] ?? [];
          handlers[event].push(handler);
          return provider;
        },
        removeListener: (event: string, handler: Listener) => {
          handlers[event] = (handlers[event] ?? []).filter((h) => h !== handler);
          return provider;
        },
      };
      provider.providers = [provider];
      (window as Window & { ethereum?: unknown }).ethereum = provider;
    },
    { account, rpcUrl: opts.rpcUrl, chainIdHex: opts.chainIdHex },
  );
}

/**
 * Wait until a data-testid element is visible, with retries on navigation.
 */
export async function waitForTestId(page: Page, testId: string, timeoutMs = 15_000) {
  await page.getByTestId(testId).waitFor({ state: 'visible', timeout: timeoutMs });
}

/**
 * Select a network via the UI network selector.
 * @param target - The deployment target to select (e.g., 'local', 'local-spoke', 'sepolia')
 */
export async function selectNetwork(page: Page, target: string) {
  const networkTrigger = page.getByTestId('network-selector-trigger');
  const isVisible = await networkTrigger.isVisible({ timeout: 5000 }).catch(() => false);
  
  if (!isVisible) {
    console.log('Network selector not visible');
    return false;
  }

  await networkTrigger.click();
  await page.waitForTimeout(500);

  const networkOption = page.getByTestId(`network-option-${target}`);
  const optionVisible = await networkOption.isVisible({ timeout: 3000 }).catch(() => false);
  
  if (!optionVisible) {
    console.log(`Network option ${target} not visible`);
    // Click away to close the dropdown
    await page.keyboard.press('Escape');
    return false;
  }

  await networkOption.click();
  await page.waitForTimeout(1000);
  return true;
}

/**
 * Select "All Chains" mode in the network selector.
 */
export async function selectAllChains(page: Page) {
  const networkTrigger = page.getByTestId('network-selector-trigger');
  const isVisible = await networkTrigger.isVisible({ timeout: 5000 }).catch(() => false);
  
  if (!isVisible) {
    console.log('Network selector not visible');
    return false;
  }

  await networkTrigger.click();
  await page.waitForTimeout(500);

  const allOption = page.getByTestId('network-option-all');
  const optionVisible = await allOption.isVisible({ timeout: 3000 }).catch(() => false);
  
  if (!optionVisible) {
    console.log('All Chains option not visible');
    await page.keyboard.press('Escape');
    return false;
  }

  await allOption.click();
  await page.waitForTimeout(1000);
  return true;
}

// ─── Envio GraphQL helpers ───────────────────────────────────────────────────

export const ENVIO_URL = process.env.E2E_ENVIO_URL ?? 'http://127.0.0.1:8080/v1/graphql';

export interface EnvioBasket {
  id: string;
  chainId: number;
  vault: string;
  name: string;
  tvlBookUsdc: string;
  totalDepositCount: string;
}

export interface EnvioUserPosition {
  id: string;
  chainId: number;
  shareBalance: string;
  cumulativeDepositedUsdc: string;
}

/**
 * Execute a GraphQL query against the local Envio endpoint.
 */
export async function envioQuery<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(ENVIO_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) {
    throw new Error(`Envio query error: ${json.errors[0].message}`);
  }
  return json.data as T;
}

/**
 * Query baskets from Envio, optionally filtered by chain ID.
 */
export async function envioGetBaskets(chainId?: number): Promise<EnvioBasket[]> {
  const where = chainId ? `where: { chainId: { _eq: ${chainId} } }` : '';
  const query = `
    query GetBaskets {
      Basket(${where}) {
        id
        chainId
        vault
        name
        tvlBookUsdc
        totalDepositCount
      }
    }
  `;
  const data = await envioQuery<{ Basket: EnvioBasket[] }>(query);
  return data.Basket ?? [];
}

/**
 * Query user positions from Envio.
 */
export async function envioGetUserPositions(userAddress: string, chainId?: number): Promise<EnvioUserPosition[]> {
  const chainFilter = chainId ? `, chainId: { _eq: ${chainId} }` : '';
  const query = `
    query GetUserPositions($address: String!) {
      UserBasketPosition(where: { user: { address: { _eq: $address } }${chainFilter} }) {
        id
        chainId
        shareBalance
        cumulativeDepositedUsdc
      }
    }
  `;
  const data = await envioQuery<{ UserBasketPosition: EnvioUserPosition[] }>(query, { address: userAddress.toLowerCase() });
  return data.UserBasketPosition ?? [];
}

/**
 * Wait for Envio to index a deposit on a specific chain.
 * Polls until the deposit count increases or timeout is reached.
 */
export async function waitForEnvioDeposit(
  chainId: number,
  vaultAddress: string,
  expectedMinDeposits: number,
  timeoutMs = 30_000,
  pollIntervalMs = 1_000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  const normalizedVault = vaultAddress.toLowerCase();

  while (Date.now() < deadline) {
    try {
      const baskets = await envioGetBaskets(chainId);
      const basket = baskets.find(b => b.vault.toLowerCase() === normalizedVault);
      if (basket && parseInt(basket.totalDepositCount, 10) >= expectedMinDeposits) {
        return true;
      }
    } catch {
      // Envio may not be ready yet
    }
    await new Promise(r => setTimeout(r, pollIntervalMs));
  }
  return false;
}

/**
 * Wait for Envio GraphQL endpoint to be healthy.
 * Checks by making a simple GraphQL query rather than the /health endpoint.
 */
export async function waitForEnvioReady(timeoutMs = 60_000, pollIntervalMs = 2_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(ENVIO_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: '{ __typename }' }),
      });
      if (res.ok) {
        const json = await res.json() as { data?: unknown };
        if (json.data) return true;
      }
    } catch {
      // Not ready yet
    }
    await new Promise(r => setTimeout(r, pollIntervalMs));
  }
  return false;
}

/**
 * Query chain pool states (routing weights) from Envio.
 */
export async function envioGetChainPoolStates(chainId: number): Promise<{
  chainSelector: string;
  twapPoolAmount: string;
  availableLiquidity: string;
}[]> {
  const query = `
    query GetChainPoolStates($chainId: Int!) {
      ChainPoolState(where: { chainId: { _eq: $chainId } }) {
        chainSelector
        twapPoolAmount
        availableLiquidity
      }
    }
  `;
  const data = await envioQuery<{ ChainPoolState: { chainSelector: string; twapPoolAmount: string; availableLiquidity: string }[] }>(
    query,
    { chainId },
  );
  return data.ChainPoolState ?? [];
}
