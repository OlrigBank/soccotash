import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';

const { Pool } = pg;
const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

function scopedDatabaseUrl(baseUrl: string, schema: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set('options', `-c search_path=${schema},public`);
  return url.toString();
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function databaseSsl(): { rejectUnauthorized: false } | undefined {
  return process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined;
}

test('cancels an active booking while preserving its record and reason', async () => {
  assert.ok(
    databaseUrl,
    'Set TEST_DATABASE_URL or DATABASE_URL to run the PostgreSQL integration test.',
  );

  const schema = `booking_cancel_${process.pid}_${crypto.randomBytes(6).toString('hex')}`;
  const controlPool = new Pool({ connectionString: databaseUrl, ssl: databaseSsl(), max: 1 });
  const originalDatabaseUrl = process.env.DATABASE_URL;
  let applicationPool: pg.Pool | undefined;

  try {
    await controlPool.query(`CREATE SCHEMA ${quoteIdentifier(schema)}`);
    process.env.DATABASE_URL = scopedDatabaseUrl(databaseUrl, schema);

    const migrationPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: databaseSsl(),
      max: 1,
    });
    try {
      const migrationDirectory = new URL('../../db/', import.meta.url);
      const migrationFiles = (await readdir(migrationDirectory))
        .filter((filename) => filename.endsWith('.sql'))
        .sort();
      for (const filename of migrationFiles) {
        await migrationPool.query(await readFile(new URL(filename, migrationDirectory), 'utf8'));
      }
    } finally {
      await migrationPool.end();
    }

    const { cancelBooking } = await import(
      '../../src/lib/booking/cancellation-lifecycle.ts'
    );
    const { getPool } = await import('../../src/lib/booking/db.ts');
    applicationPool = getPool();

    const inserted = await applicationPool.query(
      `INSERT INTO provisional_bookings (
         property_id, arrival, departure, guests, guest_name, guest_email, status
       )
       VALUES (
         'olrig-bank', CURRENT_DATE + 60, CURRENT_DATE + 63, 2,
         'Cancellation Integration Test', 'booker@example.com', 'confirmed'
       )
       RETURNING id::text, public_id::text`,
    );
    const booking = inserted.rows[0];
    const reason = 'The property is unexpectedly unavailable.';

    assert.equal(await cancelBooking(booking.public_id, reason), 'cancelled');
    assert.equal(
      await cancelBooking(booking.public_id, 'A duplicate attempt must fail.'),
      'transition_not_allowed',
    );

    const preserved = await applicationPool.query(
      `SELECT status, guest_name, guest_email
         FROM provisional_bookings
        WHERE id = $1`,
      [booking.id],
    );
    assert.deepEqual(preserved.rows[0], {
      status: 'cancelled',
      guest_name: 'Cancellation Integration Test',
      guest_email: 'booker@example.com',
    });

    const activity = await applicationPool.query(
      `SELECT actor, event_type, details
         FROM booking_activity
        WHERE provisional_booking_id = $1
        ORDER BY id`,
      [booking.id],
    );
    assert.equal(activity.rows.length, 1);
    assert.equal(activity.rows[0].actor, 'administrator');
    assert.equal(activity.rows[0].event_type, 'booking_cancelled');
    assert.equal(activity.rows[0].details.reason, reason);
    assert.equal(
      activity.rows[0].details.lifecycleRule,
      'confirmed.cancel_booking.administrator',
    );

    const message = await applicationPool.query(
      `SELECT sender_type, sender_name, body, booker_read_at, admin_read_at
         FROM booking_messages
        WHERE provisional_booking_id = $1`,
      [booking.id],
    );
    assert.equal(message.rows.length, 1);
    assert.equal(message.rows[0].sender_type, 'bot');
    assert.equal(message.rows[0].sender_name, 'Olrig Bot');
    assert.match(message.rows[0].body, /unexpectedly unavailable/);
    assert.equal(message.rows[0].booker_read_at, null);
    assert.equal(message.rows[0].admin_read_at, null);
  } finally {
    if (applicationPool) await applicationPool.end();
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
    await controlPool.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schema)} CASCADE`);
    await controlPool.end();
  }
});
