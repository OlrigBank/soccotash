import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';

import {
  BLOCKING_BOOKING_STATUSES,
  hasBookingDateConflict,
  queryAdminCalendarEntries,
  queryBookingBlocks,
  queryProvisionalBookingRequestRows,
} from '../../src/lib/booking/status-calendar.ts';

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

test('status filtering, date blocking and calendar classification remain aligned', async () => {
  assert.ok(
    databaseUrl,
    'Set TEST_DATABASE_URL or DATABASE_URL to run the PostgreSQL integration test.',
  );

  const schema = `status_calendar_${process.pid}_${crypto.randomBytes(6).toString('hex')}`;
  const controlPool = new Pool({ connectionString: databaseUrl, ssl: databaseSsl(), max: 1 });
  let applicationPool: pg.Pool | undefined;

  try {
    await controlPool.query(`CREATE SCHEMA ${quoteIdentifier(schema)}`);
    const applicationDatabaseUrl = scopedDatabaseUrl(databaseUrl, schema);
    applicationPool = new Pool({
      connectionString: applicationDatabaseUrl,
      ssl: databaseSsl(),
      max: 1,
    });

    const migrationDirectory = new URL('../../db/', import.meta.url);
    const migrationFiles = (await readdir(migrationDirectory))
      .filter((filename) => filename.endsWith('.sql'))
      .sort();
    for (const filename of migrationFiles) {
      await applicationPool.query(await readFile(new URL(filename, migrationDirectory), 'utf8'));
    }

    const statuses = [
      'pending',
      'offered',
      'offer_accepted',
      'payment_pending',
      'payment_reported',
      'confirmed',
      'approved',
      'declined',
      'cancelled',
      'expired',
    ];
    for (const [index, status] of statuses.entries()) {
      await applicationPool.query(
        `INSERT INTO provisional_bookings (
           property_id, arrival, departure, guests, guest_name, guest_email, status, created_at
         )
         VALUES (
           'olrig-bank', CURRENT_DATE + 60, CURRENT_DATE + 63, 2,
           $1, $2, $3, NOW() + ($4 * INTERVAL '1 second')
         )`,
        [`Status ${status}`, `${status}@example.invalid`, status, index],
      );
    }

    const from = new Date();
    from.setUTCDate(from.getUTCDate() + 59);
    const to = new Date();
    to.setUTCDate(to.getUTCDate() + 64);
    const fromDate = from.toISOString().slice(0, 10);
    const toDate = to.toISOString().slice(0, 10);

    const calendarEntries = await queryAdminCalendarEntries(applicationPool, fromDate, toDate);
    const bookingEntries = calendarEntries.filter((entry) => entry.id.startsWith('booking-'));
    assert.deepEqual(
      bookingEntries.map((entry) => entry.bookingStatus).sort(),
      [...BLOCKING_BOOKING_STATUSES].sort(),
      'the Admin calendar must include every status that blocks dates and no released status',
    );
    assert.deepEqual(
      bookingEntries
        .filter((entry) => entry.source === 'direct')
        .map((entry) => entry.bookingStatus)
        .sort(),
      ['approved', 'confirmed'],
      'confirmed-equivalent entries must be classified as direct bookings',
    );

    const blocks = await queryBookingBlocks(applicationPool, {
      availabilityPropertyId: 'olrig-bank',
      propertyIds: ['olrig-bank'],
      from: fromDate,
      to: toDate,
    });
    assert.equal(blocks.length, BLOCKING_BOOKING_STATUSES.length);
    assert.equal(blocks.filter((block) => block.source === 'direct').length, 2);

    assert.equal(
      await hasBookingDateConflict(applicationPool, {
        availabilityPropertyId: 'olrig-bank',
        propertyIds: ['olrig-bank'],
        arrival: fromDate,
        departure: toDate,
      }),
      true,
      'confirmed and provisional blocking states must prevent an overlapping request',
    );

    const activeList = await queryProvisionalBookingRequestRows(applicationPool, 100, false);
    assert.equal(activeList.some((booking) => booking.status === 'declined'), false);
    assert.equal(activeList.some((booking) => booking.status === 'expired'), false);
    assert.equal(activeList.some((booking) => booking.status === 'confirmed'), true);

    const completeList = await queryProvisionalBookingRequestRows(applicationPool, 100, true);
    assert.deepEqual(
      completeList.map((booking) => booking.status).sort(),
      statuses.sort(),
      'the explicit inactive view must restore declined and expired bookings',
    );

    await applicationPool.query(
      `DELETE FROM provisional_bookings
        WHERE status = ANY($1::text[])`,
      [[...BLOCKING_BOOKING_STATUSES]],
    );
    assert.equal(
      await hasBookingDateConflict(applicationPool, {
        availabilityPropertyId: 'olrig-bank',
        propertyIds: ['olrig-bank'],
        arrival: fromDate,
        departure: toDate,
      }),
      false,
      'declined, cancelled and expired records must not block released dates',
    );
  } finally {
    if (applicationPool) await applicationPool.end();
    await controlPool.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schema)} CASCADE`);
    await controlPool.end();
  }
});
