import type { Pool, PoolClient } from 'pg';
import { getPool } from './booking/db.ts';
import { validatePublicReviewData, validatePublicReviewSummary, type PublicReview, type PublicReviewSummary } from './public-reviews.ts';

type Database = Pick<Pool, 'query'> | PoolClient;
type Scores = PublicReviewSummary['categories'];

export function publicReviewSummary(reviews: PublicReview[], scores: Scores[]): PublicReviewSummary | null {
  if (!reviews.length) return null;
  if (reviews.length !== scores.length) throw new Error('Review ratings are incomplete.');
  for (const [index, values] of scores.entries()) {
    validatePublicReviewSummary({ schemaVersion: 1, reviewCount: 1, scale: 5,
      overallScore: reviews[index].rating, categories: values,
      source: { displayName: 'Airbnb detailed ratings' }, publication: reviews[index].publication });
    if (values.some(value => !Number.isInteger(value.score))) throw new Error('Individual ratings must be whole numbers.');
  }
  const average = (values: number[]) => Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
  return validatePublicReviewSummary({ schemaVersion: 1, reviewCount: reviews.length, scale: 5,
    overallScore: average(reviews.map(review => review.rating)),
    categories: scores[0].map((category, index) => ({ ...category, score: average(scores.map(values => values[index].score)) })),
    source: { displayName: 'Airbnb detailed ratings' },
    publication: { approved: true, approvedAt: reviews.map(review => review.publication.approvedAt).sort().at(-1)! },
  });
}

export async function getPublishedReviews(database: Database = getPool()) {
  // One statement gives the cards and aggregates the same publication snapshot.
  // No private feedback, conversation, source path or booking fields are selected.
  const result = await database.query(`SELECT p.public_review, p.category_scores
    FROM airbnb_review_publications p JOIN airbnb_reviews r ON r.id=p.review_id
    WHERE p.published ORDER BY r.arrival DESC, r.review_id DESC`);
  const reviews = validatePublicReviewData({ schemaVersion: 1, reviews: result.rows.map(row => row.public_review) }).reviews;
  return { reviews, summary: publicReviewSummary(reviews, result.rows.map(row => row.category_scores)) };
}

