import { expect, test } from '@playwright/test';
import { autoApprovePrivyTransactions } from './helpers';

const BASKET_PATH = '/baskets/0x15acf354ea7504ca57d9639260f6bd71f8b08c5f';

type NetworkOption = {
  target: 'sepolia' | 'fuji';
  testId: 'network-option-sepolia' | 'network-option-fuji';
  label: string;
};

const NETWORK_OPTIONS: NetworkOption[] = [
  { target: 'sepolia', testId: 'network-option-sepolia', label: 'Sepolia' },
  { target: 'fuji', testId: 'network-option-fuji', label: 'Avalanche Fuji' },
];

function parseDollarAmount(raw: string): number {
  const cleaned = raw.replace(/[^0-9.,KMBkmb-]/g, '').replace(/,/g, '').trim();
  const match = cleaned.match(/^(-?\d+(?:\.\d+)?)([KMBkmb])?$/);
  if (!match) return 0;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return 0;
  const unit = (match[2] ?? '').toUpperCase();
  if (unit === 'K') return value * 1_000;
  if (unit === 'M') return value * 1_000_000;
  if (unit === 'B') return value * 1_000_000_000;
  return value;
}

async function dismissBlockingOverlays(page: Parameters<typeof test>[0]['page']) {
  for (let i = 0; i < 6; i++) {
    const backdropVisible = await page
      .locator('div.fixed.inset-0.z-\\[60\\].bg-black\\/50')
      .isVisible()
      .catch(() => false);
    const stepVisible = await page.getByText(/step\\s*\\d+\\s*of\\s*\\d+/i).first().isVisible().catch(() => false);
    if (!backdropVisible && !stepVisible) break;

    const skipTour = page.getByRole('button', { name: /skip tour/i }).first();
    if (await skipTour.isVisible().catch(() => false)) {
      await skipTour.click({ timeout: 2_000 }).catch(() => {});
      await page.waitForTimeout(300);
      continue;
    }

    const closeButtons = [
      page.locator('button').filter({ hasText: /^×$/ }).first(),
      page.locator('button[aria-label="Close"]').first(),
    ];
    let closed = false;
    for (const close of closeButtons) {
      if (await close.isVisible().catch(() => false)) {
        await close.click({ timeout: 2_000 }).catch(() => {});
        closed = true;
        break;
      }
    }
    if (closed) {
      await page.waitForTimeout(300);
      continue;
    }

    const next = page.getByRole('button', { name: /^next$/i }).first();
    if (await next.isVisible().catch(() => false)) {
      await next.click({ timeout: 2_000 }).catch(() => {});
      await page.waitForTimeout(300);
      continue;
    }

    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(300);
  }

  await page
    .waitForSelector('div.fixed.inset-0.z-\\[60\\].bg-black\\/50', {
      state: 'hidden',
      timeout: 8_000,
    })
    .catch(() => {});

  // Last-resort cleanup for flaky onboarding overlays that can still intercept clicks in CI.
  await page
    .evaluate(() => {
      document.querySelectorAll('[data-tour-step]').forEach((n) => n.remove());
      document
        .querySelectorAll('div.fixed.inset-0.z-\\[60\\].bg-black\\/50')
        .forEach((n) => n.remove());
    })
    .catch(() => {});
}

async function disableTour(page: Parameters<typeof test>[0]['page']) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('indexflow:tour-dismissed', '1');
    } catch {
      // Ignore storage errors in restricted contexts.
    }
  });
}

async function getConnectedWalletLabel(page: Parameters<typeof test>[0]['page']) {
  const wallets = page.locator('[data-testid="privy-connected-wallet"]');
  const count = await wallets.count();
  for (let i = 0; i < count; i++) {
    const item = wallets.nth(i);
    if (!(await item.isVisible().catch(() => false))) continue;
    const txt = ((await item.textContent().catch(() => '')) ?? '').trim();
    if (txt) return txt;
  }
  return '';
}

async function isWalletConnected(page: Parameters<typeof test>[0]['page']) {
  const label = await getConnectedWalletLabel(page);
  // Connected state is represented by a shortened 0x address label.
  return /^0x[a-fA-F0-9]{4}\.\.\.[a-fA-F0-9]{4}$/.test(label);
}

