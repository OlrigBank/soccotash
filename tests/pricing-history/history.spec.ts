import { expect, test, type Page } from '@playwright/test';

async function openReport(page: Page) {
  await page.goto('/__pricing-history-preview/');
  await page.getByLabel('Historical start', { exact: true }).fill('2023-01-01');
  await page.getByLabel('Historical end (inclusive)').fill('2025-12-31');
}
async function generate(page: Page) {
  const response = page.waitForResponse(r => r.url().endsWith('/api/admin/pricing/history/') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Generate report' }).click();
  const api = await response;
  expect(api.status()).toBe(200);
  await expect(page.getByRole('link', { name: 'Download CSV' })).toBeVisible();
  return api.json();
}

test('anonymous report and downloads disclose no financial evidence', async ({ request }) => {
  const pageResponse = await request.get('/admin/pricing/history/', { maxRedirects: 0 });
  expect(pageResponse.status()).toBe(302);
  for (const route of ['/api/admin/pricing/history/', '/api/admin/pricing/history/report/']) {
    const response = await request.post(route, { data: {} });
    expect(response.status()).toBe(401);
    expect(response.headers()['cache-control']).toBe('private, no-store');
    expect(await response.text()).not.toContain('financials');
  }
});

test('rates, fallback evidence and CSV match the exact displayed report without document overflow', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await openReport(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Historical pricing' })).toBeVisible();
  await expect(page.locator('#history-download')).toHaveCount(0);
  const body = await generate(page);
  const julyWeekend = page.getByRole('table', { name: 'Historical rate table' }).getByRole('row').filter({ has: page.getByRole('rowheader', { name: /^July/ }) }).filter({ has: page.getByRole('cell', { name: 'Weekend', exact: true }) });
  await expect(julyWeekend).toContainText('£150.00');
  await expect(julyWeekend).toContainText('Supported historical baseline');
  const august = page.getByRole('table', { name: 'Historical rate table' }).getByRole('row').filter({ has: page.getByRole('rowheader', { name: /^August/ }) });
  await expect(august).toHaveCount(2);
  await expect(august.first()).toContainText('100% estimated allocation');
  await expect(august.first()).toContainText('Monthly baseline fallback');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download CSV' }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = []; for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  // Browser Blob downloads preserve the server-generated snapshot byte for byte.
  expect(Buffer.concat(chunks).toString('utf8')).toBe(body.csv);
  expect(body.report.includedReservations).toBe(18);
  expect(JSON.stringify(body)).not.toContain('PRIVATE_FIXTURE');
  const sizes = await page.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth, tables: [...document.querySelectorAll<HTMLElement>('.history-table')].map(t => ({ client: t.clientWidth, scroll: t.scrollWidth })) }));
  expect(sizes.document).toBeLessThanOrEqual(sizes.width);
  if (sizes.width < 1100) expect(sizes.tables.some(t => t.scroll > t.client)).toBe(true);
  const region = page.getByRole('region', { name: 'Historical rate table', exact: true });
  await page.getByRole('link', { name: 'Download CSV' }).focus();
  await page.keyboard.press('Tab');
  await expect(region).toBeFocused();
  expect(await region.evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe('none');
  if (await region.evaluate(el => el.scrollWidth > el.clientWidth)) {
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => region.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
  }
  await page.getByLabel('Owner uplift (%)').fill('10');
  await expect(page.getByRole('link', { name: 'Download CSV' })).toHaveCount(0);
  await expect(page.locator('#history-results')).toBeHidden();
  await expect(page.locator('#history-message')).toContainText('Settings changed');
  await generate(page);
  await expect(page.getByRole('table', { name: 'Historical rate table' })).toContainText('£165.00');
  const exported = await page.request.post('/api/admin/pricing/history/report/', { data: { ...body.report.input, upliftPercent: 0 } });
  expect(exported.status()).toBe(200);
  expect(exported.headers()['content-type']).toContain('text/csv');
  expect(exported.headers()['cache-control']).toBe('private, no-store');
  expect((await exported.text()).split('\r\n').filter(line => line.startsWith('"main-house","July"'))).toEqual(body.csv.split('\r\n').filter((line: string) => line.startsWith('"main-house","July"')));
  expect(errors).toEqual([]);
});

