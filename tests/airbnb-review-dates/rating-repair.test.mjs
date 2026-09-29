import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createLocalFixtureDatabase } from '../support/local-fixture-database.mjs';
import { reviewText } from '../airbnb-capture/fixtures.mjs';
import { parseReviewDialog } from '../../site/scripts/airbnb-capture/records.mjs';
import { importAirbnbReviews } from '../../site/src/lib/airbnb-import/reviews.ts';
import { setReviewPublication, getPublishedReviews } from '../../site/src/lib/airbnb-admin/publication.ts';
import { repairReviewRatingTokens } from '../../site/scripts/repair-airbnb-review-ratings.mjs';

test('rating-token repair preserves four-star scores, evidence and publication status; dry-run and rerun are safe', async () => {
  const fixture = await createLocalFixtureDatabase('rating_repair');
  try {
    const dialogText = reviewText.replace(/Rating, ([1-5]) stars/gu, '$1 stars\n$1');
    const capturedAt = '2026-09-01T12:00:00Z';
    const correct = parseReviewDialog({ text: dialogText, reviewId: '9000000001', capturedAt });
    const original = structuredClone(correct);
    original.publicReview.text = `4 ${correct.publicReview.text}`;
    original.detailedRatings.forEach(category => category.feedback.unshift(String(category.rating)));
    await importAirbnbReviews({ sourceSnapshotOn: '2026-09-01', documents: [{ relativePath: 'output/pdf/fixture.pdf',
      sha256: createHash('sha256').update('fixture').digest('hex'), pageCount: 1, capturedAt, review: original }] }, fixture.database);
    const id = (await fixture.database.query('SELECT public_id FROM airbnb_reviews')).rows[0].public_id;
    const admin = (await fixture.database.query("INSERT INTO admin_users(email,display_name,password_hash) VALUES('repair@example.test','Fixture','disabled') RETURNING id::text")).rows[0].id;
    await setReviewPublication({ id, published: true, revision: 0, adminUserId: admin }, fixture.database);
    const captures = [{ dialogText, capturedAt, review: original }];
    const expected = { checked: 1, reviews: 1, publications: 1, feedbackTokens: 6 };
    assert.deepEqual(await repairReviewRatingTokens(captures, fixture.database), expected);
    assert.equal((await getPublishedReviews(fixture.database)).reviews[0].quote, original.publicReview.text);
    assert.deepEqual(await repairReviewRatingTokens(captures, fixture.database, { apply: true }), expected);
    const published = await getPublishedReviews(fixture.database);
    assert.equal(published.reviews[0].quote, correct.publicReview.text);
    assert.equal(published.reviews[0].rating, 4);
    assert.equal(published.summary.categories[1].score, 4);
    assert.deepEqual((await fixture.database.query('SELECT raw_extraction FROM airbnb_source_documents')).rows[0].raw_extraction, original);
    assert.deepEqual(await repairReviewRatingTokens(captures, fixture.database, { apply: true }), { checked: 1, reviews: 0, publications: 0, feedbackTokens: 0 });
    const tampered = structuredClone(captures); tampered[0].review.publicReview.rating = 5;
    await assert.rejects(repairReviewRatingTokens(tampered, fixture.database, { apply: true }));
    assert.equal((await fixture.database.query("SELECT count(*)::int count FROM admin_audit_log WHERE action='airbnb_review.repair_rating_tokens'")).rows[0].count, 1);
  } finally { await fixture.close(); }
});
