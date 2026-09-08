import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('the booking page uses a focused no-sidebar journey with honest expectations', async () => {
  const [page, layout] = await Promise.all([
    source('src/pages/book.astro'),
    source('src/layouts/BaseLayout.astro'),
  ]);
  assert.match(page, /showSidebar=\{false\}/);
  assert.match(page, /pageClass="booking-journey-page"/);
  assert.match(page, /You will not be charged and your booking is not confirmed/);
  assert.match(layout, /activePath !== '\/book\/'/);
  assert.match(layout, /\.page-grid\.booking-journey-page/);
});

test('the request journey embeds one shared panel and two stages', async () => {
  const component = await source('src/components/BookingCalendar.astro');
  assert.match(component, /aria-label="Booking request progress"/);
  assert.match(component, /<CompactBookingPanel[^>]*requestPage=\{true\}/);
  assert.match(component, /Check your stay/);
  assert.match(component, /Send your request/);
  assert.doesNotMatch(component, /data-check-availability|data-calendar-months|data-booking-step="3"/);
  assert.match(component, /booking-panel-continue/);
  assert.match(component, /form\.focus/);
});

test('workflow restructuring retains authoritative checks and safe submission', async () => {
  const [component, panel] = await Promise.all([source('src/components/BookingCalendar.astro'), source('src/components/CompactBookingPanel.astro')]);
  assert.match(panel, /fetch\(`\/api\/availability/);
  assert.match(panel, /fetch\('\/api\/quote\/'/);
  assert.match(component, /fetch\('\/api\/provisional-bookings\/'/);
  assert.match(component, /JSON\.stringify\(reviewedState\) !== JSON\.stringify\(currentState\)/);
  assert.match(component, /response\.status === 409/);
  assert.match(component, /const managePath =[\s\S]*window\.location\.assign\(managePath\)/);
});
