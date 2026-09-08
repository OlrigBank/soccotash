import { expect, test, type Page } from '@playwright/test';

const url = '/book/?propertyId=main-house&arrival=2026-10-19&departure=2026-10-23&adults=6&children=0&infants=0&pets=0';
const panel = '[data-compact-booking-panel]';
const quote = { pricingAvailable: true, eligible: true, guestTotalPence: 173000, currency: 'GBP', nights: 4, plan: { id: 'fixture', version: 1 }, lines: [{ label: 'Accommodation', amountPence: 158000 }, { label: 'Cleaning', amountPence: 15000 }] };
const blocks = [{ startsOn: '2026-10-24', endsOn: '2026-10-30' }];

test.beforeEach(async ({ page, baseURL }) => {
  test.skip(!['localhost', '127.0.0.1'].includes(new URL(baseURL!).hostname), 'Local-only response fixtures');
  await page.clock.install({ time: new Date('2026-09-08T12:00:00Z') });
  await page.route('**/api/availability/**', route => {
    const params = new URL(route.request().url()).searchParams;
    return route.fulfill({ json: { blocks: blocks.filter(block => block.startsOn < params.get('to')! && block.endsOn > params.get('from')!) } });
  });
  await page.route('**/api/quote/**', route => route.fulfill({ json: quote }));
  // No request is created by these UI tests, even on an unexpected submission.
  await page.route('**/api/provisional-bookings/**', route => route.fulfill({ status: 500, json: { error: 'Fixture: request not saved.' } }));
});

async function openDates(page: Page) {
  await page.locator('[data-compact-date-trigger]').click();
  await expect(page.locator('[data-compact-calendar-months]')).toHaveAttribute('aria-busy', 'false');
}
async function continueToDetails(page: Page) {
  await page.getByRole('button', { name: 'Book', exact: true }).click();
  await expect(page.getByRole('form', { name: 'Send your request' })).toBeFocused();
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  expect(await page.evaluate(() => {
    const shell = document.querySelector('.mobile-first-shell')!;
    return /auto|scroll/.test(getComputedStyle(shell).overflowY) && shell.scrollHeight > shell.clientHeight;
  })).toBe(false);
}

test('incoming stay is freshly checked and continues inline to validated request details', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  let checks = 0; await page.route('**/api/quote/**', route => { checks++; return route.fulfill({ json: quote }); });
  await page.goto(url);
  await expect(page.locator('[data-compact-quick-total-value]')).toHaveText('£1,730.00');
  expect(checks).toBe(1);
  await expect(page.locator(panel)).toHaveCount(1);
  await expect(page.locator('form form')).toHaveCount(0);
  await expect(page.locator('[data-booking-contact]')).toBeHidden();
  await noOverflow(page);
  await continueToDetails(page);
  await expect(page).toHaveURL(url);
  await expect(page.locator('[data-pet-details]')).toBeHidden();
  await page.getByRole('button', { name: 'Request booking' }).click();
  await expect(page.getByLabel('Booker name')).toBeFocused();
  await page.getByLabel('Booker name').fill('Disposable browser fixture');
  await page.getByRole('button', { name: 'Request booking' }).click();
  await expect(page.getByLabel('Booker email')).toBeFocused();
  await page.getByLabel('Booker telephone').fill('01632 960123');
  const request = page.waitForRequest('**/api/provisional-bookings/**');
  await page.getByRole('button', { name: 'Request booking' }).click();
  expect((await request).postDataJSON()).toMatchObject({ propertyId: 'main-house', adults: 6, pets: 0, petDetails: [], reviewedPricing: { planId: 'fixture', planVersion: 1, guestTotalPence: 173000 } });
  await expect(page.locator('[data-booking-status]')).toHaveText('Fixture: request not saved.');
  expect(errors).toEqual([]);
});

