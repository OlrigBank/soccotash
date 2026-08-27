import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('homepage and every listing use the compact continuation journey', async () => {
  const [homepage, listings, properties] = await Promise.all([
    source('src/pages/index.astro'),
    source('src/pages/listings/[slug].astro'),
    source('src/data/booking/properties.yml'),
  ]);

  assert.match(homepage, /<CompactBookingPanel source="homepage" \/>/);
  assert.match(listings, /<CompactBookingPanel[\s\S]*propertyId=\{bookingProperty\.id\}/);
  for (const mapping of [
    ['main-house', 'olrig-bank'],
    ['cottage', 'cottage'],
    ['whole-property', 'event'],
    ['bespoke-arrangement', 'bespoke'],
  ]) {
    assert.match(properties, new RegExp(`id: ${mapping[0]}[\\s\\S]*?listingSlug: ${mapping[1]}`));
  }
});

test('the full form accepts only validated compact state and obtains a fresh quote', async () => {
  const [compact, fullForm] = await Promise.all([
    source('src/components/CompactBookingPanel.astro'),
    source('src/components/BookingCalendar.astro'),
  ]);

  assert.match(compact, /params\.set\(name, String\(data\.get\(name\) \?\? ''\)\)/);
  assert.match(fullForm, /params\.has\('propertyId'\)/);
  assert.match(fullForm, /Array\.from\(propertySelect\.options\)\.some/);
  assert.match(fullForm, /isValidTransferredDate\(requestedArrival\)/);
  assert.match(fullForm, /Number\.isInteger\(value\)/);
  assert.match(fullForm, /requestedDeparture >= addDays\(requestedArrival, selectedRules\(\)\.minimumNights\)/);
  assert.match(fullForm, /hasCompleteTransferredStay[\s\S]*await checkAvailability\(\)/);
});

test('changed selections invalidate the reviewed quote and submission rechecks server state', async () => {
  const [fullForm, submissionApi] = await Promise.all([
    source('src/components/BookingCalendar.astro'),
    source('src/pages/api/provisional-bookings.ts'),
  ]);

  assert.match(fullForm, /input\.addEventListener\('input',[\s\S]*clearReviewedQuote\(\)/);
  assert.match(fullForm, /if \(!reviewedQuote \|\| reviewedQuoteKey !== currentKey\)[\s\S]*checkAvailability\(\)/);
  assert.match(submissionApi, /getProperty\(String\(input\.propertyId \|\| ''\)\)/);
  assert.match(submissionApi, /assessPublishedOccupancy/);
  assert.match(submissionApi, /getPublishedPricingQuote/);
  assert.match(submissionApi, /quoteChanged/);
  assert.match(fullForm, /response\.status === 409[\s\S]*renderQuote\(body\.quote\)/);
});
