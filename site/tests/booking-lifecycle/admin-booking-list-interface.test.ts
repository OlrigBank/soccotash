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
  assert.match(listPage, /!metadata\.legacy/);
  assert.doesNotMatch(listPage, /Show declined and expired/);
  assert.doesNotMatch(reviewPage, /Copy Booker link[\s\S]{0,300}>Access</);
  assert.match(reviewPage, /<summary>Access<\/summary>[\s\S]*\/access\/`}>Manage Booker access</);
  assert.match(reviewPage, /booking-management-actions/);
  assert.match(reviewPage, /booking-reservation-panel[\s\S]*data-open-reservation-drawer/);
  assert.match(reviewPage, /<details id="holiday-planner" class="booking-management-panel/);
  assert.match(reviewPage, /<details class="booking-management-panel" open=/);
  assert.match(reviewPage, /showReservationButton=\{false\}/);
});
