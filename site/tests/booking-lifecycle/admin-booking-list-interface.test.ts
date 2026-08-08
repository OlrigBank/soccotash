import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('booking entries open with one click while access remains on the review page', async () => {
  const [listPage, reviewPage] = await Promise.all([
    readFile(new URL('../../src/pages/admin/bookings/index.astro', import.meta.url), 'utf8'),
    readFile(new URL('../../src/pages/admin/bookings/[reference]/index.astro', import.meta.url), 'utf8'),
  ]);

  assert.match(listPage, /data-booking-href=\{actionHref\}/);
  assert.match(listPage, /booking-entry-primary-link/);
  assert.match(listPage, /window\.location\.assign\(href\)/);
  assert.doesNotMatch(listPage, />Review<|>Access</);
  assert.doesNotMatch(listPage, /<th>Bottom-line price<|<th>Party<|<th>Received</);
  assert.match(listPage, /<th>Stay<\/th><th>Booker<\/th><th>Status<\/th>/);
  assert.match(listPage, /booking-status-filter/);
  assert.match(listPage, /name="status"/);
  assert.match(listPage, /BOOKING_STATUSES/);
  assert.doesNotMatch(listPage, /Show declined and expired/);
  assert.match(reviewPage, /Copy Booker link[\s\S]*\/access\/`}>Access</);
});
