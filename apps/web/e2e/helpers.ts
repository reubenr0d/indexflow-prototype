import { expect, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Anvil deployer — used as the `from` address for backend RPC helper calls. */
export const E2E_ACCOUNT = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';
const RPC_URL = process.env.E2E_RPC_URL ?? 'http://127.0.0.1:8545';

/** `keccak256(bytes("BHP"))` — matches `DeployLocal` single CustomRelayer asset. */
export const BHP_ASSET_ID =
  '0x39ffcb70be22eb03bd43c55d57db0e1672ef8e9016fc0233569e1f8a8ff34db0';

const WALLET_FILE = path.join(__dirname, '.auth', 'wallet-address.json');

/**
 * Returns the Privy embedded-wallet address written by global-setup,
 * or falls back to the Anvil deployer when running without Privy.
 */
export function getE2EWalletAddress(): string {
  if (existsSync(WALLET_FILE)) {
    const data = JSON.parse(readFileSync(WALLET_FILE, 'utf8')) as { address: string };
    if (data.address) return data.address;
  }
  return E2E_ACCOUNT;
}

/**
 * Inject a script that auto-clicks the Privy "Approve" and "Retry transaction"
 * dialogs. Must be called BEFORE the first page.goto().
 */
export async function autoApprovePrivyTransactions(page: Page) {
  await page.addInitScript(() => {
    setInterval(() => {
      const btns = document.querySelectorAll<HTMLButtonElement>('button');
      for (const btn of btns) {
        if (btn.offsetParent === null) continue;
        const text = btn.textContent?.trim();
        if (text === 'Approve' || text === 'Retry transaction' || text === 'All Done') {
          btn.click();
        }
      }
    }, 500);
  });
}

const PRIVY_TEST_EMAIL = process.env.PRIVY_TEST_EMAIL ?? '';
const PRIVY_TEST_OTP = process.env.PRIVY_TEST_OTP ?? '';

/**
 * Ensure a wallet is connected. When Privy is configured, waits for the SDK to
 * initialize, then either confirms the session was restored or performs a fresh
 * login. Falls back to the legacy E2E Connect button when Privy is not configured.
 */
/**
 * Dismiss any visible Privy transaction dialogs and wait for them to close
 * before a page navigation. Call BEFORE page.goto() after a transaction.
 */
export async function dismissPrivyDialogs(page: Page) {
  // autoApprovePrivyTransactions handles clicking; just wait for the dialog to close
  const allDoneBtn = page.getByRole('button', { name: 'All Done' });
  await allDoneBtn.waitFor({ state: 'hidden', timeout: 8_000 }).catch(() => {});
  await page.waitForTimeout(500);
}

/**
 * Ensure the Privy SDK is initialised after a full-page navigation.
 * If the session doesn't restore, nukes all Privy state, logs in on '/'
 * (which has no PrivyAdminGate), then navigates back to the target URL.
 */
export async function ensureWalletAfterNav(page: Page) {
  const wallet = page.locator('[data-testid="privy-connected-wallet"]');
  const loginBtn = page.getByRole('button', { name: 'Log in' });

  try {
    await Promise.race([
      wallet.waitFor({ state: 'visible', timeout: 12_000 }),
      loginBtn.waitFor({ state: 'visible', timeout: 12_000 }),
    ]);
  } catch {
    // SDK stuck in ready=false
  }

  if (await wallet.isVisible().catch(() => false)) return;

  if (await loginBtn.isVisible().catch(() => false)) {
    await doPrivyLogin(page);
    return;
  }

  // SDK is stuck (ready=false): nuke state and recover via '/' (no admin gate)
  const targetUrl = page.url();

  await page.context().clearCookies();
  await page.evaluate(() => {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('privy') || k.includes('privy'))
      .forEach((k) => localStorage.removeItem(k));
    sessionStorage.clear();
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });

  try {
    await loginBtn.waitFor({ state: 'visible', timeout: 15_000 });
  } catch {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await loginBtn.waitFor({ state: 'visible', timeout: 15_000 });
  }

  await doPrivyLogin(page);

  // Return to the original admin page with a fresh session
  const targetPath = new URL(targetUrl).pathname;
  await page.goto(targetPath, { waitUntil: 'domcontentloaded' });
  await wallet.waitFor({ state: 'visible', timeout: 15_000 });
}

async function doPrivyLogin(page: Page) {
  const loginBtn = page.getByRole('button', { name: 'Log in' });
  await loginBtn.click();
  const emailInput = page.locator('input[type="email"]').first();
  await emailInput.waitFor({ state: 'visible', timeout: 15_000 });
  await emailInput.fill(PRIVY_TEST_EMAIL);
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await emailInput.waitFor({ state: 'hidden', timeout: 15_000 });
  await page.waitForTimeout(2_000);
  const otpInputs = page.locator('#privy-dialog input[type="text"]');
  const count = await otpInputs.count();
  if (count >= 6) {
    for (let i = 0; i < PRIVY_TEST_OTP.length && i < count; i++) {
      await otpInputs.nth(i).fill(PRIVY_TEST_OTP[i]);
    }
  }
  const wallet = page.locator('[data-testid="privy-connected-wallet"]');
  await wallet.waitFor({ state: 'visible', timeout: 30_000 });
}

