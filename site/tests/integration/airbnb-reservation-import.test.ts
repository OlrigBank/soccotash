import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import { parseAirbnbBookingPdfText, type ParsedAirbnbBooking } from '../../src/lib/airbnb-import/booking-pdf.ts';
import {
  AirbnbReservationImportConflict,
  importAirbnbReservations,
  type AirbnbBookingImportDocument,
} from '../../src/lib/airbnb-import/reservations.ts';

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

function bookingText(): string {
  return `PRIVATE AIRBNB BOOKING RECORD

Example Guest
Conversation ID 8000000001 · Captured 2026-09-01T10:00:00.000Z

Reservation details

  Reservation
  Example Guest’s group of 2
  Oct 24 – 26 · 2 nights
  Olrig Bank: Spacious, but cosy, with large garden
  Check-in
  Sat, Oct 24
  4:00 PM
  Checkout
  Mon, Oct 26
  10:00 AM
  Suggested door code
  1234
  Your notes
  Guests
  Example Guest
  2 adults
  Cancellation policy
  Moderate

  Private record. Do not publish.

Price totals and breakdowns

 You earn
 £100.00
 Guest paid
 £120.00

Complete conversation

 Example Guest                                                        Aug 1, 2026 at 1:15 PM
 A synthetic booking message.

 Airbnb service                                                       Wednesday at 2:30 PM
 Booking confirmed.
`;
}

function documentFor(booking: ParsedAirbnbBooking, suffix = 'one'): AirbnbBookingImportDocument {
  return {
    relativePath: `output/pdf/airbnb-message-bookings/synthetic-${suffix}.pdf`,
    sha256: crypto.createHash('sha256').update(`booking-${suffix}`).digest('hex'),
    pageCount: 3,
    booking,
    accessCodeCiphertext: Buffer.from('synthetic-ciphertext'),
    accessCodeKeyVersion: 1,
  };
}

test('booking PDF parser preserves abbreviated stays and unresolved message dates', () => {
  const parsed = parseAirbnbBookingPdfText(bookingText());
  assert.equal(parsed.source.conversationId, '8000000001');
  assert.equal(parsed.reservation.arrival, '2026-10-24');
  assert.equal(parsed.reservation.departure, '2026-10-26');
  assert.equal(parsed.reservation.headlineHostTotalMinor, null);
  assert.equal(parsed.reservation.accessCode, '1234');
  assert.equal(parsed.reservation.adults, 2);
  assert.equal(parsed.reservation.sourceStatusText, 'Confirmed');
  assert.equal(parsed.conversationEntries.length, 2);
  assert.equal(parsed.conversationEntries[0].timestampPrecision, 'exact');
  assert.equal(parsed.conversationEntries[1].timestampPrecision, 'unresolved');
  assert.equal(parsed.conversationEntries[1].entryType, 'service_event');
  assert.deepEqual(parsed.financialSummaries.map((summary) => summary.totalMinor), [10000, 12000]);
  assert.ok(parsed.financialSummaries.every((summary) => summary.arithmeticStatus === 'not_determinable'));

  const cancelled = parseAirbnbBookingPdfText(
    bookingText().replace('Booking confirmed.', 'You canceled this reservation.'),
  );
  assert.equal(cancelled.reservation.sourceStatusText, 'Cancelled');
});

test('financial panels preserve signed hierarchy, quantities and reconciliation', () => {
  const financial = ` You earn                             Guest paid
 £234.25                              £284.17
 3 nights room fee                    £81.00 x 3 nights
 £270.00                              £243.00
 Thu, 10/24                           Guest service fee
 £90.00                               £41.17
 Fri, 10/25                           Total (GBP)
 £90.00                               £284.17
 Sat, 10/26
 £90.00
 Nightly rate adjustment
 -£27.00
 Thu, 10/24 (Non-refundable option)
 -£9.00
 Fri, 10/25 (Non-refundable option)
 -£9.00
 Sat, 10/26 (Non-refundable option)
 -£9.00
 Host service fee (3.0% + VAT)
 -£8.75
 Total (GBP)
 £234.25`;
  const parsed = parseAirbnbBookingPdfText(bookingText().replace(
    ` You earn
 £100.00
 Guest paid
 £120.00`,
    financial,
  ));
  const host = parsed.financialSummaries[0];
  const guest = parsed.financialSummaries[1];
  assert.equal(host.arithmeticStatus, 'verified');
  assert.equal(host.lineItems.filter((item) => item.parentPosition !== null).length, 6);
  assert.equal(host.lineItems.find((item) => item.itemType === 'host_service_fee')?.amountMinor, -875);
  assert.equal(guest.lineItems[0].quantity, 3);
  assert.equal(guest.lineItems[0].unitAmountMinor, 8100);
  assert.equal(guest.arithmeticStatus, 'verified');
});

