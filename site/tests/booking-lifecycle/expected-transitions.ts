import type { BookingAction, BookingActor, BookingStatus, CalendarEffect, TransitionRequirement } from '../../src/lib/booking/lifecycle.ts';

export type ExpectedTransition = Readonly<{
  from: BookingStatus;
  action: BookingAction;
  actor: BookingActor;
  to: BookingStatus | null;
  calendarEffect: CalendarEffect;
  requirements: readonly TransitionRequirement[];
}>;

const cancel = (from: BookingStatus, actor: Extract<BookingActor, 'administrator' | 'booker'>): ExpectedTransition => ({
  from,
  action: 'cancel_booking',
  actor,
  to: 'cancelled',
  calendarEffect: 'release',
  requirements: ['confirmation', 'reason'],
});

const remove = (from: BookingStatus): ExpectedTransition => ({
  from,
  action: 'delete_request',
  actor: 'administrator',
  to: null,
  calendarEffect: 'release',
  requirements: ['confirmation'],
});

/**
 * Independently maintained expected behaviour for test-first lifecycle policy changes.
 * Change this table first; the tests must fail until lifecycle.ts is changed to match.
 */
export const EXPECTED_ALLOWED_TRANSITIONS: readonly ExpectedTransition[] = Object.freeze([
  { from: 'pending', action: 'publish_offer', actor: 'administrator', to: 'offered', calendarEffect: 'retain', requirements: ['offer_payload'] },
  { from: 'offered', action: 'replace_offer', actor: 'administrator', to: 'offered', calendarEffect: 'retain', requirements: ['offer_payload'] },
  { from: 'declined', action: 'replace_offer', actor: 'administrator', to: 'offered', calendarEffect: 'block', requirements: ['offer_payload'] },
  { from: 'expired', action: 'replace_offer', actor: 'administrator', to: 'offered', calendarEffect: 'block', requirements: ['offer_payload'] },
  { from: 'offered', action: 'accept_offer', actor: 'booker', to: 'payment_pending', calendarEffect: 'retain', requirements: ['confirmation'] },
  { from: 'offered', action: 'decline_offer', actor: 'booker', to: 'declined', calendarEffect: 'release', requirements: ['confirmation'] },
  { from: 'offered', action: 'expire_offer', actor: 'system', to: 'expired', calendarEffect: 'release', requirements: [] },
  { from: 'payment_pending', action: 'report_payment', actor: 'booker', to: 'payment_reported', calendarEffect: 'retain', requirements: ['confirmation'] },
  { from: 'payment_reported', action: 'verify_payment', actor: 'administrator', to: 'confirmed', calendarEffect: 'retain', requirements: ['confirmation'] },
  { from: 'payment_reported', action: 'reject_payment_report', actor: 'administrator', to: 'payment_pending', calendarEffect: 'retain', requirements: ['reason'] },
  { from: 'confirmed', action: 'report_balance_payment', actor: 'booker', to: 'confirmed', calendarEffect: 'retain', requirements: ['confirmation'] },
  { from: 'confirmed', action: 'verify_balance_payment', actor: 'administrator', to: 'confirmed', calendarEffect: 'retain', requirements: ['confirmation'] },
  { from: 'confirmed', action: 'reject_balance_payment_report', actor: 'administrator', to: 'confirmed', calendarEffect: 'retain', requirements: ['reason'] },
  cancel('pending', 'administrator'), cancel('offered', 'administrator'), cancel('offer_accepted', 'administrator'),
  cancel('payment_pending', 'administrator'),
  cancel('pending', 'booker'), cancel('offered', 'booker'), cancel('offer_accepted', 'booker'),
  cancel('payment_pending', 'booker'), cancel('payment_reported', 'booker'), cancel('confirmed', 'booker'),
  cancel('approved', 'booker'),
  remove('pending'), remove('offered'),
]);
