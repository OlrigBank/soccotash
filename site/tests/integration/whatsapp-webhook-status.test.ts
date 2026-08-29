import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';

const { Pool } = pg;
const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;

test('WhatsApp statuses are idempotent, monotonic and queue fallback outside the webhook transaction', async () => {
  assert.ok(databaseUrl, 'Set TEST_DATABASE_URL or DATABASE_URL to run the PostgreSQL integration test.');
  const schema = `whatsapp_status_${process.pid}_${crypto.randomBytes(6).toString('hex')}`;
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
    const { processWhatsAppStatus } = await import('../../src/lib/booking/notification-delivery.ts');
    application = getPool();
    const booking = await application.query(
      `INSERT INTO provisional_bookings
         (property_id, arrival, departure, guests, guest_name, guest_email, status)
       VALUES ('main-house', CURRENT_DATE + 20, CURRENT_DATE + 23, 2,
               'Webhook test', 'webhook@example.test', 'pending')
       RETURNING id::text`,
    );
    const event = await application.query(
      `INSERT INTO booking_notification_events
         (provisional_booking_id, event_type, target, source_key)
       VALUES ($1, 'booking_received', 'booker', 'webhook-status-test') RETURNING id::text`,
      [booking.rows[0].id],
    );
    await application.query(
      `INSERT INTO booking_notification_deliveries
         (notification_event_id, channel, provider, status, provider_message_id, idempotency_key)
       VALUES ($1, 'whatsapp', 'meta', 'submitted', 'wamid.integration', 'webhook-status-test:whatsapp')`,
      [event.rows[0].id],
    );

    const failure = {
      providerMessageId: 'wamid.integration', status: 'failed' as const,
      providerEventKey: 'failed-event', timestamp: new Date('2026-08-29T10:00:00Z'), errorCode: '131000',
    };
    assert.equal(await processWhatsAppStatus(failure), 'updated');
    assert.equal(await processWhatsAppStatus(failure), 'duplicate');
    assert.equal((await application.query('SELECT count(*)::int AS count FROM booking_notification_fallback_jobs')).rows[0].count, 1);

    assert.equal(await processWhatsAppStatus({
      providerMessageId: 'wamid.integration', status: 'delivered',
      providerEventKey: 'delivered-event', timestamp: new Date('2026-08-29T10:00:01Z'), errorCode: null,
    }), 'updated');
    const result = await application.query(
      `SELECT d.status, j.status AS job_status
         FROM booking_notification_deliveries d
         JOIN booking_notification_fallback_jobs j ON j.whatsapp_delivery_id = d.id
        WHERE d.provider_message_id = 'wamid.integration'`,
    );
    assert.deepEqual(result.rows[0], { status: 'delivered', job_status: 'cancelled' });

    assert.equal(await processWhatsAppStatus({
      providerMessageId: 'wamid.integration', status: 'failed',
      providerEventKey: 'late-failed-event', timestamp: new Date('2026-08-29T10:00:02Z'), errorCode: '131001',
    }), 'updated');
    const final = await application.query(
      `SELECT d.status, j.status AS job_status
         FROM booking_notification_deliveries d
         JOIN booking_notification_fallback_jobs j ON j.whatsapp_delivery_id = d.id
        WHERE d.provider_message_id = 'wamid.integration'`,
    );
    assert.deepEqual(final.rows[0], { status: 'delivered', job_status: 'cancelled' });
  } finally {
    if (application) await application.end();
    process.env.DATABASE_URL = original;
    await control.query(`DROP SCHEMA IF EXISTS ${quote(schema)} CASCADE`);
    await control.end();
  }
});
