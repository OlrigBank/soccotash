import { expect, test } from '@playwright/test';

test('welcome page offers stable topic links, guidance and a shared print view', async ({ page }) => {
  const faults: string[] = [];
  page.on('pageerror', error => faults.push(error.message));
  await page.goto('/welcome/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome to Olrig Bank');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://olrig-bank.com/welcome/');
  await expect(page.locator('[data-welcome-topic]')).toHaveCount(6);
  await expect(page.locator('.quick-check-band')).toHaveCount(0);
  const jump = page.getByRole('navigation', { name: 'Welcome topics' }).getByRole('link', { name: 'Before you leave' });
  await jump.focus();
  expect(await jump.evaluate(element => getComputedStyle(element).outlineStyle)).toBe('solid');
  await jump.press('Enter');
  await expect(page).toHaveURL(/#departure$/);
  await expect(page.locator('#departure')).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  const summaries = await page.locator('.welcome__copy > p:first-of-type').allTextContents();
  await page.getByRole('link', { name: 'Print welcome poster', exact: true }).click();
  await expect(page).toHaveURL(/\/welcome\/print\/$/);
  expect(await page.locator('.welcome__copy > p:first-of-type').allTextContents()).toEqual(summaries);
  await expect(page.locator('.welcome__qr img')).toHaveCount(6);
  expect(await page.locator('.welcome__qr img').evaluateAll(images => images.every(image => (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.getByLabel('Paper size').selectOption('A4');
  await expect.poll(() => page.locator('#welcome-paper-size').evaluate(element => element.textContent)).toContain('A4 portrait');
  await page.evaluate(() => { (window as any).__printed = false; window.print = () => { (window as any).__printed = true; }; });
  await page.getByRole('button', { name: 'Print welcome poster' }).focus();
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => (window as any).__printed)).toBe(true);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.welcome__print-controls')).toBeHidden();
  expect(faults).toEqual([]);
});

test('existing information destinations retain their fragment targets', async ({ page }) => {
  await page.goto('/welcome/');
  const links = await page.locator('[data-welcome-topic] .welcome__details').evaluateAll(elements => elements.map(element => element.getAttribute('href')!));
  for (const href of links) {
    const response = await page.goto(href);
    if (response) expect(response.ok(), href).toBe(true);
    else expect((await page.request.get(href)).ok(), href).toBe(true);
    const fragment = new URL(page.url()).hash.slice(1);
    if (fragment) await expect(page.locator(`[id="${fragment}"]`)).toHaveCount(1);
  }
  await page.goto('/guest-information/');
  await expect(page.getByRole('link', { name: 'Welcome page', exact: true })).toHaveAttribute('href', '/welcome/');
});

test('welcome and print guidance remain useful without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`${baseURL}/welcome/#parking-access`);
  await expect(page.locator('#parking-access')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Arrival guidance' })).toHaveAttribute('href', '/guest-information/#parking-and-arrival');
  await page.getByRole('link', { name: 'Print welcome poster', exact: true }).click();
  await expect(page.getByText(/your browser’s Print command/)).toBeVisible();
  await expect(page.locator('.welcome__qr img')).toHaveCount(6);
  await context.close();
});
