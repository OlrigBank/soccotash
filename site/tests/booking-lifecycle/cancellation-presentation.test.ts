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
