import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('calendar override mutation is protected, confirmed and audited', async () => {
  const route = await readFile(
    new URL('../../src/pages/admin/calendars/override.ts', import.meta.url),
    'utf8',
  );
  const middleware = await readFile(new URL('../../src/middleware.ts', import.meta.url), 'utf8');

  assert.match(middleware, /path\.startsWith\('\/admin\/'\)/,
    'the Admin middleware must protect the calendar mutation route');
  assert.match(route, /isSameOrigin\(request\)/,
    'the mutation must reject cross-site form submissions');
  assert.match(route, /form\.get\('confirmed'\) !== 'yes'/,
    'creating an override must require explicit confirmation');
  assert.match(route, /setCalendarAvailabilityOverride/);
  assert.match(route, /removeCalendarAvailabilityOverride/);
  assert.match(route, /calendar\.availability_override_created/);
  assert.match(route, /calendar\.availability_override_removed/);
  assert.match(route, /review-required/,
    'override creation must require a valid booking review context');
});

test('the Admin calendar explains that overrides preserve underlying entries', async () => {
  const page = await readFile(
    new URL('../../src/pages/admin/calendars/index.astro', import.meta.url),
    'utf8',
  );

  assert.match(page, /Bespoke-stay overrides take precedence over every calendar entry/);
  assert.match(page, /Standard stay arrangements remain blocked/);
  assert.match(page, /without deleting the underlying booking or imported block/);
  assert.match(page, /Available for bespoke stays/);
  assert.match(page, /Restore \{availabilityName\}/);
  assert.match(page, /if \(!bespokeBooking \|\| !inRequestedStay\) return null/,
    'creation controls must render only on requested nights during a Bespoke review');
});

test('Bespoke requests start a conversation without consulting availability', async () => {
  const component = await readFile(
    new URL('../../src/components/BookingCalendar.astro', import.meta.url),
    'utf8',
  );
  const quoteRoute = await readFile(new URL('../../src/pages/api/quote.ts', import.meta.url), 'utf8');
  const repository = await readFile(
    new URL('../../src/lib/booking/repository.ts', import.meta.url),
    'utf8',
  );

  assert.match(component, /if \(isBespokeStay\(\)\) \{\s*visibleBlocks = \[\]/);
  assert.match(component, /if \(!bespokeStay\) \{\s*const params = new URLSearchParams/);
  assert.match(component, /Your preferred dates have been recorded without an availability check/);
  assert.match(quoteRoute, /propertyId !== 'bespoke-arrangement' && \(await getBlocks/);
  assert.match(repository, /if \(property\.id !== 'bespoke-arrangement'\) \{/);
});

test('the Bespoke Reservation panel hands date review to the contextual calendar', async () => {
  const bookingPage = await readFile(
    new URL('../../src/pages/admin/bookings/[reference]/index.astro', import.meta.url),
    'utf8',
  );
  const calendarPage = await readFile(
    new URL('../../src/pages/admin/calendars/index.astro', import.meta.url),
    'utf8',
  );
  const dateRoute = await readFile(
    new URL('../../src/pages/admin/bookings/[reference]/dates/index.ts', import.meta.url),
    'utf8',
  );
  const repository = await readFile(
    new URL('../../src/lib/booking/repository.ts', import.meta.url),
    'utf8',
  );

  assert.match(bookingPage, /Review requested dates in calendar/);
  assert.match(bookingPage, /month=\$\{booking\.arrival\.slice\(0, 7\)\}.*property=bespoke-arrangement.*booking=\$\{reference\}/);
  assert.match(bookingPage, /reservationOpen \? 'yes' : 'no'/);
  assert.match(calendarPage, /Bespoke stay date review/);
  assert.match(calendarPage, /Nearest open same-length stay/);
  assert.match(calendarPage, /Suggest dates and return to booking/);
  assert.match(calendarPage, /Return to booking without changes/);
  assert.match(calendarPage, /data-select-bespoke-arrival/);
  assert.match(dateRoute, /isSameOrigin\(request\)/);
  assert.match(dateRoute, /booking\.bespoke_dates_suggested/);
  assert.match(dateRoute, /reservation=open&dates=suggested/);
  assert.match(repository, /applyAvailabilityOverrides: true/);
  assert.match(repository, /duration_mismatch/);
  assert.match(repository, /bespoke_dates_suggested/);
  assert.match(repository, /bespoke-dates-suggested:/);
  assert.match(repository, /input\.date < booking\.arrival/);
  assert.match(repository, /input\.date >= booking\.departure/);
  assert.match(repository, /ON CONFLICT \(property_id, available_on\) DO NOTHING/,
    'a request must not take ownership of or rewrite a pre-existing override');
  assert.match(repository, /applyAvailabilityOverrides: Boolean\(row\.originated_as_bespoke\)/,
    'an assigned Bespoke request must retain override-aware acceptance checks');
});

test('Bespoke alternative dates remain a conversation until the Booker decides', async () => {
  const repository = await readFile(new URL('../../src/lib/booking/repository.ts', import.meta.url), 'utf8');
  const customerView = await readFile(new URL('../../src/components/CustomerBookingView.astro', import.meta.url), 'utf8');
  const managePage = await readFile(new URL('../../src/pages/booking/manage/[token]/index.astro', import.meta.url), 'utf8');
  const migration = await readFile(new URL('../../db/019_bespoke_date_dialog.sql', import.meta.url), 'utf8');

  assert.match(repository, /respondToBespokeDateSuggestion/);
  assert.match(repository, /bespoke_original_dates_retained/);
  assert.match(customerView, /Agree to suggested dates/);
  assert.match(customerView, /Send my revised dates/);
  assert.match(customerView, /Keep my original dates/);
  assert.match(managePage, /respond-bespoke-dates/);
  assert.match(repository, /bespoke_dates_changed_by_booker/);
  assert.match(migration, /original_arrival/);
});

test('cancelling restores only availability overrides owned by that booking request', async () => {
  const overrideRoute = await readFile(new URL('../../src/pages/admin/calendars/override.ts', import.meta.url), 'utf8');
  const cancellation = await readFile(new URL('../../src/lib/booking/cancellation-lifecycle.ts', import.meta.url), 'utf8');
  const migration = await readFile(new URL('../../db/021_booking_owned_availability_overrides.sql', import.meta.url), 'utf8');

  assert.match(overrideRoute, /bookingReference/);
  assert.match(cancellation, /WHERE provisional_booking_id = \$1/);
  assert.match(cancellation, /booking_availability_overrides_restored/);
  assert.match(migration, /provisional_booking_id/);
});
