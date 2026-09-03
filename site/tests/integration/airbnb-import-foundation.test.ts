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

test('Airbnb import foundation stores a private normalized evidence graph and enforces boundaries', async () => {
  assert.ok(databaseUrl, 'Set TEST_DATABASE_URL or DATABASE_URL to run the PostgreSQL integration test.');
  const schema = `airbnb_import_${process.pid}_${crypto.randomBytes(6).toString('hex')}`;
  const control = new Pool({ connectionString: databaseUrl, ssl: databaseSsl(), max: 1 });
  const database = new Pool({
    connectionString: scopedDatabaseUrl(databaseUrl!, schema),
    ssl: databaseSsl(),
    max: 1,
  });

  try {
    await control.query(`CREATE SCHEMA ${quoteIdentifier(schema)}`);
    const directory = new URL('../../db/', import.meta.url);
    const files = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort();
    for (const filename of files) await database.query(await readFile(new URL(filename, directory), 'utf8'));

    const expectedTables = [
      'airbnb_conversation_entries',
      'airbnb_conversation_reactions',
      'airbnb_financial_line_items',
      'airbnb_financial_summaries',
      'airbnb_import_batches',
      'airbnb_reservation_documents',
      'airbnb_reservation_private_details',
      'airbnb_reservations',
      'airbnb_review_category_ratings',
      'airbnb_review_feedback_tags',
      'airbnb_review_reservation_links',
      'airbnb_reviews',
      'airbnb_source_documents',
    ];
    const tables = await database.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = $1 AND table_name LIKE 'airbnb_%'
        ORDER BY table_name`,
      [schema],
    );
    assert.deepEqual(tables.rows.map((row) => row.table_name), expectedTables);

    const batch = await database.query<{ id: string }>(
      `INSERT INTO airbnb_import_batches
         (source_collection, source_snapshot_on, importer_schema_version, expected_count)
       VALUES ('mixed', DATE '2026-09-01', 1, 2) RETURNING id::text`,
    );
    const bookingDocument = await database.query<{ id: string }>(
      `INSERT INTO airbnb_source_documents
         (import_batch_id, document_type, relative_path, sha256, source_external_id,
          page_count, captured_at, raw_extraction)
       VALUES ($1, 'booking', 'output/pdf/private-booking.pdf', $2, '2001', 3,
               '2026-09-01T10:00:00Z', '{"schemaVersion":1}') RETURNING id::text`,
      [batch.rows[0].id, 'a'.repeat(64)],
    );
    const reviewDocument = await database.query<{ id: string }>(
      `INSERT INTO airbnb_source_documents
         (import_batch_id, document_type, relative_path, sha256, source_external_id,
          page_count, captured_at, raw_extraction)
       VALUES ($1, 'review', 'output/pdf/private-review.pdf', $2, '3001', 1,
               '2026-08-31T12:00:00Z', '{"schemaVersion":1}') RETURNING id::text`,
      [batch.rows[0].id, 'b'.repeat(64)],
    );
    const reservation = await database.query<{ id: string }>(
      `INSERT INTO airbnb_reservations
         (conversation_id, confirmation_code, property_id, source_listing_name,
          booker_display_name, party_display_name, arrival, departure, nights,
          check_in_time, check_out_time, party_size, adults, pets, booking_date,
          source_status_text, cancellation_policy, currency,
          headline_host_total_minor, source_captured_at)
       VALUES ('2001', 'CONFIRM1', 'main-house', 'Source listing', 'Example guest',
               'Example group', DATE '2026-10-10', DATE '2026-10-12', 2,
               TIME '16:00', TIME '10:00', 3, 2, 1, DATE '2026-08-01',
               'Confirmed', 'Moderate', 'GBP', 80586, '2026-09-01T10:00:00Z')
       RETURNING id::text`,
    );
    await database.query(
      `INSERT INTO airbnb_reservation_documents (reservation_id, source_document_id, is_preferred)
       VALUES ($1, $2, TRUE)`,
      [reservation.rows[0].id, bookingDocument.rows[0].id],
    );
    await database.query(
      `INSERT INTO airbnb_reservation_private_details
         (reservation_id, host_notes, guest_profile_text, access_code_ciphertext,
          access_code_key_version, access_code_expires_at)
       VALUES ($1, 'Private host note', 'Private profile detail', decode('00ff', 'hex'), 1,
               '2026-10-12T10:00:00Z')`,
      [reservation.rows[0].id],
    );
    const entry = await database.query<{ id: string }>(
      `INSERT INTO airbnb_conversation_entries
         (reservation_id, position, entry_type, sender_type, sender_display_name,
          body, displayed_date, displayed_time, sent_at, timestamp_precision, raw_entry)
       VALUES ($1, 0, 'message', 'guest', 'Example guest', 'Synthetic message',
               'Aug 1, 2026', '1:15 PM', '2026-08-01T13:15:00Z', 'exact', '{}')
       RETURNING id::text`,
      [reservation.rows[0].id],
    );
    await database.query(
      `INSERT INTO airbnb_conversation_reactions
         (conversation_entry_id, position, reaction, reactor_display_name)
       VALUES ($1, 0, 'thumbs-up', 'Example host')`,
      [entry.rows[0].id],
    );
    const financial = await database.query<{ id: string }>(
      `INSERT INTO airbnb_financial_summaries
         (reservation_id, perspective, currency, total_minor, arithmetic_status,
          raw_display_text, captured_at)
       VALUES ($1, 'host_earnings', 'GBP', 80586, 'verified',
               'Synthetic financial panel', '2026-09-01T10:00:00Z')
       RETURNING id::text`,
      [reservation.rows[0].id],
    );
    const parentLine = await database.query<{ id: string }>(
      `INSERT INTO airbnb_financial_line_items
         (financial_summary_id, position, item_type, description, quantity,
          amount_minor, raw_display_text)
       VALUES ($1, 0, 'accommodation', 'Two nights', 2, 90000, 'Synthetic parent row')
       RETURNING id::text`,
      [financial.rows[0].id],
    );
    await database.query(
      `INSERT INTO airbnb_financial_line_items
         (financial_summary_id, parent_line_item_id, position, item_type,
          description, service_date, amount_minor, raw_display_text)
       VALUES ($1, $2, 1, 'nightly_charge', 'First night', DATE '2026-10-10',
               45000, 'Synthetic child row')`,
      [financial.rows[0].id, parentLine.rows[0].id],
    );
    const review = await database.query<{ id: string }>(
      `INSERT INTO airbnb_reviews
         (review_id, source_document_id, reviewer_display_name, property_id,
          source_listing_name, arrival, departure, nights, published_on,
          overall_rating, public_text, private_feedback, captured_on)
       VALUES ('3001', $1, 'Example guest', 'main-house', 'Source listing',
               DATE '2026-10-10', DATE '2026-10-12', 2, DATE '2026-10-12',
               5, 'Synthetic public review', 'Synthetic private feedback',
               DATE '2026-08-31') RETURNING id::text`,
      [reviewDocument.rows[0].id],
    );
    const rating = await database.query<{ id: string }>(
      `INSERT INTO airbnb_review_category_ratings
         (review_id, category_key, category_display_name, rating, position)
       VALUES ($1, 'check-in', 'Check-in', 5, 0) RETURNING id::text`,
      [review.rows[0].id],
    );
    await database.query(
      `INSERT INTO airbnb_review_feedback_tags
         (category_rating_id, position, feedback_text, normalized_key)
       VALUES ($1, 0, 'Easy arrival', 'easy arrival')`,
      [rating.rows[0].id],
    );
    await database.query(
      `INSERT INTO airbnb_review_reservation_links
         (review_id, reservation_id, link_status, match_method, confidence,
          evidence, decision_source, reviewed_at)
       VALUES ($1, $2, 'confirmed', 'stay_listing_identity', 1,
               '{"stay":true,"listing":true}', 'automatic', NOW())`,
      [review.rows[0].id, reservation.rows[0].id],
    );

    assert.equal((await database.query('SELECT count(*)::int AS count FROM airbnb_reservations')).rows[0].count, 1);
    assert.equal((await database.query('SELECT count(*)::int AS count FROM provisional_bookings')).rows[0].count, 0);

    await assert.rejects(
      database.query(
        `INSERT INTO airbnb_source_documents
           (import_batch_id, document_type, relative_path, sha256, source_external_id,
            page_count, captured_at, raw_extraction)
         VALUES ($1, 'booking', 'output/pdf/duplicate.pdf', $2, '2002', 1, NOW(), '{}')`,
        [batch.rows[0].id, 'a'.repeat(64)],
      ),
      /airbnb_source_documents_sha256_key/,
    );
    await assert.rejects(
      database.query(
        `INSERT INTO airbnb_reservation_documents
           (reservation_id, source_document_id)
         VALUES ($1, $2)`,
        [reservation.rows[0].id, reviewDocument.rows[0].id],
      ),
      /foreign key constraint/,
    );
    await assert.rejects(
      database.query(
        `INSERT INTO airbnb_reservations
           (conversation_id, source_listing_name, booker_display_name, arrival,
            departure, nights, cancellation_policy, currency, source_captured_at)
         VALUES ('2001', 'Other', 'Other', DATE '2026-11-01', DATE '2026-11-02',
                 1, 'Flexible', 'GBP', NOW())`,
      ),
      /airbnb_reservations_conversation_id_key/,
    );
    await assert.rejects(
      database.query(
        `INSERT INTO airbnb_review_category_ratings
           (review_id, category_key, category_display_name, rating, position)
         VALUES ($1, 'cleanliness', 'Cleanliness', 6, 1)`,
        [review.rows[0].id],
      ),
      /airbnb_review_category_ratings_rating_check/,
    );
    await assert.rejects(
      database.query(
        `INSERT INTO airbnb_financial_summaries
           (reservation_id, perspective, currency, total_minor, raw_display_text, captured_at)
         VALUES ($1, 'payout', 'gbp', 1, 'Invalid', NOW())`,
        [reservation.rows[0].id],
      ),
      /airbnb_financial_summaries_(perspective_check|currency_check)/,
    );

    const importedForeignTargets = await database.query<{ foreign_table: string }>(
      `SELECT DISTINCT foreign_table.relname AS foreign_table
         FROM pg_constraint constraint_record
         JOIN pg_class local_table ON local_table.oid = constraint_record.conrelid
         JOIN pg_namespace namespace_record ON namespace_record.oid = local_table.relnamespace
         JOIN pg_class foreign_table ON foreign_table.oid = constraint_record.confrelid
        WHERE constraint_record.contype = 'f'
          AND namespace_record.nspname = $1
          AND local_table.relname LIKE 'airbnb_%'`,
      [schema],
    );
    assert.equal(importedForeignTargets.rows.some((row) => row.foreign_table === 'provisional_bookings'), false);

    const migration = await readFile(new URL('055_airbnb_import_foundation.sql', directory), 'utf8');
    await database.query(migration);
  } finally {
    await database.end();
    await control.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schema)} CASCADE`);
    await control.end();
  }
});
