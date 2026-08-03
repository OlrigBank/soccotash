import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('the private Booker page wires a token-authenticated controlled cancellation action', async () => {
  const route = await readFile(
    new URL('../../src/pages/booking/manage/[token]/index.astro', import.meta.url),
    'utf8',
  );
  const view = await readFile(
    new URL('../../src/components/CustomerBookingView.astro', import.meta.url),
    'utf8',
  );

  assert.match(route, /cancelBookingByBookerToken/);
  assert.match(route, /action === 'cancel-booking'/);
  assert.match(route, /confirmCancellation/);
  assert.match(route, /cancellationReason/);
  assert.match(route, /booking_cancelled_by_booker/);
  assert.match(view, /name="action" value="cancel-booking"/);
  assert.match(view, /name="confirmCancellation"/);
  assert.match(view, /name="cancellationReason"/);
});
