import { defineConfig } from '@playwright/test';

// This suite creates only uniquely named, telephone-only local fixtures.
// No email address or WhatsApp consent is supplied. Fixtures are deleted in finally.
export default defineConfig({
  testDir: './tests/booking-regression',
  testMatch: 'booking-request.spec.ts',
  workers: 1,
  timeout: 60_000,
  reporter: [['list']],
  outputDir: './test-results/booking-request',
  use: {
    baseURL: 'http://127.0.0.1:8080',
    viewport: { width: 390, height: 844 },
    locale: 'en-GB',
    reducedMotion: 'reduce',
    trace: 'off', video: 'off', screenshot: 'off',
  },
});