test('listing filters, empty and insufficient states and server validation are clear', async ({ page }) => {
  await openReport(page);
  await page.getByRole('combobox', { name: 'Listing', exact: true }).selectOption('cottage');
  await generate(page);
  await expect(page.getByRole('table', { name: 'Historical rate table' })).toContainText('Insufficient history');
  await expect(page.locator('.history-summary')).toContainText('1Eligible reservations');
  await page.getByRole('combobox', { name: 'Listing', exact: true }).selectOption('whole-property');
  await generate(page);
  await expect(page.getByText('No eligible historical reservations were found', { exact: false })).toBeVisible();
  await page.getByLabel('Historical start', { exact: true }).fill('2025-01-01');
  await page.getByLabel('Historical end (inclusive)').fill('2024-01-01');
  await page.getByRole('button', { name: 'Generate report' }).click();
  await expect(page.locator('#history-message')).toContainText('Choose a historical range');
  await expect(page.locator('#history-download')).toHaveCount(0);
  const blocked = await page.request.post('/api/admin/pricing/history/', { headers: { origin: 'https://example.invalid' }, data: {} });
  expect(blocked.status()).toBe(403);
});

test('exception editor supports continuation, overlap validation and safe report rendering', async ({ page }) => {
  await openReport(page);
  const targetYear = Number(await page.getByLabel('Target year', { exact: true }).inputValue());
  await page.getByText('Holiday and event exceptions', { exact: true }).click();
  await page.getByRole('button', { name: 'Add exception', exact: true }).click();
  await page.getByLabel('Exception name', { exact: true }).fill('Summer event');
  await page.getByLabel('Target period start', { exact: true }).fill(`${targetYear}-07-01`);
  await page.getByLabel('Target period end', { exact: true }).fill(`${targetYear}-07-07`);
  await page.getByLabel('Historical period start', { exact: true }).fill('2023-07-01');
  await page.getByLabel('Historical period end', { exact: true }).fill('2023-07-07');
  await page.getByRole('button', { name: 'Add historical period', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Historical period start', { exact: true }).nth(1)).toBeFocused();
  await page.getByLabel('Historical period start', { exact: true }).nth(1).fill('2023-07-07');
  await page.getByLabel('Historical period end', { exact: true }).nth(1).fill('2023-07-10');
  await page.getByRole('button', { name: 'Generate report' }).click();
  await expect(page.locator('#history-message')).toContainText('must not overlap');
  await page.getByRole('button', { name: 'Remove historical period', exact: true }).nth(1).click();
  await expect(page.getByRole('button', { name: 'Add historical period', exact: true })).toBeFocused();
  await generate(page);
  const row = page.getByRole('table', { name: 'Historical rate table' }).getByRole('row').filter({ has: page.getByRole('rowheader', { name: /^Summer event/ }) });
  await expect(row).toContainText('Insufficient history');
  await expect(row).toContainText('reference only');
  await page.getByRole('button', { name: 'Remove exception 1', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add exception', exact: true })).toBeFocused();
  await generate(page);
  await expect(page.getByRole('rowheader', { name: /^Summer event/ })).toHaveCount(0);
});

test('failed and superseded requests cannot leave a misleading report or download', async ({ page }) => {
  await openReport(page);
  await generate(page);
  await page.route('**/api/admin/pricing/history/', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'The historical report could not be calculated.' }) }));
  await page.getByRole('button', { name: 'Generate report' }).click();
  await expect(page.locator('#history-message')).toContainText('could not be calculated');
  await expect(page.locator('#history-results')).toBeHidden();
  await expect(page.locator('#history-download')).toHaveCount(0);
  await page.unroute('**/api/admin/pricing/history/');
  let release: (() => void) | undefined;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/admin/pricing/history/', async route => { const response = await route.fetch(); await gate; await route.fulfill({ response }); });
  await page.getByRole('button', { name: 'Generate report' }).click();
  await expect(page.locator('#history-message')).toContainText('Reading reservation evidence');
  await page.getByLabel('Owner uplift (%)').fill('15');
  const received = page.waitForResponse(r => r.url().endsWith('/api/admin/pricing/history/'));
  release!(); await received;
  await expect(page.locator('#history-message')).toContainText('Settings changed');
  await expect(page.locator('#history-results')).toBeHidden();
  await expect(page.locator('#history-download')).toHaveCount(0);
  await page.unroute('**/api/admin/pricing/history/');
  await generate(page);
  await expect(page.getByRole('table', { name: 'Historical rate table' })).toContainText('£173.00');
});
