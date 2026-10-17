import { test, expect } from '@playwright/test';

test('admin creates an offline request ready for review and payment without signing in as the booker', async ({ page, context }, info) => {
  await page.goto('/__admin-preview/');
  await page.getByRole('link', { name: 'Create booking', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Create booking from a request' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Create booking', exact: true }).click();
  expect(await page.locator('input[name=name]').evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true);
  await page.getByLabel('Name', { exact: true }).fill('Alex Offline');
  await page.getByLabel('Email address', { exact: true }).fill('offline@example.test');
  await page.getByRole('combobox', { name: 'Accommodation', exact: true }).selectOption('cottage');
  const month = String(info.project.name === 'phone' ? 3 : info.project.name === 'tablet' ? 4 : 5).padStart(2, '0');
  await page.getByLabel('Arrival', { exact: true }).fill(`2098-${month}-10`);
  await page.getByLabel('Departure', { exact: true }).fill(`2098-${month}-14`);
  await page.getByRole('button', { name: 'Create booking', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Booking created. No message has been sent.' })).toBeVisible();
  const reference = page.url().match(/bookings\/([^/]+)\//)![1];
  expect((await context.cookies()).some(cookie => cookie.name === 'olrig_booker_session')).toBe(false);
  await page.goto(`/admin/bookings/${reference}/access/`);
  await expect(page.getByText('Awaiting verification of email: offline@example.test')).toBeVisible();
  await page.goto(`/admin/bookings/${reference}/customer-view/`);
  await expect(page.getByText(/Alex Offline/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Offer & reservation', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Booking offer ready', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Current offer', exact: true })).toBeVisible();
  await expect(page.locator('body')).toContainText('£1,200.00');
  await page.goto(`/booking/manage/${reference}/payment/`);
  await expect(page).toHaveURL(/\/booking\/\?returnTo=/);
  // The same dates cannot be silently entered twice.
  await page.goto('/admin/bookings/new/');
  const response = await page.request.post('/admin/bookings/new/', { form: {
    name: 'Another Booker', email: 'another@example.test', propertyId: 'cottage',
    arrival: `2098-${month}-10`, departure: `2098-${month}-14`, adults: '1', children: '0', infants: '0', stage: 'payment',
  } });
  expect(response.status()).toBe(409);
  expect(await response.text()).toContain('Those dates are no longer available.');
});

test('validation retains inputs and mobile-only bespoke requests can be saved for review', async ({ page }) => {
  await page.goto('/__admin-preview/');
  await page.goto('/admin/bookings/new/');
  await page.getByLabel('Name', { exact: true }).fill('Mobile Booker');
  await page.getByLabel('Mobile number', { exact: true }).fill('+447700900123');
  await page.getByRole('combobox', { name: 'Accommodation', exact: true }).selectOption('bespoke-arrangement');
  await page.getByLabel('Arrival', { exact: true }).fill('2098-10-10');
  await page.getByLabel('Departure', { exact: true }).fill('2098-10-14');
  await page.getByRole('button', { name: 'Create booking', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Save for review');
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Mobile Booker');
  await page.getByRole('radio', { name: /Save for review/ }).check();
  await page.getByRole('button', { name: 'Create booking', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Booking created.' })).toBeVisible();
  await page.goto(page.url().split('?')[0] + 'access/');
  await expect(page.getByText('Awaiting verification of mobile: +447700900123')).toBeVisible();
});

test('anonymous and cross-origin creation are rejected', async ({ page }) => {
  await page.goto('/admin/bookings/new/');
  await expect(page).toHaveURL(/\/admin\/login/);
  await page.goto('/__admin-preview/');
  const response = await page.request.post('/admin/bookings/new/', { headers: { Origin: 'https://unrelated.example' }, form: {} });
  expect(response.status()).toBe(403);
});
