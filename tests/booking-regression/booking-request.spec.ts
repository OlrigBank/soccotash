import { test, expect } from '@playwright/test';
import pg from 'pg';
import { randomUUID } from 'node:crypto';

test('E11 persists a non-notifying request and resumes its private page', async ({ page }) => {
  const name = `E11 disposable ${randomUUID()}`;
  const database = new pg.Client({
    host: '127.0.0.1', port: 5433,
    user: process.env.POSTGRES_USER || 'soccotash',
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB || 'soccotash',
  });
  await database.connect();
  try {
    // Far-future Bespoke dates do not affect standard availability or create a hold.
    await page.goto('/book/?propertyId=bespoke-arrangement&arrival=2099-10-19&departure=2099-10-23&adults=3&children=1&infants=1&pets=1');
    await page.getByRole('link', { name: 'Start a bespoke request' }).click();
    await page.getByLabel('Booker name').fill(name);
    await page.getByLabel('Booker telephone').fill('+441632960123');
    await expect(page.getByLabel('Booker email')).toHaveValue('');
    await expect(page.locator('#whatsapp-consent')).not.toBeChecked();
    await page.locator('[data-pet-species]').selectOption('cat');
    await page.locator('[data-pet-breed]').fill('Disposable pet fixture');
    await page.getByRole('button', { name: 'Request booking' }).click();
    await expect(page.getByRole('banner')).toContainText('Private stay area');
    const saved = await database.query(`SELECT id, property_id, adults, children, infants, pets,
      guest_email, whatsapp_consent_status FROM provisional_bookings WHERE guest_name=$1`, [name]);
    expect(saved.rows).toHaveLength(1);
    expect(saved.rows[0]).toMatchObject({ property_id: 'bespoke-arrangement', adults: 3, children: 1, infants: 1, pets: 1 });
    expect(saved.rows[0].guest_email || '').toBe('');
    expect(saved.rows[0].whatsapp_consent_status).not.toBe('active');
    const pets = await database.query('SELECT species, breed FROM booking_pets WHERE provisional_booking_id=$1', [saved.rows[0].id]);
    expect(pets.rows).toEqual([{ species: 'cat', breed: 'Disposable pet fixture' }]);
    const deliveries = await database.query(`SELECT d.status FROM booking_notification_deliveries d
      JOIN booking_notification_events e ON e.id=d.notification_event_id WHERE e.provisional_booking_id=$1`, [saved.rows[0].id]);
    expect(deliveries.rows.length).toBeGreaterThan(0);
    expect(deliveries.rows.every(row => ['skipped', 'not_requested'].includes(row.status))).toBe(true);
    await page.reload();
    await expect(page.getByRole('banner')).toContainText('Private stay area');
    await expect(page.getByRole('navigation', { name: 'Your booking' })).toBeVisible();
  } finally {
    await database.query('DELETE FROM provisional_bookings WHERE guest_name=$1', [name]);
    await database.end();
  }
});
