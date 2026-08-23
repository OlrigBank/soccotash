import { expect, test } from '@playwright/test';

const PUBLIC_PAGES = [
  { path: '/', heading: 'Stay at Olrig Bank in Kendal' },
  { path: '/listings/', heading: 'Places to stay' },
  { path: '/guest-information/', heading: 'Guest information' },
  { path: '/contact/', heading: 'Contact' },
  { path: '/local-guide/', heading: 'Local guide' },
];

test.describe('soccotash public live smoke tests', () => {
  test('primary public navigation reaches the booking journey', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle('Olrig Bank');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Stay at Olrig Bank in Kendal' }),
    ).toBeVisible();

    await page.getByRole('link', { name: 'Request a stay' }).first().click();

    await expect(page).toHaveURL(/\/book\/$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Request a stay' }),
    ).toBeVisible();
  });

  for (const publicPage of PUBLIC_PAGES) {
    test(`public page ${publicPage.path} renders its principal heading`, async ({
      page,
    }) => {
      const response = await page.goto(publicPage.path);

      expect(response?.status()).toBe(200);
      await expect(
        page.getByRole('heading', { level: 1, name: publicPage.heading }),
      ).toBeVisible();
      await expect(page.getByRole('contentinfo')).toContainText('Olrig Bank');
    });
  }

  test('booking calendar responds to arrangement and month controls', async ({
    page,
  }) => {
    await page.goto('/book/');

    const arrangement = page.getByRole('combobox', { name: 'Stay arrangement' });
    const nextMonths = page.getByRole('button', { name: 'Show next months' });
    await expect(nextMonths).toBeEnabled({ timeout: 20_000 });

    const firstMonthBefore = await page
      .getByRole('heading', { level: 3 })
      .first()
      .textContent();

    await arrangement.selectOption({ label: 'Bespoke stay' });
    await expect(arrangement.locator('option:checked')).toHaveText('Bespoke stay');
    await expect(page.getByText(/Minimum stay: 1 night\./)).toBeVisible();
    await expect(page.locator('[data-calendar-picker]')).toBeHidden();
    await expect(page.getByLabel('Arrival')).toBeEditable();
    await expect(page.getByLabel('Departure')).toBeEditable();

    await arrangement.selectOption({ label: 'Olrig Bank' });
    await expect(page.getByText(/Minimum stay: 2 nights\./)).toBeVisible();
    await expect(page.locator('[data-calendar-picker]')).toBeVisible();
    await expect(
      page.locator('button[aria-label$=", available"]:not([disabled])').first(),
    ).toBeVisible({ timeout: 20_000 });

    await nextMonths.click();
    await expect
      .poll(async () =>
        page.getByRole('heading', { level: 3 }).first().textContent(),
      )
      .not.toBe(firstMonthBefore);
  });

  test('missing Booker contact is rejected before a booking can be created', async ({
    page,
  }) => {
    await page.goto('/book/');

    const result = await page.evaluate(async () => {
      const response = await fetch('/api/provisional-bookings/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          propertyId: 'main-house',
          arrival: '2099-01-01',
          departure: '2099-01-03',
          guests: 2,
          pets: 0,
          name: 'Live smoke test',
          email: '',
          telephone: '',
          whatsappConsent: false,
        }),
      });
      return { status: response.status, body: await response.json() };
    });

    expect(result.status).toBe(400);
    expect(result.body).toEqual({
      error:
        'Please provide an email address and/or a contact telephone number so that we can provide you with an offer.',
    });
  });

  test('an unknown route fails safely', async ({ page }) => {
    const response = await page.goto('/live-smoke-route-that-must-not-exist/');

    expect(response?.status()).toBe(404);
    await expect(page.locator('body')).not.toContainText(
      /stack trace|node_modules|database_url/i,
    );
  });
});
