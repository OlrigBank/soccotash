import { expect, test, type Page } from '@playwright/test';

// Read-only local fixtures: these tests never create a request or send a message.
const listings = [['olrig-bank', 'main-house'], ['cottage', 'cottage'], ['event', 'whole-property'], ['bespoke', 'bespoke-arrangement']] as const;
const panelSelector = '[data-compact-booking-panel]';
const browserFaults = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page, baseURL }) => {
  test.skip(!['localhost', '127.0.0.1'].includes(new URL(baseURL!).hostname), 'Quick Check response fixtures are local-only');
  const faults: string[] = [];
  browserFaults.set(page, faults);
  page.on('pageerror', error => faults.push(error.message));
  await page.route('**/api/provisional-bookings/**', route => {
    faults.push('Unexpected attempt to create a booking request');
    return route.abort();
  });
});
test.afterEach(async ({ page }) => {
  expect(browserFaults.get(page) ?? []).toEqual([]);
});
async function chooseDates(page: Page) {
  const panel = page.locator(panelSelector);
  await panel.locator('[data-compact-date-trigger]').click();
  await panel.getByRole('button', { name: 'Show next month' }).click();
  const days = panel.locator('[data-compact-calendar-days] button');
  await days.nth(9).click();
  await days.nth(13).click();
  await expect(panel.locator('[data-compact-date-calendar]')).toBeHidden();
}
async function fixtures(page: Page, outcome = 'available') {
  await page.route('**/api/availability/**', route => route.fulfill({ json: { blocks: outcome === 'unavailable' ? [{ start: '2030-01-01' }] : [] } }));
  await page.route('**/api/quote/**', route => route.fulfill({ json: outcome === 'host' ? { pricingAvailable: false, hostDecisionRequired: true } : { pricingAvailable: true, eligible: true, guestTotalPence: 123400, currency: 'GBP', nights: 4, lines: [] } }));
}

test('each listing has image-first Quick Check and keeps its arrangement fixed', async ({ page }) => {
  for (const [slug, property] of listings) {
    await page.goto(`/listings/${slug}/`);
    const panel = page.locator(panelSelector);
    await expect(panel).toHaveCount(1);
    await expect(panel.locator('[name="propertyId"]')).toHaveValue(property);
    await expect(panel.locator('select[name="propertyId"]')).toHaveCount(0);
    await expect(panel.locator('[data-compact-date-trigger]')).toBeVisible();
    const order = await page.evaluate(() => {
      const image = document.querySelector('.listing-hero-image')!.getBoundingClientRect();
      const band = document.querySelector('.quick-check-band')!;
      const description = document.querySelector('.listing-opening')!.getBoundingClientRect();
      return { imageBottom: image.bottom, bandTop: band.getBoundingClientRect().top, descriptionTop: description.top, position: getComputedStyle(band).position, overflow: document.documentElement.scrollWidth > innerWidth };
    });
    expect(order.overflow).toBe(false);
    if (page.viewportSize()!.width >= 700) {
      expect(order.position).toBe('relative');
      expect(order.bandTop).toBeGreaterThanOrEqual(order.imageBottom);
      expect(order.descriptionTop).toBeGreaterThan(order.bandTop);
    } else expect(order.position).toBe('fixed');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  }
});

test('generic public pages replace the mobile action without adding a desktop panel', async ({ page }) => {
  for (const path of ['/listings/', '/contact/', '/guest-information/', '/local-guide/']) {
    await page.goto(path);
    await expect(page.locator('.mobile-contact-bar')).toHaveCount(0);
    const panel = page.locator(panelSelector);
    await expect(panel).toHaveCount(1);
    if (page.viewportSize()!.width < 700) await expect(panel).toBeVisible();
    else await expect(panel).toBeHidden();
  }
  await page.goto('/book/');
  await expect(page.locator(panelSelector)).toHaveCount(0);
});