export async function connectWallet(page: Page) {
  const privyWallet = page.locator('[data-testid="privy-connected-wallet"]');

  if (await privyWallet.isVisible({ timeout: 8_000 }).catch(() => false)) {
    return;
  }

  if (PRIVY_TEST_EMAIL && PRIVY_TEST_OTP) {
    const loginBtn = page.getByRole('button', { name: 'Log in' });
    if (await loginBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await loginBtn.click();
      const emailInput = page.locator('input[type="email"]').first();
      await emailInput.waitFor({ state: 'visible', timeout: 15_000 });
      await emailInput.fill(PRIVY_TEST_EMAIL);
      await page.getByRole('button', { name: 'Submit', exact: true }).click();
      await emailInput.waitFor({ state: 'hidden', timeout: 15_000 });
      await page.waitForTimeout(2_000);
      const otpInputs = page.locator('#privy-dialog input[type="text"]');
      const count = await otpInputs.count();
      if (count >= 6) {
        for (let i = 0; i < PRIVY_TEST_OTP.length && i < count; i++) {
          await otpInputs.nth(i).fill(PRIVY_TEST_OTP[i]);
        }
      }
      await privyWallet.waitFor({ state: 'visible', timeout: 30_000 });
      return;
    }
  }

  const desktopButton = page.getByTestId('e2e-connect-wallet');
  if (await desktopButton.isVisible()) {
    await desktopButton.click();
  }
  const mobileButton = page.getByTestId('e2e-connect-wallet-mobile');
  if (await mobileButton.isVisible()) {
    await mobileButton.click();
  }
}

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

/**
 * Click a basket link and wait for navigation. Retries if the first click
 * doesn't trigger navigation (can happen during Next.js compilation or
 * when the click lands on an interactive child element).
 */
async function clickBasketLink(page: Page, href: string, maxAttempts = 3) {
  const link = page.locator(`a[href="${href}"]`).first();
  await link.waitFor({ state: 'visible', timeout: 15_000 });

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Click near top-left to avoid "Show info" buttons inside the link
    await link.click({ position: { x: 20, y: 8 }, timeout: 5_000 }).catch(() => {});
    try {
      await waitForPath(page, href, 5_000);
      return;
    } catch {
      if (attempt === maxAttempts) {
        throw new Error(`Failed to navigate to ${href} after ${maxAttempts} attempts`);
      }
      await page.waitForTimeout(1_000);
    }
  }
}

/**
 * Wait for the current pathname to match (polling, works with pushState).
 */
async function waitForPath(page: Page, expected: string, timeout = 20_000) {
  await page.waitForFunction(
    (p) => {
      const path = window.location.pathname;
      return path === p || path === p + '/';
    },
    expected,
    { timeout },
  );
}

/**
 * Navigate using Next.js client-side routing (Link click) instead of
 * page.goto(), which causes a full page reload and breaks the Privy SDK.
 */
export async function navTo(page: Page, target: string, basketAddress?: string) {
  async function currentPath() {
    return new URL(page.url()).pathname;
  }

  async function ensureAdmin() {
    if (!(await currentPath()).startsWith('/admin')) {
      const adminLink = page.locator('header nav a[href="/admin"]').first();
      await adminLink.evaluate((el) => (el as HTMLElement).click());
      await waitForPath(page, '/admin');
      await page.waitForTimeout(1_000);
    }
  }

  async function clickSidebar(href: string) {
    const link = page.locator(`aside a[href="${href}"]`).first();
    await link.waitFor({ state: 'visible', timeout: 15_000 });
    await link.evaluate((el) => (el as HTMLElement).click());
    await waitForPath(page, href);
  }

  switch (target) {
    case '/admin/baskets': {
      await ensureAdmin();
      await clickSidebar('/admin/baskets');
      break;
    }
    case '/admin/risk': {
      await ensureAdmin();
      await clickSidebar('/admin/risk');
      break;
    }
    case '/admin/oracle': {
      await ensureAdmin();
      await clickSidebar('/admin/oracle');
      break;
    }
    case '/admin/pool': {
      await ensureAdmin();
      await clickSidebar('/admin/pool');
      break;
    }
    case '/admin/basket-detail': {
      if (!basketAddress) throw new Error('basketAddress required');
      await ensureAdmin();
      if ((await currentPath()) !== '/admin/baskets') {
        await clickSidebar('/admin/baskets');
      }
      await clickBasketLink(page, `/admin/baskets/${basketAddress}`);
      break;
    }
    case '/basket-detail': {
      if (!basketAddress) throw new Error('basketAddress required');
      const basketsNavLink = page.locator('header nav a[href="/baskets"]').first();
      await basketsNavLink.evaluate((el) => (el as HTMLElement).click());
      await waitForPath(page, '/baskets');
      await clickBasketLink(page, `/baskets/${basketAddress}`);
      break;
    }
    default:
      throw new Error(`Unknown navigation target: ${target}`);
  }

  await page.waitForTimeout(500);
}