test('calendar shows two months, blocks occupied nights and permits a boundary departure', async ({ page }) => {
  await page.goto(url); await openDates(page);
  await expect(page.locator('[data-compact-calendar-months] h3')).toHaveText(['October 2026', 'November 2026']);
  await expect(page.locator('[data-date="2026-10-25"]')).toBeDisabled();
  await page.locator('[data-date="2026-10-22"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-date="2026-10-22"]')).toBeFocused();
  await expect(page.locator('[data-date="2026-10-24"]')).toHaveAccessibleName(/available as departure/);
  await page.locator('[data-date="2026-10-23"]').click();
  await expect(page.locator('[data-compact-calendar-message]')).toContainText('at least 2 nights');
  await page.locator('[data-date="2026-10-31"]').click();
  await expect(page.locator('[data-compact-calendar-message]')).toContainText('unavailable nights');
  await page.locator('[data-date="2026-10-24"]').click();
  await expect(page.locator('[name="departure"]')).toHaveValue('2026-10-24');
  await expect(page.locator('[data-compact-date-trigger]')).toBeFocused();
  await openDates(page); await noOverflow(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-compact-date-calendar]')).toBeHidden();
  await expect(page.locator('[data-compact-date-trigger]')).toBeFocused();
});

test('two-month picker selects across months and navigates across the year boundary', async ({ page }) => {
  await page.goto(url); await openDates(page);
  await page.locator('[data-date="2026-10-31"]').click();
  await page.locator('[data-date="2026-11-03"]').click();
  await expect(page.locator('[name="departure"]')).toHaveValue('2026-11-03');
  await openDates(page);
  await page.getByRole('button', { name: 'Show next month' }).click();
  await page.getByRole('button', { name: 'Show next month' }).click();
  await expect(page.locator('[data-compact-calendar-months] h3')).toHaveText(['December 2026', 'January 2027']);
});

test('availability errors, retry and refreshed conflicts preserve selected dates', async ({ page }) => {
  await page.goto(url);
  await expect(page.getByRole('button', { name: 'Book', exact: true })).toBeVisible();
  await page.route('**/api/availability/**', route => route.fulfill({ status: 503, json: { error: 'Offline fixture' } }));
  await openDates(page);
  await expect(page.locator('[data-compact-calendar-availability]')).toContainText('could not be loaded');
  await expect(page.locator('[data-date="2026-10-19"]')).toBeDisabled();
  await page.route('**/api/availability/**', route => route.fulfill({ json: { blocks: [{ startsOn: '2026-10-20', endsOn: '2026-10-22' }], refreshWarning: 'Latest refresh failed.' } }));
  await page.getByRole('button', { name: 'Retry availability' }).click();
  await expect(page.locator('[data-compact-calendar-availability]')).toContainText('no longer available');
  await expect(page.locator('[data-compact-calendar-availability]')).toContainText('Latest refresh failed');
  await expect(page.locator('[name="arrival"]')).toHaveValue('2026-10-19');
  await expect(page.locator('[data-compact-quick-total]')).toBeHidden();
});