test('selection survives breakpoint changes, pop-ups return focus and Book continues', async ({ page }) => {
  await fixtures(page);
  await page.goto('/listings/cottage/');
  const panel = page.locator(panelSelector);
  await chooseDates(page);
  const arrival = await panel.locator('[name="arrival"]').inputValue();
  await panel.locator('[data-compact-guests] summary').click();
  await panel.getByRole('button', { name: 'Add children' }).click();
  await panel.getByRole('button', { name: 'Add pets' }).click();
  await panel.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(panel.locator('[data-compact-guests] summary')).toBeFocused();
  for (const width of [699, 700, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(panel.locator('[name="arrival"]')).toHaveValue(arrival);
    await expect(panel.locator('[name="children"]')).toHaveValue('1');
    await expect(panel.locator('[name="pets"]')).toHaveValue('1');
    await panel.locator('[data-compact-date-trigger]').click();
    await panel.getByRole('button', { name: 'Show next month' }).focus();
    await page.keyboard.press('Escape');
    await expect(panel.locator('[data-compact-date-calendar]')).toBeHidden();
    await expect(panel.locator('[data-compact-date-trigger]')).toBeFocused();
  }
  await panel.getByRole('button', { name: 'Quick Check', exact: true }).click();
  await expect(panel.locator('[data-compact-quick-total-value]')).toHaveText('£1,234.00');
  await expect(panel.locator('[data-compact-quick-stay]')).toContainText('Cottage at Olrig Bank');
  await expect(panel.locator('[data-compact-booking-submit]')).toHaveText('Book');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const clearance = await page.evaluate(() => ({ footer: document.querySelector('.footer-copyright')!.getBoundingClientRect().bottom, dock: document.querySelector('.quick-check-band')!.getBoundingClientRect().top }));
  expect(clearance.footer).toBeLessThanOrEqual(clearance.dock);
  await panel.getByRole('button', { name: 'Book', exact: true }).click();
  await expect(page).toHaveURL(/\/book\/\?/);
  const url = new URL(page.url());
  expect(url.searchParams.get('propertyId')).toBe('cottage');
  expect(url.searchParams.get('arrival')).toBe(arrival);
  expect(url.searchParams.get('children')).toBe('1');
  expect(url.searchParams.get('pets')).toBe('1');
});

test('validation, unavailable, host-priced and network-error results remain recoverable after resizing', async ({ page }) => {
  await fixtures(page, 'unavailable');
  await page.goto('/listings/olrig-bank/');
  const panel = page.locator(panelSelector);
  await page.setViewportSize({ width: 390, height: 844 });
  await panel.locator('[data-compact-booking-submit]').click();
  await expect(panel.locator('[data-compact-booking-status]')).toContainText('Choose a departure date');
  await page.keyboard.press('Escape');
  await chooseDates(page);
  await panel.locator('[data-compact-booking-submit]').click();
  await expect(panel.locator('[data-compact-booking-status]')).toContainText('unavailable');
  await page.keyboard.press('Escape');
  await fixtures(page, 'host');
  await panel.locator('[data-compact-booking-submit]').click();
  await expect(panel.getByRole('link', { name: 'Continue with request' })).toBeVisible();
  await expect(panel.locator('[data-compact-quick-total]')).toBeHidden();
  await page.keyboard.press('Escape');
  await page.route('**/api/availability/**', route => route.fulfill({ status: 503, json: { error: 'Calendar temporarily unavailable.' } }));
  await panel.locator('[data-compact-booking-submit]').click();
  await expect(panel.getByRole('link', { name: 'Continue to request form' })).toBeVisible();
  await expect(panel.locator('[name="arrival"]')).not.toHaveValue('');
});

test('Bespoke continues with preferred dates without availability or quote requests', async ({ page }) => {
  let checks = 0;
  await page.route(/\/api\/(availability|quote)\//, route => { checks++; return route.fulfill({ json: {} }); });
  await page.goto('/listings/bespoke/');
  await chooseDates(page);
  const panel = page.locator(panelSelector);
  await panel.locator('[data-compact-booking-submit]').click();
  await expect(panel.locator('[data-compact-booking-status]')).toContainText('Your dates are not reserved');
  await expect(panel.getByRole('link', { name: 'Start a bespoke request' })).toBeVisible();
  await expect(panel.locator('[data-compact-quick-total]')).toBeHidden();
  expect(checks).toBe(0);
});

test('generic Quick Check selects a stay and transfers dates and party to its listing', async ({ page }) => {
  await fixtures(page);
  await page.goto('/');
  await chooseDates(page);
  const panel = page.locator(panelSelector);
  await panel.locator('[data-compact-booking-submit]').click();
  const stay = panel.locator('[data-compact-quick-stay-value]');
  await expect(stay).toContainText('Cottage at Olrig Bank');
  const arrival = await panel.locator('[name="arrival"]').inputValue();
  await stay.click();
  await expect(page).toHaveURL(/\/listings\/cottage\/\?/);
  await expect(page.locator('[name="arrival"]')).toHaveValue(arrival);
  await expect(page.locator('[name="adults"]')).toHaveValue('2');
  await expect(page.locator('[name="propertyId"]')).toHaveValue('cottage');
});

test('changing guests invalidates a checked price and discards an in-flight response', async ({ page }) => {
  await fixtures(page);
  await page.goto('/listings/cottage/');
  await chooseDates(page);
  const panel = page.locator(panelSelector);
  await panel.locator('[data-compact-booking-submit]').click();
  await expect(panel.locator('[data-compact-quick-total]')).toBeVisible();
  await panel.locator('[data-compact-guests] summary').click();
  await panel.getByRole('button', { name: 'Add pets' }).click();
  await panel.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(panel.locator('[data-compact-quick-total]')).toBeHidden();
  await expect(panel.locator('[data-compact-booking-submit]')).toHaveText('Quick Check');

  let release!: () => void;
  let started!: () => void;
  const requested = new Promise<void>(resolve => { started = resolve; });
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/quote/**', async route => {
    started();
    await pending;
    await route.fulfill({ json: { pricingAvailable: true, guestTotalPence: 90000 } });
  });
  await panel.locator('[data-compact-booking-submit]').click();
  await requested;
  await page.keyboard.press('Escape');
  await panel.locator('[data-compact-guests] summary').click();
  await panel.getByRole('button', { name: 'Add pets' }).click();
  await panel.getByRole('button', { name: 'Done', exact: true }).click();
  release();
  await expect(panel.locator('[data-compact-booking-submit]')).toBeEnabled();
  await expect(panel.locator('[data-compact-quick-total]')).toBeHidden();
  await expect(panel.locator('[data-compact-booking-submit]')).toHaveText('Quick Check');
});

test('an existing host-priced result remains available when moving from desktop to mobile', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await fixtures(page, 'host');
  await page.goto('/listings/event/');
  await chooseDates(page);
  const panel = page.locator(panelSelector);
  await panel.locator('[data-compact-booking-submit]').click();
  await expect(panel.getByRole('link', { name: 'Continue with request' })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 800 });
  await expect(panel.getByRole('dialog', { name: 'Quick Check result' })).toBeVisible();
  await expect(panel.getByRole('link', { name: 'Continue with request' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});


test('a compact quoted result retains server occupancy and stay guidance', async ({ page }) => {
  await fixtures(page);
  await page.route('**/api/quote/**', route => route.fulfill({ json: { pricingAvailable: true, guestTotalPence: 123400, warnings: ['Please discuss the additional accommodation with Jenna.'] } }));
  await page.goto('/listings/event/');
  await chooseDates(page);
  const panel = page.locator(panelSelector);
  await panel.locator('[data-compact-booking-submit]').click();
  await expect(panel.locator('[data-compact-booking-status]')).toBeVisible();
  await expect(panel.locator('[data-compact-booking-status]')).toContainText('Please discuss the additional accommodation with Jenna.');
  await expect(panel.locator('[data-compact-quick-total-value]')).toHaveText('£1,234.00');
});


test('transferred invalid dates and counts do not break the picker or bypass minimum stays', async ({ page }) => {
  await page.goto('/listings/cottage/?arrival=invalid&departure=2026-99-99&adults=0&pets=-1');
  const panel = page.locator(panelSelector);
  await expect(panel.locator('[data-compact-arrival-label]')).toHaveText('Add date');
  await expect(panel.locator('[name="adults"]')).toHaveValue('2');
  await expect(panel.locator('[name="pets"]')).toHaveValue('0');
  const start = new Date();
  start.setUTCMonth(start.getUTCMonth() + 1, 10);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  await page.goto(`/listings/cottage/?arrival=${start.toISOString().slice(0, 10)}&departure=${end.toISOString().slice(0, 10)}`);
  await expect(panel.locator('[name="departure"]')).toHaveValue('');
  await expect(panel.locator('[data-compact-departure-label]')).toHaveText('Add date');
});
