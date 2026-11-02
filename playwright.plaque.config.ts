import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/plaque-regression',
  fullyParallel: true,
  use: { baseURL: 'http://127.0.0.1:8093', locale: 'en-GB' },
  webServer: [{
    command: 'PORT=8093 UMAMI_WEBSITE_ID=11111111-1111-4111-8111-111111111111 UMAMI_SCRIPT_URL=https://analytics.example.test/script.js node --experimental-strip-types tests/support/public-review-preview.mjs',
    url: 'http://127.0.0.1:8093/plaque/', timeout: 120000, reuseExistingServer: !process.env.CI,
  }, {
    command: 'PORT=8095 HOST=127.0.0.1 DATABASE_URL= UMAMI_WEBSITE_ID= node site/dist/server/entry.mjs',
    url: 'http://127.0.0.1:8095/plaque/', timeout: 30000, reuseExistingServer: !process.env.CI,
  }],
  projects: [
    { name: 'small-phone', use: { viewport: { width: 320, height: 800 } } },
    { name: 'phone', use: { viewport: { width: 390, height: 844 } } },
    { name: 'tablet', use: { viewport: { width: 768, height: 1024 } } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
  ],
});