test('Airbnb reservation import deduplicates captures and rolls back conflicts', async () => {
  assert.ok(databaseUrl, 'Set TEST_DATABASE_URL or DATABASE_URL to run the PostgreSQL integration test.');
  const schema = `airbnb_reservations_${process.pid}_${crypto.randomBytes(6).toString('hex')}`;
  const control = new Pool({ connectionString: databaseUrl, max: 1 });
  const database = new Pool({ connectionString: scopedDatabaseUrl(databaseUrl!, schema), max: 2 });
  try {
    await control.query(`CREATE SCHEMA ${quoteIdentifier(schema)}`);
    const directory = new URL('../../db/', import.meta.url);
    for (const filename of (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort()) {
      await database.query(await readFile(new URL(filename, directory), 'utf8'));
    }
    const booking = parseAirbnbBookingPdfText(bookingText());
    const first = await importAirbnbReservations(
      { sourceSnapshotOn: '2026-09-01', documents: [documentFor(booking)] }, database,
    );
    assert.equal(first.documentsAdded, 1);
    assert.equal(first.reservationsAdded, 1);
    assert.equal((await database.query('SELECT count(*)::int AS count FROM airbnb_conversation_entries')).rows[0].count, 2);
    assert.equal((await database.query('SELECT count(*)::int AS count FROM airbnb_financial_summaries')).rows[0].count, 2);
    assert.equal((await database.query(
      `SELECT encode(access_code_ciphertext, 'escape') AS encrypted
         FROM airbnb_reservation_private_details`,
    )).rows[0].encrypted, 'synthetic-ciphertext');
    assert.equal(JSON.stringify((await database.query(
      `SELECT raw_extraction FROM airbnb_source_documents WHERE document_type='booking'`,
    )).rows[0].raw_extraction).includes('1234'), false);

    const duplicate = await importAirbnbReservations(
      { sourceSnapshotOn: '2026-09-01', documents: [documentFor(booking, 'two')] }, database,
    );
    assert.equal(duplicate.documentsAdded, 1);
    assert.equal(duplicate.reservationsAdded, 0);
    assert.equal(duplicate.reservationsUnchanged, 1);
    assert.equal((await database.query('SELECT count(*)::int AS count FROM airbnb_reservation_documents')).rows[0].count, 2);

    const unchanged = await importAirbnbReservations(
      { sourceSnapshotOn: '2026-09-01', documents: [documentFor(booking)] }, database,
    );
    assert.equal(unchanged.documentsAdded, 0);
    assert.equal(unchanged.reservationsUnchanged, 1);

    const conflicting = structuredClone(booking);
    conflicting.conversationEntries[0].body = 'Conflicting synthetic content.';
    await assert.rejects(
      importAirbnbReservations(
        { sourceSnapshotOn: '2026-09-02', documents: [documentFor(conflicting, 'conflict')] }, database,
      ),
      (error: unknown) => error instanceof AirbnbReservationImportConflict,
    );
    assert.equal((await database.query('SELECT count(*)::int AS count FROM airbnb_reservations')).rows[0].count, 1);
    assert.equal((await database.query('SELECT count(*)::int AS count FROM airbnb_source_documents')).rows[0].count, 2);
    assert.equal((await database.query(
      `SELECT status FROM airbnb_import_batches ORDER BY id DESC LIMIT 1`,
    )).rows[0].status, 'failed');
  } finally {
    await database.end();
    await control.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schema)} CASCADE`);
    await control.end();
  }
});