test('changing stay rejects obsolete calendar responses', async ({ page }) => {
  await page.goto(url);
  let release: () => void = () => {}; const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/availability/**', async route => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get('property') === 'main-house') { await pending; return route.fulfill({ json: { blocks: [{ startsOn: '2026-10-01', endsOn: '2026-12-01' }] } }); }
    return route.fulfill({ json: { blocks: [] } });
  });
  await page.locator('[data-compact-date-trigger]').click();
  await expect(page.locator('[data-compact-calendar-months]')).toHaveAttribute('aria-busy', 'true');
  // Native select operation while the separate date pop-up is open.
  await page.getByRole('combobox', { name: 'Stay', exact: true }).selectOption('whole-property');
  await expect(page.locator('[data-compact-calendar-months]')).toHaveAttribute('aria-busy', 'false');
  release();
  await expect(page.locator('[data-date="2026-10-19"]')).toBeEnabled();
  await expect(page.locator('[data-compact-calendar-availability]')).not.toContainText('no longer available');
});

test('pet answers and contact details survive edits and rechecking', async ({ page }) => {
  await page.goto(url.replace('pets=0', 'pets=1')); await continueToDetails(page);
  await page.getByLabel('Booker name').fill('Retained fixture');
  await page.locator('[data-pet-breed]').fill('Labrador');
  await page.locator('[data-compact-guests] summary').click();
  await noOverflow(page);
  await page.getByRole('button', { name: 'Add children' }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Request booking' })).toBeDisabled();
  await page.locator('[data-compact-booking-submit]').click(); await continueToDetails(page);
  await expect(page.getByLabel('Booker name')).toHaveValue('Retained fixture');
  await expect(page.locator('[data-pet-breed]')).toHaveValue('Labrador');
  await page.locator('[data-compact-guests] summary').click();
  await page.getByRole('button', { name: 'Remove pets' }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.locator('[data-compact-booking-submit]').click(); await continueToDetails(page);
  await expect(page.locator('[data-pet-details]')).toBeHidden();
  await expect(page.locator('[data-pet-row]')).toHaveCount(0);
});

test('changed quote needs another explicit submission and safe continuation uses returned private path', async ({ page }) => {
  await page.goto(url); await continueToDetails(page);
  await page.getByLabel('Booker name').fill('Changed quote fixture');
  await page.getByLabel('Booker telephone').fill('01632 960123');
  let submissions = 0;
  const privatePath = `/booking/manage/${'fixture'.repeat(7)}/`;
  await page.route('**/api/provisional-bookings/**', route => {
    submissions++;
    if (submissions === 1) return route.fulfill({ status: 409, json: { error: 'Price changed. Review the new total.', quote: { ...quote, guestTotalPence: 180000, plan: { id: 'fixture', version: 2 } } } });
    expect(route.request().postDataJSON().reviewedPricing).toMatchObject({ guestTotalPence: 180000, planVersion: 2 });
    return route.fulfill({ status: 201, json: { managePath: privatePath } });
  });
  await page.route(`**${privatePath}`, route => route.fulfill({ contentType: 'text/html', body: '<h1>Disposable continuation fixture</h1>' }));
  await page.getByRole('button', { name: 'Request booking' }).click();
  await expect(page.locator('[data-booking-submit-review]')).toContainText('£1,800.00');
  await expect(page.locator('[data-booking-submit-review]')).toBeFocused();
  expect(submissions).toBe(1);
  await expect(page.getByLabel('Booker name')).toHaveValue('Changed quote fixture');
  await page.getByRole('button', { name: 'Request booking' }).click();
  await expect(page).toHaveURL(privatePath);
  await page.reload(); await expect(page.getByRole('heading')).toHaveText('Disposable continuation fixture');
});

test('Bespoke uses neutral two-month dates and continues without live checks', async ({ page }) => {
  let checks = 0; await page.route(/\/api\/(availability|quote)\//, route => { checks++; return route.abort(); });
  await page.goto(url.replace('main-house', 'bespoke-arrangement'));
  await openDates(page);
  await expect(page.locator('[data-compact-calendar-months] h3')).toHaveCount(2);
  await expect(page.locator('[data-date="2026-10-25"]')).toBeEnabled();
  await expect(page.locator('[data-compact-calendar-availability]')).toContainText('Preferred dates only');
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: 'Start a bespoke request' }).click();
  await expect(page.locator('[data-booking-contact]')).toBeVisible();
  expect(checks).toBe(0);
});

test('empty generic selection shows current and next month with no availability claims', async ({ page }) => {
  await page.goto('/book/'); await openDates(page);
  await expect(page.locator('[data-compact-calendar-months] h3')).toHaveText(['September 2026', 'October 2026']);
  await expect(page.locator('[data-compact-calendar-availability]')).toHaveText('Choose a stay to see its unavailable dates.');
  await noOverflow(page);
});

test('responsive calendar stays inside the page at the dock breakpoint', async ({ page }) => {
  for (const route of [url, '/listings/cottage/?arrival=2026-10-19&departure=2026-10-23&adults=2&children=0&infants=0&pets=0']) {
    await page.goto(route);
    for (const width of [699, 700]) {
      await page.setViewportSize({ width, height: 900 });
      await openDates(page);
      await noOverflow(page);
      await expect(page.locator('[data-compact-calendar-months] h3')).toHaveCount(2);
      await page.keyboard.press('Escape');
    }
  }
});

test('automatic stay selection refreshes an already open neutral calendar', async ({ page }) => {
  let release: () => void = () => {};
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/availability/**', async route => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get('from') === '2026-10-19' && params.get('to') === '2026-10-23') {
      await pending;
      return route.fulfill({ json: { blocks: [] } });
    }
    return route.fulfill({ json: { blocks } });
  });
  await page.goto(url.replace('propertyId=main-house&', '').replace('adults=6', 'adults=2'));
  await openDates(page);
  await expect(page.locator('[data-compact-calendar-availability]')).toContainText('Choose a stay');
  release();
  await expect(page.locator('[name="propertyId"]')).toHaveValue('cottage');
  await expect(page.locator('[data-date="2026-10-25"]')).toBeDisabled();
  await expect(page.locator('[data-date="2026-10-25"]')).toHaveAccessibleName(/unavailable/);
});