async function loginWithPrivy(page: Parameters<typeof test>[0]['page']) {
  const email = process.env.PRIVY_TEST_EMAIL ?? '';
  const otp = process.env.PRIVY_TEST_OTP ?? '';
  if (!email || !otp) {
    throw new Error('PRIVY_TEST_EMAIL and PRIVY_TEST_OTP are required.');
  }

  const loginBtn = page.getByRole('button', { name: 'Log in' });
  await expect(loginBtn).toBeVisible({ timeout: 45_000 });
  await loginBtn.click();

  const emailInput = page.locator('input[type="email"]').first();
  await emailInput.waitFor({ state: 'visible', timeout: 30_000 });
  await emailInput.fill(email);
  await page.getByRole('button', { name: 'Submit', exact: true }).click();

  await emailInput.waitFor({ state: 'hidden', timeout: 30_000 });
  await page.waitForTimeout(2_000);

  const otpInputs = page.locator('#privy-dialog input[type="text"]');
  const count = await otpInputs.count();
  if (count >= 6) {
    for (let i = 0; i < otp.length && i < count; i++) {
      await otpInputs.nth(i).fill(otp[i]);
    }
  } else if (count >= 1) {
    const first = otpInputs.first();
    await first.click();
    await first.fill('');
    await page.keyboard.type(otp, { delay: 80 });
  } else {
    await page.keyboard.type(otp, { delay: 80 });
  }
  await page.keyboard.press('Enter');
}

async function ensureConnectedWallet(page: Parameters<typeof test>[0]['page']) {
  if (await isWalletConnected(page)) return;

  const loginVisible = await page.getByRole('button', { name: 'Log in' }).isVisible().catch(() => false);
  if (loginVisible) {
    await loginWithPrivy(page);
  }

  await expect.poll(async () => await isWalletConnected(page), {
    timeout: 60_000,
  }).toBe(true);
}

async function openNetworkMenu(page: Parameters<typeof test>[0]['page']) {
  await dismissBlockingOverlays(page);
  const optionsVisible = async () => {
    const all = await page.getByTestId('network-option-all').isVisible().catch(() => false);
    const sep = await page.getByTestId('network-option-sepolia').isVisible().catch(() => false);
    const fuji = await page.getByTestId('network-option-fuji').isVisible().catch(() => false);
    return all || sep || fuji;
  };

  if (await optionsVisible()) return;

  const trigger = page.locator('[data-testid="network-selector-trigger"]').first();
  await expect(trigger).toBeVisible({ timeout: 20_000 });

  for (let attempt = 0; attempt < 4; attempt++) {
    if (await optionsVisible()) return;
    await trigger.click();
    await page.waitForTimeout(200);
    if (await optionsVisible()) return;
  }

  await expect
    .poll(async () => await optionsVisible(), { timeout: 8_000 })
    .toBe(true);
}

async function selectNetworkOption(page: Parameters<typeof test>[0]['page'], testId: string) {
  await openNetworkMenu(page);
  const option = page.getByTestId(testId);
  await expect(option).toBeVisible({ timeout: 10_000 });
  await option.click();
  await page.waitForTimeout(1_500);
}

async function mintOnCurrentNetwork(page: Parameters<typeof test>[0]['page'], networkLabel: string) {
  await dismissBlockingOverlays(page);

  const mintButton = page.getByTestId('mint-10k-usdc');
  await expect(mintButton).toBeVisible({ timeout: 20_000 });

  if (await mintButton.isDisabled()) {
    await ensureConnectedWallet(page);
    await expect(mintButton).toBeEnabled({ timeout: 30_000 });
  }

  await mintButton.click();

  const successToast = page.getByText('Minted 10,000 Test USDC');
  const sponsorshipDialog = page.getByRole('dialog').filter({ hasText: 'Gas Sponsorship Failed' });

  const outcome = await Promise.race([
    successToast.waitFor({ state: 'visible', timeout: 90_000 }).then(() => 'success' as const),
    sponsorshipDialog.waitFor({ state: 'visible', timeout: 90_000 }).then(() => 'sponsorship_failed' as const),
  ]);

  if (outcome === 'sponsorship_failed') {
    const detail = (await sponsorshipDialog.textContent().catch(() => '')) ?? '';
    throw new Error(`Mint failed on ${networkLabel}: ${detail}`);
  }
}

async function waitForPositiveMaxBalance(page: Parameters<typeof test>[0]['page'], context: string) {
  const maxButton = page.getByRole('button', { name: /^Max:\s*\$/i }).first();
  await expect(maxButton).toBeVisible({ timeout: 20_000 });

  await expect
    .poll(
      async () => {
        const text = (await maxButton.textContent().catch(() => '')) ?? '';
        const amountText = text.replace(/^Max:\s*/i, '').trim();
        return parseDollarAmount(amountText);
      },
      { timeout: 90_000 }
    )
    .toBeGreaterThan(0);

  const finalText = ((await maxButton.textContent().catch(() => '')) ?? '').trim();
  if (!finalText || parseDollarAmount(finalText.replace(/^Max:\s*/i, '')) <= 0) {
    throw new Error(`Expected positive USDC balance after ${context}, but saw "${finalText}".`);
  }
}

