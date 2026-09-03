import { expect, test } from '@playwright/test';

const expectedVisibleReviews = (width: number) => width >= 1000 ? 3 : width >= 520 ? 2 : 1;

const publicRoutes = [
  { path: '/', heading: 'Olrig Bank', status: 200 },
  { path: '/listings/', heading: 'Holiday accommodation at Olrig Bank', status: 200 },
  { path: '/listings/olrig-bank/', heading: 'Large group and family holiday house in Kendal', status: 200 },
  { path: '/local-guide/', heading: 'Local guide', status: 200 },
  { path: '/book/', heading: 'Request a stay', status: 200 },
  { path: '/e09-page-that-does-not-exist/', heading: 'Page not found', status: 404 },
] as const;

test.beforeEach(async ({ page }) => {
  const faults: string[] = [];
  page.on('console', (message) => {
    if (page.url().includes('/e09-page-that-does-not-exist/') && message.type() === 'error' && message.text().includes('404')) return;
    if (message.type() === 'error') faults.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => faults.push(`page: ${error.message}`));
  page.on('requestfailed', (request) => faults.push(`request: ${request.url()} (${request.failure()?.errorText})`));
  (page as typeof page & { publicExperienceFaults?: string[] }).publicExperienceFaults = faults;
});

test.afterEach(async ({ page }) => {
  const faults = (page as typeof page & { publicExperienceFaults?: string[] }).publicExperienceFaults ?? [];
  expect(faults, 'the public experience should not emit unexpected browser or network failures').toEqual([]);
});

test('protects the representative public journey and shared landmarks', async ({ page }) => {
  for (const route of publicRoutes) {
    const response = await page.goto(route.path);
    expect(response?.status(), route.path).toBe(route.status);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(route.heading);
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('contentinfo')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), route.path).toBe(false);
  }
});

