import { expect, type Page } from '@playwright/test';

export const E2E_ACCOUNT = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';
const RPC_URL = process.env.E2E_RPC_URL ?? 'http://127.0.0.1:8545';

/** `keccak256(bytes("BHP"))` — matches `DeployLocal` single CustomRelayer asset. */
export const BHP_ASSET_ID =
  '0x39ffcb70be22eb03bd43c55d57db0e1672ef8e9016fc0233569e1f8a8ff34db0';

export async function installMetaMaskShim(page: Page) {
  await page.addInitScript(
    ({ account, rpcUrl }) => {
      type Listener = (...args: unknown[]) => void;
      type HandlerMap = Record<string, Listener[]>;

      const handlers: HandlerMap = {};
      const chainIdHex = '0x7a69';
      let selectedAddress: string | null = null;

      const emit = (event: string, ...args: unknown[]) => {
        for (const handler of handlers[event] ?? []) {
          handler(...args);
        }
      };

      const rpc = async (method: string, params: unknown[] = []) => {
        const response = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: Date.now(),
            method,
            params,
          }),
        });
        const json = await response.json();
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
              selectedAddress = account;
              (provider.selectedAddress as string | null) = selectedAddress;
              emit('accountsChanged', [selectedAddress]);
              return [selectedAddress];
            case 'eth_accounts':
              return selectedAddress ? [selectedAddress] : [];
            case 'wallet_switchEthereumChain':
              return null;
            case 'wallet_addEthereumChain':
              return null;
            case 'wallet_requestPermissions':
              selectedAddress = account;
              (provider.selectedAddress as string | null) = selectedAddress;
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
    { account: E2E_ACCOUNT, rpcUrl: RPC_URL }
  );
}

export async function connectWallet(page: Page) {
  const desktopButton = page.getByTestId('e2e-connect-wallet');
  if (await desktopButton.isVisible()) {
    await desktopButton.click();
  }
  const mobileButton = page.getByTestId('e2e-connect-wallet-mobile');
  if (await mobileButton.isVisible()) {
    await mobileButton.click();
  }
}

export async function waitForSuccessToast(page: Page, message: string) {
  await expect(page.getByText(message)).toBeVisible();
}

async function rpcCall<T>(method: string, params: unknown[] = []): Promise<T> {
  const response = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
  });
  const json = await response.json();
  if (json.error) throw new Error(json.error.message ?? `RPC error: ${method}`);
  return json.result as T;
}

function hexToBigInt(value: string) {
  return value === '0x' ? 0n : BigInt(value);
}

function pad32Hex(valueHexNoPrefix: string) {
  return valueHexNoPrefix.padStart(64, '0');
}

export async function sendTransaction(to: string, data: string, from = E2E_ACCOUNT) {
  const hash = await rpcCall<string>('eth_sendTransaction', [{ from, to, data, value: '0x0' }]);
  for (let i = 0; i < 20; i += 1) {
    const receipt = await rpcCall<{ status?: string } | null>('eth_getTransactionReceipt', [hash]);
    if (receipt) return hash;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return hash;
}

export async function mintMockUsdc(token: string, to: string, amount: bigint) {
  const selector = '40c10f19'; // mint(address,uint256)
  const toArg = to.toLowerCase().replace('0x', '').padStart(64, '0');
  const amountArg = pad32Hex(amount.toString(16));
  const data = `0x${selector}${toArg}${amountArg}`;
  return sendTransaction(token, data, E2E_ACCOUNT);
}

export async function getERC20Balance(token: string, owner: string) {
  const ownerArg = owner.toLowerCase().replace('0x', '').padStart(64, '0');
  const callData = `0x70a08231${ownerArg}`;
  const result = await rpcCall<string>('eth_call', [{ to: token, data: callData }, 'latest']);
  return result === '0x' ? 0n : BigInt(result);
}

export async function getTransactionCount(address: string) {
  const result = await rpcCall<string>('eth_getTransactionCount', [address, 'latest']);
  return hexToBigInt(result);
}

export async function waitForNextTransaction(address: string, previousCount: bigint, timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const count = await getTransactionCount(address);
    if (count > previousCount) return count;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error(`Timed out waiting for transaction count to increase for ${address}`);
}

export async function waitForERC20Balance(
  token: string,
  owner: string,
  predicate: (balance: bigint) => boolean,
  timeoutMs = 60_000
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const balance = await getERC20Balance(token, owner);
    if (predicate(balance)) return balance;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`Timed out waiting for ERC20 balance predicate for ${owner}`);
}

export function parseBasketAddressFromHref(href: string | null) {
  if (!href) throw new Error('Missing basket href');
  const address = href.split('/').pop();
  if (!address || !address.startsWith('0x')) throw new Error(`Unexpected basket href: ${href}`);
  return address;
}
