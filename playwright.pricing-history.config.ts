import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/pricing-history',
  testMatch: '*.spec.ts',
  outputDir: './test-results/pricing-history',
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/pricing-history', open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:8096', locale: 'en-GB', timezoneId: 'Europe/London', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: {
    command: 'node --experimental-strip-types tests/support/pricing-history-preview.mjs',
    url: 'http://127.0.0.1:8096/admin/login/',
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } } },
    { name: 'phone', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
