import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validatePublicReviewData, validatePublicReviewSummary } from '../../src/lib/public-reviews.ts';

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
  assert.equal(validated.reviews.length, 52);
  assert.equal(new Set(validated.reviews.map((review) => review.id)).size, 52);
  assert.equal(validated.reviews[0].reviewer.displayName, 'Fred');
  assert.equal(validated.reviews.at(-1)?.reviewer.displayName, 'Theo');
  assert.equal(validated.reviews.filter((review) => review.rating === 4).length, 2);
  assert.deepEqual(
    validated.reviews.filter((review) => review.rating === 4).map((review) => review.reviewer.displayName),
    ['Christopher', 'Emma'],
  );
  assert.equal(validated.reviews.filter((review) => review.rating === 5).length, 50);
});

test('the public detailed-ratings summary passes strict validation', async () => {
  const data = JSON.parse(await read('src/data/public-review-summary.json'));
  const validated = validatePublicReviewSummary(data);
  assert.equal(validated.reviewCount, 52);
  assert.equal(validated.overallScore, 4.96);
  assert.deepEqual(validated.categories.map((category) => category.key), [
    'check-in', 'cleanliness', 'accuracy', 'communication', 'location', 'value',
  ]);
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

test('the homepage renders an item-based responsive review carousel immediately after the gallery', async () => {
  const [homepage, component, menu] = await Promise.all([
    read('src/pages/index.astro'),
    read('src/components/PublicReviewCarousel.astro'),
    read('src/components/SideMenu.astro'),
  ]);
  assert.match(homepage, /validatePublicReviewData\(publicReviewData\)/u);
  assert.match(homepage, /<PublicReviewCarousel reviews=\{publicReviews\} summary=\{publicReviewSummary\}/u);
  assert.match(component, /data-review-carousel/u);
  assert.match(component, />What our guests say<\/h2>/u);
  assert.match(component, /reviews\.map\(\(review, index\)/u);
  assert.match(component, /aria-label=\{`Review \$\{index \+ 1\} of \$\{total\}`\}/u);
  assert.match(component, /data-review-card/u);
  assert.match(component, /data-review-previous/u);
  assert.match(component, /data-review-next/u);
  assert.match(component, /data-review-dot/u);
  assert.match(component, /data-review-more/u);
  assert.match(component, /data-review-full/u);
  assert.match(component, /review-carousel__rating--below-five/u);
  assert.match(component, /review-carousel__filled-stars/u);
  assert.match(component, /review-carousel__empty-stars/u);
  assert.match(component, /aria-live="polite"/u);
  assert.match(component, /touch-action: pan-y/u);
  assert.match(component, />Rating by Airbnb category<\/h3>/u);
  assert.doesNotMatch(component, />The details guests notice<\/h3>/u);
  assert.match(component, /summary\.categories\.map/u);
  assert.match(component, /ArrowLeft/u);
  assert.match(component, /ArrowRight/u);
  assert.match(menu, /href="\/#guest-reviews"/u);
  assert.ok(homepage.indexOf('<PublicReviewCarousel') > homepage.indexOf('<HomeGallery'));
  assert.ok(homepage.indexOf('<PublicReviewCarousel') < homepage.indexOf('class="local-guide-panel"'));
  assert.match(component, /Review \$\{current \+ 1\} of \$\{carousel\.dataset\.total\}/u);
  assert.match(component, /flex:\s*0 0 88%/u);
  assert.match(component, /flex-basis: calc\(\(100% - 0\.65rem\) \/ 2\)/u);
  assert.match(component, /flex-basis: calc\(\(100% - 1\.3rem\) \/ 3\)/u);
  assert.match(component, /slidesContainer\.scrollTo/u);
  assert.match(component, /const visibleCount = matchMedia\('\(min-width: 1000px\)'\)\.matches \? 3/u);
  assert.match(component, /slide\.setAttribute\('aria-hidden', String\(!visible\)\)/u);
  assert.match(component, /slide\.inert = !visible/u);
  assert.match(component, /closest<HTMLElement>\('\[data-review-card\]'\)/u);
  assert.doesNotMatch(component, /set:html/u);
});
