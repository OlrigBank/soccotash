import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/booking-regression', testMatch: 'payment-completion.spec.ts',
  workers: 1, timeout: 60_000, reporter: [['list']], outputDir: './test-results/payment-completion',
  use: { baseURL: 'http://127.0.0.1:8086', locale: 'en-GB', reducedMotion: 'reduce' },
  webServer: { command: 'npm run build && REQUEST_PREVIEW_SIMULATE_CARD=yes node tests/support/request-journey-preview.mjs',
    url: 'http://127.0.0.1:8086/', reuseExistingServer: !process.env.CI, timeout: 120_000 },
  projects: [
    { name: 'phone', use: { viewport: { width: 390, height: 844 } } },
    { name: 'tablet', use: { viewport: { width: 768, height: 1024 } } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
  ],
});
