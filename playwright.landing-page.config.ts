import { defineConfig } from '@playwright/test';

const baseURL = process.env.LANDING_PAGE_REGRESSION_BASE_URL || 'http://127.0.0.1:8080';
const target = new URL(baseURL);
const developmentPort = target.port || (target.protocol === 'https:' ? '443' : '80');

if (!['127.0.0.1', 'localhost'].includes(target.hostname)) {
  throw new Error(`Landing-page regression tests may only target a local service, not ${target.origin}.`);
}

export default defineConfig({
  testDir: './tests/landing-page-regression',
  outputDir: './test-results/landing-page-regression',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report/landing-page-regression', open: 'never' }],
  ],
  use: {
    baseURL: target.origin,
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    locale: 'en-GB',
    timezoneId: 'Europe/London',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npm --prefix site run dev -- --host 127.0.0.1 --port ${developmentPort}`,
    url: target.origin,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: 'phone-390x844', use: { viewport: { width: 390, height: 844 } } },
    { name: 'tablet-768x1024', use: { viewport: { width: 768, height: 1024 } } },
    { name: 'desktop-1440x900', use: { viewport: { width: 1440, height: 900 } } },
  ],
});
