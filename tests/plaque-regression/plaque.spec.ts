import { test, expect } from '@playwright/test';

async function collector(page, delay = 0) {
  await page.addInitScript(() => {
    window['collected'] = [];
  });
  await page.route('https://analytics.example.test/script.js', async route => {
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    await route.fulfill({ contentType: 'application/javascript', body: `window.umami = { track: payload => { window.collected.push(payload); return Promise.resolve(); } };` });
  });
}

test('plaque is usable at each viewport and links continue with attribution', async ({ page }) => {
  await collector(page);
  await page.goto('/plaque/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Olrig Bank');
  await expect(page.getByRole('heading', { name: 'What our guests say' })).toBeVisible();
  await expect(page.locator('main img')).toHaveCount(0);
  await expect(page.getByRole('note', { name: 'Airbnb guest rating' })).toContainText('out of 5 from 52 Airbnb guest reviews');
  await expect(page.getByRole('note', { name: 'Airbnb guest rating' }).locator('strong')).toHaveText('4.96');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  await expect.poll(() => page.evaluate(() => window['collected'].length)).toBe(1);
  await page.getByRole('link', { name: 'Olrig Bank', exact: true }).click();
  await expect(page).toHaveURL(/\/listings\/olrig-bank\/$/);
  await expect.poll(() => page.evaluate(() => window['collected'].length)).toBeGreaterThan(0);
  const views = await page.evaluate(() => window['collected']);
  expect(views[0]).toMatchObject({ url: '/listings/olrig-bank/', data: { entry_source: 'plaque' } });
  await page.goto('/book/');
  await expect.poll(() => page.evaluate(() => window['collected'].length)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window['collected'][0])).toMatchObject({ url: '/book/', data: { entry_source: 'plaque' } });
});

test('delayed tracker queues clicks, ready is idempotent and strips unsafe event fields', async ({ page }) => {
  await collector(page, 500);
  await page.goto('/plaque/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    document.querySelector('a[data-plaque-destination="main-house"]').addEventListener('click', event => event.preventDefault());
  });
  await page.getByRole('link', { name: 'Olrig Bank', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window['collected'].length)).toBe(2);
  await page.evaluate(() => {
    window.olrigAnalytics.ready();
    window.olrigAnalytics.track('booking_requested', { property: 'main-house', email: 'private@example.test', reference: 'private-reference' });
  });
  const events = await page.evaluate(() => window['collected']);
  expect(events.filter(item => !item.name)).toHaveLength(1);
  expect(events[1]).toMatchObject({ name: 'plaque_link_clicked', data: { destination: 'main-house', placement: 'stays', entry_source: 'plaque' } });
  expect(events[2].data).toEqual({ entry_source: 'plaque', property: 'main-house' });
  await page.reload();
  await expect.poll(() => page.evaluate(() => window['collected'].length)).toBe(1);
});

test('nested private routes and referrers cannot leak tokens or query values', async ({ page }) => {
  await collector(page);
  await page.route('**/booking/manage/disposable-secret/payment/**', async route => {
    await route.fulfill({ contentType: 'text/html', body: '<title>Private person: disposable-secret</title><script src="/analytics.js"></script><a href="/plaque/">Plaque</a>' });
  });
  await page.goto('/booking/manage/disposable-secret/payment/?booking=private-reference');
  await expect.poll(() => page.evaluate(() => window['collected'].length)).toBe(1);
  await page.evaluate(() => window.olrigAnalytics.track('payment_started', { property: 'cottage' }));
  const privateEvents = await page.evaluate(() => window['collected']);
  expect(privateEvents[0].url).toBe('/booking/manage');
  expect(JSON.stringify(privateEvents)).not.toMatch(/disposable-secret|private-reference|Private person/);
  await page.getByRole('link', { name: 'Plaque', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window['collected'].length)).toBe(1);
  expect(await page.evaluate(() => window['collected'][0].referrer)).toBe('http://127.0.0.1:8093/booking/manage');
});

test('blocked storage and blocked analytics leave navigation usable', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('Unavailable'); } }); });
  await page.route('https://analytics.example.test/**', route => route.abort());
  await page.goto('/plaque/');
  await page.getByRole('link', { name: 'Browse our Kendal local guide' }).click();
  await expect(page).toHaveURL(/\/local-guide\/$/);
});

test('expired attribution does not label unrelated visits', async ({ page }) => {
  await collector(page);
  await page.goto('/plaque/');
  await page.evaluate(() => sessionStorage.setItem('olrig:plaque-entry', String(Date.now() - 1800001)));
  await page.goto('/listings/');
  await expect.poll(() => page.evaluate(() => window['collected'].length)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window['collected'][0].data)).toEqual({});
});


test('fast onward navigation retains unsent pageviews and clicks', async ({ page }) => {
  await collector(page, 1500);
  await page.goto('/plaque/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('link', { name: 'Olrig Bank', exact: true }).click({ noWaitAfter: true });
  await expect(page).toHaveURL(/\/listings\/olrig-bank\/$/);
  await expect.poll(() => page.evaluate(() => window['collected'].length)).toBe(4);
  expect(await page.evaluate(() => window['collected'].map(item => item.name || item.url)))
    .toEqual(['/plaque/', 'plaque_link_clicked', '/listings/olrig-bank/', 'listing_viewed']);
});

test('without published reviews or configured analytics the page remains useful', async ({ page }) => {
  await page.goto('http://127.0.0.1:8095/plaque/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('note', { name: 'Airbnb guest rating' })).toHaveCount(0);
  await expect(page.locator('.guest-endorsement-strip')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Ways to stay' })).toBeVisible();
  expect(await page.evaluate(() => window.olrigAnalytics)).toBeUndefined();
  const response = await page.request.get('http://127.0.0.1:8095/analytics.js');
  expect(await response.text()).toBe('');
});

test('every plaque destination resolves and core content works without JavaScript', async ({ browser, request }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:8093/plaque/');
  const links = await page.locator('a[data-plaque-destination]').evaluateAll(links => [...new Set(links.map(link => link.getAttribute('href')))]);
  for (const href of links) expect((await request.get(href)).ok(), href).toBe(true);
  await page.getByRole('link', { name: 'Olrig Bank', exact: true }).click();
  await expect(page).toHaveURL(/\/listings\/olrig-bank\/$/);
  await context.close();
});
