import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const middlewareUrl = new URL('../../src/middleware.ts', import.meta.url);
const layoutUrl = new URL('../../src/layouts/AdminLayout.astro', import.meta.url);
const dashboardUrl = new URL('../../src/pages/admin/index.astro', import.meta.url);
const airbnbUrl = new URL('../../src/pages/admin/airbnb/index.astro', import.meta.url);
const reservationsUrl = new URL('../../src/pages/admin/airbnb/reservations/index.astro', import.meta.url);

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
