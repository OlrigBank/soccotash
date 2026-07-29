import assert from 'node:assert/strict';
import test from 'node:test';
import { BOOKING_STATUSES, BOOKING_TRANSITION_RULES } from '../../src/lib/booking/lifecycle.ts';
import { expectedCalendarEffect, validateBookingLifecycleModel } from '../../src/lib/booking/lifecycle-integrity.ts';

test('the lifecycle model satisfies all structural invariants', () => {
  assert.deepEqual(validateBookingLifecycleModel(), []);
});

test('calendar effects agree with the source and target status definitions', () => {
  for (const rule of BOOKING_TRANSITION_RULES) {
    assert.equal(rule.calendarEffect, expectedCalendarEffect(rule.from, rule.to), rule.id);
  }
});

test('cancelled is terminal and legacy statuses are never new transition targets', () => {
  assert.equal(BOOKING_STATUSES.cancelled.terminal, true);
  assert.equal(BOOKING_TRANSITION_RULES.some((rule) => rule.from === 'cancelled'), false);
  assert.equal(BOOKING_TRANSITION_RULES.some((rule) => rule.to === 'offer_accepted' || rule.to === 'approved'), false);
});

test('payment reporting never confirms a booking without administrator verification', () => {
  const reportRule = BOOKING_TRANSITION_RULES.find((rule) => rule.action === 'report_payment');
  assert.ok(reportRule);
  assert.equal(reportRule.actor, 'booker');
  assert.equal(reportRule.to, 'payment_reported');

  const verifyRule = BOOKING_TRANSITION_RULES.find((rule) => rule.action === 'verify_payment');
  assert.ok(verifyRule);
  assert.equal(verifyRule.actor, 'administrator');
  assert.equal(verifyRule.from, 'payment_reported');
  assert.equal(verifyRule.to, 'confirmed');
});

test('only guarded deletion rules remove a record instead of selecting a next status', () => {
  const removalRules = BOOKING_TRANSITION_RULES.filter((rule) => rule.to === null);
  assert.deepEqual(removalRules.map((rule) => `${rule.from}/${rule.action}`).sort(), [
    'offered/delete_request',
    'pending/delete_request',
  ]);
});
