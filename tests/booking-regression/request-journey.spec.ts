import { test, expect } from '@playwright/test';

test('standard bookings continue from verified details and edit the same booking', async ({ page, context, baseURL }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/__request-preview/');
  await expect(page.locator('[data-progress-step="3"]')).toContainText('Make a payment');
  await page.getByLabel('Booker name').fill('Taylor Example');
  await page.getByLabel('Booker email').fill('journey@example.test');
  // Submit an obsolete reviewed version once to exercise real server revalidation.
  await page.route('**/api/provisional-bookings/', async route => {
    const input = route.request().postDataJSON();
    input.reviewedPricing.planVersion = -1;
    await route.continue({ postData: JSON.stringify(input) });
  }, { times: 1 });
  await page.getByRole('button', { name: 'Continue to payment', exact: true }).click();
  await expect(page.locator('[data-booking-status]')).toContainText('changed before submission');
  await expect(page.locator('[data-booking-contact]')).toBeVisible();
  const createResponse = page.waitForResponse(response => response.url().endsWith('/api/provisional-bookings/') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Continue to payment', exact: true }).click();
  const createdResponse = await createResponse;
  expect(createdResponse.status()).toBe(201);
  await expect(page).toHaveURL(/\/booking\/manage\/[^/]+\/payment\//);
  const created = { reference: new URL(page.url()).pathname.split('/')[3], customerReference: await page.locator('.payment-totals code').innerText() };
  await expect(page.locator('[name="journeyRevision"]')).toHaveValue('1');
  await expect(page.getByRole('heading', { name: 'Make a payment', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'View reservation details', exact: true })).toHaveCount(0);
  const paymentUrl = page.url();
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`booking=${created.reference}`));
  await expect(page.getByLabel('Booker name')).toHaveValue('Taylor Example');
  await page.getByRole('link', { name: 'Return to payment without saving' }).click();
  await expect(page).toHaveURL(paymentUrl);
  const stalePayment = await context.newPage();
  await stalePayment.goto(paymentUrl);
  await page.getByRole('link', { name: 'Edit contact details' }).click();
  await expect(page.getByLabel('Booker name')).toHaveValue('Taylor Example');
  await expect(page.getByLabel('Booker email')).toHaveValue('journey@example.test');
  const savedEditUrl = page.url();
  const staleDetails = await context.newPage();
  await staleDetails.goto(savedEditUrl);
  await page.getByLabel('Booker name').fill('Taylor Updated');
  await page.getByRole('button', { name: 'Save and continue to payment' }).click();
  await expect(page).toHaveURL(paymentUrl);
  await expect(page.getByRole('complementary', { name: 'Reservation summary' })).toContainText('Taylor Updated');
  await expect(page.getByRole('complementary', { name: 'Reservation summary' })).toContainText(created.customerReference);
  await staleDetails.getByLabel('Booker name').fill('Stale overwrite');
  await staleDetails.getByRole('button', { name: 'Save and continue to payment' }).click();
  await expect(staleDetails.locator('[data-booking-status]')).toContainText('another tab');
  await stalePayment.getByLabel('I have reviewed and accept the booking and cancellation terms and the content of the reservation summary.').check();
  await stalePayment.getByRole('button', { name: 'Pay £300.00 by card' }).click();
  await expect(stalePayment.getByRole('alert')).toContainText('This booking has changed');
  await page.reload();
  await expect(page.getByRole('link', { name: 'Edit contact details' })).toBeVisible();
  await staleDetails.close(); await stalePayment.close();

  await page.getByRole('link', { name: 'Edit stay dates and guests' }).click();
  await expect(page.locator('[data-stay-editor]')).toBeVisible();
  const departure = await page.locator('[name="departure"]').inputValue();
  const nextDeparture = new Date(`${departure}T12:00:00Z`);
  nextDeparture.setUTCDate(nextDeparture.getUTCDate() + 1);
  const arrival = await page.locator('[name="arrival"]').inputValue();
  await page.locator('[data-compact-date-trigger]').click();
  await page.locator(`[data-date="${arrival}"]`).click();
  await page.locator(`[data-date="${nextDeparture.toISOString().slice(0, 10)}"]`).click();
  await page.locator('[data-compact-booking-form] button[type="submit"]').click();
  await page.getByRole('button', { name: 'Book', exact: true }).click();
  await expect(page.getByLabel('Booker name')).toHaveValue('Taylor Updated');
  await page.getByRole('button', { name: 'Save and continue to payment' }).click();
  await expect(page).toHaveURL(paymentUrl);
  await expect(page.getByRole('complementary', { name: 'Reservation summary' })).toContainText('£1,500.00');
  await expect(page.getByRole('complementary', { name: 'Reservation summary' })).toContainText(created.customerReference);

  // Contact changes must still use verification, and retain the owning account.
  await page.getByRole('link', { name: 'Edit contact details' }).click();
  await page.getByLabel('Booker email').fill('changed@example.test');
  await expect(page.getByRole('button', { name: 'Save and continue to payment' })).toBeDisabled();
  await page.getByLabel('Booker name').focus();
  await page.getByRole('button', { name: 'Save and continue to payment' }).click();
  await expect(page).toHaveURL(paymentUrl);
  await expect(page.getByRole('complementary', { name: 'Reservation summary' })).toContainText('changed@example.test');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  // An unauthenticated caller cannot retrieve the saved contact form.
  const anonymous = await context.browser()!.newContext({ baseURL });
  const response = await anonymous.request.get(savedEditUrl, { maxRedirects: 0 });
  expect(response.status()).toBe(303);
  await anonymous.close();
});

