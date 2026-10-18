import { expect, test } from '@playwright/test';

// The public preview uses migrated disposable content, including this category
// and entry. No customer credentials or external websites are needed.
test('guide overview stays indexable while categories and entries opt out', async ({ page, request }) => {
  await page.goto('/local-guide/');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://olrig-bank.com/local-guide/');
  await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(0);

  for (const path of ['/local-guide/activities/', '/local-guide/abbothall/']) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow');
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  }
  await expect(page.getByRole('link', { name: 'Visit website', exact: true })).toHaveAttribute('href', 'https://lakelandarts.org.uk/abbot-hall/');
  await expect(page.getByRole('link', { name: 'Visit website', exact: true })).toHaveAttribute('href', /^https:/);

  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  const xml = await sitemap.text();
  expect(xml).toContain('<loc>https://olrig-bank.com/local-guide/</loc>');
  expect(xml).not.toMatch(/<loc>https:\/\/olrig-bank\.com\/local-guide\/[^<]+<\/loc>/);
  expect(await (await request.get('/robots.txt')).text()).not.toMatch(/Disallow:\s*\/local-guide/);
});

test('unknown guide references retain their not-found response', async ({ page }) => {
  const response = await page.goto('/local-guide/search-verification-missing-reference/');
  expect(response?.status()).toBe(404);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,nofollow');
});
