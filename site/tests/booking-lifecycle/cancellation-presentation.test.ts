import assert from 'node:assert/strict';
import test from 'node:test';

test('cancelled presentation takes precedence over confirmation and offer wording', async () => {
  const { getCancellationDisplayState } = await import(
    '../../src/lib/booking/cancellation-display.ts'
  );

  assert.deepEqual(getCancellationDisplayState({
    cancelled: true,
    fullyPaid: true,
    acceptedOffer: true,
  }), {
    statusHeading: 'Booking cancelled',
    paymentHeading: 'Payment history at cancellation',
    paymentState: 'Payment record retained',
    priceHeading: 'Price at cancellation',
    totalLabel: 'Accepted total',
  });
});

test('a request cancelled before offer acceptance retains provisional price wording', async () => {
  const { getCancellationDisplayState, hasAcceptedOfferEvidence } = await import(
    '../../src/lib/booking/cancellation-display.ts'
  );

  assert.equal(hasAcceptedOfferEvidence({
    acceptedAt: null,
    customerStatus: 'cancelled',
    bookingStatus: 'cancelled',
  }), false);
  assert.equal(hasAcceptedOfferEvidence({
    acceptedAt: '2026-08-03T12:00:00.000Z',
    customerStatus: 'cancelled',
    bookingStatus: 'cancelled',
  }), true);

  assert.deepEqual(getCancellationDisplayState({
    cancelled: true,
    fullyPaid: false,
    acceptedOffer: false,
  }), {
    statusHeading: 'Booking cancelled',
    paymentHeading: 'Payment history at cancellation',
    paymentState: 'Payment record retained',
    priceHeading: 'Price at cancellation',
    totalLabel: 'Recorded provisional total',
  });
});

test('controlled cancellation input requires both confirmation and a visible reason', async () => {
  const { validateCancellationInput } = await import(
    '../../src/lib/booking/cancellation-display.ts'
  );

  assert.deepEqual(validateCancellationInput({ confirmed: false, reason: 'Plans changed.' }), {
    accepted: false,
    code: 'confirmation_required',
  });
  assert.deepEqual(validateCancellationInput({ confirmed: true, reason: '   ' }), {
    accepted: false,
    code: 'reason_required',
  });
  assert.deepEqual(validateCancellationInput({ confirmed: true, reason: '  Plans changed.  ' }), {
    accepted: true,
    reason: 'Plans changed.',
  });
});
