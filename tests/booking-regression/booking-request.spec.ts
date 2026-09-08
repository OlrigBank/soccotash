import { test, expect } from '@playwright/test';
import pg from 'pg';
import { randomUUID, randomBytes, createHash } from 'node:crypto';

// Keep private fixture links and disposable administrator sessions out of recordings
// even when this spec is discovered by the wider CI regression configuration.
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

test('E11 persists a non-notifying request and resumes its private page', async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw new Error('Booking request fixtures require a local service.');
  const name = `E11 disposable ${randomUUID()}`;
  const adminEmail = `e11-${randomUUID()}@example.test`;
  const connectionString = process.env.DATABASE_URL;
  if (connectionString && !['localhost', '127.0.0.1'].includes(new URL(connectionString).hostname)) {
    throw new Error('Booking request fixtures require a local database.');
  }
  const database = new pg.Client(connectionString ? { connectionString } : {
    host: '127.0.0.1', port: 5433,
    user: process.env.POSTGRES_USER || 'soccotash',
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB || 'soccotash',
  });
  await database.connect();
  try {
    for (const promoCode of ['x'.repeat(81), { unexpected: 'object' }]) {
      const response = await page.request.post('/api/provisional-bookings/', {
        headers: { origin },
        data: { propertyId: 'bespoke-arrangement', arrival: '2099-10-19', departure: '2099-10-23', adults: 2, children: 0, infants: 0, pets: 0, name, telephone: '+441632960123', promoCode },
      });
      expect(response.status()).toBe(400);
      expect((await response.json()).error).toContain('promo code');
    }
    // Far-future Bespoke dates do not affect standard availability or create a hold.
    await page.goto('/book/?propertyId=bespoke-arrangement&arrival=2099-10-19&departure=2099-10-23&adults=3&children=1&infants=1&pets=1');
    await page.getByRole('link', { name: 'Start a bespoke request' }).click();
    await page.getByLabel('Booker name').fill(name);
    await page.getByLabel('Mobile number').fill('+441632960123');
    await expect(page.getByLabel('Booker email')).toHaveValue('');
    await expect(page.locator('#whatsapp-consent')).not.toBeChecked();
    await page.locator('[data-pet-species]').selectOption('cat');
    await page.locator('[data-pet-breed]').fill('Disposable pet fixture');
    await page.getByLabel('Promo code (optional)').fill('  Autumn-Test  ');
    await page.getByRole('button', { name: 'Continue to review' }).click();
    await expect(page.locator('[data-booking-answers]')).toContainText('Autumn-Test');
    await page.getByRole('button', { name: 'Request booking' }).click();
    await expect(page.getByRole('banner')).toContainText('Private stay area');
    const saved = await database.query(`SELECT id, public_id, property_id, adults, children, infants, pets,
      guest_email, promo_code, whatsapp_consent_status FROM provisional_bookings WHERE guest_name=$1`, [name]);
    expect(saved.rows).toHaveLength(1);
    expect(saved.rows[0]).toMatchObject({ property_id: 'bespoke-arrangement', adults: 3, children: 1, infants: 1, pets: 1, promo_code: 'Autumn-Test' });
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
    // Disposable administrator session; no real credentials or notifications.
    const admin = await database.query("INSERT INTO admin_users(email,display_name,password_hash) VALUES($1,'E11 disposable administrator','unusable-test-password') RETURNING id", [adminEmail]);
    const token = randomBytes(32).toString('base64url');
    await database.query("INSERT INTO admin_sessions(admin_user_id,token_hash,expires_at) VALUES($1,$2,NOW()+INTERVAL '10 minutes')", [admin.rows[0].id, createHash('sha256').update(token).digest('hex')]);
    await page.context().addCookies([{ name: 'olrig_admin_session', value: token, url: origin, httpOnly: true, sameSite: 'Lax' }]);
    await page.goto(`/admin/bookings/${saved.rows[0].public_id}/reservation/`);
    await expect(page.locator('[data-booking-promo-code]')).toContainText('Autumn-Test');
    await expect(page.locator('[data-booking-promo-code]')).toContainText('no automatic discount');
    // Missing and blank optional codes retain compatibility and persist as NULL.
    for (const promoCode of [undefined, '   ']) {
      const response = await page.request.post('/api/provisional-bookings/', {
        headers: { origin },
        data: { propertyId: 'bespoke-arrangement', arrival: '2099-10-19', departure: '2099-10-23', adults: 2, children: 0, infants: 0, pets: 0, name, telephone: '+441632960123', promoCode },
      });
      expect(response.status()).toBe(201);
    }
    const compatibility = await database.query('SELECT promo_code FROM provisional_bookings WHERE guest_name=$1 AND id<>$2', [name, saved.rows[0].id]);
    expect(compatibility.rows).toEqual([{ promo_code: null }, { promo_code: null }]);
  } finally {
    await database.query('DELETE FROM provisional_bookings WHERE guest_name=$1', [name]);
    await database.query('DELETE FROM admin_users WHERE email=$1', [adminEmail]);
    await database.end();
  }
});
