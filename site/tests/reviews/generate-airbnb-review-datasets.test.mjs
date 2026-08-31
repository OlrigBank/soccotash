import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseDetailedRatings,
  parseReviewPdfText,
  parseStayLine,
  toPublicReview,
  toPublicReviewSummary,
} from '../../scripts/generate-airbnb-review-datasets.mjs';

test('stay parsing handles omitted years, changing months, and year boundaries', () => {
  assert.deepEqual(parseStayLine('January 29 – February 1 - 3 nights · Published February 1, 2026'), {
    checkIn: '2026-01-29', checkOut: '2026-02-01', nights: 3, publishedAt: '2026-02-01',
  });
  assert.deepEqual(parseStayLine('December 29, 2025 – January 2, 2026 - 4 nights · Published January 2, 2026'), {
    checkIn: '2025-12-29', checkOut: '2026-01-02', nights: 4, publishedAt: '2026-01-02',
  });
  assert.throws(
    () => parseStayLine('March 21 – 23, 2025 - 3 nights · Published March 23, 2025'),
    /span 2 nights/u,
  );
});

test('public summary contains only aggregate category scores', () => {
  const detailedRatings = ['Check-in', 'Cleanliness', 'Accuracy', 'Communication', 'Location', 'Value']
    .map((category, index) => ({ category, rating: index === 1 ? 4 : 5, feedback: ['Private detail'] }));
  const summary = toPublicReviewSummary([
    { detailedRatings, publicReview: { rating: 5 } },
    { detailedRatings, publicReview: { rating: 4 } },
  ], '2026-08-30');
  assert.equal(summary.reviewCount, 2);
  assert.equal(summary.overallScore, 4.5);
  assert.equal(summary.categories[1].score, 4);
  assert.equal(JSON.stringify(summary).includes('Private detail'), false);
  assert.equal(JSON.stringify(summary).includes('feedback'), false);
});

test('detailed-rating parsing joins wrapped text and removes duplicate feedback', () => {
  const lines = [
    'Detailed ratings',
    'Check-in ★★★★★ 5 Clear instructions; Easy to find; Clear instructions',
    'Cleanliness ★★★★ 4 Squeaky-clean bathroom; Pristine',
    'kitchen',
    'Accuracy ★★★★★ 5',
    'Communication ★★★★★ 5',
    'Location ★★★★★ 5',
    'Value ★★★ 3',
    'Airbnb review ID 123',
  ];
  const ratings = parseDetailedRatings(lines, 0, 8);
  assert.deepEqual(ratings[0].feedback, ['Clear instructions', 'Easy to find']);
  assert.deepEqual(ratings[1].feedback, ['Squeaky-clean bathroom', 'Pristine kitchen']);
  assert.equal(ratings[5].rating, 3);
});

test('clean PDF parsing separates private fields from the public projection', () => {
  const text = `AIRBNB GUEST REVIEW

Fred's review
Olrig Bank: Spacious, but cosy, with large garden
August 27 – 30 - 3 nights · Published August 30, 2026

Public review · ★★★★ 4
Public words only.

Note from Fred
Only visible to you and Airbnb
Private words only.

Detailed ratings
Check-in ★★★★★ 5 Clear instructions
Cleanliness ★★★★ 4
Accuracy ★★★★★ 5
Communication ★★★★★ 5
Location ★★★★★ 5 Walkable; Walkable
Value ★★★ 3
Airbnb review ID 123456789 · Captured August 31, 2026
`;
  const review = parseReviewPdfText(text, '01-fred-123456789.pdf');
  assert.equal(review.privateFeedback.text, 'Private words only.');
  assert.equal(review.detailedRatings[4].feedback.length, 1);
  const published = toPublicReview(review, '2026-08-30');
  assert.equal(published.quote, 'Public words only.');
  assert.equal(JSON.stringify(published).includes('Private words'), false);
  assert.equal(JSON.stringify(published).includes('detailedRatings'), false);
  assert.equal(JSON.stringify(published).includes('123456789'), false);
});
