import { test, expect } from '@playwright/test';

test('unreceived transfers notify the Booker and reopen payment from the conversation', async ({ page, browser, baseURL }) => {
  const adminContext = await browser.newContext({ baseURL, viewport: page.viewportSize()! });
  const admin = await adminContext.newPage();
  const errors: string[] = [];
  for (const window of [page, admin]) window.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto('/__request-preview/');
    await page.getByLabel('Booker name').fill('Transfer Retry Example');
    await page.getByLabel('Booker email').fill('journey@example.test');
    await page.getByRole('button', { name: 'Continue to payment', exact: true }).click();
    await expect(page).toHaveURL(/\/payment\/$/);
    const reference = new URL(page.url()).pathname.split('/')[3];
    const home = `/booking/manage/${reference}/`;
    await page.getByRole('link', { name: 'Bank transfer', exact: true }).click();
    await page.getByRole('checkbox', { name: /I have reviewed/ }).check();
    await page.getByRole('button', { name: 'Request bank transfer details' }).click();
    await admin.goto('/__admin-preview/');
    // Cover both the initial deposit and a later balance, whose booking stays confirmed.
    for (const stage of ['deposit', 'balance']) {
      if (stage === 'balance') {
        await page.goto(`${home}payment/?method=bank`);
        await expect(page.getByRole('complementary', { name: 'Reservation summary' })).toContainText('£900.00');
      }
      await page.getByRole('checkbox', { name: 'I confirm that I have sent this bank transfer.' }).check();
      await page.getByRole('button', { name: 'Report bank transfer sent' }).click();
      await expect(page).toHaveURL(new RegExp(`${home}\\?payment=bank-transfer-reported`));
      await page.goto(`${home}messages/`);
      await expect(page.getByRole('link', { name: 'Make a payment', exact: true })).toHaveCount(0);
      await admin.goto('/admin/bookings/');
      const row = admin.locator(`tr[data-booking-href="/admin/bookings/${reference}/payment/"]`);
      await expect(row.getByRole('link', { name: `Check ${stage === 'balance' ? 'balance ' : ''}transfer received` })).toBeVisible();
      await row.getByRole('link', { name: /Check .*transfer received/ }).click();
      const send = admin.getByRole('button', { name: 'Send message and reopen payment' });
      await send.click();
      await expect(admin.getByLabel('Message to the Booker')).toBeFocused();
      const reason = `We checked the bank account and your ${stage} transfer has not been received. Please check with your bank.`;
      await admin.getByLabel('Message to the Booker').fill(reason);
      await send.click();
      await expect(admin.getByRole('heading', { name: 'No payment decision is currently required' })).toBeVisible();
      // An already-open message board receives the message and offers a refresh,
      // including for a rejected balance where the booking status is unchanged.
      await expect(page.locator('.booking-conversation')).toContainText(reason, { timeout: 15_000 });
      await page.getByRole('button', { name: 'Refresh this page' }).click();
      const retry = page.getByRole('link', { name: 'Make a payment', exact: true });
      await expect(retry).toHaveAttribute('href', `${home}payment/`);
      await retry.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('button', { name: /Pay £.* by card/ })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Edit contact details' })).toHaveCount(0);
      await page.getByRole('link', { name: 'Bank transfer', exact: true }).click();
      await expect(page.getByText('Disposable preview account')).toHaveCount(0);
      await page.getByRole('button', { name: 'Request bank transfer details' }).click();
      await expect(page.getByText('Disposable preview account')).toBeVisible();
      await expect(page.getByRole('checkbox', { name: 'I confirm that I have sent this bank transfer.' })).not.toBeChecked();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.getByRole('checkbox', { name: 'I confirm that I have sent this bank transfer.' }).check();
      await page.getByRole('button', { name: 'Report bank transfer sent' }).click();
      await expect(page).toHaveURL(new RegExp(`${home}\\?payment=bank-transfer-reported`));
      await admin.goto('/admin/bookings/');
      await row.getByRole('link', { name: /Check .*transfer received/ }).click();
      await expect(admin.locator('tbody tr').filter({ hasText: reason })).toContainText('rejected');
      await expect(admin.locator('tbody tr').filter({ hasText: 'Awaiting verification' })).toHaveCount(1);
      await admin.getByRole('checkbox', { name: 'I have verified the transfer against the bank account.' }).check();
      await admin.getByRole('button', { name: stage === 'deposit' ? 'Verify deposit and confirm booking' : 'Verify balance payment' }).click();
    }
    await page.goto(`${home}messages/`);
    await expect(page.getByRole('link', { name: 'Make a payment', exact: true })).toHaveCount(0);
    await expect(admin.locator('tbody tr .status-rejected')).toHaveCount(2);
    await expect(admin.locator('tbody tr .status-verified')).toHaveCount(2);
    expect(errors).toEqual([]);
  } finally { await adminContext.close(); }
});

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
    await expect(page).toHaveURL(/\/booking\/manage\/[^/]+\/\?payment=bank-transfer-reported/);
    await expect(page.getByText('Bank transfer reported. Olrig Bank will verify the payment before confirming your booking.', { exact: true }).first()).toBeVisible();
  } else await expect(page.getByRole('alert')).toContainText('Card');
  await expect(page.getByRole('link', { name: 'Edit contact details' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Reservation confirmed' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'View reservation details', exact: true })).toHaveCount(0);
  if (method === 'card') await expect(page.getByRole('link', { name: 'send a booking message' })).toHaveAttribute('href', /\/messages\/$/);
  await page.reload();
  await expect(page.getByRole('checkbox', { name: /I have reviewed/ })).toHaveCount(0);
});

test('administrator can edit and publish Ruskins with its bundled image', async ({ page }) => {
  await page.goto('/__admin-preview/');
  await page.goto('/admin/local-guide/');
  await page.getByRole('button', { name: 'Edit Ruskins Bar', exact: true }).click();
  const editor = page.locator('[data-entry-dialog]');
  const image = editor.locator('[name="imagePath"]');
  await expect(image).toHaveValue('/media/images/local-guide/ruskins.png');
  expect(await image.evaluate(element => (element as HTMLInputElement).checkValidity())).toBe(true);
  await editor.locator('[name="summary"]').fill('A local bar with its existing bundled image.');
  const saved = page.waitForResponse(response => response.url().endsWith('/api/admin/local-guide/action/') && response.request().method() === 'POST');
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  expect((await saved).status()).toBe(200);
  await expect(editor).not.toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  const published = page.waitForResponse(response => response.url().endsWith('/api/admin/local-guide/workspace/') && response.request().method() === 'POST');
  const publishedReload = page.waitForEvent('framenavigated', { predicate: frame => frame === page.mainFrame() });
  await page.getByRole('button', { name: 'Publish Local Guide', exact: true }).click();
  expect((await published).status()).toBe(200);
  await publishedReload;
  await page.waitForLoadState('domcontentloaded');
  await page.goto('/local-guide/ruskins/');
  await expect(page.getByRole('heading', { level: 1, name: 'Ruskins Bar' })).toBeVisible();
  await expect(page.locator('img[src="/media/images/local-guide/ruskins.png"]').first()).toBeVisible();
});
