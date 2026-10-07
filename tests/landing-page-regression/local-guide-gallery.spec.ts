import { expect, test } from '@playwright/test';

test('guide previews open native categories and cards link to guide pages in new tabs', async ({ page }) => {
  const faults: string[] = [];
  page.on('pageerror', error => faults.push(error.message));
  await page.goto('/local-guide/');
  const category = page.locator('details[data-local-guide-category]').filter({ has: page.locator('[data-guide-card]') }).first();
  await category.locator(':scope > summary').focus();
  expect(await category.locator(':scope > summary').evaluate(element => getComputedStyle(element).outlineStyle)).toBe('solid');
  await page.keyboard.press('Enter');
  await expect(category).toHaveAttribute('open', '');
  const card = category.locator('[data-guide-card] a').first();
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('target', '_blank');
  await expect(card).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(card).toHaveAttribute('href', /^\/local-guide\/.+\/$/);
  const popupPromise = page.waitForEvent('popup');
  await card.click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  await expect(popup.getByRole('heading', { level: 1 })).toBeVisible();
  await popup.close();
  expect(faults).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test('all guide entries remain available without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`${baseURL}/local-guide/`);
  expect(await page.locator('[data-guide-card]').count()).toBeGreaterThan(0);
  await expect(page.locator('[data-guide-card][hidden]')).toHaveCount(0);
  await context.close();
});

for (const automatic of [true, false]) {
  test(`guide progressively reveals entries with ${automatic ? 'scrolling' : 'keyboard continuation'}`, async ({ page }) => {
    if (!automatic) await page.addInitScript(() => { delete (window as any).IntersectionObserver; });
    // Expand a published category in the disposable presentation response so
    // batching is covered even when every real category has fewer than 12 entries.
    await page.route('**/local-guide/', async route => {
      const response = await route.fetch();
      const html = (await response.text()).replace(/(<ul[^>]*data-guide-gallery[^>]*>)([\s\S]*?)(<\/ul>)/, (_match, start, content, end) => {
        const card = content.match(/<li data-guide-card[\s\S]*?<\/li>/)?.[0];
        if (!card) throw new Error('Expected an entry card in the preview');
        return start + card.repeat(27) + end + '<div class="local-guide-tree__continuation" data-guide-continuation hidden><button type="button">Show more recommendations</button><span role="status" data-guide-progress></span></div>';
      });
      await route.fulfill({ response, body: html });
    });
    await page.goto('/local-guide/');
    const category = page.locator('details[data-local-guide-category]').first();
    await category.locator(':scope > summary').click();
    const cards = category.locator('[data-guide-card]:not([hidden])');
    await expect(cards).toHaveCount(12);
    await expect(page.locator('details[data-local-guide-category]').nth(1)).not.toHaveAttribute('open', '');
    const more = category.getByRole('button', { name: 'Show more recommendations' });
    if (automatic) await more.scrollIntoViewIfNeeded();
    else { await more.focus(); await page.keyboard.press('Enter'); }
    await expect(cards).toHaveCount(24);
    await category.locator(':scope > summary').click();
    await category.locator(':scope > summary').click();
    await expect(cards).toHaveCount(24);
    if (automatic) await more.scrollIntoViewIfNeeded();
    else await more.press('Enter');
    await expect(cards).toHaveCount(27);
    if (!automatic) await expect(category.getByRole('button', { name: 'All recommendations shown' })).toBeFocused();
  });
}
