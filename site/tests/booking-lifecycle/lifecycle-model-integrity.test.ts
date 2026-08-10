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

test('Booker can cancel every active state while administrator stops at payment reporting', () => {
  const activeStatuses = [
    'pending',
    'offered',
    'offer_accepted',
    'payment_pending',
    'payment_reported',
    'confirmed',
    'approved',
  ];

  for (const actor of ['booker'] as const) for (const from of activeStatuses) {
      const cancellation = BOOKING_TRANSITION_RULES.find((rule) => (
        rule.from === from
        && rule.action === 'cancel_booking'
        && rule.actor === actor
      ));
      assert.ok(cancellation, `${actor} cancellation should be defined from ${from}`);
      assert.equal(cancellation.to, 'cancelled');
      assert.equal(cancellation.calendarEffect, 'release');
      assert.deepEqual(cancellation.requirements, ['confirmation', 'reason']);
      assert.equal(cancellation.activityEvent, 'booking_cancelled');
  }
  for(const from of ['pending','offered','offer_accepted','payment_pending'])assert.ok(BOOKING_TRANSITION_RULES.some(rule=>rule.from===from&&rule.action==='cancel_booking'&&rule.actor==='administrator'));
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

test('administrator cancellation stops when payment is reported while Booker cancellation remains available', () => {
  for (const status of ['payment_reported','confirmed','approved']) {
    assert.equal(BOOKING_TRANSITION_RULES.some(rule=>rule.from===status&&rule.action==='cancel_booking'&&rule.actor==='administrator'),false);
    assert.equal(BOOKING_TRANSITION_RULES.some(rule=>rule.from===status&&rule.action==='cancel_booking'&&rule.actor==='booker'),true);
  }
});
