import { expect, test } from '@playwright/test';

test('welcome garden link leads to the complete garden guidance', async ({ page }) => {
  const faults: string[] = [];
  page.on('pageerror', error => faults.push(error.message));
  await page.goto('/welcome/');
  const link = page.locator('#garden .welcome__details');
  await expect(link).toHaveAccessibleName('Enjoy the Garden');
  await link.focus();
  expect(await link.evaluate(element => getComputedStyle(element).outlineStyle)).toBe('solid');
  await link.press('Enter');
  await expect(page).toHaveURL(/\/enjoy-the-garden\/?$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Use of the Garden');
  const body = page.locator('.prose');
  await expect(body).toContainText('we hope you’ll make full use of the garden during your stay.');
  await expect(body).toContainText('keep noise at a reasonable level.');
  await expect(body.getByRole('listitem')).toHaveCount(2);
  await expect(body.getByRole('listitem').nth(0)).toHaveText('Game playing and noisy gatherings in the garden must stop after 21:30.');
  await expect(body.getByRole('listitem').nth(1)).toHaveText('Guests who wish to use the garden for a planned event, please discuss this with us in advance — this allows us to inform the neighbours that an event is going to take place.');
  await expect(body.locator('strong')).toHaveText(['21:30', 'planned event']);
  await expect(body).toContainText('Thank you for helping us keep things peaceful for our neighbours — we hope you have a wonderful time!');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  expect(faults).toEqual([]);
});

test('garden guidance loads directly without JavaScript', async ({ browser, baseURL, viewport }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport });
  try {
    const page = await context.newPage();
    const response = await page.goto(`${baseURL}/enjoy-the-garden`);
    expect(response?.ok()).toBe(true);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Use of the Garden');
    await expect(page.locator('.prose').getByRole('listitem')).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  } finally {
    await context.close();
  }
});
