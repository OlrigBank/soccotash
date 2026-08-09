import { expect, test } from '@playwright/test';
import pg from 'pg';
import type { Client as PgClient } from 'pg';

const { Client } = pg;
const ARRIVAL = '2099-08-15';
const DEPARTURE = '2099-08-16';
const EMAIL = 'playwright-bespoke-regression@example.test';
const BLOCK_UID_PREFIX = 'playwright-bespoke-regression';
const PRICING_PLAN_NAME = 'Playwright booking regression payment terms';
const ADMIN_EMAIL = process.env.BOOKING_REGRESSION_ADMIN_EMAIL || 'playwright-admin@example.test';
const ADMIN_PASSWORD = process.env.BOOKING_REGRESSION_ADMIN_PASSWORD || 'playwright-admin-password';

async function withDatabase<T>(run: (client: PgClient) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try { return await run(client); } finally { await client.end(); }
}

async function cleanRegressionData() {
  await withDatabase(async (client) => {
    await client.query('BEGIN');
    try {
      await client.query(
        `DELETE FROM calendar_availability_overrides
         WHERE provisional_booking_id IN (SELECT id FROM provisional_bookings WHERE guest_email = $1)`,
        [EMAIL],
      );
      await client.query(`DELETE FROM provisional_bookings WHERE guest_email = $1`, [EMAIL]);
      await client.query(`DELETE FROM booking_blocks WHERE external_uid LIKE $1`, [`${BLOCK_UID_PREFIX}:%`]);
      await client.query(`DELETE FROM pricing_plans WHERE name = $1`, [PRICING_PLAN_NAME]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}

test.describe('bespoke blocked-date negotiation', () => {
  test.beforeEach(async () => {
    await cleanRegressionData();
    await withDatabase(async (client) => {
      const plan = await client.query(
        `INSERT INTO pricing_plans (property_id, name, status, currency, version, published_at)
         VALUES ('whole-property', $1, 'published', 'GBP', 1, NOW()) RETURNING id`,
        [PRICING_PLAN_NAME],
      );
      await client.query(
        `INSERT INTO pricing_rules
           (plan_id, type, name, position, priority, enabled, stackable, stacking_group, conditions, action)
         VALUES
           ($1, 'deposit_percentage', 'Regression deposit', 10, 100, TRUE, FALSE, 'payment-terms', '{}', '{"percentage":25}'),
           ($1, 'initial_payment_deadline', 'Regression initial deadline', 20, 100, TRUE, FALSE, 'payment-terms', '{}', '{"days":7}'),
           ($1, 'balance_payment_deadline', 'Regression balance deadline', 30, 100, TRUE, FALSE, 'payment-terms', '{}', '{"days":42}')`,
        [plan.rows[0].id],
      );
      for (const propertyId of ['main-house', 'cottage']) {
        await client.query(
          `INSERT INTO booking_blocks (property_id, source, external_uid, starts_on, ends_on)
           VALUES ($1, 'airbnb', $2, $3, $4)`,
          [propertyId, `${BLOCK_UID_PREFIX}:${propertyId}`, ARRIVAL, DEPARTURE],
        );
      }
    });
  });

  test.afterEach(async () => { await cleanRegressionData(); });

  test('restores blocked dates after a negotiated bespoke offer is cancelled', async ({ browser, page }) => {
    await page.goto('/book/');
    await page.getByRole('combobox', { name: 'Stay arrangement' }).selectOption('bespoke-arrangement');
    await page.getByLabel('Arrival').fill(ARRIVAL);
    await page.getByLabel('Departure').fill(DEPARTURE);
    await page.getByLabel('Guests').fill('4');
    await page.getByLabel('Pets').fill('0');
    await page.getByRole('button', { name: 'Continue with request' }).click();
    await page.getByLabel('Booker name').fill('Playwright Bespoke Regression');
    await page.getByLabel('Booker email').fill(EMAIL);
    await page.getByRole('button', { name: 'Request booking' }).click();
    await expect(page).toHaveURL(/\/booking\/manage\/[A-Za-z0-9_-]+\/$/);
    const bookerUrl = page.url();

    const adminContext = await browser.newContext({ locale: 'en-GB', timezoneId: 'Europe/London' });
    const adminPage = await adminContext.newPage();
    await adminPage.goto('/admin/login/');
    await adminPage.getByLabel('Email address').fill(ADMIN_EMAIL);
    await adminPage.getByLabel('Password').fill(ADMIN_PASSWORD);
    await adminPage.getByRole('button', { name: 'Sign in' }).click();
    await adminPage.goto('/admin/bookings/');
    const bookingRow = adminPage.getByRole('row').filter({ hasText: 'Playwright Bespoke Regression' });
    await bookingRow.getByRole('link', { name: /Review|Open/ }).first().click();
    const reference = new URL(adminPage.url()).pathname.split('/').filter(Boolean).at(-1)!;

    await adminPage.getByRole('link', { name: /Reservation/ }).click();
    await adminPage.getByRole('link', { name: 'Review requested dates in calendar' }).click();
    await expect(adminPage.getByText(`Requested: ${ARRIVAL} to ${DEPARTURE}`)).toBeVisible();
    await adminPage.getByRole('button', { name: 'Suggest dates and return to booking' }).click();
    await expect(adminPage.getByText("Awaiting the Booker's date decision")).toBeVisible();

    await page.reload();
    await page.getByRole('link', { name: /Reservation/ }).click();
    await expect(page.getByRole('heading', { name: 'Olrig Bank has suggested a change to your request' })).toBeVisible();
    await page.getByRole('button', { name: 'Keep my original dates' }).click();
    await expect(page.getByText('Your original dates were kept')).toBeVisible();

    await adminPage.goto(`/admin/bookings/${reference}/reservation/`);
    await adminPage.getByRole('link', { name: 'Review requested dates in calendar' }).click();
    for (const property of ['Main House', 'Cottage']) {
      const reason = adminPage.getByLabel(`Reason for allowing bespoke stays at ${property} on ${ARRIVAL}`);
      await reason.fill('Automated regression: honour the requested blocked night');
      adminPage.once('dialog', (dialog) => dialog.accept());
      await adminPage.getByRole('button', { name: `Allow bespoke · ${property}` }).click();
      await expect(adminPage.getByRole('button', { name: `Restore ${property}` })).toBeVisible();
    }

    await adminPage.getByRole('link', { name: 'Return to booking without changes' }).click();
    await adminPage.getByLabel('Agreed stay arrangement').selectOption({ label: 'Olrig Bank' });
    await adminPage.getByRole('button', { name: 'Assign arrangement' }).click();
    await adminPage.getByRole('link', { name: /Reservation/ }).click();
    await adminPage.getByLabel('Amount (£)').fill('100.00');
    await adminPage.getByRole('button', { name: 'Publish offer' }).click();
    await expect(adminPage.getByRole('status').filter({ hasText: 'The offer is published on the Booker booking page.' })).toBeVisible();

    await page.goto(bookerUrl);
    await page.getByRole('link', { name: /Reservation/ }).click();
    await page.getByLabel('I have reviewed and accept the dates, price and terms.').check();
    await page.getByRole('button', { name: 'Accept offer and continue to payment' }).click();
    await expect(page.getByText(/offer is accepted/i).first()).toBeVisible();
    const cancellationForm = page.locator('form').filter({ has: page.locator('input[name="action"][value="cancel-booking"]') });
    await cancellationForm.getByLabel('Reason for cancellation').fill('Automated regression completed');
    await cancellationForm.getByLabel(/I confirm that I want to cancel this booking/).evaluate((checkbox: HTMLInputElement) => {
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await cancellationForm.evaluate((form: HTMLFormElement) => form.requestSubmit());
    await expect(page.getByText('Your cancellation has been recorded')).toBeVisible();
    await adminContext.close();

    const state = await withDatabase(async (client) => {
      const booking = await client.query(`SELECT status FROM provisional_bookings WHERE public_id = $1`, [reference]);
      const overrides = await client.query(
        `SELECT property_id FROM calendar_availability_overrides WHERE provisional_booking_id = (SELECT id FROM provisional_bookings WHERE public_id = $1)`,
        [reference],
      );
      const blockers = await client.query(
        `SELECT property_id FROM booking_blocks WHERE external_uid LIKE $1 ORDER BY property_id`,
        [`${BLOCK_UID_PREFIX}:%`],
      );
      return { status: booking.rows[0]?.status, overrides: overrides.rowCount, blockers: blockers.rows.map((row) => row.property_id) };
    });
    expect(state).toEqual({ status: 'cancelled', overrides: 0, blockers: ['cottage', 'main-house'] });
  });
});
