import { test, expect } from '@playwright/test';

test('homepage explains the three stays without document overflow', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('A Victorian holiday home and cottage in Kendal');
  const comparison = page.getByRole('region', { name: 'Comparison of ways to stay at Olrig Bank' });
  await expect(comparison.getByRole('link', { name: 'Olrig Bank Max', exact: true })).toBeVisible();
  await expect(comparison).toContainText('Main house + two additional bedrooms and a bathroom');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('mobile availability expands, keeps values and restores keyboard focus', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1440) >= 700, 'Mobile disclosure only');
  await page.goto('/');
  const disclosure = page.locator('.home-availability');
  const trigger = disclosure.locator(':scope > summary');
  await expect(disclosure).not.toHaveAttribute('open', '');
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(disclosure).toHaveAttribute('open', '');
  const state = await disclosure.locator('form').evaluate((form: HTMLFormElement) => [...new FormData(form).entries()]);
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(disclosure).not.toHaveAttribute('open', '');
  await page.keyboard.press('Enter');
  expect(await disclosure.locator('form').evaluate((form: HTMLFormElement) => [...new FormData(form).entries()])).toEqual(state);
});

for (const outcome of ['available', 'unavailable', 'error'] as const) {
  test(`availability disclosure preserves the ${outcome} outcome`, async ({ page }) => {
    await page.route('**/api/availability/**', route => route.fulfill(outcome === 'error'
      ? { status: 503, json: { error: 'Availability fixture offline' } }
      : { json: { blocks: outcome === 'unavailable' ? [{ startsOn: '2030-06-01', endsOn: '2030-06-08' }] : [] } }));
    await page.route('**/api/quote/**', route => route.fulfill({ json: { pricingAvailable: true, eligible: true, guestTotalPence: 140000, currency: 'GBP', nights: 4, plan: { id: 'fixture', version: 1 }, lines: [] } }));
    await page.route('**/api/provisional-bookings/**', route => route.abort());
    await page.goto('/?propertyId=main-house&arrival=2030-06-02&departure=2030-06-06&adults=6');
    const disclosure = page.locator('.home-availability');
    if ((page.viewportSize()?.width ?? 1440) < 700) await disclosure.locator(':scope > summary').click();
    await disclosure.locator('button[type=submit]').click();
    if (outcome === 'available') {
      await expect(disclosure.getByRole('button', { name: 'Book', exact: true })).toBeVisible();
    } else {
      await expect(disclosure).toContainText(outcome === 'unavailable' ? 'Those dates are unavailable' : 'Availability fixture offline');
    }
  });
}
