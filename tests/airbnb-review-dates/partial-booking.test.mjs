import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from '@playwright/test';
import { startAirbnbPartialPreview } from '../support/airbnb-partial-preview.mjs';

test('incomplete booking messages remain clearly flagged at phone, tablet and desktop widths', { timeout: 60_000 }, async () => {
  const preview = await startAirbnbPartialPreview(8092);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', request => errors.push(request.failure()?.errorText));
    for (const [width, height] of [[390, 844], [768, 1024], [1440, 900]]) {
      await page.setViewportSize({ width, height });
      await page.goto('http://127.0.0.1:8092/__airbnb-preview/');
      await page.locator('.airbnb-conversation-warning').waitFor();
      assert.match(await page.locator('.airbnb-conversation-warning').innerText(), /Messages incomplete/);
      assert.equal(await page.locator('.airbnb-conversation-entry').count(), 0);
      assert.equal(await page.locator('.airbnb-financial-panel').count(), 2);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'A');
      assert.ok(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle !== 'none'));
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await preview.close(); }
});
