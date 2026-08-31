export type PublicReview = {
  id: string;
  rating: number;
  quote: string;
  reviewer: { displayName: string };
  stay: { nights: number; month: string; year: number };
  listing: { key: 'main-house' | 'cottage'; displayName: string };
  source: { displayName: string };
  publication: { approved: true; approvedAt: string };
};

export type PublicReviewData = {
  schemaVersion: 1;
  reviews: PublicReview[];
};

export type PublicReviewSummary = {
  schemaVersion: 1;
  reviewCount: number;
  scale: 5;
  overallScore: number;
  categories: Array<{ key: string; displayName: string; score: number }>;
  source: { displayName: string };
  publication: { approved: true; approvedAt: string };
};

const months = new Set([
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]);
const listingKeys = new Set(['main-house', 'cottage']);

function record(value: unknown, context: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${context} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: string[], context: string) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${context} contains missing or prohibited fields.`);
  }
}

function text(value: unknown, context: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${context} must be non-empty text.`);
  if (/[<>]/u.test(value)) throw new Error(`${context} must be plain text without HTML.`);
}

function validIsoDate(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validatePublicReviewData(value: unknown): PublicReviewData {
  const root = record(value, 'Public review data');
  exactKeys(root, ['schemaVersion', 'reviews'], 'Public review data');
  if (root.schemaVersion !== 1) throw new Error('Public review schemaVersion must be 1.');
  if (!Array.isArray(root.reviews)) throw new Error('Public reviews must be an array.');

  const seenIds = new Set<string>();
  root.reviews.forEach((candidate, index) => {
    const context = `Review ${index + 1}`;
    const review = record(candidate, context);
    exactKeys(review, ['id', 'rating', 'quote', 'reviewer', 'stay', 'listing', 'source', 'publication'], context);
    text(review.id, `${context} id`);
    if (seenIds.has(review.id as string)) throw new Error(`Duplicate public review id: ${review.id}`);
    seenIds.add(review.id as string);
    if (!Number.isInteger(review.rating) || Number(review.rating) < 1 || Number(review.rating) > 5) {
      throw new Error(`${context} rating must be an integer from 1 to 5.`);
    }
    text(review.quote, `${context} quote`);

    const reviewer = record(review.reviewer, `${context} reviewer`);
    exactKeys(reviewer, ['displayName'], `${context} reviewer`);
    text(reviewer.displayName, `${context} reviewer displayName`);

    const stay = record(review.stay, `${context} stay`);
    exactKeys(stay, ['nights', 'month', 'year'], `${context} stay`);
    if (!Number.isInteger(stay.nights) || Number(stay.nights) < 1) {
      throw new Error(`${context} nights must be a positive integer.`);
    }
    if (typeof stay.month !== 'string' || !months.has(stay.month)) {
      throw new Error(`${context} month is invalid.`);
    }
    if (!Number.isInteger(stay.year) || Number(stay.year) < 2000 || Number(stay.year) > 2100) {
      throw new Error(`${context} year is invalid.`);
    }

    const listing = record(review.listing, `${context} listing`);
    exactKeys(listing, ['key', 'displayName'], `${context} listing`);
    if (typeof listing.key !== 'string' || !listingKeys.has(listing.key)) {
      throw new Error(`${context} listing key is unsupported.`);
    }
    text(listing.displayName, `${context} listing displayName`);

    const source = record(review.source, `${context} source`);
    exactKeys(source, ['displayName'], `${context} source`);
    text(source.displayName, `${context} source displayName`);

    const publication = record(review.publication, `${context} publication`);
    exactKeys(publication, ['approved', 'approvedAt'], `${context} publication`);
    if (publication.approved !== true) throw new Error(`${context} is not approved for publication.`);
    if (!validIsoDate(publication.approvedAt)) throw new Error(`${context} approval date is invalid.`);
  });

  return value as PublicReviewData;
}

export function validatePublicReviewSummary(value: unknown): PublicReviewSummary {
  const root = record(value, 'Public review summary');
  exactKeys(root, ['schemaVersion', 'reviewCount', 'scale', 'overallScore', 'categories', 'source', 'publication'], 'Public review summary');
  if (root.schemaVersion !== 1) throw new Error('Public review summary schemaVersion must be 1.');
  if (!Number.isInteger(root.reviewCount) || Number(root.reviewCount) < 1) throw new Error('Public review summary count is invalid.');
  if (root.scale !== 5) throw new Error('Public review summary scale must be 5.');
  if (typeof root.overallScore !== 'number' || root.overallScore < 1 || root.overallScore > 5) throw new Error('Public review summary overall score is invalid.');
  if (!Array.isArray(root.categories) || root.categories.length !== 6) throw new Error('Public review summary must contain six categories.');
  const expectedCategories = ['check-in', 'cleanliness', 'accuracy', 'communication', 'location', 'value'];
  root.categories.forEach((candidate, index) => {
    const category = record(candidate, `Summary category ${index + 1}`);
    exactKeys(category, ['key', 'displayName', 'score'], `Summary category ${index + 1}`);
    if (category.key !== expectedCategories[index]) throw new Error(`Summary category ${index + 1} is out of order or unsupported.`);
    text(category.displayName, `Summary category ${index + 1} displayName`);
    if (typeof category.score !== 'number' || category.score < 1 || category.score > 5) throw new Error(`Summary category ${index + 1} score is invalid.`);
  });
  const source = record(root.source, 'Public review summary source');
  exactKeys(source, ['displayName'], 'Public review summary source');
  text(source.displayName, 'Public review summary source displayName');
  const publication = record(root.publication, 'Public review summary publication');
  exactKeys(publication, ['approved', 'approvedAt'], 'Public review summary publication');
  if (publication.approved !== true) throw new Error('Public review summary is not approved.');
  if (!validIsoDate(publication.approvedAt)) throw new Error('Public review summary approval date is invalid.');
  return value as PublicReviewSummary;
}
