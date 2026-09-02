import { defineConfig } from '@playwright/test';

const baseURL = process.env.LANDING_PAGE_REGRESSION_BASE_URL || 'http://127.0.0.1:8080';
const target = new URL(baseURL);
const developmentPort = target.port || (target.protocol === 'https:' ? '443' : '80');
const approvedRenderOrigin = 'https://soccotash.onrender.com';
const isLocal = ['127.0.0.1', 'localhost'].includes(target.hostname);
const isApprovedRender = target.origin === approvedRenderOrigin;

if (!isLocal && !isApprovedRender) {
  throw new Error(`Landing-page regression tests refuse unapproved origin ${target.origin}.`);
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
  metadata: {
    targetOrigin: target.origin,
    safetyMode: 'read-only interactions; Quick Check submission prohibited',
    productionAllowed: false,
  },
  webServer: isLocal ? {
    command: `npm --prefix site run dev -- --host 127.0.0.1 --port ${developmentPort}`,
    url: target.origin,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  } : undefined,
  projects: [
    { name: 'phone-390x844', use: { viewport: { width: 390, height: 844 } } },
    { name: 'tablet-768x1024', use: { viewport: { width: 768, height: 1024 } } },
    { name: 'desktop-1440x900', use: { viewport: { width: 1440, height: 900 } } },
  ],
});
