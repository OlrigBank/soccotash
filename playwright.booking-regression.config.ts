import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.BOOKING_REGRESSION_BASE_URL || 'http://127.0.0.1:8080';
const target = new URL(baseURL);

if (!['127.0.0.1', 'localhost'].includes(target.hostname)) {
  throw new Error(`Booking regression tests may only target a local service, not ${target.origin}.`);
}
if (process.env.BOOKING_REGRESSION_ALLOW_MUTATION !== 'yes') {
  throw new Error('Set BOOKING_REGRESSION_ALLOW_MUTATION=yes to acknowledge that this suite changes disposable test data.');
}
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for isolated test setup and verification.');

export default defineConfig({
  testDir: './tests/booking-regression',
  outputDir: './test-results/booking-regression',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report/booking-regression', open: 'never' }],
  ],
  use: {
    baseURL: target.origin,
    locale: 'en-GB',
    timezoneId: 'Europe/London',
    trace: { mode: 'on', screenshots: true, snapshots: true, sources: true },
    video: 'on',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm --prefix site run dev -- --host 127.0.0.1 --port 8080',
    url: target.origin,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
