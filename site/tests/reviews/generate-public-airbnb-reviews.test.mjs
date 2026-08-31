import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractPublicQuote,
  extractPublicRating,
  metadataFromFilename,
} from '../../scripts/generate-public-airbnb-reviews.mjs';

test('metadata supports both canonical separator styles and cottage reviews', () => {
  assert.deepEqual(
    metadataFromFilename('2026-07-13–2026-07-16 – 3 nights – Ryan Review Cottage – Airbnb.pdf'),
    {
      startDate: '2026-07-13', reviewer: 'Ryan', nights: 3,
      month: 'July', year: 2026, listingKey: 'cottage',
    },
  );
  assert.equal(
    metadataFromFilename('2026-08-24-2026-08-27 - 3 nights - Andrew Review - Airbnb.pdf').reviewer,
    'Andrew',
  );
});

test('public rating extraction reads only the overall Public review label', () => {
  assert.equal(extractPublicRating('Public review · ★ 4 Detailed ratings Check-in ★ 5'), 4);
  assert.equal(extractPublicRating('Public review - x4 Detailed ratings Check-in x5'), 4);
  assert.throws(() => extractPublicRating('Detailed ratings Check-in ★ 5'), /public overall star rating/u);
});

test('public text extraction retains wrapped review lines and excludes private feedback', () => {
  const text = `Heading\n              Olrig Bank: Spacious, but cosy, with large garden\n\n          First sentence.\n          Second sentence.\n              Clear instructions (19)\n          Final public sentence.\n             Responsive Host (13)\n\n             Only visible to you and Airbnb\n          This is private.\n`;
  assert.equal(extractPublicQuote(text), 'First sentence. Second sentence.');
});

test('public text extraction supports clean print layouts without leaking private sections', () => {
  const text = `AIRBNB GUEST REVIEW

Fred's review
Olrig Bank: Spacious, but cosy, with large garden
August 27 - 30 - 3 nights - Published August 30, 2026

  Public review - ***** 5

  First public sentence.
  Second public sentence.

  Note from Fred
  Only visible to you and Airbnb
  This is private.

Detailed ratings
 Check-in  ***** 5
`;
  assert.equal(extractPublicQuote(text), 'First public sentence. Second public sentence.');
});
