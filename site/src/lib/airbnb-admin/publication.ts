import type { Pool, PoolClient } from 'pg';
import { getPool } from '../booking/db.ts';
import { validatePublicReviewData, type PublicReview, type PublicReviewSummary } from '../public-reviews.ts';

import { publicReviewSummary } from '../public-review-repository.ts';
export { getPublishedReviews, publicReviewSummary } from '../public-review-repository.ts';

type Database = Pick<Pool, 'query'> | PoolClient;
type Scores = PublicReviewSummary['categories'];
export class ReviewPublicationError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const categories = ['check-in', 'cleanliness', 'accuracy', 'communication', 'location', 'value'];

export async function getReviewPublication(id: string, database: Database = getPool()) {
  if (!uuid.test(id)) throw new ReviewPublicationError('Review not found.', 404);
  const result = await database.query(`SELECT r.id::text, r.public_id::text, r.reviewer_display_name,
      r.property_id, r.arrival::text, r.nights, r.overall_rating, r.public_text,
      p.published, p.public_review, p.category_scores, p.revision
    FROM airbnb_reviews r LEFT JOIN airbnb_review_publications p ON p.review_id=r.id
    WHERE r.public_id=$1::uuid`, [id]);
  if (!result.rowCount) throw new ReviewPublicationError('Review not found.', 404);
  const row = result.rows[0];
  let review: PublicReview;
  let scores: Scores;
  if (row.public_review) { review = row.public_review; scores = row.category_scores; }
  else {
    const date = new Date(`${row.arrival}T00:00:00Z`);
    review = {
      id: row.public_id, rating: row.overall_rating, quote: row.public_text,
      reviewer: { displayName: row.reviewer_display_name },
      stay: { nights: row.nights, month: date.toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' }), year: date.getUTCFullYear() },
      listing: { key: row.property_id, displayName: row.property_id === 'cottage' ? 'Cottage at Olrig Bank' : 'Olrig Bank' },
      source: { displayName: 'Airbnb guest review' },
      publication: { approved: true, approvedAt: new Date().toISOString().slice(0, 10) },
    };
    const ratings = await database.query(`SELECT category_key,category_display_name,rating
      FROM airbnb_review_category_ratings WHERE review_id=$1`, [row.id]);
    scores = categories.map(key => {
      const rating = ratings.rows.find(value => value.category_key === key);
      return { key, displayName: rating?.category_display_name, score: rating?.rating };
    });
  }
  let eligible = true;
  try { validatePublicReviewData({ schemaVersion: 1, reviews: [review] }); publicReviewSummary([review], [scores]); }
  catch { eligible = false; }
  return { internalId: row.id as string, published: row.published === true,
    revision: Number(row.revision || 0), review, scores, eligible };
}

export async function setReviewPublication(input: { id: string; published: boolean; revision: number; adminUserId: string }, database: Pool = getPool()) {
  if (!uuid.test(input.id) || !Number.isInteger(input.revision) || input.revision < 0) throw new ReviewPublicationError('Invalid publication request.');
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    // Lock the parent too: a publication row does not exist before first approval.
    await client.query('SELECT id FROM airbnb_reviews WHERE public_id=$1::uuid FOR UPDATE', [input.id]);
    const current = await getReviewPublication(input.id, client);
    if (current.revision !== input.revision) throw new ReviewPublicationError('This review changed. Reload the page before trying again.', 409);
    if (input.published && !current.eligible) throw new ReviewPublicationError('This review needs valid public text and all six category ratings before publication.');
    if (input.published !== current.published) {
      if (input.published) current.review.publication.approvedAt = new Date().toISOString().slice(0, 10);
      await client.query(`INSERT INTO airbnb_review_publications(review_id,published,public_review,category_scores,updated_by)
        VALUES($1,$2,$3::jsonb,$4::jsonb,$5)
        ON CONFLICT(review_id) DO UPDATE SET published=EXCLUDED.published, public_review=EXCLUDED.public_review,
          revision=airbnb_review_publications.revision+1, updated_by=EXCLUDED.updated_by, updated_at=NOW()`,
        [current.internalId, input.published, JSON.stringify(current.review), JSON.stringify(current.scores), input.adminUserId]);
      await client.query(`INSERT INTO admin_audit_log(admin_user_id,action,entity_type,entity_id,details)
        VALUES($1,$2,'airbnb_review',$3,$4::jsonb)`, [input.adminUserId,
        input.published ? 'airbnb_review.publish' : 'airbnb_review.unpublish', input.id,
        JSON.stringify({ previousRevision: current.revision })]);
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
