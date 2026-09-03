import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import {
  AIRBNB_ADMIN_MAX_PAGE_SIZE,
  getAirbnbDashboardSummary,
  getAirbnbReservationDetail,
  getAirbnbReviewDetail,
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
    const secondSource = await database.query<{ id: string }>(
      `INSERT INTO airbnb_source_documents
         (import_batch_id, document_type, relative_path, sha256, source_external_id,
          page_count, captured_at, raw_extraction)
       VALUES ($1,'review','private/review-two.pdf',$2,'8002',1,NOW(),'{}') RETURNING id::text`,
      [batch.rows[0].id, '6'.repeat(64)],
    );
    await database.query(
      `INSERT INTO airbnb_reviews
         (review_id, source_document_id, reviewer_display_name, property_id,
          source_listing_name, arrival, departure, nights, published_on,
          overall_rating, public_text, captured_on)
       VALUES ('8002',$1,'Élodie Guest','cottage','Cottage','2026-12-10',
               '2026-12-12',2,'2026-12-13',4,'Other review','2026-09-01')`,
      [secondSource.rows[0].id],
    );
    const ratings = await database.query<{ id: string; position: number }>(
      `INSERT INTO airbnb_review_category_ratings
         (review_id,category_key,category_display_name,rating,position)
       VALUES ($1,'cleanliness','Cleanliness',5,1),($1,'check-in','Check-in',4,0)
       RETURNING id::text,position`, [review.rows[0].id],
    );
    const checkInRating = ratings.rows.find((rating) => Number(rating.position) === 0)!;
    await database.query(
      `INSERT INTO airbnb_review_feedback_tags
         (category_rating_id,position,feedback_text,normalized_key)
       VALUES ($1,1,'Second tag','second-tag'),($1,0,'First tag','first-tag')`,
      [checkInRating.id],
    );
    await database.query(
      `INSERT INTO airbnb_review_reservation_links
         (review_id,reservation_id,link_status,match_method,confidence,evidence,decision_source,reviewed_at)
       VALUES ($1,$2,'confirmed','stay_listing_identity',1,'{}','automatic',NOW())`,
      [review.rows[0].id, reservations.rows[0].id],
    );
    const bookingSource = await database.query<{ id: string }>(
      `INSERT INTO airbnb_source_documents
         (import_batch_id, document_type, relative_path, sha256, source_external_id,
          page_count, captured_at, raw_extraction)
       VALUES ($1,'booking','private/booking.pdf',$2,'7001',2,NOW(),'{}') RETURNING id::text`,
      [batch.rows[0].id, '7'.repeat(64)],
    );
    await database.query(
      `INSERT INTO airbnb_reservation_documents (reservation_id,source_document_id,is_preferred)
       VALUES ($1,$2,TRUE)`, [reservations.rows[0].id, bookingSource.rows[0].id],
    );
    await database.query(
      `INSERT INTO airbnb_conversation_entries
         (reservation_id,position,entry_type,sender_type,sender_display_name,body,
          displayed_date,displayed_time,sent_at,timestamp_precision,raw_entry)
       VALUES
         ($1,0,'message','guest','Percent% Guest','Hello <script>. The code for that box is 2468.','Oct 1, 2026','1:00 PM',NOW(),'exact','{}'),
         ($1,1,'message','host','Host','Welcome','Oct 2','2:00 PM',NULL,'year_unknown','{}'),
         ($1,2,'service_event','airbnb','Airbnb service','Confirmed','Yesterday','3:00 PM',NULL,'unresolved','{}')`,
      [reservations.rows[0].id],
    );
    const financial = await database.query<{ id: string; perspective: string }>(
      `INSERT INTO airbnb_financial_summaries
         (reservation_id,perspective,currency,total_minor,arithmetic_status,raw_display_text,captured_at)
       VALUES ($1,'host_earnings','GBP',9500,'verified','private raw panel',NOW()),
              ($1,'guest_paid','GBP',12000,'verified','private guest panel',NOW())
       RETURNING id::text,perspective`, [reservations.rows[0].id],
    );
    const hostSummary = financial.rows.find((row) => row.perspective === 'host_earnings')!;
    const parent = await database.query<{ id: string }>(
      `INSERT INTO airbnb_financial_line_items
         (financial_summary_id,position,item_type,description,amount_minor,raw_display_text)
       VALUES ($1,0,'accommodation','Room fee',10000,'private parent') RETURNING id::text`, [hostSummary.id],
    );
    await database.query(
      `INSERT INTO airbnb_financial_line_items
         (financial_summary_id,parent_line_item_id,position,item_type,description,amount_minor,raw_display_text)
       VALUES ($1,$2,1,'nightly_charge','First night',10000,'private child'),
              ($1,NULL,2,'host_service_fee','Host fee',-500,'private fee')`, [hostSummary.id, parent.rows[0].id],
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
    const combined = await listAirbnbReservations(
      parseAirbnbReservationListQuery(new URLSearchParams('property=cottage&status=unset&link=unlinked&search=_&sort=arrival-asc')),
      database,
    );
    assert.equal(combined.total, 1);
    assert.equal(combined.items[0].bookerDisplayName, 'Under_score Guest');
    const ordered = await listAirbnbReservations(
      parseAirbnbReservationListQuery(new URLSearchParams('from=2026-10-10&to=2026-10-10&sort=arrival-asc')),
      database,
    );
    assert.deepEqual(ordered.items.map((item) => item.bookerDisplayName), ['Percent% Guest', 'Under_score Guest']);
    const empty = await listAirbnbReservations(
      parseAirbnbReservationListQuery(new URLSearchParams('search=does-not-exist')),
      database,
    );
    assert.deepEqual({ total: empty.total, items: empty.items }, { total: 0, items: [] });
    const invalid = parseAirbnbReservationListQuery(new URLSearchParams('page=-2&pageSize=nope&sort=drop-table&from=2026-02-30'));
    assert.deepEqual(
      { page: invalid.page, pageSize: invalid.pageSize, sort: invalid.sort, arrivalFrom: invalid.arrivalFrom },
      { page: 1, pageSize: 25, sort: 'arrival-desc', arrivalFrom: null },
    );

    const reviews = await listAirbnbReviews(
      parseAirbnbReviewListQuery(new URLSearchParams('rating=5&private=yes&link=confirmed')),
      database,
    );
    assert.equal(reviews.total, 1);
    assert.equal('publicText' in reviews.items[0], false);
    assert.equal('privateFeedback' in reviews.items[0], false);
    const unlinkedReviews = await listAirbnbReviews(
      parseAirbnbReviewListQuery(new URLSearchParams('rating=4&private=no&link=unlinked&search=Élodie')),
      database,
    );
    assert.equal(unlinkedReviews.total, 1);
    assert.deepEqual(await getAirbnbDashboardSummary(database), { reservations: 3, reviews: 2, proposedLinks: 0 });
    const detail = await getAirbnbReservationDetail(literalPercent.items[0].id, database);
    assert.ok(detail);
    assert.deepEqual(detail.conversation.map((entry) => entry.timestampPrecision), ['exact', 'year_unknown', 'unresolved']);
    assert.equal(detail.conversation[0].body, 'Hello <script>. The code for that box is [Access code redacted].');
    const storedMessage = await database.query(`SELECT body FROM airbnb_conversation_entries WHERE reservation_id=$1 AND position=0`, [reservations.rows[0].id]);
    assert.equal(storedMessage.rows[0].body, 'Hello <script>. The code for that box is 2468.');
    assert.equal(detail.financialSummaries.length, 2);
    assert.equal(detail.financialSummaries[0].lineItems[1].parentPosition, 0);
    assert.equal(detail.provenance[0].abbreviatedHash, '777777777777');
    assert.equal(detail.reviewLinks[0].reviewId.length, 36);
    const serialized = JSON.stringify(detail);
    assert.equal(serialized.includes('deadbeef'), false);
    assert.equal(serialized.includes('private raw panel'), false);
    assert.equal(await getAirbnbReservationDetail('not-a-uuid', database), null);
    assert.equal(await getAirbnbReservationDetail(crypto.randomUUID(), database), null);
    const reviewDetail = await getAirbnbReviewDetail(reviews.items[0].id, database);
    assert.ok(reviewDetail);
    assert.deepEqual(reviewDetail.categoryRatings.map((rating) => rating.key), ['check-in', 'cleanliness']);
    assert.deepEqual(reviewDetail.categoryRatings[0].feedbackTags, ['First tag', 'Second tag']);
    assert.equal(reviewDetail.reservationLinks[0].reservationId, literalPercent.items[0].id);
    assert.equal(reviewDetail.publicText, 'Private test text');
    assert.equal(reviewDetail.privateFeedback, 'Private note');
    assert.equal(JSON.stringify(reviewDetail).includes('raw_extraction'), false);
    assert.equal(await getAirbnbReviewDetail('not-a-uuid', database), null);
  } finally {
    await database.end();
    await control.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schema)} CASCADE`);
    await control.end();
  }
});
