import { expect, test } from '@playwright/test';

test('listing space cards show an image and heading caption only', async ({ page }) => {
  for (const slug of ['olrig-bank', 'event', 'cottage']) {
    await page.goto(`/listings/${slug}/`);
    const cards = page.locator('.spaces-section .space-card');
    expect(await cards.count()).toBeGreaterThan(0);

    for (const card of await cards.all()) {
      const caption = card.locator('.space-card-content h3');
      await expect(caption).toHaveText(/\S/);
      await expect(card.locator('.space-card-content > *')).toHaveCount(1);
      await expect(card.locator('img')).toHaveAttribute('alt', (await caption.textContent())!.trim());
    }

    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  }
});
