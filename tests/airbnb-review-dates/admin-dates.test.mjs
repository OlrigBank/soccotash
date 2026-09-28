import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from '@playwright/test';
import { startAirbnbReviewPreview } from '../support/airbnb-review-preview.mjs';

test('admin review pages display unknown publication dates across responsive widths', { timeout: 60_000 }, async () => {
  const preview = await startAirbnbReviewPreview(8088);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 500) errors.push(`HTTP ${response.status()}`); });
    for (const [width, height] of [[390, 844], [768, 1024], [1440, 900]]) {
      await page.setViewportSize({ width, height });
      await page.goto('http://127.0.0.1:8088/__airbnb-preview/');
      assert.ok(await page.getByText('Unknown', { exact: true }).filter({ visible: true }).count());
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.getByRole('link', { name: 'Open review by Undated fixture guest', exact: true }).or(page.locator('article').filter({ hasText: 'Undated fixture guest' }).getByRole('link', { name: 'Open review' })).filter({ visible: true }).click();
      await page.getByRole('heading', { name: '5/5 · publication date unknown' }).waitFor();
      await page.getByText('Stay year assumed from the capture year.').waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.getByRole('link', { name: 'Back to reviews' }).click();
      await page.goto('http://127.0.0.1:8088/admin/airbnb/reviews/?from=2026-01-01');
      assert.equal(await page.getByText('Undated fixture guest', { exact: true }).count(), 0);
      await page.goto('http://127.0.0.1:8088/admin/airbnb/reviews/?search=NoMatchingFixture');
      assert.equal(await page.locator('tbody tr').count(), 0);
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await preview.close(); }
});
