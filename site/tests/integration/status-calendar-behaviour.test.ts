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
    await applicationPool.query(
      `INSERT INTO provisional_bookings (
         property_id, arrival, departure, guests, guest_name, guest_email, status
       ) VALUES (
         'bespoke-arrangement', CURRENT_DATE + 60, CURRENT_DATE + 63, 2,
         'Bespoke calendar request', 'bespoke@example.invalid', 'pending'
       )`,
    );

    const from = new Date();
    from.setUTCDate(from.getUTCDate() + 59);
    const to = new Date();
    to.setUTCDate(to.getUTCDate() + 64);
    const fromDate = from.toISOString().slice(0, 10);
    const toDate = to.toISOString().slice(0, 10);

    const calendarEntries = await queryAdminCalendarEntries(applicationPool, fromDate, toDate);
    const bookingEntries = calendarEntries.filter((entry) => entry.id.startsWith('booking-'));
    assert.deepEqual(
      bookingEntries.filter((entry) => entry.propertyId !== 'bespoke-arrangement').map((entry) => entry.bookingStatus).sort(),
      [...BLOCKING_BOOKING_STATUSES].sort(),
      'the Admin calendar must include every blocking status plus the informational bespoke request',
    );
    assert.equal(
      bookingEntries.some((entry) => entry.propertyId === 'bespoke-arrangement' && entry.bookingStatus === 'pending' && entry.source === 'provisional'),
      true,
      'a pending bespoke request must appear as an informational provisional Admin-calendar entry',
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
    const blocksIncludingBespokeRequests = await queryBookingBlocks(applicationPool, {
      availabilityPropertyId: 'olrig-bank',
      propertyIds: ['olrig-bank', 'bespoke-arrangement'],
      from: fromDate,
      to: toDate,
    });
    assert.equal(
      blocksIncludingBespokeRequests.length,
      BLOCKING_BOOKING_STATUSES.length,
      'a pending Bespoke request must not add a block to shared availability',
    );

    assert.equal(
      await hasBookingDateConflict(applicationPool, {
        availabilityPropertyId: 'olrig-bank',
        propertyIds: ['olrig-bank', 'bespoke-arrangement'],
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
    assert.equal(
      completeList.some(
        (booking) =>
          booking.propertyId === 'bespoke-arrangement' && booking.status === 'pending',
      ),
      true,
      'the explicit inactive view must include the pending bespoke request',
    );
    assert.deepEqual(
      completeList
        .filter((booking) => booking.propertyId !== 'bespoke-arrangement')
        .map((booking) => booking.status)
        .sort(),
      statuses.sort(),
      'the explicit inactive view must restore declined and expired bookings',
    );

    const overrideNight = new Date();
    overrideNight.setUTCDate(overrideNight.getUTCDate() + 61);
    const overrideDate = overrideNight.toISOString().slice(0, 10);
    const followingNight = new Date(overrideNight);
    followingNight.setUTCDate(followingNight.getUTCDate() + 1);
    const followingDate = followingNight.toISOString().slice(0, 10);

    await applicationPool.query(
      `INSERT INTO booking_blocks (property_id, source, external_uid, starts_on, ends_on)
       VALUES ('olrig-bank', 'airbnb', 'override-test', CURRENT_DATE + 60, CURRENT_DATE + 63)`,
    );
    await applicationPool.query(
      `INSERT INTO calendar_availability_overrides (property_id, available_on, reason)
       VALUES ('olrig-bank', $1::date, 'Administrator verified availability')`,
      [overrideDate],
    );

    assert.equal(
      await hasBookingDateConflict(applicationPool, {
        availabilityPropertyId: 'olrig-bank',
        propertyIds: ['olrig-bank'],
        arrival: overrideDate,
        departure: followingDate,
        applyAvailabilityOverrides: true,
      }),
      false,
      'an administrator override must take precedence over Airbnb and every blocking booking status',
    );
    assert.equal(
      await hasBookingDateConflict(applicationPool, {
        availabilityPropertyId: 'olrig-bank',
        propertyIds: ['olrig-bank'],
        arrival: overrideDate,
        departure: followingDate,
        applyAvailabilityOverrides: false,
      }),
      true,
      'the same override must not make an ordinary stay available',
    );
    assert.equal(
      await hasBookingDateConflict(applicationPool, {
        availabilityPropertyId: 'olrig-bank',
        propertyIds: ['olrig-bank'],
        arrival: fromDate,
        departure: followingDate,
        applyAvailabilityOverrides: true,
      }),
      true,
      'an override must not make adjacent blocked nights available',
    );

    const overriddenBlocks = await queryBookingBlocks(applicationPool, {
      availabilityPropertyId: 'olrig-bank',
      propertyIds: ['olrig-bank'],
      from: fromDate,
      to: toDate,
      applyAvailabilityOverrides: true,
    });
    assert.equal(
      overriddenBlocks.some((block) => block.startsOn <= overrideDate && block.endsOn > overrideDate),
      false,
      'the public block result must exclude the overridden night',
    );
    assert.equal(
      overriddenBlocks.some((block) => block.endsOn === overrideDate),
      true,
      'blocks before an override must retain their departure boundary',
    );
    assert.equal(
      overriddenBlocks.some((block) => block.startsOn === followingDate),
      true,
      'blocks after an override must retain their arrival boundary',
    );
    const ordinaryStayBlocks = await queryBookingBlocks(applicationPool, {
      availabilityPropertyId: 'olrig-bank',
      propertyIds: ['olrig-bank'],
      from: fromDate,
      to: toDate,
      applyAvailabilityOverrides: false,
    });
    assert.equal(
      ordinaryStayBlocks.some((block) => block.startsOn <= overrideDate && block.endsOn > overrideDate),
      true,
      'ordinary stay calendars must continue to return the underlying block',
    );

    const overriddenCalendar = await queryAdminCalendarEntries(applicationPool, fromDate, toDate);
    assert.equal(
      overriddenCalendar.some((entry) => entry.source === 'override'
        && entry.propertyId === 'olrig-bank'
        && entry.startsOn === overrideDate
        && entry.reason === 'Administrator verified availability'),
      true,
      'the Admin calendar must display the override and its reason',
    );
    assert.equal(
      overriddenCalendar.some((entry) => entry.source === 'direct' && entry.startsOn <= overrideDate && entry.endsOn > overrideDate),
      true,
      'the Admin calendar must preserve underlying confirmed booking evidence',
    );

    await applicationPool.query(
      `DELETE FROM calendar_availability_overrides
        WHERE property_id = 'olrig-bank' AND available_on = $1::date`,
      [overrideDate],
    );
    assert.equal(
      await hasBookingDateConflict(applicationPool, {
        availabilityPropertyId: 'olrig-bank',
        propertyIds: ['olrig-bank'],
        arrival: overrideDate,
        departure: followingDate,
      }),
      true,
      'removing an override must restore the underlying block',
    );

    await applicationPool.query(
      `DELETE FROM provisional_bookings
        WHERE status = ANY($1::text[])
          AND property_id <> 'bespoke-arrangement'`,
      [[...BLOCKING_BOOKING_STATUSES]],
    );
    await applicationPool.query(
      `DELETE FROM booking_blocks WHERE external_uid = 'override-test'`,
    );
    assert.equal(
      await hasBookingDateConflict(applicationPool, {
        availabilityPropertyId: 'olrig-bank',
        propertyIds: ['olrig-bank', 'bespoke-arrangement'],
        arrival: fromDate,
        departure: toDate,
      }),
      false,
      'inactive records and pending Bespoke conversations must not block released dates',
    );
  } finally {
    if (applicationPool) await applicationPool.end();
    await controlPool.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schema)} CASCADE`);
    await controlPool.end();
  }
});
