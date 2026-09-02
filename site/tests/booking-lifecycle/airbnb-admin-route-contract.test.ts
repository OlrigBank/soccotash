import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const middlewareUrl = new URL('../../src/middleware.ts', import.meta.url);
const layoutUrl = new URL('../../src/layouts/AdminLayout.astro', import.meta.url);
const dashboardUrl = new URL('../../src/pages/admin/index.astro', import.meta.url);
const airbnbUrl = new URL('../../src/pages/admin/airbnb/index.astro', import.meta.url);
const reservationsUrl = new URL('../../src/pages/admin/airbnb/reservations/index.astro', import.meta.url);
const reservationDetailUrl = new URL('../../src/pages/admin/airbnb/reservations/[id]/index.astro', import.meta.url);
const reviewsUrl = new URL('../../src/pages/admin/airbnb/reviews/index.astro', import.meta.url);
const reviewDetailUrl = new URL('../../src/pages/admin/airbnb/reviews/[id]/index.astro', import.meta.url);

test('Airbnb records inherit the authenticated admin-only route boundary', async () => {
  const [middleware, layout, dashboard, airbnb] = await Promise.all([
    readFile(middlewareUrl, 'utf8'), readFile(layoutUrl, 'utf8'),
    readFile(dashboardUrl, 'utf8'), readFile(airbnbUrl, 'utf8'),
  ]);
  assert.match(middleware, /path === '\/admin' \|\| path\.startsWith\('\/admin\/'\)/u);
  assert.match(middleware, /if \(!user\)[\s\S]*context\.redirect\(`\/admin\/login/u);
  assert.match(middleware, /if \(isAdminApi\) return Response\.json\(\{ error: 'Unauthorized\.' \}, \{ status: 401 \}\)/u);
  assert.match(layout, /\['\/admin\/airbnb\/', 'Airbnb records'\]/u);
  assert.match(dashboard, /href="\/admin\/airbnb\/"/u);
  assert.match(airbnb, /Access-code material is not available/u);
  assert.doesNotMatch(airbnb, /access_code_ciphertext|raw_extraction/u);
});

test('Airbnb review list and detail keep private text out of summaries and use UUID links', async () => {
  const [list, detail] = await Promise.all([readFile(reviewsUrl, 'utf8'), readFile(reviewDetailUrl, 'utf8')]);
  for (const field of ['search', 'property', 'from', 'to', 'rating', 'link', 'private', 'sort', 'pageSize']) {
    assert.match(list, new RegExp(`name=["']${field}["']`, 'u'));
  }
  assert.match(list, /airbnb-review-table/u);
  assert.match(list, /airbnb-review-cards/u);
  assert.match(list, /returnTo=\$\{returnTo\}/u);
  assert.doesNotMatch(list, /review\.publicText|review\.privateFeedback|raw_extraction/u);
  assert.match(detail, /getAirbnbReviewDetail\(Astro\.params\.id/u);
  assert.match(detail, /new Response\('Imported review not found\.', \{ status: 404 \}\)/u);
  assert.match(detail, /Private host information/u);
  assert.match(detail, /review\.categoryRatings\.map/u);
  assert.match(detail, /review\.reservationLinks\.map/u);
  assert.match(detail, /\/admin\/airbnb\/reservations\/\$\{link\.reservationId\}\//u);
  assert.doesNotMatch(detail, /raw_extraction|set:html/u);
});

test('Airbnb reservation detail uses UUID lookup and excludes access-code retrieval', async () => {
  const [list, detail] = await Promise.all([readFile(reservationsUrl, 'utf8'), readFile(reservationDetailUrl, 'utf8')]);
  assert.match(list, /returnTo=\$\{returnTo\}/u);
  assert.match(detail, /getAirbnbReservationDetail\(Astro\.params\.id/u);
  assert.match(detail, /new Response\('Imported reservation not found\.', \{ status: 404 \}\)/u);
  assert.match(detail, /requestedReturn.*startsWith\('\/admin\/airbnb\/reservations\/\?'/su);
  assert.match(detail, /Private host information/u);
  assert.match(detail, /Year not shown/u);
  assert.match(detail, /Financial panels/u);
  assert.match(detail, /Source provenance/u);
  assert.doesNotMatch(detail, /access_code_ciphertext|accessCodeCiphertext|raw_extraction|set:html/u);
});

test('Airbnb reservation list retains filters, supports pagination and has responsive alternatives', async () => {
  const reservations = await readFile(reservationsUrl, 'utf8');
  for (const field of ['search', 'property', 'from', 'to', 'status', 'link', 'sort', 'pageSize']) {
    assert.match(reservations, new RegExp(`name=["']${field}["']`, 'u'));
  }
  assert.match(reservations, /new URLSearchParams\(Astro\.url\.searchParams\)/u);
  assert.match(reservations, /params\.set\('page', String\(page\)\)/u);
  assert.match(reservations, /aria-label="Reservation pages"/u);
  assert.match(reservations, /airbnb-reservation-table/u);
  assert.match(reservations, /airbnb-reservation-cards/u);
  assert.match(reservations, /\/admin\/airbnb\/reservations\/\$\{reservation\.id\}\//u);
  assert.doesNotMatch(reservations, /conversationEntries|privateFeedback|access_code|financialRaw/u);
});
