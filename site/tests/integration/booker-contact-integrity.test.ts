import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';

const { Pool } = pg;
const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;

test('contact updates retain reachability and invalidate number-bound WhatsApp consent', async () => {
  assert.ok(databaseUrl, 'Set TEST_DATABASE_URL or DATABASE_URL to run the PostgreSQL integration test.');
  const schema = `booker_contact_${process.pid}_${crypto.randomBytes(6).toString('hex')}`;
  const control = new Pool({ connectionString: databaseUrl, max: 1 });
  const original = process.env.DATABASE_URL;
  let application: pg.Pool | undefined;
  try {
    await control.query(`CREATE SCHEMA ${quote(schema)}`);
    const url = new URL(databaseUrl);
    url.searchParams.set('options', `-c search_path=${schema},public`);
    process.env.DATABASE_URL = url.toString();
    const migrations = new Pool({ connectionString: url.toString(), max: 1 });
    try {
      const directory = new URL('../../db/', import.meta.url);
      for (const file of (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort()) {
        await migrations.query(await readFile(new URL(file, directory), 'utf8'));
      }
    } finally { await migrations.end(); }

    const { getPool } = await import('../../src/lib/booking/db.ts');
    const { updateProvisionalBookingContact } = await import('../../src/lib/booking/booking-contact.ts');
    application = getPool();
    const inserted = await application.query(
      `INSERT INTO provisional_bookings (
         property_id, arrival, departure, guests, guest_name, guest_email, guest_telephone,
         guest_telephone_e164, whatsapp_consent_status, whatsapp_consent_at,
         whatsapp_consent_source, whatsapp_consent_version, whatsapp_consent_number_e164, status
       ) VALUES (
         'main-house', CURRENT_DATE + 40, CURRENT_DATE + 43, 2, 'Contact test', '',
         '07700 900123', '+447700900123', 'active', NOW(), 'booking_form', 'test-v1', '+447700900123', 'pending'
       ) RETURNING public_id::text`,
    );
    const reference = inserted.rows[0].public_id;

    assert.deepEqual(
      await updateProvisionalBookingContact({ reference, email: '', telephone: '' }),
      { status: 'final_contact_required' },
    );
    const changed = await updateProvisionalBookingContact({ reference, email: 'booker@example.com', telephone: '07700 900999' });
    assert.equal(changed.status, 'updated');
    if (changed.status === 'updated') assert.equal(changed.whatsappConsentInvalidated, true);
    const stored = await application.query(
      `SELECT guest_email, guest_telephone_e164, whatsapp_consent_status,
              whatsapp_consent_number_e164, whatsapp_consent_withdrawn_at IS NOT NULL AS withdrawn
         FROM provisional_bookings WHERE public_id = $1::uuid`, [reference],
    );
    assert.deepEqual(stored.rows[0], {
      guest_email: 'booker@example.com', guest_telephone_e164: '+447700900999',
      whatsapp_consent_status: 'withdrawn', whatsapp_consent_number_e164: null, withdrawn: true,
    });

    await application.query(`UPDATE provisional_bookings SET status = 'cancelled' WHERE public_id = $1::uuid`, [reference]);
    assert.equal((await updateProvisionalBookingContact({ reference, email: '', telephone: '' })).status, 'updated');
  } finally {
    if (application) await application.end();
    if (original === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = original;
    await control.query(`DROP SCHEMA IF EXISTS ${quote(schema)} CASCADE`);
    await control.end();
  }
});
