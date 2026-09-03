import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);

test('the private Booker area is separate from public-site navigation', async () => {
  const layout = await readFile(new URL('src/layouts/BookerLayout.astro', root), 'utf8');

  assert.match(layout, /areaTitle = 'Your booking'/);
  assert.match(layout, /Visit the public website/);
  assert.match(layout, /href="\/" target="_blank" rel="noopener noreferrer"/);
  assert.doesNotMatch(layout, /Request a stay|Listings|Guest information|Local guide|Explore Olrig Bank/);
  assert.match(layout, /noindex,nofollow,noarchive/);
});

test('the booking home exposes isolated Reservation, Messages and Holiday Planner workspaces', async () => {
  const [page, route, component] = await Promise.all([
    readFile(new URL('src/pages/booking/manage/[token]/index.astro', root), 'utf8'),
    readFile(new URL('src/pages/booking/manage/[token]/[workspace]/index.astro', root), 'utf8'),
    readFile(new URL('src/components/CustomerBookingView.astro', root), 'utf8'),
  ]);

  for (const workspace of ['reservation', 'messages', 'holiday-planner']) {
    assert.match(route, new RegExp(`['"]${workspace}['"]`));
    assert.match(page, new RegExp(`/\\$\\{token\\}/${workspace}/`));
  }
  assert.match(route, /Booking workspace not found/);
  assert.match(route, /Astro\.rewrite\(target\)/);
  assert.match(page, /Booking overview/);
  assert.match(page, /workspace === 'reservation'/);
  assert.match(page, /workspace === 'messages'/);
  assert.match(page, /workspace === 'holiday-planner'/);
  assert.match(component, /view === 'reservation'/);
  assert.match(component, /view === 'messages'/);
  assert.match(component, /showReservationButton=\{view === 'combined'\}/);
  assert.match(component, /view === 'combined' \? 'booking-reservation-drawer' : 'customer-reservation-page'/);
  assert.match(component, /view === 'reservation' && conversationNotice/);
  assert.match(component, /view === 'reservation' && conversationError/);
  assert.match(component, /<h3>Your stay<\/h3>/);
});

test('Booker actions remain in their relevant workspace after submission', async () => {
  const page = await readFile(new URL('src/pages/booking/manage/[token]/index.astro', root), 'utf8');

  assert.match(page, /\/messages\/\?message=sent/);
  assert.match(page, /\/holiday-planner\/\?planner=created/);
  assert.match(page, /\/holiday-planner\/\?planner=example-copied/);
  assert.match(page, /\/reservation\/\?consent=withdrawn/);
  assert.match(page, /\/reservation\/\?payment=bank-transfer-reported/);
  assert.match(page, /\/reservation\/\?response=/);
});

test('the saved private link always targets the booking landing page', async () => {
  const [page, component] = await Promise.all([
    readFile(new URL('src/pages/booking/manage/[token]/index.astro', root), 'utf8'),
    readFile(new URL('src/components/CustomerBookingView.astro', root), 'utf8'),
  ]);

  assert.match(page, /const bookingLandingUrl = new URL\(`\/booking\/manage\/\$\{token\}\/`, Astro\.url\)\.toString\(\)/);
  assert.match(page, /!workspace && <section class="customer-booking-card customer-booking-access-card">/);
  assert.match(page, /data-copy-booking-link=\{bookingLandingUrl\}/);
  assert.match(page, /navigator\.clipboard\.writeText\(bookingUrl\)/);
  assert.doesNotMatch(page, /navigator\.clipboard\.writeText\(window\.location\.href\)/);
  assert.doesNotMatch(component, /customer-booking-access-card|data-copy-booking-link/);
});

test('private Holiday Planner pages use the Booker layout', async () => {
  const pages = await Promise.all([
    readFile(new URL('src/pages/booking/manage/[token]/planner/index.astro', root), 'utf8'),
    readFile(new URL('src/pages/booking/manage/[token]/planner/print/index.astro', root), 'utf8'),
    readFile(new URL('src/pages/booking/manage/[token]/planner/proposals/[proposalId].astro', root), 'utf8'),
  ]);

  for (const page of pages) {
    assert.match(page, /BookerLayout/);
    assert.doesNotMatch(page, /BaseLayout/);
  }
  assert.match(pages[0], /Back to planning dashboard/);
});
