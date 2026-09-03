import { isDeepStrictEqual } from 'node:util';
import type { Pool, PoolClient } from 'pg';

export interface ParsedAirbnbReview {
  source: {
    platform: 'airbnb';
    reviewId: string;
    pdfFilename: string;
    capturedAt: string;
  };
  reviewer: { displayName: string };
  listing: { key: string; displayName: string; sourceDisplayName: string };
  stay: { checkIn: string; checkOut: string; nights: number };
  publishedAt: string;
  publicReview: { rating: number; text: string };
  privateFeedback: { text: string } | null;
  detailedRatings: Array<{
    category: string;
    rating: number;
    feedback: string[];
  }>;
}

export interface AirbnbReviewImportDocument {
  relativePath: string;
  sha256: string;
  pageCount: number;
  capturedAt: string;
  review: ParsedAirbnbReview;
}

export interface AirbnbReviewImportResult {
  batchId: string;
  documentsProcessed: number;
  documentsAdded: number;
  reviewsAdded: number;
  reviewsUnchanged: number;
}

export class AirbnbReviewImportConflict extends Error {
  readonly code = 'AIRBNB_REVIEW_IMPORT_CONFLICT';
  readonly reviewId: string;

  constructor(reviewId: string, reason: string) {
    super(`Airbnb review ${reviewId}: ${reason}`);
    this.name = 'AirbnbReviewImportConflict';
    this.reviewId = reviewId;
  }
}

function categoryKey(value: string): string {
  return value.toLocaleLowerCase('en-GB').replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '');
}

function feedbackKey(value: string): string {
  return value.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('en-GB');
}

function sameJson(left: unknown, right: unknown): boolean {
  return isDeepStrictEqual(left, right);
}

async function insertReviewGraph(
  client: PoolClient,
  sourceDocumentId: string,
  review: ParsedAirbnbReview,
): Promise<void> {
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO airbnb_reviews
       (review_id, source_document_id, reviewer_display_name, property_id,
        source_listing_name, arrival, departure, nights, published_on,
        overall_rating, public_text, private_feedback, captured_on)
     VALUES ($1, $2, $3, $4, $5, $6::date, $7::date, $8, $9::date,
             $10, $11, $12, $13::date)
     RETURNING id::text`,
    [
      review.source.reviewId,
      sourceDocumentId,
      review.reviewer.displayName,
      review.listing.key,
      review.listing.sourceDisplayName,
      review.stay.checkIn,
      review.stay.checkOut,
      review.stay.nights,
      review.publishedAt,
      review.publicReview.rating,
      review.publicReview.text,
      review.privateFeedback?.text ?? null,
      review.source.capturedAt,
    ],
  );
  const reviewDatabaseId = inserted.rows[0].id;

  for (const [ratingPosition, rating] of review.detailedRatings.entries()) {
    const insertedRating = await client.query<{ id: string }>(
      `INSERT INTO airbnb_review_category_ratings
         (review_id, category_key, category_display_name, rating, position)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id::text`,
      [reviewDatabaseId, categoryKey(rating.category), rating.category, rating.rating, ratingPosition],
    );
    for (const [tagPosition, feedback] of rating.feedback.entries()) {
      await client.query(
        `INSERT INTO airbnb_review_feedback_tags
           (category_rating_id, position, feedback_text, normalized_key)
         VALUES ($1, $2, $3, $4)`,
        [insertedRating.rows[0].id, tagPosition, feedback, feedbackKey(feedback)],
      );
    }
  }
}

export async function importAirbnbReviews(
  input: {
    sourceSnapshotOn: string;
    documents: AirbnbReviewImportDocument[];
  },
  database: Pool,
): Promise<AirbnbReviewImportResult> {
  const batch = await database.query<{ id: string }>(
    `INSERT INTO airbnb_import_batches
       (source_collection, source_snapshot_on, importer_schema_version,
        expected_count, status)
     VALUES ('reviews', $1::date, 1, $2, 'pending')
     RETURNING id::text`,
    [input.sourceSnapshotOn, input.documents.length],
  );
  const batchId = batch.rows[0].id;
  const client = await database.connect();
  let documentsAdded = 0;
  let reviewsAdded = 0;
  let reviewsUnchanged = 0;

  try {
    await client.query('BEGIN');
    for (const document of input.documents) {
      const reviewId = document.review.source.reviewId;
      if (document.review.source.platform !== 'airbnb' || !/^\d+$/u.test(reviewId)) {
        throw new AirbnbReviewImportConflict(reviewId || 'unknown', 'invalid source identity');
      }

      const hashMatch = await client.query<{
        id: string;
        document_type: string;
        source_external_id: string;
      }>(
        `SELECT id::text, document_type, source_external_id
           FROM airbnb_source_documents WHERE sha256 = $1`,
        [document.sha256],
      );
      if (hashMatch.rowCount) {
        const existing = hashMatch.rows[0];
        if (existing.document_type !== 'review' || existing.source_external_id !== reviewId) {
          throw new AirbnbReviewImportConflict(reviewId, 'document hash belongs to different source evidence');
        }
      }

      const existingReview = await client.query<{ raw_extraction: ParsedAirbnbReview }>(
        `SELECT source.raw_extraction
           FROM airbnb_reviews review
           JOIN airbnb_source_documents source ON source.id = review.source_document_id
          WHERE review.review_id = $1`,
        [reviewId],
      );
      if (existingReview.rowCount && !sameJson(existingReview.rows[0].raw_extraction, document.review)) {
        throw new AirbnbReviewImportConflict(reviewId, 'canonical content conflicts with stored evidence');
      }

      let sourceDocumentId = hashMatch.rows[0]?.id;
      if (!sourceDocumentId) {
        const insertedDocument = await client.query<{ id: string }>(
          `INSERT INTO airbnb_source_documents
             (import_batch_id, document_type, relative_path, sha256,
              source_external_id, page_count, captured_at, raw_extraction)
           VALUES ($1, 'review', $2, $3, $4, $5, $6::timestamptz, $7::jsonb)
           RETURNING id::text`,
          [
            batchId,
            document.relativePath,
            document.sha256,
            reviewId,
            document.pageCount,
            document.capturedAt,
            JSON.stringify(document.review),
          ],
        );
        sourceDocumentId = insertedDocument.rows[0].id;
        documentsAdded += 1;
      }

      if (existingReview.rowCount) {
        reviewsUnchanged += 1;
      } else {
        await insertReviewGraph(client, sourceDocumentId, document.review);
        reviewsAdded += 1;
      }
    }

    await client.query(
      `UPDATE airbnb_import_batches
          SET status = 'completed', imported_count = $2, completed_at = NOW()
        WHERE id = $1`,
      [batchId, input.documents.length],
    );
    await client.query('COMMIT');
    return {
      batchId,
      documentsProcessed: input.documents.length,
      documentsAdded,
      reviewsAdded,
      reviewsUnchanged,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    await database.query(
      `UPDATE airbnb_import_batches
          SET status = 'failed', completed_at = NOW(),
              diagnostics = jsonb_build_object('errorCode', $2::text)
        WHERE id = $1`,
      [batchId, error instanceof AirbnbReviewImportConflict ? error.code : 'AIRBNB_REVIEW_IMPORT_FAILED'],
    );
    throw error;
  } finally {
    client.release();
  }
}
