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
