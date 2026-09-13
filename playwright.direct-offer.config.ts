import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/booking-regression', testMatch: 'direct-offer.spec.ts', workers: 1, timeout: 60_000,
  reporter: [['list']], outputDir: './test-results/direct-offer',
  use: { baseURL: process.env.E15_BASE_URL || 'http://127.0.0.1:8082', locale: 'en-GB', reducedMotion: 'reduce', trace: 'off', video: 'off', screenshot: 'off' },
});
