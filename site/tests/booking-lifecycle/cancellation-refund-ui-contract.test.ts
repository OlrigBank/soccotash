import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);

async function source(path: string) {
  return readFile(new URL(path, root), 'utf8');
}

test('customer booking and payment views expose the shared cancellation terms pattern', async () => {
  const [bookingView, paymentView] = await Promise.all([
    source('src/components/CustomerBookingView.astro'),
    source('src/pages/booking/manage/[token]/payment/index.astro'),
  ]);

  for (const view of [bookingView, paymentView]) {
    assert.match(view, /Booking and cancellation terms/);
    assert.match(view, /refund (bands|percentage)/i);
    assert.match(view, /cancellationTerms/);
    assert.match(view, /<details>/);
  }
});

test('administrator reservation view provides a recorded refund decision path', async () => {
  const adminView = await source('src/pages/admin/bookings/[reference]/index.astro');

  assert.match(adminView, /Customer-facing policy/);
  assert.match(adminView, /Estimated refund/);
  assert.match(adminView, /record-refund-decision/);
  assert.match(adminView, /refund_decision_recorded/);
});

test('payment page exposes the reference summary and state-aware actions', async () => {
  const paymentView = await source('src/pages/booking/manage/[token]/payment/index.astro');

  assert.match(paymentView, /role="tablist"/);
  assert.match(paymentView, /Credit card/);
  assert.match(paymentView, /Bank transfer/);
  assert.match(paymentView, /Reservation summary/);
  assert.match(paymentView, /Add a promo code/);
  assert.match(paymentView, /Confirm reservation/);
  assert.match(paymentView, /payment-action-bar/);
});
