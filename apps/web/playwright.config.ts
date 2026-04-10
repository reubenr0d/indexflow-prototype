import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const isCI = !!process.env.CI;
const hasPrivy = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);
const storageStatePath = path.join(__dirname, 'e2e', '.auth', 'privy-state.json');

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
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    headless: true,
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
    command: 'npm run dev -- --hostname 127.0.0.1 --port 3000',
    port: 3000,
    cwd: __dirname,
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_E2E_TEST_MODE: '1',
      ...(process.env.NEXT_PUBLIC_PRIVY_APP_ID
        ? { NEXT_PUBLIC_PRIVY_APP_ID: process.env.NEXT_PUBLIC_PRIVY_APP_ID }
        : {}),
    },
  },
  outputDir: 'test-results/artifacts',
});
