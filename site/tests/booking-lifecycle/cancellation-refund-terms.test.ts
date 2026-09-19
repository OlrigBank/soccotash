import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateCancellationRefund, DEFAULT_CANCELLATION_TERMS } from '../../src/lib/pricing/cancellation-terms.ts';

test('cancellation refund bands use verified payments and the arrival boundary', () => {
  const payments = [
    { amountPence: 25000, status: 'verified' },
    { amountPence: 75000, status: 'reported' },
  ];
  assert.deepEqual(calculateCancellationRefund({
    arrival: '2026-08-15', cancelledOn: '2026-07-16', payments,
  }), {
    cancelledOn: '2026-07-16', daysBeforeArrival: 30, refundPercentage: 100,
    paymentsMadePence: 25000, refundAmountPence: 25000, retainedAmountPence: 0, policyVersion: 'e17-v1',
  });
  assert.equal(calculateCancellationRefund({ arrival: '2026-08-15', cancelledOn: '2026-08-01', payments }).refundPercentage, 50);
  assert.equal(calculateCancellationRefund({ arrival: '2026-08-15', cancelledOn: '2026-08-02', payments }).refundPercentage, 0);
});

test('default cancellation terms are explicit and stable', () => {
  assert.equal(DEFAULT_CANCELLATION_TERMS.maximumGuests, 8);
  assert.deepEqual(DEFAULT_CANCELLATION_TERMS.refundBands.map((band) => band.refundPercentage), [100, 50, 0]);
  assert.equal(DEFAULT_CANCELLATION_TERMS.securityDeposit, null);
});
