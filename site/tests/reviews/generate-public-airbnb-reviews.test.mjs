import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractPublicQuote,
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

test('public text extraction retains wrapped review lines and excludes private feedback', () => {
  const text = `Heading\n              Olrig Bank: Spacious, but cosy, with large garden\n\n          First sentence.\n          Second sentence.\n              Clear instructions (19)\n          Final public sentence.\n             Responsive Host (13)\n\n             Only visible to you and Airbnb\n          This is private.\n`;
  assert.equal(extractPublicQuote(text), 'First sentence. Second sentence.');
});
