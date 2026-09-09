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

test('requires account ownership and preserves booking access revocation', async () => {
  assert.ok(
    databaseUrl,
    'Set TEST_DATABASE_URL or DATABASE_URL to run the PostgreSQL integration test.',
  );

  const schema = `booking_access_${process.pid}_${crypto.randomBytes(6).toString('hex')}`;
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

    const {
      resolveBookingAccessCredential,
      revokeBookingAccessCredential,
    } = await import('../../src/lib/booking/booking-access.ts');
    const { getPool } = await import('../../src/lib/booking/db.ts');
    applicationPool = getPool();

    const inserted = await applicationPool.query(
      `INSERT INTO provisional_bookings (
         property_id, arrival, departure, guests, guest_name, guest_email, status
       )
       VALUES (
         'olrig-bank', CURRENT_DATE + 30, CURRENT_DATE + 33, 2,
         'Booker Lifecycle Integration Test', 'integration@example.invalid', 'pending'
       )
       RETURNING id::text, public_id::text, customer_access_token,
                 arrival::text, departure::text, guest_name, status`,
    );
    const booking = inserted.rows[0];
    const originalToken = String(booking.customer_access_token);

    const offerToken = crypto.randomBytes(32).toString('base64url');
    const offerTokenHash = crypto.createHash('sha256').update(offerToken).digest('hex');
    await applicationPool.query(
      `INSERT INTO booking_offers (
         provisional_booking_id, line_items, total_pence, recipient_email, subject,
         delivery_status, customer_status, access_token_hash, published_at
       )
       VALUES ($1, '[]'::jsonb, 50000, 'integration@example.invalid',
               'Integration test offer', 'not_requested', 'active', $2, NOW())`,
      [booking.id, offerTokenHash],
    );

    const { bookerContext } = await import('../../src/lib/booker/context.ts');
    const accountId = (await applicationPool.query('INSERT INTO booker_accounts DEFAULT VALUES RETURNING id')).rows[0].id;
    await applicationPool.query('UPDATE provisional_bookings SET booker_account_id=$2 WHERE id=$1',[booking.id,accountId]);
    assert.equal((await resolveBookingAccessCredential(originalToken)).allowed,false);
    assert.equal((await resolveBookingAccessCredential(offerToken)).allowed,false);
    assert.equal((await resolveBookingAccessCredential(booking.public_id)).allowed,false);
    await bookerContext.run({accountId},async()=>{
      assert.equal((await resolveBookingAccessCredential(booking.public_id,{recordUse:true})).allowed,true);
      await revokeBookingAccessCredential({reference:booking.public_id,adminUserId:'integration-test-admin',reason:'Lifecycle revocation'});
      assert.deepEqual(await resolveBookingAccessCredential(booking.public_id),{allowed:false,reason:'revoked'});
      await applicationPool!.query('UPDATE provisional_bookings SET customer_access_token_revoked_at=NULL WHERE id=$1',[booking.id]);
      assert.equal((await resolveBookingAccessCredential(booking.public_id)).allowed,true);
    });
    const preservedBooking = await applicationPool.query(
      `SELECT public_id::text, arrival::text, departure::text, guest_name, status
         FROM provisional_bookings
        WHERE id = $1`,
      [booking.id],
    );
    assert.deepEqual(preservedBooking.rows[0], {
      public_id: booking.public_id,
      arrival: booking.arrival,
      departure: booking.departure,
      guest_name: booking.guest_name,
      status: booking.status,
    });

    const activity = await applicationPool.query(
      `SELECT event_type, details
         FROM booking_activity
        WHERE provisional_booking_id = $1
          AND event_type IN (
            'booking_access_rotated',
            'booking_access_revoked',
            'booking_access_denied'
          )
        ORDER BY id`,
      [booking.id],
    );
    assert.deepEqual(activity.rows.map(row=>row.event_type),['booking_access_revoked']);

    const activityJson = JSON.stringify(activity.rows);
    for (const credential of [
      originalToken,
      offerToken,
    ]) {
      assert.equal(
        activityJson.includes(credential),
        false,
        'technical activity must never record a private credential',
      );
    }
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