test('bespoke requests and promo codes retain review and explicit submission', async ({ page }) => {
  for (const bespoke of [true, false]) {
    await page.goto(`/__request-preview/${bespoke ? '?bespoke=1' : ''}`);
    await page.getByLabel('Booker name').fill('Review Example');
    await page.getByLabel('Booker email').fill('journey@example.test');
    if (!bespoke) await page.getByLabel('Promo code (optional)').fill('REVIEW');
    await expect(page.locator('[data-progress-step="3"]')).toContainText('Review and send request');
    await page.getByRole('button', { name: 'Continue to review' }).click();
    await expect(page.locator('[data-booking-review]')).toBeVisible();
    await page.getByRole('button', { name: 'Request booking', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Your request is being reviewed' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Edit contact details' })).toHaveCount(0);
  }
});

for (const method of ['bank', 'card']) test(`accept the summary and terms when starting ${method} payment`, async ({ page, context }) => {
  await page.goto('/__request-preview/');
  await page.getByLabel('Booker name').fill('Payment Example');
  await page.getByLabel('Booker email').fill('journey@example.test');
  await page.getByRole('button', { name: 'Continue to payment', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Payment details' })).toBeVisible();
  await expect(page.getByText('Your offer is ready', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Accept offer and continue to payment' })).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: 'Reservation summary' })).toContainText('£300.00');
  if (method === 'bank') await page.getByRole('link', { name: 'Bank transfer', exact: true }).click();
  await expect(page.getByText('Disposable preview account')).toHaveCount(0);
  const action = page.getByRole('button', { name: method === 'bank' ? 'Request bank transfer details' : 'Pay £300.00 by card', exact: true });
  await action.click();
  const acceptance = page.getByRole('checkbox', { name: 'I have reviewed and accept the booking and cancellation terms and the content of the reservation summary.' });
  await expect(acceptance).toBeFocused();
  const hidden = await page.locator('.payment-method form').evaluate(form => Object.fromEntries(new FormData(form as HTMLFormElement)));
  const rejected = await context.request.post(page.url(), { form: hidden, headers: { origin: new URL(page.url()).origin } });
  expect(await rejected.text()).toContain('Confirm that you have reviewed and accept');
  await page.reload();
  await expect(page.getByRole('link', { name: 'Edit contact details' })).toBeVisible();
  await acceptance.check();
  await action.click();
  if (method === 'bank') {
    await expect(page.getByText('Disposable preview account')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Report bank transfer sent' })).toBeVisible();
    await page.getByRole('checkbox', { name: 'I confirm that I have sent this bank transfer.' }).check();
    await page.getByRole('button', { name: 'Report bank transfer sent' }).click();
    await expect(page).toHaveURL(/\/payment\/\?payment=bank-transfer-reported/);
    await expect(page.getByRole('heading', { name: 'Bank transfer awaiting verification' })).toBeVisible();
  } else await expect(page.getByRole('alert')).toContainText('Card');
  await expect(page.getByRole('link', { name: 'Edit contact details' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Reservation confirmed' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'View reservation details', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'send a booking message' })).toHaveAttribute('href', /\/messages\/$/);
  await page.reload();
  await expect(page.getByRole('checkbox', { name: /I have reviewed/ })).toHaveCount(0);
});
