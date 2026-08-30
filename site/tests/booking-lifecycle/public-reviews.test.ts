import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validatePublicReviewData } from '../../src/lib/public-reviews.ts';

const root = new URL('../../', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');
const validReview = {
  id: 'cottage-2026-08-example',
  rating: 5,
  quote: 'A comfortable stay.',
  reviewer: { displayName: 'Example' },
  stay: { nights: 3, month: 'August', year: 2026 },
  listing: { key: 'cottage', displayName: 'Cottage at Olrig Bank' },
  source: { displayName: 'Airbnb guest review' },
  publication: { approved: true, approvedAt: '2026-08-30' },
};

test('the versioned public review dataset passes strict validation', async () => {
  const data = JSON.parse(await read('src/data/public-reviews.json'));
  const validated = validatePublicReviewData(data);
  assert.equal(validated.reviews.length, 51);
  assert.equal(new Set(validated.reviews.map((review) => review.id)).size, 51);
  assert.equal(validated.reviews[0].reviewer.displayName, 'Andrew');
  assert.equal(validated.reviews.at(-1)?.reviewer.displayName, 'David');
});

test('public review validation rejects duplicates, unapproved content, HTML, and private fields', () => {
  assert.throws(
    () => validatePublicReviewData({ schemaVersion: 1, reviews: [validReview, validReview] }),
    /Duplicate public review id/u,
  );
  assert.throws(
    () => validatePublicReviewData({
      schemaVersion: 1,
      reviews: [{ ...validReview, publication: { ...validReview.publication, approved: false } }],
    }),
    /not approved/u,
  );
  assert.throws(
    () => validatePublicReviewData({ schemaVersion: 1, reviews: [{ ...validReview, quote: '<b>Unsafe</b>' }] }),
    /without HTML/u,
  );
  assert.throws(
    () => validatePublicReviewData({ schemaVersion: 1, reviews: [{ ...validReview, reviewUrl: 'private' }] }),
    /prohibited fields/u,
  );
});

test('the homepage renders the accessible swipeable public review carousel near the contact footer', async () => {
  const [homepage, component, menu] = await Promise.all([
    read('src/pages/index.astro'),
    read('src/components/PublicReviewCarousel.astro'),
    read('src/components/SideMenu.astro'),
  ]);
  assert.match(homepage, /validatePublicReviewData\(publicReviewData\)/u);
  assert.match(homepage, /<PublicReviewCarousel reviews=\{publicReviews\}/u);
  assert.match(component, /data-review-carousel/u);
  assert.match(component, /data-review-previous/u);
  assert.match(component, /data-review-next/u);
  assert.match(component, /data-review-dot/u);
  assert.match(component, /data-review-more/u);
  assert.match(component, /data-review-full/u);
  assert.match(component, /aria-live="polite"/u);
  assert.match(component, /touch-action: pan-y/u);
  assert.match(component, /ArrowLeft/u);
  assert.match(component, /ArrowRight/u);
  assert.match(menu, /href="\/#guest-reviews"/u);
  assert.ok(homepage.indexOf('<PublicReviewCarousel') > homepage.indexOf('class="local-guide-panel"'));
  assert.doesNotMatch(component, /set:html/u);
});
