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

test('the existing form is organised as one progressive three-step request', async () => {
  const component = await source('src/components/BookingCalendar.astro');
  assert.match(component, /aria-label="Booking request progress"/);
  assert.match(component, /data-progress-step="1"[^>]*><span>1<\/span><strong>Choose<\/strong>/);
  assert.match(component, /data-progress-step="2"[^>]*><span>2<\/span><strong>Check<\/strong>/);
  assert.match(component, /data-progress-step="3"[^>]*><span>3<\/span><strong>Request<\/strong>/);
  assert.match(component, /data-booking-step="1"/);
  assert.match(component, /data-booking-step="2"/);
  assert.match(component, /data-booking-step="3" hidden/);
  assert.match(component, /function setProgress\(currentStep: number\)/);
  assert.match(component, /document\.createElement\('h2'\)/);
  assert.match(component, /setProgress\(2\)[\s\S]*fetch\(`\/api\/availability/);
  assert.match(component, /contact\.hidden = false;\s*setProgress\(3\)/);
});

test('workflow restructuring retains authoritative checking and safe submission', async () => {
  const component = await source('src/components/BookingCalendar.astro');
  assert.match(component, /fetch\(`\/api\/availability\/\?\$\{params\}`\)/);
  assert.match(component, /fetch\('\/api\/quote\/'/);
  assert.match(component, /fetch\('\/api\/provisional-bookings\/'/);
  assert.match(component, /if \(!reviewedQuote \|\| reviewedQuoteKey !== currentKey\)/);
  assert.match(component, /response\.status === 409/);
  assert.match(component, /const managePath =[\s\S]*window\.location\.assign\(managePath\)/);
});
