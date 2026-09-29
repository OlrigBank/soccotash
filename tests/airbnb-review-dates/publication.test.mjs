import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from '@playwright/test';
import { startAirbnbReviewPreview } from '../support/airbnb-review-preview.mjs';

test('publication changes the live homepage and ratings without rebuilding; private data stays private', { timeout: 90_000 }, async () => {
  const preview = await startAirbnbReviewPreview(0);
  let browser;
  const origin = preview.origin;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage();
    page.setDefaultTimeout(10_000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let response = await page.goto(origin);
    assert.match(response.headers()['cache-control'], /no-store/);
    await page.getByText('Guest reviews will be added here soon.').waitFor();
    assert.equal(await page.locator('.review-summary').count(), 0);
    await page.goto(`${origin}/__airbnb-preview/`);
    await page.getByRole('link', { name: 'Open review by Undated fixture guest', exact: true }).filter({ visible: true }).click();
    const detail = page.url();
    const id = await page.locator('input[name=id]').inputValue();
    const post = (data, headers = {}) => page.request.post(`${origin}/api/admin/airbnb/reviews/publication/`, { form: data, headers: { Origin: origin, ...headers }, maxRedirects: 0 });
    assert.equal((await post({ id, revision: '0', action: 'publish' }, { Origin: 'https://other.example' })).status(), 403);
    assert.equal((await post({ id, revision: '0', action: 'invalid' })).status(), 400);
    await page.getByRole('button', { name: 'Publish on website', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Publication change saved.' }).waitFor();
    await page.getByText('Published on the website', { exact: true }).waitFor();
    assert.equal((await post({ id, revision: '0', action: 'unpublish' })).status(), 409);
    for (const [width, height] of [[390,844],[768,1024],[1440,900]]) {
      await page.setViewportSize({ width, height });
      await page.goto(origin);
      await page.locator('[data-review-card]').waitFor();
      assert.equal(await page.locator('[data-review-card]').count(), 1);
      await page.getByText('Average category scores from 1 Airbnb guest reviews.').waitFor();
      assert.equal(await page.locator('.review-summary__overall strong').innerText(), '5.00');
      const html = await page.content();
      assert.ok(!html.includes('PRIVATE_FIXTURE_FEEDBACK'));
      assert.ok(!html.includes('output/pdf/fixture'));
      assert.ok(!html.includes('900000000000000001'));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.goto(detail);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.getByRole('button', { name: 'Unpublish from website' }).focus();
      assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Unpublish from website');
    }
    await page.keyboard.press('Enter');
    await page.getByText('Not published on the website', { exact: true }).waitFor();
    await page.goto(origin);
    await page.getByText('Guest reviews will be added here soon.').waitFor();
    const anonymous = await browser.newContext();
    const denied = await anonymous.request.post(`${origin}/api/admin/airbnb/reviews/publication/`, { form: { id, revision: '2', action: 'publish' }, headers: { Origin: origin }, maxRedirects: 0 });
    assert.ok([401,302,303].includes(denied.status()));
    await anonymous.close();
    assert.deepEqual(errors, []);
  } finally { await browser?.close(); await preview.close(); }
});
