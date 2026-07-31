import assert from 'node:assert/strict';
import test from 'node:test';
import { planPaymentTransition } from '../../src/lib/booking/payment-transition.ts';

test('a Booker report moves payment pending to payment reported, never confirmed', () => {
  const plan = planPaymentTransition({ status: 'payment_pending', action: 'report_payment', actor: 'booker' });
  assert.equal(plan.from, 'payment_pending');
  assert.equal(plan.to, 'payment_reported');
  assert.notEqual(plan.to, 'confirmed');
  assert.equal(plan.activityEvent, 'payment_reported');
});

test('only administrator verification confirms a reported payment', () => {
  const plan = planPaymentTransition({ status: 'payment_reported', action: 'verify_payment', actor: 'administrator' });
  assert.equal(plan.to, 'confirmed');
  assert.equal(plan.activityEvent, 'payment_verified_booking_confirmed');
});

test('rejecting a report returns the booking to payment required and records the reason', () => {
  const plan = planPaymentTransition({
    status: 'payment_reported',
    action: 'reject_payment_report',
    actor: 'administrator',
    reason: '  Transfer not visible in the bank account.  ',
  });
  assert.equal(plan.to, 'payment_pending');
  assert.equal(plan.reason, 'Transfer not visible in the bank account.');
  assert.equal(plan.activityEvent, 'payment_report_rejected');
});

test('a rejection without a reason is refused', () => {
  assert.throws(
    () => planPaymentTransition({ status: 'payment_reported', action: 'reject_payment_report', actor: 'administrator' }),
    /PAYMENT_REJECTION_REASON_REQUIRED/,
  );
});

test('Bookers cannot verify their own payment report', () => {
  assert.throws(
    () => planPaymentTransition({ status: 'payment_reported', action: 'verify_payment', actor: 'booker' }),
    /transition|actor/i,
  );
});

test('payment cannot be reported before the offer is accepted', () => {
  assert.throws(
    () => planPaymentTransition({ status: 'offered', action: 'report_payment', actor: 'booker' }),
    /transition/i,
  );
});

test('balance reporting and decisions retain confirmed booking status', () => {
  const report = planPaymentTransition({ status: 'confirmed', action: 'report_balance_payment', actor: 'booker' });
  assert.equal(report.to, 'confirmed');
  assert.equal(report.activityEvent, 'balance_payment_reported');

  const verify = planPaymentTransition({ status: 'confirmed', action: 'verify_balance_payment', actor: 'administrator' });
  assert.equal(verify.to, 'confirmed');
  assert.equal(verify.activityEvent, 'balance_payment_verified');

  const reject = planPaymentTransition({
    status: 'confirmed',
    action: 'reject_balance_payment_report',
    actor: 'administrator',
    reason: 'Balance not visible.',
  });
  assert.equal(reject.to, 'confirmed');
  assert.equal(reject.activityEvent, 'balance_payment_report_rejected');
});
