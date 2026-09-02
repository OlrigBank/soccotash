import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import {
  decideAirbnbReviewReservationLink,
  reconcileAirbnbReviews,
} from '../../src/lib/airbnb-import/reconciliation.ts';

const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

function scopedDatabaseUrl(baseUrl: string, schema: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set('options', `-c search_path=${schema},public`);
  return url.toString();
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

test('reconciliation confirms unique evidence and preserves immutable manual decisions', async () => {
  assert.ok(databaseUrl, 'Set TEST_DATABASE_URL or DATABASE_URL to run the PostgreSQL integration test.');
  const schema = `airbnb_reconciliation_${process.pid}_${crypto.randomBytes(6).toString('hex')}`;
  const control = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  const database = new pg.Pool({ connectionString: scopedDatabaseUrl(databaseUrl!, schema), max: 2 });
  try {
    await control.query(`CREATE SCHEMA ${quoteIdentifier(schema)}`);
    const directory = new URL('../../db/', import.meta.url);
    for (const filename of (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort()) {
      await database.query(await readFile(new URL(filename, directory), 'utf8'));
    }
    const batch = await database.query<{ id: string }>(
      `INSERT INTO airbnb_import_batches
         (source_collection, source_snapshot_on, importer_schema_version, expected_count, status, completed_at)
       VALUES ('mixed', DATE '2026-09-01', 1, 3, 'completed', NOW()) RETURNING id::text`,
    );
    const admin = await database.query<{ id: string }>(
      `INSERT INTO admin_users (email, display_name, password_hash)
       VALUES ('reconciliation@example.test', 'Reviewer', 'not-a-real-hash') RETURNING id::text`,
    );
    async function reservation(conversationId: string, name: string, arrival: string, departure: string): Promise<void> {
      await database.query(
        `INSERT INTO airbnb_reservations
           (conversation_id, property_id, source_listing_name, booker_display_name,
            arrival, departure, nights, cancellation_policy, currency, source_captured_at)
         VALUES ($1, 'main-house', 'Synthetic listing', $2, $3::date, $4::date,
                 $4::date-$3::date, 'Synthetic', 'GBP', NOW())`,
        [conversationId, name, arrival, departure],
      );
    }
    async function review(reviewId: string, name: string, arrival: string, departure: string): Promise<void> {
      const source = await database.query<{ id: string }>(
        `INSERT INTO airbnb_source_documents
           (import_batch_id, document_type, relative_path, sha256, source_external_id,
            page_count, captured_at, raw_extraction)
         VALUES ($1, 'review', $2, $3, $4, 1, NOW(), '{}'::jsonb) RETURNING id::text`,
        [batch.rows[0].id, `private/${reviewId}.pdf`, reviewId.padStart(64, '0'), reviewId],
      );
      await database.query(
        `INSERT INTO airbnb_reviews
           (review_id, source_document_id, reviewer_display_name, property_id,
            source_listing_name, arrival, departure, nights, published_on,
            overall_rating, public_text, captured_on)
         VALUES ($1, $2, $3, 'main-house', 'Synthetic listing', $4::date, $5::date,
                 $5::date-$4::date, $5::date, 5, 'Synthetic', DATE '2026-09-01')`,
        [reviewId, source.rows[0].id, name, arrival, departure],
      );
    }
    await reservation('1001', 'Alice Smith', '2026-01-01', '2026-01-03');
    await reservation('1002', 'Bob Jones', '2026-02-01', '2026-02-03');
    await reservation('1003', 'Different Guest', '2026-02-01', '2026-02-03');
    await review('2001', 'Alice Smith', '2026-01-01', '2026-01-03');
    await review('2002', 'Bob', '2026-02-01', '2026-02-03');
    await review('2003', 'Nobody', '2026-03-01', '2026-03-03');

    const first = await reconcileAirbnbReviews(database);
    assert.deepEqual(
      { reviews: first.reviewsConsidered, candidates: first.candidatesFound, confirmed: first.automaticallyConfirmed, proposed: first.proposed },
      { reviews: 3, candidates: 3, confirmed: 2, proposed: 1 },
    );
    const proposed = await database.query<{ id: string }>(
      `SELECT id::text FROM airbnb_review_reservation_links WHERE link_status='proposed'`,
    );
    await decideAirbnbReviewReservationLink(database, {
      linkId: proposed.rows[0].id,
      decision: 'confirmed',
      adminUserId: admin.rows[0].id,
    });
    await assert.rejects(
      decideAirbnbReviewReservationLink(database, {
        linkId: proposed.rows[0].id,
        decision: 'rejected',
        adminUserId: admin.rows[0].id,
      }),
      /already been decided/u,
    );
    const rerun = await reconcileAirbnbReviews(database);
    assert.equal(rerun.linksAdded, 0);
    assert.equal(rerun.manualDecisionsPreserved, 2);
    assert.equal((await database.query(
      `SELECT count(*)::int AS count FROM admin_audit_log
        WHERE action IN ('airbnb_review_reservation_decided', 'airbnb_review_reservation_superseded')`,
    )).rows[0].count, 2);
    assert.equal((await database.query(
      `SELECT count(*)::int AS count FROM airbnb_review_reservation_links
        WHERE review_id=(SELECT review_id FROM airbnb_review_reservation_links WHERE id=$1)
          AND link_status='confirmed'`,
      [proposed.rows[0].id],
    )).rows[0].count, 1);
  } finally {
    await database.end();
    await control.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schema)} CASCADE`);
    await control.end();
  }
});