test('retains keyboard-visible focus and moves from discovery into booking', async ({ page }) => {
  await page.goto('/listings/');
  await page.keyboard.press('Tab');
  const skipLink = page.getByRole('link', { name: 'Skip to main content' });
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();
  await skipLink.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();

  await page.getByRole('contentinfo').getByRole('link', { name: 'Check availability' }).click();
  await expect(page).toHaveURL(/\/book\/$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Request a stay' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Booking request progress' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});

test('renders the shared responsive shell without overflow', async ({ page }, testInfo) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle('Olrig Bank');
  await expect(page.getByRole('heading', { level: 1, name: 'Olrig Bank' })).toBeVisible();
  await expect(page.locator('.desktop-sidebar-wrap')).toHaveCount(0);
  await expect(page.locator('[data-compact-booking-panel]')).toHaveCount(1);
  await expect(page.getByRole('contentinfo')).toContainText('Olrig Bank');

  const menu = page.locator('.mobile-site-menu');
  await menu.locator('summary').click();
  await expect(page.getByRole('navigation', { name: 'Public navigation' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Public navigation' }).getByRole('link')).toHaveCount(7);

  const layout = await page.evaluate(() => {
    const hero = document.querySelector('.home-hero')?.getBoundingClientRect();
    const booking = document.querySelector('.home-booking-band')?.getBoundingClientRect();
    const ways = document.querySelector('#ways-to-stay')?.getBoundingClientRect();
    const reviews = document.querySelector('#guest-reviews')?.getBoundingClientRect();
    return {
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
      heroTop: hero?.top,
      bookingTop: booking?.top,
      waysTop: ways?.top,
      reviewsTop: reviews?.top,
    };
  });
  expect(layout.horizontalOverflow).toBe(false);
  expect(layout.heroTop).toBeLessThan(layout.waysTop ?? Infinity);
  expect(layout.waysTop).toBeLessThan(layout.reviewsTop ?? Infinity);

  const width = testInfo.project.use.viewport?.width ?? 0;
  if (width >= 700) expect(layout.bookingTop).toBeLessThan(layout.waysTop ?? Infinity);
  const bandPosition = await page.locator('.home-booking-band').evaluate((element) => getComputedStyle(element).position);
  expect(bandPosition).toBe(width < 700 ? 'fixed' : 'relative');
});

test('opens and closes the responsive Quick Check controls without submitting', async ({ page }, testInfo) => {
  await page.goto('/');
  const width = testInfo.project.use.viewport?.width ?? 0;
  const panel = page.locator('[data-compact-booking-panel]');
  const dateTrigger = panel.locator('[data-compact-date-trigger]');
  const calendar = panel.locator('[data-compact-date-calendar]');

  await dateTrigger.click();
  await expect(calendar).toBeVisible();
  await expect(dateTrigger).toHaveAttribute('aria-expanded', 'true');

  if (width < 700) {
    await expect(calendar).toHaveAttribute('role', 'dialog');
    await expect(calendar).toHaveAttribute('aria-modal', 'true');
    await panel.getByRole('button', { name: 'Close date selection' }).click();
    await expect(dateTrigger).toBeFocused();
  } else {
    await expect(calendar).not.toHaveAttribute('role', 'dialog');
    const nextMonth = panel.getByRole('button', { name: 'Show next month' });
    await nextMonth.focus();
    await nextMonth.press('Escape');
  }
  await expect(calendar).toBeHidden();

  const guests = panel.locator('[data-compact-guests]');
  const guestsSummary = guests.locator('summary');
  await guestsSummary.focus();
  await guestsSummary.press('Enter');
  await expect(panel.locator('.compact-guests__popover')).toBeVisible();
  await panel.getByRole('button', { name: 'Add children' }).click();
  await panel.getByRole('button', { name: 'Done' }).click();
  await expect(guests).not.toHaveAttribute('open', '');
  await expect(panel.locator('[data-compact-guests-summary]')).toContainText('1 child');
});

test('advances one review and preserves the selected item while resizing', async ({ page }, testInfo) => {
  await page.goto('/');
  const width = testInfo.project.use.viewport?.width ?? 0;
  const carousel = page.locator('[data-review-carousel]');
  const count = carousel.locator('[data-review-count]');
  const visibleSlides = carousel.locator('[data-review-slide]:not([inert])');

  await expect(count).toHaveText('Review 1 of 52');
  await expect(visibleSlides).toHaveCount(expectedVisibleReviews(width));
  await carousel.getByRole('button', { name: 'Show next review' }).click();
  await expect(count).toHaveText('Review 2 of 52');
  await carousel.focus();
  await carousel.press('ArrowRight');
  await expect(count).toHaveText('Review 3 of 52');

  const more = visibleSlides.locator('[data-review-more]').first();
  if (await more.count()) {
    await more.click();
    await expect(more).toHaveAttribute('aria-expanded', 'true');
    await expect(visibleSlides.locator('[data-review-more][aria-expanded="true"]')).toHaveCount(1);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(count).toHaveText('Review 3 of 52');
  await expect(visibleSlides).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test('keeps the desktop hero copy localised over the top-left trees', async ({ page }, testInfo) => {
  test.skip((testInfo.project.use.viewport?.width ?? 0) < 1000, 'desktop hero contract');
  await page.goto('/');

  const geometry = await page.evaluate(() => {
    const hero = document.querySelector('.home-hero')!.getBoundingClientRect();
    const copy = document.querySelector('.home-hero__copy')!.getBoundingClientRect();
    return {
      leftInset: copy.left - hero.left,
      topInset: copy.top - hero.top,
      widthRatio: copy.width / hero.width,
      fullImageOverlay: getComputedStyle(document.querySelector('.home-hero')!, '::after').content !== 'none',
    };
  });

  expect(geometry.leftInset).toBeLessThanOrEqual(2);
  expect(geometry.topInset).toBeLessThanOrEqual(2);
  expect(geometry.widthRatio).toBeLessThan(0.3);
  expect(geometry.fullImageOverlay).toBe(false);
});
