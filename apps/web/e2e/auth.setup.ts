import { test as setup } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const RPC_URL = process.env.E2E_RPC_URL ?? 'http://127.0.0.1:8545';
const PRIVY_TEST_EMAIL = process.env.PRIVY_TEST_EMAIL ?? '';
const PRIVY_TEST_OTP = process.env.PRIVY_TEST_OTP ?? '';
const DEPLOYER = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';

const AUTH_DIR = path.join(__dirname, '.auth');
export const STORAGE_STATE_PATH = path.join(AUTH_DIR, 'privy-state.json');
export const WALLET_FILE_PATH = path.join(AUTH_DIR, 'wallet-address.json');

const TRANSFER_OWNERSHIP_SIG = 'f2fde38b';
const SET_GOV_SIG = 'cfad57a2';

async function rpcCall<T>(method: string, params: unknown[] = []): Promise<T> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
  });
  const json = (await res.json()) as { result?: T; error?: { message?: string } };
  if (json.error) throw new Error(json.error.message ?? `RPC error: ${method}`);
  return json.result as T;
}

function pad32(hex: string) {
  return hex.replace('0x', '').toLowerCase().padStart(64, '0');
}

async function sendTx(to: string, data: string, from = DEPLOYER) {
  const hash = await rpcCall<string>('eth_sendTransaction', [
    { from, to, data, value: '0x0' },
  ]);
  for (let i = 0; i < 40; i++) {
    const receipt = await rpcCall<unknown>('eth_getTransactionReceipt', [hash]);
    if (receipt) return;
    await new Promise((r) => setTimeout(r, 250));
  }
}

async function transferOwnership(contract: string, newOwner: string) {
  await sendTx(contract, `0x${TRANSFER_OWNERSHIP_SIG}${pad32(newOwner)}`);
}

async function setGov(contract: string, newGov: string) {
  await sendTx(contract, `0x${SET_GOV_SIG}${pad32(newGov)}`);
}

async function fundWithEth(to: string) {
  const value = '0x' + (100n * 10n ** 18n).toString(16);
  await rpcCall('eth_sendTransaction', [{ from: DEPLOYER, to, value }]);
}

async function mintUsdc(usdcAddr: string, to: string, amount: bigint) {
  const sig = '40c10f19'; // mint(address,uint256)
  const data = `0x${sig}${pad32(to)}${pad32(amount.toString(16))}`;
  await sendTx(usdcAddr, data);
}

setup('authenticate with Privy and setup wallet', async ({ page }) => {
  setup.setTimeout(120_000);
  mkdirSync(AUTH_DIR, { recursive: true });

  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');

  // --- Step 1: Open Privy modal ---
  console.log('[auth.setup] Clicking Log in...');
  const loginBtn = page.getByRole('button', { name: 'Log in' });
  await loginBtn.waitFor({ state: 'visible', timeout: 30_000 });
  await loginBtn.click();

  // --- Step 2: Enter email and click Submit ---
  console.log('[auth.setup] Entering email...');
  const emailInput = page.locator('input[type="email"]').first();
  await emailInput.waitFor({ state: 'visible', timeout: 30_000 });
  await emailInput.fill(PRIVY_TEST_EMAIL);

  // Click "Submit" — the exact button text in the Privy modal (NOT "Continue with a wallet")
  const submitBtn = page.getByRole('button', { name: 'Submit', exact: true });
  await submitBtn.click();

  // --- Step 3: Wait for OTP screen and enter code ---
  console.log('[auth.setup] Waiting for OTP screen...');
  // Privy shows an OTP verification screen after email submit.
  // Wait for the email input to disappear (screen transition).
  await emailInput.waitFor({ state: 'hidden', timeout: 15_000 });
  await page.waitForTimeout(2_000);

  await page.screenshot({ path: path.join(AUTH_DIR, 'otp-screen.png') });

  // Locate OTP inputs inside the Privy dialog (id=privy-dialog).
  // Privy v3 uses individual digit inputs with type="text" inside the modal.
  const privyDialog = page.locator('#privy-dialog');
  const otpInputs = privyDialog.locator('input[type="text"]');
  const inputCount = await otpInputs.count();
  console.log(`[auth.setup] Found ${inputCount} text inputs in Privy dialog for OTP`);

  if (inputCount >= 6) {
    // Individual digit inputs
    for (let i = 0; i < PRIVY_TEST_OTP.length && i < inputCount; i++) {
      await otpInputs.nth(i).fill(PRIVY_TEST_OTP[i]);
    }
  } else if (inputCount >= 1) {
    // Single combined input or first available
    const otpInput = otpInputs.first();
    await otpInput.click();
    await otpInput.fill('');
    await page.keyboard.type(PRIVY_TEST_OTP, { delay: 80 });
  } else {
    // Fallback: try typing on the focused element
    console.log('[auth.setup] No text inputs found, typing OTP via keyboard...');
    await page.keyboard.type(PRIVY_TEST_OTP, { delay: 80 });
  }

  // Submit OTP by pressing Enter
  await page.keyboard.press('Enter');

  // --- Step 4: Wait for authentication to complete ---
  console.log('[auth.setup] Waiting for wallet connection...');
  await page.waitForTimeout(3_000);
  await page.screenshot({ path: path.join(AUTH_DIR, 'after-otp.png') });

  const walletIndicator = page.locator('[data-testid="privy-connected-wallet"]');
  await walletIndicator.waitFor({ state: 'visible', timeout: 60_000 });

  const walletAddress = await walletIndicator.getAttribute('data-address');
  if (!walletAddress || !walletAddress.startsWith('0x')) {
    throw new Error(`[auth.setup] Could not read wallet address. Got: ${walletAddress}`);
  }
  console.log(`[auth.setup] Privy wallet: ${walletAddress}`);

  // --- Step 5: Fund the embedded wallet ---
  console.log('[auth.setup] Funding wallet with ETH...');
  await fundWithEth(walletAddress);

  const deployment = JSON.parse(
    readFileSync(path.join(__dirname, '../src/config/local-deployment.json'), 'utf8'),
  ) as Record<string, string>;

  console.log('[auth.setup] Minting USDC...');
  await mintUsdc(deployment.usdc, walletAddress, 100_000n * 1_000_000n);

  // --- Step 6: Transfer contract ownership to the Privy wallet ---
  const ownableContracts = [
    'basketFactory',
    'vaultAccounting',
    'oracleAdapter',
    'pricingEngine',
    'fundingRateManager',
    'priceSync',
    'assetWiring',
  ];

  for (const name of ownableContracts) {
    const addr = deployment[name];
    if (!addr) continue;
    console.log(`[auth.setup] transferOwnership ${name} → ${walletAddress}`);
    await transferOwnership(addr, walletAddress);
  }

  if (deployment.gmxVault) {
    console.log(`[auth.setup] setGov gmxVault → ${walletAddress}`);
    await setGov(deployment.gmxVault, walletAddress);
  }

  // --- Step 7: Persist auth state and wallet address ---
  await page.context().storageState({ path: STORAGE_STATE_PATH });
  writeFileSync(WALLET_FILE_PATH, JSON.stringify({ address: walletAddress }));
  console.log('[auth.setup] Auth state and wallet address saved. Done.');
});
