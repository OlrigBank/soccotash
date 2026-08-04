import { defineConfig, devices } from '@playwright/test';

const DEFAULT_DEVELOPMENT_ORIGIN = 'https://soccotash.onrender.com';
const PRODUCTION_HOSTS = new Set([
  'olrig-bank.com',
  'www.olrig-bank.com',
  'olrigbank.co.uk',
  'www.olrigbank.co.uk',
]);

const requestedUrl = new URL(
  process.env.LIVE_SMOKE_BASE_URL || DEFAULT_DEVELOPMENT_ORIGIN,
);
const targetOrigin = requestedUrl.origin;

if (PRODUCTION_HOSTS.has(requestedUrl.hostname.toLowerCase())) {
  throw new Error(
    `The live smoke suite refuses to target production (${targetOrigin}).`,
  );
}

if (
  targetOrigin !== DEFAULT_DEVELOPMENT_ORIGIN &&
  process.env.LIVE_SMOKE_APPROVED_ORIGIN !== targetOrigin
) {
  throw new Error(
    `Refusing unapproved origin ${targetOrigin}. Set LIVE_SMOKE_APPROVED_ORIGIN to that exact origin if it is an authorised non-production environment.`,
  );
}

export default defineConfig({
  testDir: './tests/live-smoke',
  outputDir: './test-results/live-smoke',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report/live-smoke', open: 'never' }],
  ],
  metadata: {
    targetOrigin,
    safetyMode: 'read-only and rejected-write only',
    productionAllowed: false,
  },
  use: {
    baseURL: targetOrigin,
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    locale: 'en-GB',
    timezoneId: 'Europe/London',
    trace: {
      mode: 'on',
      screenshots: true,
      snapshots: true,
      sources: true,
    },
    video: 'on',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'cloud-chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
