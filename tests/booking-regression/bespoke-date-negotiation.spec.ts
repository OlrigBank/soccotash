import { expect, test } from '@playwright/test';
import pg from 'pg';
import type { Client as PgClient } from 'pg';

const { Client } = pg;
const ARRIVAL = '2099-08-15';
const DEPARTURE = '2099-08-16';
const EMAIL = 'playwright-bespoke-regression@example.test';
const BLOCK_UID_PREFIX = 'playwright-bespoke-regression';
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

    await adminPage.getByRole('button', { name: 'Reservation' }).click();
    await adminPage.getByRole('link', { name: 'Review requested dates in calendar' }).click();
    await expect(adminPage.getByText(`Requested: ${ARRIVAL} to ${DEPARTURE}`)).toBeVisible();
    await adminPage.getByRole('button', { name: 'Suggest dates and return to booking' }).click();
    await expect(adminPage.getByText("Awaiting the Booker's date decision")).toBeVisible();

    await page.reload();
    await page.getByRole('button', { name: 'Reservation' }).click();
    await expect(page.getByRole('heading', { name: 'Olrig Bank has suggested a change to your request' })).toBeVisible();
    await page.getByRole('button', { name: 'Keep my original dates' }).click();
    await expect(page.getByText('Your original dates were kept')).toBeVisible();

    await adminPage.goto(`/admin/bookings/${reference}/?reservation=open`);
    await adminPage.getByRole('link', { name: 'Review requested dates in calendar' }).click();
    for (const property of ['Main House', 'Cottage']) {
      const reason = adminPage.getByLabel(`Reason for allowing bespoke stays at ${property} on ${ARRIVAL}`);
      await reason.fill('Automated regression: honour the requested blocked night');
      adminPage.once('dialog', (dialog) => dialog.accept());
      await adminPage.getByRole('button', { name: `Allow bespoke · ${property}` }).click();
      await expect(adminPage.getByRole('button', { name: `Restore ${property}` })).toBeVisible();
    }

    await adminPage.getByRole('link', { name: 'Return to booking without changes' }).click();
    await adminPage.getByLabel('Agreed stay arrangement').selectOption('olrig-bank');
    await adminPage.getByRole('button', { name: 'Assign arrangement' }).click();
    await adminPage.getByLabel('Amount (£)').fill('100.00');
    await adminPage.getByRole('button', { name: 'Publish offer' }).click();
    await expect(adminPage.getByText(/offer.*published/i)).toBeVisible();

    await page.goto(bookerUrl);
    await page.getByRole('button', { name: 'Reservation' }).click();
    await page.getByLabel('I have reviewed and accept the dates, price and terms.').check();
    await page.getByRole('button', { name: 'Accept offer and continue to payment' }).click();
    await expect(page.getByText(/offer is accepted/i).first()).toBeVisible();
    await page.getByLabel('Reason for cancellation').fill('Automated regression completed');
    await page.getByLabel(/I confirm that I want to cancel this booking/).check();
    await page.getByRole('button', { name: 'Cancel booking' }).click();
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
