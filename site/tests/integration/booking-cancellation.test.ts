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

    const { cancelBooking, cancelBookingByBookerToken } = await import(
      '../../src/lib/booking/cancellation-lifecycle.ts'
    );
    const { hasBookingDateConflict } = await import('../../src/lib/booking/status-calendar.ts');
    const { getPool } = await import('../../src/lib/booking/db.ts');
    applicationPool = getPool();

    const inserted = await applicationPool.query(
      `INSERT INTO provisional_bookings (
         property_id, arrival, departure, guests, guest_name, guest_email, status
       )
       VALUES (
         'olrig-bank', CURRENT_DATE + 60, CURRENT_DATE + 63, 2,
         'Cancellation Integration Test', 'booker@example.com', 'payment_pending'
       )
       RETURNING id::text, public_id::text, customer_access_token,
                 arrival::text, departure::text`,
    );
    const booking = inserted.rows[0];
    const reason = 'The property is unexpectedly unavailable.';

    const offer = await applicationPool.query(
      `INSERT INTO booking_offers (
         provisional_booking_id, line_items, total_pence, recipient_email,
         subject, delivery_status, customer_status, published_at, accepted_at
       ) VALUES (
         $1, '[{"label":"Accepted stay","amountPence":120000}]'::jsonb,
         120000, 'booker@example.com', 'Accepted cancellation test offer',
         'not_requested', 'accepted', NOW(), NOW()
       ) RETURNING id::text, public_id::text, total_pence, customer_status`,
      [booking.id],
    );
    await applicationPool.query(
      `INSERT INTO booking_payments (
         provisional_booking_id, booking_offer_id, stage, amount_pence,
         currency, method, status, reported_at, verified_at
       ) VALUES ($1, $2, 'deposit', 30000, 'GBP', 'bank_transfer', 'verified', NOW(), NOW()),
                ($1, $2, 'balance', 90000, 'GBP', 'bank_transfer', 'reported', NOW(), NULL)`,
      [booking.id, offer.rows[0].id],
    );
    await applicationPool.query(
      `INSERT INTO calendar_availability_overrides
         (property_id, available_on, reason, provisional_booking_id)
       VALUES
         ('olrig-bank', $2::date, 'Owned cancellation test night one', $1),
         ('olrig-bank', $2::date + 1, 'Owned cancellation test night two', $1),
         ('cottage', $2::date, 'Unrelated override that must remain', NULL)`,
      [booking.id, booking.arrival],
    );

    assert.equal(await cancelBooking(booking.public_id, '   '), 'reason_required');
    assert.equal(await hasBookingDateConflict(applicationPool, {
      availabilityPropertyId: 'olrig-bank',
      propertyIds: ['olrig-bank'],
      arrival: booking.arrival,
      departure: booking.departure,
    }), true, 'the active booking must block an overlapping stay before cancellation');

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
        WHERE provisional_booking_id = $1 AND event_type = 'booking_cancelled'
        ORDER BY id`,
      [booking.id],
    );
    assert.equal(activity.rows.length, 1);
    assert.equal(activity.rows[0].actor, 'administrator');
    assert.equal(activity.rows[0].event_type, 'booking_cancelled');
    assert.equal(activity.rows[0].details.reason, reason);
    assert.equal(
      activity.rows[0].details.lifecycleRule,
      'payment_pending.cancel_booking.administrator',
    );

    const remainingOverrides = await applicationPool.query(
      `SELECT property_id, available_on::text, provisional_booking_id::text
         FROM calendar_availability_overrides
        ORDER BY property_id, available_on`,
    );
    assert.deepEqual(remainingOverrides.rows, [{
      property_id: 'cottage',
      available_on: booking.arrival,
      provisional_booking_id: null,
    }], 'cancellation removes every override owned by the booking and preserves unrelated overrides');
    const overrideActivity = await applicationPool.query(
      `SELECT details FROM booking_activity
        WHERE provisional_booking_id = $1
          AND event_type = 'booking_availability_overrides_restored'`,
      [booking.id],
    );
    assert.equal(overrideActivity.rowCount, 1);
    assert.equal(overrideActivity.rows[0].details.overrides.length, 2);

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

    assert.equal(await hasBookingDateConflict(applicationPool, {
      availabilityPropertyId: 'olrig-bank',
      propertyIds: ['olrig-bank'],
      arrival: booking.arrival,
      departure: booking.departure,
    }), false, 'cancellation must immediately release the dates');

    const preservedOffer = await applicationPool.query(
      `SELECT public_id::text, total_pence, customer_status
         FROM booking_offers
        WHERE id = $1`,
      [offer.rows[0].id],
    );
    assert.deepEqual(preservedOffer.rows[0], {
      public_id: offer.rows[0].public_id,
      total_pence: 120000,
      customer_status: 'accepted',
    });
    const preservedPayments = await applicationPool.query(
      `SELECT stage, status, verified_at IS NOT NULL AS verified,
              cancelled_at IS NOT NULL AS cancelled
         FROM booking_payments
        WHERE provisional_booking_id = $1
        ORDER BY stage`,
      [booking.id],
    );
    assert.deepEqual(preservedPayments.rows, [
      { stage: 'balance', status: 'cancelled', verified: false, cancelled: true },
      { stage: 'deposit', status: 'verified', verified: true, cancelled: false },
    ]);

    const atomic = await applicationPool.query(
      `INSERT INTO provisional_bookings (
         property_id, arrival, departure, guests, guest_name, guest_email, status
       ) VALUES (
         'olrig-bank', CURRENT_DATE + 80, CURRENT_DATE + 83, 2,
         'Atomic Cancellation Test', 'atomic@example.invalid', 'payment_pending'
       ) RETURNING id::text, public_id::text`,
    );
    await applicationPool.query(`
      CREATE FUNCTION reject_test_cancellation_message() RETURNS trigger AS $$
      BEGIN
        IF NEW.source_key LIKE 'booking-cancelled:%' THEN
          RAISE EXCEPTION 'test cancellation message failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER reject_test_cancellation_message
      BEFORE INSERT ON booking_messages
      FOR EACH ROW EXECUTE FUNCTION reject_test_cancellation_message();
    `);
    await assert.rejects(
      cancelBooking(atomic.rows[0].public_id, 'This transaction must roll back.'),
      /test cancellation message failure/,
    );
    await applicationPool.query('DROP TRIGGER reject_test_cancellation_message ON booking_messages');
    const atomicEvidence = await applicationPool.query(
      `SELECT pb.status,
              COUNT(DISTINCT ba.id)::int AS activity_count,
              COUNT(DISTINCT bm.id)::int AS message_count
         FROM provisional_bookings pb
         LEFT JOIN booking_activity ba ON ba.provisional_booking_id = pb.id
         LEFT JOIN booking_messages bm ON bm.provisional_booking_id = pb.id
        WHERE pb.id = $1
        GROUP BY pb.status`,
      [atomic.rows[0].id],
    );
    assert.deepEqual(atomicEvidence.rows[0], {
      status: 'payment_pending',
      activity_count: 0,
      message_count: 0,
    });

    const bookerToken = crypto.randomBytes(32).toString('base64url');
    const bookerCancellation = await applicationPool.query(
      `INSERT INTO provisional_bookings (
         property_id, arrival, departure, guests, guest_name, guest_email,
         status, customer_access_token
       ) VALUES (
         'olrig-bank', CURRENT_DATE + 100, CURRENT_DATE + 103, 2,
         'Booker Cancellation Integration Test', 'booker-cancel@example.invalid',
         'confirmed', $1
       ) RETURNING id::text, public_id::text`,
      [bookerToken],
    );
    const bookerReason = 'Our travel plans have changed.';
    assert.equal(await cancelBookingByBookerToken('invalid-token', bookerReason), 'not_found');
    assert.equal(await cancelBookingByBookerToken(bookerToken, '   '), 'reason_required');
    assert.equal(
      await cancelBookingByBookerToken(bookerToken, bookerReason),
      'cancelled',
    );
    assert.equal(
      await cancelBookingByBookerToken(bookerToken, 'A repeated cancellation must fail.'),
      'transition_not_allowed',
    );
    const bookerEvidence = await applicationPool.query(
      `SELECT pb.status, ba.actor, ba.event_type, ba.details, bm.sender_type, bm.body
         FROM provisional_bookings pb
         JOIN booking_activity ba ON ba.provisional_booking_id = pb.id
         JOIN booking_messages bm ON bm.provisional_booking_id = pb.id
        WHERE pb.id = $1 AND ba.event_type = 'booking_cancelled'`,
      [bookerCancellation.rows[0].id],
    );
    assert.equal(bookerEvidence.rows[0].status, 'cancelled');
    assert.equal(bookerEvidence.rows[0].actor, 'customer');
    assert.equal(bookerEvidence.rows[0].event_type, 'booking_cancelled');
    assert.equal(bookerEvidence.rows[0].details.reason, bookerReason);
    assert.equal(bookerEvidence.rows[0].details.lifecycleRule, 'confirmed.cancel_booking.booker');
    assert.equal(bookerEvidence.rows[0].sender_type, 'bot');
    assert.match(bookerEvidence.rows[0].body, /Booker cancelled this booking/i);
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
