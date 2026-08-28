import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('host-decision standard stays expose a server-calculated published-price estimate', async () => {
  const quoteRoute = await source('src/pages/api/quote.ts');

  assert.match(quoteRoute, /const publishedQuote = property\.administratorPriced \? null : await getPublishedPricingQuote\(input\)/);
  assert.match(quoteRoute, /requiresHostAgreement && publishedQuote\?\.result\.eligible/);
  assert.match(quoteRoute, /estimatedPricing,/);
  assert.match(quoteRoute, /administratorPriced: property\.administratorPriced === true/);
  assert.match(quoteRoute, /hostDecisionRequired: requiresHostAgreement/);
  assert.doesNotMatch(quoteRoute, /const publishedQuote = await getPublishedPricingQuote\(input\)/);
});

test('compact and full forms label the calculated amount as an unconfirmed estimate', async () => {
  const [compact, fullForm] = await Promise.all([
    source('src/components/CompactBookingPanel.astro'),
    source('src/components/BookingCalendar.astro'),
  ]);

  assert.match(compact, /Estimated published-price total/);
  assert.match(compact, /This is an indication, continue to get a confirmed quote/);
  assert.match(fullForm, /Estimated published-price total/);
  assert.match(fullForm, /This is an indication, not a confirmed quote/);
  assert.match(fullForm, /Jenna may adjust it when reviewing the arrangement/);
  assert.match(compact, /body\.estimatedPricing\.guestTotalPence/);
  assert.match(fullForm, /body\.estimatedPricing\.guestTotalPence/);
});
