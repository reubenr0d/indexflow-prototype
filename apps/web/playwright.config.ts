import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const isCI = !!process.env.CI;
const hasPrivy = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);
const storageStatePath = path.join(__dirname, 'e2e', '.auth', 'privy-state.json');

// E2E uses a dedicated port (default 3010) so the spawned Next.js test server
// does not collide with a developer's running `npm run dev` on :3000. The
// existing dev server intentionally stays on its own port + its own
// .env.local (which points at production Envio). Override with `E2E_PORT=`.
const e2ePort = parseInt(process.env.E2E_PORT ?? '3010', 10);
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${e2ePort}`;

// Env vars the Playwright-spawned dev server needs that are NOT in
// apps/web/.env.local (so we keep the dev .env.local untouched and inject
// the E2E-specific overrides — e.g. local Envio URL — only when running tests).
const E2E_FORWARDED_ENV = [
  'NEXT_PUBLIC_PRIVY_APP_ID',
  'NEXT_PUBLIC_ENVIO_URL',
] as const;

// Forward when defined (including empty string). Passing an empty string is
// how we tell the spawned Next.js dev server to *override* a value in
// apps/web/.env.local (e.g. unset Privy to force the mock-connector path that
// the cross_chain_e2e CI job uses).
const forwardedEnv = E2E_FORWARDED_ENV.reduce<Record<string, string>>((acc, key) => {
  const value = process.env[key];
  if (value !== undefined) acc[key] = value;
  return acc;
}, {});

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 1 : undefined,
  reporter: [
    ['list'],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    headless: true,
    launchOptions: {
      args: [
        '--disable-features=ThirdPartyCookiePhaseout,TrackingProtection3pcd',
      ],
    },
  },
  projects: hasPrivy
    ? [
        {
          name: 'setup',
          testMatch: /auth\.setup\.ts/,
        },
        {
          name: 'chromium',
          use: {
            ...devices['Desktop Chrome'],
            storageState: storageStatePath,
          },
          dependencies: ['setup'],
        },
      ]
    : [
        {
          name: 'chromium',
          use: { ...devices['Desktop Chrome'] },
        },
      ],
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${e2ePort}`,
    port: e2ePort,
    cwd: __dirname,
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_E2E_TEST_MODE: '1',
      ...forwardedEnv,
    },
  },
  outputDir: 'test-results/artifacts',
});