async function runSplitDeposit(page: Parameters<typeof test>[0]['page']) {
  console.log('[E2E] runSplitDeposit: selecting all-chains mode');
  await selectNetworkOption(page, 'network-option-all');

  await expect(page.getByText(/multi-chain deposit enabled/i)).toBeVisible({ timeout: 15_000 });

  const amountInput = page.getByTestId('deposit-redeem-amount');
  await expect(amountInput).toBeVisible({ timeout: 15_000 });
  await amountInput.fill('10000');

  const submit = page.getByTestId('deposit-redeem-submit');
  await expect(submit).toBeVisible({ timeout: 15_000 });
  await expect(submit).toBeEnabled({ timeout: 30_000 });
  console.log('[E2E] runSplitDeposit: clicking submit');
  await submit.click();

  const phaseNames = ['loading', 'no-routing', 'preview', 'executing', 'complete', 'error'] as const;
  type DrawerPhase = (typeof phaseNames)[number];
  const getCurrentPhase = async (): Promise<DrawerPhase | null> => {
    for (const phase of phaseNames) {
      const attached = await page
        .locator(`[data-testid="multi-chain-drawer-phase"][data-phase="${phase}"]`)
        .count()
        .then((count) => count > 0)
        .catch(() => false);
      if (attached) return phase;
    }
    return null;
  };

  await expect
    .poll(async () => await getCurrentPhase(), { timeout: 60_000 })
    .not.toBeNull();

  let initialPhase = await getCurrentPhase();
  console.log(`[E2E] runSplitDeposit: initial drawer phase = ${initialPhase}`);
  if (initialPhase === 'loading') {
    await expect
      .poll(async () => await getCurrentPhase(), { timeout: 60_000 })
      .not.toBe('loading');
    initialPhase = await getCurrentPhase();
    console.log(`[E2E] runSplitDeposit: post-loading phase = ${initialPhase}`);
  }

  if (!initialPhase) {
    throw new Error('Multi-chain deposit drawer did not open after submit.');
  }

  if (initialPhase === 'no-routing') {
    throw new Error('Multi-chain routing is unavailable (`no-routing` drawer phase).');
  }

  const phaseError = page.locator('[data-testid="multi-chain-drawer-phase"][data-phase="error"]');
  const phaseComplete = page.locator('[data-testid="multi-chain-drawer-phase"][data-phase="complete"]');

  if (initialPhase === 'preview') {
    const confirm = page.getByTestId('multi-chain-confirm-deposit');
    await expect(confirm).toBeEnabled({ timeout: 15_000 });
    console.log('[E2E] runSplitDeposit: clicking confirm');
    await confirm.click();
  }

  if (initialPhase === 'error') {
    const body = (await page.textContent('body').catch(() => '')) ?? '';
    throw new Error(`Split deposit entered error phase immediately. Snapshot:\n${body.slice(0, 1200)}`);
  }

  const POLL_INTERVAL_MS = 500;
  const deadline = Date.now() + 200_000; // 3.33 minutes - aligned with app timeouts
  let lastLoggedPhase = initialPhase;
  let terminalPhase: 'complete' | 'error' | null = null;

  console.log('[E2E] runSplitDeposit: entering execution polling loop');

  // Also monitor for success toast which appears regardless of drawer state
  const successToastLocator = page.getByText(/multi-chain deposit complete/i);
  const depositCompleteLocator = page.getByText(/deposit complete/i);

  while (Date.now() < deadline) {
    // Check for success toast first (shown when deposits complete, even if drawer closes)
    if (await successToastLocator.isVisible({ timeout: 100 }).catch(() => false)) {
      console.log('[E2E] runSplitDeposit: SUCCESS - found "multi-chain deposit complete" message');
      terminalPhase = 'complete';
      break;
    }

    if (await depositCompleteLocator.isVisible({ timeout: 100 }).catch(() => false)) {
      console.log('[E2E] runSplitDeposit: SUCCESS - found "deposit complete" message');
      terminalPhase = 'complete';
      break;
    }

    const currentPhase = await getCurrentPhase();
    if (currentPhase !== lastLoggedPhase) {
      console.log(`[E2E] runSplitDeposit: phase changed to ${currentPhase}`);
      lastLoggedPhase = currentPhase;
    }

    if (await phaseComplete.count().then((c) => c > 0).catch(() => false)) {
      console.log('[E2E] runSplitDeposit: reached complete phase');
      terminalPhase = 'complete';
      break;
    }

    if (await phaseError.count().then((c) => c > 0).catch(() => false)) {
      console.log('[E2E] runSplitDeposit: reached error phase');
      terminalPhase = 'error';
      break;
    }

    // Privy transaction modal can appear during execution; keep approving pending actions.
    const frames = page.frames();
    const labels = [
      /^Approve$/i,
      /^Retry transaction$/i,
      /^All Done$/i,
      /^Confirm$/i,
      /^Continue$/i,
      /^Submit$/i,
      /^Sign$/i,
      /^Send$/i,
    ];
    for (const frame of frames) {
      for (const label of labels) {
        const btn = frame.getByRole('button', { name: label }).first();
        if (await btn.isVisible({ timeout: 100 }).catch(() => false)) {
          console.log(`[E2E] runSplitDeposit: clicking ${label} in frame`);
          await btn.click({ timeout: 500 }).catch(() => {});
        }
      }
    }

    await page.waitForTimeout(POLL_INTERVAL_MS);
  }

  if (terminalPhase === 'complete') {
    const doneButton = page.getByRole('button', { name: 'Done' }).first();
    if (await doneButton.isVisible().catch(() => false)) {
      await doneButton.click().catch(() => {});
    }
    await expect(page.getByText(/deposit complete/i)).toBeVisible({ timeout: 30_000 });
    console.log('[E2E] runSplitDeposit: SUCCESS - deposit complete');
    return;
  }

  if (terminalPhase === 'error') {
    const drawerContent = await page.locator('[data-testid="multi-chain-drawer-content"]').textContent().catch(() => '');
    console.log(`[E2E] runSplitDeposit: ERROR phase reached. Drawer content:\n${drawerContent?.slice(0, 800)}`);
    throw new Error(`Split deposit ended in error state. Drawer snapshot:\n${drawerContent?.slice(0, 1200)}`);
  }

  const finalPhase = await getCurrentPhase();
  const approveVisible = await page.getByRole('button', { name: /^Approve$/i }).first().isVisible().catch(() => false);
  console.log(`[E2E] runSplitDeposit: TIMEOUT - phase=${finalPhase} approveVisible=${approveVisible}`);

  // If drawer closed but we can find success indicators, treat as success
  // This handles the case where Privy's "All Done" closes the drawer before our phase updates
  const successToast = page.getByText(/deposit complete/i);
  const multiChainComplete = page.getByText(/multi-chain deposit complete/i);
  
  if (await successToast.isVisible({ timeout: 5000 }).catch(() => false)) {
    console.log('[E2E] runSplitDeposit: SUCCESS - found deposit complete message');
    return;
  }
  
  if (await multiChainComplete.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log('[E2E] runSplitDeposit: SUCCESS - found multi-chain deposit complete message');
    return;
  }

  throw new Error(
    `Split deposit timed out before reaching terminal phase. phase=${finalPhase ?? 'unknown'} approveVisible=${String(approveVisible)}`
  );
}

test('mint on all available networks and execute split deposit', async ({ page }) => {
  test.setTimeout(420_000);

  await disableTour(page);
  await autoApprovePrivyTransactions(page);
  await page.goto(BASKET_PATH, { waitUntil: 'domcontentloaded' });
  await dismissBlockingOverlays(page);
  await ensureConnectedWallet(page);

  const available: NetworkOption[] = [];
  await openNetworkMenu(page);
  for (const option of NETWORK_OPTIONS) {
    const node = page.getByTestId(option.testId);
    if (await node.isVisible().catch(() => false)) {
      available.push(option);
    }
  }
  await page.keyboard.press('Escape').catch(() => {});

  expect(available.length).toBeGreaterThan(0);

  for (const network of available) {
    await selectNetworkOption(page, network.testId);
    await mintOnCurrentNetwork(page, network.label);
    await waitForPositiveMaxBalance(page, `mint on ${network.label}`);
  }

  // Ensure routing-weight reads resolve from the hub context before entering all-chains mode.
  await selectNetworkOption(page, 'network-option-sepolia');
  await waitForPositiveMaxBalance(page, 'all-network mint pass');
  await runSplitDeposit(page);
});

