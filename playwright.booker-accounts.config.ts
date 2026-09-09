import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/booker-accounts', workers: 1, timeout: 60_000,
  reporter: [['list']], outputDir: './test-results/booker-accounts',
  use: { baseURL: 'http://127.0.0.1:8082', locale: 'en-GB', reducedMotion: 'reduce', trace: 'off', video: 'off', screenshot: 'off' },
  webServer: { command: 'npm run build && node tests/support/booker-server.mjs', url: 'http://127.0.0.1:8082', reuseExistingServer: !process.env.CI, timeout: 120_000 },
  projects: [
    { name: 'phone-320', use: { viewport: { width: 320, height: 800 }, isMobile: true, hasTouch: true } },
    { name: 'phone-390', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: 'tablet', use: { viewport: { width: 768, height: 1024 } } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
  ],
});
