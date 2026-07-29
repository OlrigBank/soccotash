import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BOOKING_ACTIONS,
  BOOKING_ACTORS,
  BOOKING_STATUSES,
  BookingTransitionError,
  assertBookingTransitionAllowed,
  decideBookingTransition,
  listAllowedBookingTransitions,
  type BookingAction,
  type BookingActor,
  type BookingStatus,
} from '../../src/lib/booking/lifecycle.ts';
import { EXPECTED_ALLOWED_TRANSITIONS } from './expected-transitions.ts';

const expectedKey = (status: string, action: string, actor: string) => `${status}\u0000${action}\u0000${actor}`;
const expectedByKey = new Map(EXPECTED_ALLOWED_TRANSITIONS.map((entry) => [expectedKey(entry.from, entry.action, entry.actor), entry]));

test('every expected transition is allowed with the expected decision data', () => {
  for (const expected of EXPECTED_ALLOWED_TRANSITIONS) {
    const decision = decideBookingTransition({ status: expected.from, action: expected.action, actor: expected.actor });
    assert.equal(decision.allowed, true, `${expected.from}/${expected.action}/${expected.actor} should be allowed`);
    if (!decision.allowed) continue;
    assert.equal(decision.nextStatus, expected.to);
    assert.equal(decision.rule.calendarEffect, expected.calendarEffect);
    assert.deepEqual(decision.rule.requirements, expected.requirements);
  }
});

test('the complete status/action/actor matrix allows only explicitly expected decisions', () => {
  for (const status of Object.keys(BOOKING_STATUSES) as BookingStatus[]) {
    for (const action of Object.keys(BOOKING_ACTIONS) as BookingAction[]) {
      for (const actor of BOOKING_ACTORS as readonly BookingActor[]) {
        const expected = expectedByKey.get(expectedKey(status, action, actor));
        const decision = decideBookingTransition({ status, action, actor });
        assert.equal(decision.allowed, Boolean(expected), `${status}/${action}/${actor} unexpectedly ${decision.allowed ? 'passed' : 'failed'} (${decision.code})`);
      }
    }
  }
});

test('wrong actor is distinguished from an impossible transition', () => {
  const wrongActor = decideBookingTransition({ status: 'offered', action: 'accept_offer', actor: 'administrator' });
  assert.equal(wrongActor.allowed, false);
  assert.equal(wrongActor.code, 'actor_not_allowed');

  const impossible = decideBookingTransition({ status: 'pending', action: 'accept_offer', actor: 'booker' });
  assert.equal(impossible.allowed, false);
  assert.equal(impossible.code, 'transition_not_allowed');
});

test('unknown runtime inputs fail closed', () => {
  assert.equal(decideBookingTransition({ status: 'invented', action: 'publish_offer', actor: 'administrator' }).code, 'unknown_status');
  assert.equal(decideBookingTransition({ status: 'pending', action: 'invented', actor: 'administrator' }).code, 'unknown_action');
  assert.equal(decideBookingTransition({ status: 'pending', action: 'publish_offer', actor: 'invented' }).code, 'unknown_actor');
});

test('assertBookingTransitionAllowed returns allowed decisions and throws typed denials', () => {
  const allowed = assertBookingTransitionAllowed({ status: 'payment_reported', action: 'verify_payment', actor: 'administrator' });
  assert.equal(allowed.nextStatus, 'confirmed');
  assert.throws(
    () => assertBookingTransitionAllowed({ status: 'payment_pending', action: 'verify_payment', actor: 'administrator' }),
    (error: unknown) => error instanceof BookingTransitionError && error.decision.code === 'transition_not_allowed',
  );
});

test('listAllowedBookingTransitions supports UI and processing discovery', () => {
  assert.deepEqual(
    listAllowedBookingTransitions('payment_reported', 'administrator').map((entry) => entry.action).sort(),
    ['cancel_booking', 'reject_payment_report', 'verify_payment'],
  );
  assert.deepEqual(listAllowedBookingTransitions('cancelled'), []);
});
