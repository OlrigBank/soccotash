import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import {
  AirbnbReviewImportConflict,
  importAirbnbReviews,
  type AirbnbReviewImportDocument,
  type ParsedAirbnbReview,
} from '../../src/lib/airbnb-import/reviews.ts';

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

function syntheticReview(publicText = 'A synthetic public review.'): ParsedAirbnbReview {
  return {
    source: {
      platform: 'airbnb',
      reviewId: '900000000000000001',
      pdfFilename: 'synthetic-review.pdf',
      capturedAt: '2026-08-31',
    },
    reviewer: { displayName: 'Synthetic Reviewer' },
    listing: { key: 'main-house', displayName: 'Olrig Bank', sourceDisplayName: 'Synthetic listing' },
    stay: { checkIn: '2026-08-20', checkOut: '2026-08-22', nights: 2 },
    publishedAt: '2026-08-22',
    publicReview: { rating: 5, text: publicText },
    privateFeedback: { text: 'Synthetic private feedback.' },
    detailedRatings: [
      { category: 'Check-in', rating: 5, feedback: ['Clear instructions', 'Easy to find'] },
      { category: 'Cleanliness', rating: 5, feedback: [] },
      { category: 'Accuracy', rating: 5, feedback: ['Matched the description'] },
      { category: 'Communication', rating: 5, feedback: ['Responsive host'] },
      { category: 'Location', rating: 5, feedback: ['Peaceful'] },
      { category: 'Value', rating: 5, feedback: [] },
    ],
  };
}

function documentFor(review: ParsedAirbnbReview, suffix = 'one'): AirbnbReviewImportDocument {
  return {
    relativePath: `output/pdf/airbnb-reviews/synthetic-${suffix}.pdf`,
    sha256: crypto.createHash('sha256').update(`synthetic-${suffix}`).digest('hex'),
    pageCount: 1,
    capturedAt: '2026-08-31T00:00:00.000Z',
    review,
  };
}

test('Airbnb review import is normalized, idempotent and conflict-safe', async () => {
  assert.ok(databaseUrl, 'Set TEST_DATABASE_URL or DATABASE_URL to run the PostgreSQL integration test.');
  const schema = `airbnb_reviews_${process.pid}_${crypto.randomBytes(6).toString('hex')}`;
  const control = new Pool({ connectionString: databaseUrl, ssl: databaseSsl(), max: 1 });
  const database = new Pool({ connectionString: scopedDatabaseUrl(databaseUrl!, schema), ssl: databaseSsl(), max: 2 });

  try {
    await control.query(`CREATE SCHEMA ${quoteIdentifier(schema)}`);
    const directory = new URL('../../db/', import.meta.url);
    for (const filename of (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort()) {
      await database.query(await readFile(new URL(filename, directory), 'utf8'));
    }

    const review = syntheticReview();
    const first = await importAirbnbReviews(
      { sourceSnapshotOn: '2026-08-31', documents: [documentFor(review)] },
      database,
    );
    assert.deepEqual(
      {
        documentsProcessed: first.documentsProcessed,
        documentsAdded: first.documentsAdded,
        reviewsAdded: first.reviewsAdded,
        reviewsUnchanged: first.reviewsUnchanged,
      },
      { documentsProcessed: 1, documentsAdded: 1, reviewsAdded: 1, reviewsUnchanged: 0 },
    );
    assert.equal((await database.query('SELECT count(*)::int AS count FROM airbnb_reviews')).rows[0].count, 1);
    assert.equal((await database.query('SELECT count(*)::int AS count FROM airbnb_review_category_ratings')).rows[0].count, 6);
    assert.equal((await database.query('SELECT count(*)::int AS count FROM airbnb_review_feedback_tags')).rows[0].count, 5);
    assert.equal((await database.query('SELECT private_feedback FROM airbnb_reviews')).rows[0].private_feedback, 'Synthetic private feedback.');

    const second = await importAirbnbReviews(
      { sourceSnapshotOn: '2026-08-31', documents: [documentFor(review)] },
      database,
    );
    assert.equal(second.documentsAdded, 0);
    assert.equal(second.reviewsAdded, 0);
    assert.equal(second.reviewsUnchanged, 1);

    const additionalEvidence = await importAirbnbReviews(
      { sourceSnapshotOn: '2026-09-01', documents: [documentFor(review, 'two')] },
      database,
    );
    assert.equal(additionalEvidence.documentsAdded, 1);
    assert.equal(additionalEvidence.reviewsUnchanged, 1);
    assert.equal((await database.query('SELECT count(*)::int AS count FROM airbnb_source_documents')).rows[0].count, 2);
    assert.equal((await database.query('SELECT count(*)::int AS count FROM airbnb_reviews')).rows[0].count, 1);

    await assert.rejects(
      importAirbnbReviews(
        {
          sourceSnapshotOn: '2026-09-02',
          documents: [documentFor(syntheticReview('Conflicting public review.'), 'conflict')],
        },
        database,
      ),
      (error: unknown) => error instanceof AirbnbReviewImportConflict
        && error.code === 'AIRBNB_REVIEW_IMPORT_CONFLICT',
    );
    assert.equal((await database.query('SELECT count(*)::int AS count FROM airbnb_source_documents')).rows[0].count, 2);
    assert.equal((await database.query('SELECT count(*)::int AS count FROM airbnb_reviews')).rows[0].count, 1);
    assert.deepEqual(
      (await database.query(
        `SELECT status, diagnostics->>'errorCode' AS error_code
           FROM airbnb_import_batches ORDER BY id DESC LIMIT 1`,
      )).rows[0],
      { status: 'failed', error_code: 'AIRBNB_REVIEW_IMPORT_CONFLICT' },
    );
  } finally {
    await database.end();
    await control.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schema)} CASCADE`);
    await control.end();
  }
});
