import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.AIRBNB_ADMIN_BASE_URL || 'http://127.0.0.1:8082';
const target = new URL(baseURL);
if (!['127.0.0.1', 'localhost'].includes(target.hostname)) {
  throw new Error(`Airbnb admin UI tests may only target a local service, not ${target.origin}.`);
}
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for isolated admin test setup.');

export default defineConfig({
  testDir: './tests/airbnb-admin',
  outputDir: './test-results/airbnb-admin',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/airbnb-admin', open: 'never' }]],
  use: {
    baseURL: target.origin,
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
    locale: 'en-GB',
    timezoneId: 'Europe/London',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } } },
    { name: 'phone', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
