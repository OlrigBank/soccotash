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

test('each listing has image-first Quick Check and defaults to its own arrangement', async ({ page }) => {
  for (const [slug, property] of listings) {
    await page.goto(`/listings/${slug}/`);
    const panel = page.locator(panelSelector);
    await expect(panel).toHaveCount(1);
    await expect(panel.locator('[name="propertyId"]')).toHaveValue(property);
    await expect(panel.getByRole('combobox', { name: 'Stay', exact: true })).toHaveValue(property);
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
  await expect(panel.locator('[data-compact-stay-select]')).toHaveValue('cottage');
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

test('the Stay link preserves the complete checked panel and Book continues to server revalidation', async ({ page }) => {
  await fixtures(page);
  let quoteChecks = 0;
  await page.route('**/api/quote/**', route => {
    quoteChecks++;
    return route.fulfill({ json: { pricingAvailable: true, guestTotalPence: 123400, currency: 'GBP', warnings: ['Please discuss your pet requirements with Jenna.'] } });
  });
  await page.goto('/?adults=2&children=1&infants=1&pets=2');
  await chooseDates(page);
  const panel = page.locator(panelSelector);
  await panel.locator('[data-compact-booking-submit]').click();
  await expect(panel.locator('[data-compact-stay-select]')).toHaveValue('cottage');
  const displayedResult = () => panel.evaluate(element => ({
    stay: element.querySelector<HTMLSelectElement>('[data-compact-stay-select]')?.selectedOptions[0].textContent,
    counts: [...element.querySelectorAll<HTMLInputElement>('[name="adults"], [name="children"], [name="infants"], [name="pets"]')].map(input => [input.name, input.value]),
    text: ['arrival-label', 'departure-label', 'guests-summary', 'quick-total-value', 'quick-stay-value', 'quick-message', 'booking-submit', 'booking-status'].map(name => element.querySelector(`[data-compact-${name}]`)?.textContent),
  }));
  const original = await displayedResult();
  await panel.locator('[data-compact-quick-stay-value]').click();
  await expect(page).toHaveURL(/\/listings\/cottage\/\?/);
  await expect(panel.locator('[data-compact-booking-submit]')).toHaveText('Book');
  expect(await displayedResult()).toEqual(original);
  expect(quoteChecks).toBe(1);
  await expect(panel.locator('[name="propertyId"]')).toHaveValue('cottage');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await panel.locator('[data-compact-booking-submit]').click();
  await expect(page).toHaveURL(/\/book\/\?/);
  await expect.poll(() => quoteChecks).toBe(2);
});

for (const storedState of ['missing', 'expired', 'mismatched', 'malformed', 'disabled'] as const) {
  test(`the listing refreshes automatically when saved state is ${storedState}`, async ({ page }) => {
    await fixtures(page);
    let quoteChecks = 0;
    await page.route('**/api/quote/**', route => {
      quoteChecks++;
      return route.fulfill({ json: { pricingAvailable: true, guestTotalPence: quoteChecks === 1 ? 123400 : 145600, currency: 'GBP' } });
    });
    if (storedState === 'disabled') await page.addInitScript(() => {
      Object.defineProperty(window, 'sessionStorage', { get() { throw new DOMException('Storage disabled', 'SecurityError'); } });
    });
    await page.goto('/');
    await chooseDates(page);
    const panel = page.locator(panelSelector);
    await panel.locator('[data-compact-booking-submit]').click();
    await expect(panel.locator('[data-compact-quick-total-value]')).toHaveText('£1,234.00');
    if (storedState !== 'disabled') await page.evaluate(state => {
      const key = 'olrig-quick-check-result';
      if (state === 'missing') sessionStorage.removeItem(key);
      else if (state === 'malformed') sessionStorage.setItem(key, '{bad JSON');
      else {
        const saved = JSON.parse(sessionStorage.getItem(key)!);
        if (state === 'expired') saved.checkedAt = Date.now() - 16 * 60 * 1000;
        else saved.selection = '/book/?propertyId=main-house';
        sessionStorage.setItem(key, JSON.stringify(saved));
      }
    }, storedState);
    await panel.locator('[data-compact-quick-stay-value]').click();
    await expect(panel.locator('[data-compact-quick-total-value]')).toHaveText('£1,456.00');
    await expect(panel.locator('[data-compact-booking-submit]')).toHaveText('Book');
    expect(quoteChecks).toBe(2);
  });
}

test('a restored host-priced estimate keeps the same total, guidance and action', async ({ page }) => {
  await fixtures(page);
  await page.route('**/api/quote/**', route => route.fulfill({ json: { pricingAvailable: false, estimatedPricing: { guestTotalPence: 89000, currency: 'GBP' } } }));
  await page.goto('/');
  await chooseDates(page);
  const panel = page.locator(panelSelector);
  await panel.locator('[data-compact-booking-submit]').click();
  await expect(panel.locator('[data-compact-quick-total-value]')).toHaveText('£890.00');
  const guidance = await panel.locator('[data-compact-booking-status]').textContent();
  await panel.locator('[data-compact-quick-stay-value]').click();
  await expect(panel.locator('[data-compact-quick-total-value]')).toHaveText('£890.00');
  await expect(panel.locator('[data-compact-booking-submit]')).toHaveText('Book');
  await expect(panel.locator('[data-compact-booking-status]')).toHaveText(guidance!);
  await page.keyboard.press('Escape');
  await panel.locator('[data-compact-guests] summary').click();
  await panel.getByRole('button', { name: 'Add pets' }).click();
  await panel.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(panel.locator('[data-compact-quick-total]')).toBeHidden();
  await expect(panel.locator('[data-compact-booking-submit]')).toHaveText('Quick Check');
});

test('an expired result cannot retain Book when the dates have become unavailable', async ({ page }) => {
  await fixtures(page);
  await page.goto('/');
  await chooseDates(page);
  const panel = page.locator(panelSelector);
  await panel.locator('[data-compact-booking-submit]').click();
  await expect(panel.locator('[data-compact-quick-total]')).toBeVisible();
  await page.evaluate(() => {
    const saved = JSON.parse(sessionStorage.getItem('olrig-quick-check-result')!);
    saved.checkedAt = 0;
    sessionStorage.setItem('olrig-quick-check-result', JSON.stringify(saved));
  });
  await fixtures(page, 'unavailable');
  await panel.locator('[data-compact-quick-stay-value]').click();
  await expect(panel.locator('[data-compact-booking-status]')).toContainText('unavailable');
  await expect(panel.locator('[data-compact-quick-total]')).toBeHidden();
  await expect(panel.locator('[data-compact-booking-submit]')).toHaveText('Quick Check');
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

async function stayPriceFixtures(page: Page) {
  const requests: Array<Record<string, unknown>> = [];
  await fixtures(page);
  await page.route('**/api/quote/**', route => {
    const input = route.request().postDataJSON();
    requests.push(input);
    const totals: Record<string, number> = { cottage: 100000, 'main-house': 200000, 'whole-property': 300000 };
    return route.fulfill({ json: { pricingAvailable: true, guestTotalPence: totals[input.propertyId], currency: 'GBP' } });
  });
  return requests;
}

test('the active result follows ordinary navigation and listing entry changes and rechecks the stay', async ({ page }) => {
  const requests = await stayPriceFixtures(page);
  await page.goto('/?adults=2&children=1&infants=1&pets=2');
  await chooseDates(page);
  const panel = page.locator(panelSelector);
  await panel.locator('[data-compact-booking-submit]').click();
  await expect(panel.locator('[data-compact-quick-total-value]')).toHaveText('£1,000.00');
  const arrival = await panel.locator('[name="arrival"]').inputValue();
  for (const path of ['/contact/', '/guest-information/', '/local-guide/', '/', '/listings/cottage/']) {
    await page.goto(path);
    await expect(panel).toBeVisible();
    await expect(panel.locator('[data-compact-stay-select]')).toHaveValue('cottage');
    await expect(panel.locator('[data-compact-quick-total-value]')).toHaveText('£1,000.00');
    await expect(panel.locator('[name="arrival"]')).toHaveValue(arrival);
    await expect(panel.locator('[name="children"]')).toHaveValue('1');
    await expect(panel.locator('[name="infants"]')).toHaveValue('1');
    await expect(panel.locator('[name="pets"]')).toHaveValue('2');
    await expect(panel.locator('[data-compact-booking-submit]')).toHaveText('Book');
  }
  expect(requests).toHaveLength(1);
  await page.goto('/listings/olrig-bank/');
  await expect(panel.locator('[data-compact-stay-select]')).toHaveValue('main-house');
  await expect(panel.locator('[data-compact-quick-total-value]')).toHaveText('£2,000.00');
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual({ ...requests[0], propertyId: 'main-house' });
  await page.goto('/');
  await expect(panel.locator('[data-compact-stay-select]')).toHaveValue('main-house');
  await expect(panel.locator('[data-compact-quick-total-value]')).toHaveText('£2,000.00');
  await page.goBack();
  await expect(panel.locator('[data-compact-quick-total-value]')).toHaveText('£2,000.00');
  await page.goBack();
  await expect(panel.locator('[data-compact-stay-select]')).toHaveValue('cottage');
  await expect(panel.locator('[data-compact-quick-total-value]')).toHaveText('£1,000.00');
  expect(requests).toHaveLength(3);
});

test('Stay dropdown rechecks the unchanged party and dates and keeps the manual choice on the landing page', async ({ page }) => {
  const requests = await stayPriceFixtures(page);
  await page.goto('/listings/cottage/?adults=2&children=1&infants=1&pets=2');
  await chooseDates(page);
  const panel = page.locator(panelSelector);
  await panel.locator('[data-compact-booking-submit]').click();
  await expect(panel.locator('[data-compact-quick-total-value]')).toHaveText('£1,000.00');
  const selector = panel.getByRole('combobox', { name: 'Stay', exact: true });
  await selector.selectOption('whole-property');
  await expect(panel.locator('[data-compact-quick-total-value]')).toHaveText('£3,000.00');
  expect(requests[1]).toEqual({ ...requests[0], propertyId: 'whole-property' });
  await expect(panel.getByRole('link', { name: 'View stay: Olrig Bank++' })).toHaveAttribute('href', /\/listings\/event\//);
  await page.goto('/');
  await expect(selector).toHaveValue('whole-property');
  await expect(panel.locator('[data-compact-quick-total-value]')).toHaveText('£3,000.00');
  expect(requests).toHaveLength(2);
  await selector.selectOption('main-house');
  await expect(panel.locator('[data-compact-quick-total-value]')).toHaveText('£2,000.00');
  expect(requests[2]).toEqual({ ...requests[0], propertyId: 'main-house' });
});

test('unavailable stay changes clear the previous quote, remain selected and can recover', async ({ page }) => {
  await stayPriceFixtures(page);
  await page.goto('/listings/cottage/');
  await chooseDates(page);
  const panel = page.locator(panelSelector);
  await panel.locator('[data-compact-booking-submit]').click();
  await expect(panel.locator('[data-compact-quick-total]')).toBeVisible();
  await fixtures(page, 'unavailable');
  await panel.getByRole('combobox', { name: 'Stay', exact: true }).selectOption('main-house');
  await expect(panel.locator('[data-compact-booking-status]')).toContainText('unavailable');
  await expect(panel.locator('[data-compact-quick-total]')).toBeHidden();
  await page.goto('/contact/');
  await expect(panel.locator('[data-compact-stay-select]')).toHaveValue('main-house');
  await expect(panel.locator('[data-compact-booking-status]')).toContainText('unavailable');
  await expect(panel.locator('[data-compact-quick-total]')).toBeHidden();
  await page.keyboard.press('Escape');
  await stayPriceFixtures(page);
  await panel.getByRole('combobox', { name: 'Stay', exact: true }).selectOption('cottage');
  await expect(panel.locator('[data-compact-quick-total-value]')).toHaveText('£1,000.00');
});

test('a late quote cannot overwrite a newer Stay dropdown choice', async ({ page }) => {
  await stayPriceFixtures(page);
  await page.goto('/listings/cottage/');
  await chooseDates(page);
  const panel = page.locator(panelSelector);
  let release!: () => void;
  let started!: () => void;
  const requested = new Promise<void>(resolve => { started = resolve; });
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/quote/**', async route => {
    const propertyId = route.request().postDataJSON().propertyId;
    if (propertyId === 'main-house') { started(); await pending; }
    await route.fulfill({ json: { pricingAvailable: true, guestTotalPence: propertyId === 'main-house' ? 200000 : 300000 } });
  });
  await panel.getByRole('combobox', { name: 'Stay', exact: true }).selectOption('main-house');
  await requested;
  await page.keyboard.press('Escape');
  await panel.getByRole('combobox', { name: 'Stay', exact: true }).selectOption('whole-property');
  await expect(panel.locator('[data-compact-quick-total-value]')).toHaveText('£3,000.00');
  const lateResponse = page.waitForResponse(response => response.url().includes('/api/quote/') && response.request().postDataJSON().propertyId === 'main-house');
  release();
  await lateResponse;
  await expect(panel.locator('[data-compact-quick-total-value]')).toHaveText('£3,000.00');
  await page.goto('/contact/');
  await expect(panel.locator('[data-compact-stay-select]')).toHaveValue('whole-property');
  await expect(panel.locator('[data-compact-quick-total-value]')).toHaveText('£3,000.00');
});

test('Stay dropdown can enter and leave Bespoke without claiming an availability check', async ({ page }) => {
  const requests = await stayPriceFixtures(page);
  await page.goto('/listings/cottage/');
  await chooseDates(page);
  const panel = page.locator(panelSelector);
  await panel.getByRole('combobox', { name: 'Stay', exact: true }).selectOption('bespoke-arrangement');
  await expect(panel.locator('[data-compact-booking-status]')).toContainText('Your dates are not reserved');
  await expect(panel.locator('[data-compact-quick-total]')).toBeHidden();
  expect(requests).toHaveLength(0);
  await page.goto('/');
  await expect(panel.locator('[data-compact-stay-select]')).toHaveValue('bespoke-arrangement');
  await expect(panel.locator('[data-compact-booking-status]')).toContainText('Your dates are not reserved');
  await page.keyboard.press('Escape');
  await panel.getByRole('combobox', { name: 'Stay', exact: true }).selectOption('cottage');
  await expect(panel.locator('[data-compact-quick-total-value]')).toHaveText('£1,000.00');
  expect(requests).toHaveLength(1);
});

test('edited dates and guest counts survive navigation without resurrecting the previous quote', async ({ page }) => {
  const requests = await stayPriceFixtures(page);
  await page.goto('/listings/cottage/');
  await chooseDates(page);
  const panel = page.locator(panelSelector);
  await panel.locator('[data-compact-booking-submit]').click();
  await expect(panel.locator('[data-compact-quick-total]')).toBeVisible();
  await panel.locator('[data-compact-guests] summary').click();
  await panel.getByRole('button', { name: 'Add pets' }).click();
  await panel.getByRole('button', { name: 'Done', exact: true }).click();
  await chooseDates(page);
  const arrival = await panel.locator('[name="arrival"]').inputValue();
  await page.goto('/contact/');
  await expect(panel.locator('[name="arrival"]')).toHaveValue(arrival);
  await expect(panel.locator('[name="pets"]')).toHaveValue('1');
  await expect(panel.locator('[data-compact-booking-submit]')).toHaveText('Book');
  expect(requests).toHaveLength(2);
  expect(requests[1].arrival).toBe(arrival);
  expect(requests[1].pets).toBe(1);
});

test('changing to a listing with a longer minimum stay retains dates and explains the restriction', async ({ page }) => {
  const requests = await stayPriceFixtures(page);
  const start = new Date();
  start.setUTCMonth(start.getUTCMonth() + 1, 10);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  const arrival = start.toISOString().slice(0, 10);
  const departure = end.toISOString().slice(0, 10);
  await page.goto(`/listings/bespoke/?arrival=${arrival}&departure=${departure}`);
  const panel = page.locator(panelSelector);
  await panel.locator('[data-compact-booking-submit]').click();
  await page.goto('/listings/olrig-bank/');
  await expect(panel.locator('[data-compact-stay-select]')).toHaveValue('main-house');
  await expect(panel.locator('[name="arrival"]')).toHaveValue(arrival);
  await expect(panel.locator('[name="departure"]')).toHaveValue(departure);
  await expect(panel.locator('[data-compact-booking-status]')).toContainText('at least 2 nights');
  await expect(panel.locator('[data-compact-quick-total]')).toBeHidden();
  expect(requests).toHaveLength(0);
});
