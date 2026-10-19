import { expect, test } from '@playwright/test';
import { parseExportCsv, readReservationArchive } from '../../site/tests/pricing/reservation-export-fixtures';

const endpoint = '/api/admin/pricing/history/reservations/export/';

test('reservation archives require authentication and reject cross-origin export requests', async ({ page, request }) => {
  const anonymous = await request.post(endpoint);
  expect(anonymous.status()).toBe(401);
  expect(anonymous.headers()['cache-control']).toBe('private, no-store');
  await page.goto('/__pricing-history-preview/');
  const forbidden = await page.request.post(endpoint, { headers: { origin: 'https://example.invalid' } });
  expect(forbidden.status()).toBe(403);
});

test('keyboard download contains all reservations independent of report settings and preserves the report workflow', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/__pricing-history-preview/');
  const panel = page.getByRole('region', { name: 'Export imported reservation data' });
  await expect(panel).toContainText('all listings and dates');
  await page.getByRole('combobox', { name: 'Listing', exact: true }).selectOption('cottage');
  await page.getByLabel('Historical start', { exact: true }).fill('2025-01-01');
  await page.getByLabel('Historical end (inclusive)').fill('2024-01-01');
  const button = page.getByRole('button', { name: 'Download reservation CSVs (ZIP)' });
  await button.focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
  await expect(button).toBeFocused();
  expect(await button.evaluate(e => getComputedStyle(e).outlineStyle)).not.toBe('none');
  const downloaded = page.waitForEvent('download');
  const responsePromise = page.waitForResponse(r => r.url().endsWith(endpoint));
  await page.keyboard.press('Enter');
  const [download, response] = await Promise.all([downloaded, responsePromise]);
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toBe('private, no-store');
  expect(response.headers()['content-type']).toBe('application/zip');
  expect(response.headers()['x-content-type-options']).toBe('nosniff');
  expect(download.suggestedFilename()).toMatch(/^airbnb-reservation-evidence-\d{4}-\d{2}-\d{2}\.zip$/);
  const stream = await download.createReadStream(), chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const files = readReservationArchive(Buffer.concat(chunks));
  const index = parseExportCsv(files['reservations.csv']);
  const financial = parseExportCsv(files['financial-lines.csv']);
  expect(index).toHaveLength(24); expect(Object.keys(files)).toHaveLength(27);
  expect(index.some(r => r.property_id === 'main-house')).toBe(true);
  expect(index.some(r => r.property_id === 'cottage')).toBe(true);
  expect(index.some(r => r.normalised_status === 'cancelled')).toBe(true);
  expect(index.some(r => r.normalised_status === 'unknown')).toBe(true);
  expect(financial.some(r => r.row_kind === 'reservation_only')).toBe(true);
  expect(financial.some(r => r.source_item_type === 'adjustment' && r.parent_line_id)).toBe(true);
  expect(index.flatMap(r => parseExportCsv(files[`reservations/${r.reservation_id}.csv`]))).toEqual(financial);
  expect(Object.values(files).join('')).not.toContain('PRIVATE_FIXTURE_GUEST');
  await expect(page.locator('#reservation-export-message')).toContainText('24 reservation files');
  await expect(button).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // The archive export never validates or modifies the separate report form.
  await page.getByLabel('Historical start', { exact: true }).fill('2023-01-01');
  await page.getByLabel('Historical end (inclusive)').fill('2025-12-31');
  await page.getByRole('button', { name: 'Generate report' }).click();
  await expect(page.getByRole('link', { name: 'Download CSV', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('progress, empty, failure and size-limit states allow retry without a stale download', async ({ page }) => {
  await page.goto('/__pricing-history-preview/');
  const button = page.getByRole('button', { name: 'Download reservation CSVs (ZIP)' });
  const message = page.locator('#reservation-export-message');
  let release: (() => void) | undefined;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**${endpoint}`, async route => { await gate; await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'No imported reservations are available to export.' }) }); });
  await button.click();
  await expect(button).toBeDisabled();
  await expect(message).toContainText('Preparing all imported');
  await expect(page.locator('#reservation-export-form')).toHaveAttribute('aria-busy', 'true');
  release!();
  await expect(message).toContainText('No imported reservations');
  await expect(button).toBeEnabled();
  for (const status of [503, 422]) {
    await page.unroute(`**${endpoint}`);
    await page.route(`**${endpoint}`, route => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ error: status === 422 ? 'The reservation evidence exceeds the export size limit.' : 'The reservation export could not be created. Please try again.' }) }));
    await button.click();
    await expect(message).toContainText(status === 422 ? 'size limit' : 'could not be created');
    await expect(button).toBeEnabled();
    await expect(page.locator('#reservation-export-form')).toHaveAttribute('aria-busy', 'false');
  }
  await page.unroute(`**${endpoint}`);
  const download = page.waitForEvent('download'); await button.click(); await download;
  await expect(message).toContainText('Download started');
});
