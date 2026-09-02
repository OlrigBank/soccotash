import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import {
  AIRBNB_ADMIN_MAX_PAGE_SIZE,
  getAirbnbDashboardSummary,
  listAirbnbReservations,
  listAirbnbReviews,
  parseAirbnbReservationListQuery,
  parseAirbnbReviewListQuery,
} from '../../src/lib/airbnb-admin/repository.ts';

const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

function scopedDatabaseUrl(baseUrl: string, schema: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set('options', `-c search_path=${schema},public`);
  return url.toString();
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

test('Airbnb admin queries are bounded, deterministic and privacy-minimized', async () => {
  assert.ok(databaseUrl, 'Set TEST_DATABASE_URL or DATABASE_URL to run the PostgreSQL integration test.');
  const schema = `airbnb_admin_${process.pid}_${crypto.randomBytes(6).toString('hex')}`;
  const control = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  const database = new pg.Pool({ connectionString: scopedDatabaseUrl(databaseUrl!, schema), max: 2 });
  try {
    await control.query(`CREATE SCHEMA ${quoteIdentifier(schema)}`);
    const directory = new URL('../../db/', import.meta.url);
    for (const filename of (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort()) {
      await database.query(await readFile(new URL(filename, directory), 'utf8'));
    }
    const reservations = await database.query<{ id: string }>(
      `INSERT INTO airbnb_reservations
         (conversation_id, property_id, source_listing_name, booker_display_name,
          arrival, departure, nights, party_size, source_status_text,
          cancellation_policy, currency, source_captured_at)
       VALUES
         ('7001','main-house','Main house','Percent% Guest','2026-10-10','2026-10-12',2,2,'Confirmed','Flexible','GBP',NOW()),
         ('7002','cottage','Cottage','Under_score Guest','2026-10-10','2026-10-12',2,1,NULL,'Flexible','GBP',NOW()),
         ('7003','main-house','Main house','Later Guest','2026-11-10','2026-11-12',2,2,'Cancelled','Flexible','GBP',NOW())
       RETURNING id::text`,
    );
    await database.query(
      `INSERT INTO airbnb_reservation_private_details
         (reservation_id, access_code_ciphertext, access_code_key_version, access_code_expires_at)
       VALUES ($1, decode('deadbeef','hex'), 1, NOW())`,
      [reservations.rows[0].id],
    );
    const batch = await database.query<{ id: string }>(
      `INSERT INTO airbnb_import_batches
         (source_collection, source_snapshot_on, importer_schema_version, expected_count, status, completed_at)
       VALUES ('reviews','2026-09-01',1,1,'completed',NOW()) RETURNING id::text`,
    );
    const source = await database.query<{ id: string }>(
      `INSERT INTO airbnb_source_documents
         (import_batch_id, document_type, relative_path, sha256, source_external_id,
          page_count, captured_at, raw_extraction)
       VALUES ($1,'review','private/review.pdf',$2,'8001',1,NOW(),'{}') RETURNING id::text`,
      [batch.rows[0].id, '8'.repeat(64)],
    );
    const review = await database.query<{ id: string }>(
      `INSERT INTO airbnb_reviews
         (review_id, source_document_id, reviewer_display_name, property_id,
          source_listing_name, arrival, departure, nights, published_on,
          overall_rating, public_text, private_feedback, captured_on)
       VALUES ('8001',$1,'Percent% Guest','main-house','Main house','2026-10-10',
               '2026-10-12',2,'2026-10-13',5,'Private test text','Private note','2026-09-01')
       RETURNING id::text`,
      [source.rows[0].id],
    );
    await database.query(
      `INSERT INTO airbnb_review_reservation_links
         (review_id,reservation_id,link_status,match_method,confidence,evidence,decision_source,reviewed_at)
       VALUES ($1,$2,'confirmed','stay_listing_identity',1,'{}','automatic',NOW())`,
      [review.rows[0].id, reservations.rows[0].id],
    );

    const parsed = parseAirbnbReservationListQuery(new URLSearchParams('pageSize=999&sort=unsafe&search=%'));
    assert.equal(parsed.pageSize, AIRBNB_ADMIN_MAX_PAGE_SIZE);
    assert.equal(parsed.sort, 'arrival-desc');
    const literalPercent = await listAirbnbReservations(parsed, database);
    assert.equal(literalPercent.total, 1);
    assert.equal(literalPercent.items[0].bookerDisplayName, 'Percent% Guest');
    assert.deepEqual(Object.keys(literalPercent.items[0]).sort(), [
      'arrival', 'bookerDisplayName', 'confirmationCodePresent', 'departure', 'id', 'nights',
      'partyDisplayName', 'partySize', 'propertyId', 'reviewLinkStatus', 'sourceListingName', 'sourceStatus',
    ]);
    assert.match(literalPercent.items[0].id, /^[0-9a-f-]{36}$/u);
    assert.equal(JSON.stringify(literalPercent).includes('deadbeef'), false);

    const page = await listAirbnbReservations(
      parseAirbnbReservationListQuery(new URLSearchParams('pageSize=1&from=2026-10-10&to=2026-10-10')),
      database,
    );
    assert.equal(page.total, 2);
    assert.equal(page.items.length, 1);

    const reviews = await listAirbnbReviews(
      parseAirbnbReviewListQuery(new URLSearchParams('rating=5&private=yes&link=confirmed')),
      database,
    );
    assert.equal(reviews.total, 1);
    assert.equal('publicText' in reviews.items[0], false);
    assert.equal('privateFeedback' in reviews.items[0], false);
    assert.deepEqual(await getAirbnbDashboardSummary(database), { reservations: 3, reviews: 1, proposedLinks: 0 });
  } finally {
    await database.end();
    await control.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schema)} CASCADE`);
    await control.end();
  }
});
