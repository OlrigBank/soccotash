export const BOOKING_ACTORS = ['booker', 'administrator', 'system'] as const;
export type BookingActor = (typeof BOOKING_ACTORS)[number];

export const BOOKING_STATUSES = {
  pending: {
    label: 'Pending request',
    description: 'The request is awaiting administrator review.',
    blocksDates: true,
    terminal: false,
    legacy: false,
  },
  offered: {
    label: 'Offer published',
    description: 'A current offer is available for the Booker to accept or decline.',
    blocksDates: true,
    terminal: false,
    legacy: false,
  },
  offer_accepted: {
    label: 'Offer accepted (legacy)',
    description: 'Legacy compatibility state retained for existing records; new decisions do not enter this state.',
    blocksDates: true,
    terminal: false,
    legacy: true,
  },
  payment_pending: {
    label: 'Payment required',
    description: 'The offer has been accepted and the required payment has not yet been reported.',
    blocksDates: true,
    terminal: false,
    legacy: false,
  },
  payment_reported: {
    label: 'Payment reported',
    description: 'Payment has been reported but must still be verified by an administrator.',
    blocksDates: true,
    terminal: false,
    legacy: false,
  },
  confirmed: {
    label: 'Confirmed',
    description: 'The required payment has been verified and the direct booking is confirmed.',
    blocksDates: true,
    terminal: false,
    legacy: false,
  },
  approved: {
    label: 'Approved (legacy)',
    description: 'Legacy confirmed-equivalent state retained for existing records; new decisions do not enter this state.',
    blocksDates: true,
    terminal: false,
    legacy: true,
  },
  declined: {
    label: 'Declined',
    description: 'The Booker declined the current offer; a replacement offer may be published.',
    blocksDates: false,
    terminal: false,
    legacy: false,
  },
  cancelled: {
    label: 'Cancelled',
    description: 'The booking has been cancelled and no longer blocks its dates.',
    blocksDates: false,
    terminal: true,
    legacy: false,
  },
  expired: {
    label: 'Expired',
    description: 'The offer expired; a replacement offer may be published.',
    blocksDates: false,
    terminal: false,
    legacy: false,
  },
} as const;

export type BookingStatus = keyof typeof BOOKING_STATUSES;

export const BOOKING_ACTIONS = {
  publish_offer: {
    label: 'Publish offer',
    description: 'Publish the first offer for a pending request.',
  },
  replace_offer: {
    label: 'Publish replacement offer',
    description: 'Replace an active, declined or expired offer with a new current offer.',
  },
  accept_offer: {
    label: 'Accept offer',
    description: 'Accept the current offer and move to the payment-required stage.',
  },
  decline_offer: {
    label: 'Decline offer',
    description: 'Decline the current offer and release the held dates.',
  },
  expire_offer: {
    label: 'Expire offer',
    description: 'Expire an elapsed offer and release the held dates.',
  },
  report_payment: {
    label: 'Report payment',
    description: 'Record the Booker declaration that the required payment was sent.',
  },
  verify_payment: {
    label: 'Verify payment',
    description: 'Record administrator verification that the required payment was received.',
  },
  reject_payment_report: {
    label: 'Reject payment report',
    description: 'Return an unverified or incorrect payment report to payment required.',
  },
  cancel_booking: {
    label: 'Cancel booking',
    description: 'Cancel an active booking or request and release the held dates.',
  },
  delete_request: {
    label: 'Delete request',
    description: 'Permanently delete a pending or offered request under the existing guarded deletion rules.',
  },
} as const;

export type BookingAction = keyof typeof BOOKING_ACTIONS;
export type CalendarEffect = 'block' | 'retain' | 'release' | 'none';
export type TransitionRequirement = 'confirmation' | 'reason' | 'offer_payload';
export type NotificationTarget = 'booker' | 'administrator';

export type BookingTransitionRule = Readonly<{
  id: string;
  from: BookingStatus;
  action: BookingAction;
  actor: BookingActor;
  to: BookingStatus | null;
  calendarEffect: CalendarEffect;
  requirements: readonly TransitionRequirement[];
  activityEvent: string;
  botMessageTargets: readonly NotificationTarget[];
  emailNotificationTargets: readonly NotificationTarget[];
}>;

const rule = (value: BookingTransitionRule): BookingTransitionRule => Object.freeze({
  ...value,
  requirements: Object.freeze([...value.requirements]),
  botMessageTargets: Object.freeze([...value.botMessageTargets]),
  emailNotificationTargets: Object.freeze([...value.emailNotificationTargets]),
});

export const BOOKING_TRANSITION_RULES: readonly BookingTransitionRule[] = Object.freeze([
  rule({ id: 'pending.publish_offer.administrator', from: 'pending', action: 'publish_offer', actor: 'administrator', to: 'offered', calendarEffect: 'retain', requirements: ['offer_payload'], activityEvent: 'booking_offer_published', botMessageTargets: ['booker'], emailNotificationTargets: ['booker'] }),
  rule({ id: 'offered.replace_offer.administrator', from: 'offered', action: 'replace_offer', actor: 'administrator', to: 'offered', calendarEffect: 'retain', requirements: ['offer_payload'], activityEvent: 'booking_offer_replaced', botMessageTargets: ['booker'], emailNotificationTargets: ['booker'] }),
  rule({ id: 'declined.replace_offer.administrator', from: 'declined', action: 'replace_offer', actor: 'administrator', to: 'offered', calendarEffect: 'block', requirements: ['offer_payload'], activityEvent: 'booking_offer_reopened', botMessageTargets: ['booker'], emailNotificationTargets: ['booker'] }),
  rule({ id: 'expired.replace_offer.administrator', from: 'expired', action: 'replace_offer', actor: 'administrator', to: 'offered', calendarEffect: 'block', requirements: ['offer_payload'], activityEvent: 'booking_offer_reopened', botMessageTargets: ['booker'], emailNotificationTargets: ['booker'] }),
  rule({ id: 'offered.accept_offer.booker', from: 'offered', action: 'accept_offer', actor: 'booker', to: 'payment_pending', calendarEffect: 'retain', requirements: ['confirmation'], activityEvent: 'offer_accepted_payment_required', botMessageTargets: ['administrator'], emailNotificationTargets: ['booker', 'administrator'] }),
  rule({ id: 'offered.decline_offer.booker', from: 'offered', action: 'decline_offer', actor: 'booker', to: 'declined', calendarEffect: 'release', requirements: ['confirmation'], activityEvent: 'offer_declined', botMessageTargets: ['administrator'], emailNotificationTargets: ['booker', 'administrator'] }),
  rule({ id: 'offered.expire_offer.system', from: 'offered', action: 'expire_offer', actor: 'system', to: 'expired', calendarEffect: 'release', requirements: [], activityEvent: 'offer_expired', botMessageTargets: ['booker', 'administrator'], emailNotificationTargets: [] }),
  rule({ id: 'payment_pending.report_payment.booker', from: 'payment_pending', action: 'report_payment', actor: 'booker', to: 'payment_reported', calendarEffect: 'retain', requirements: ['confirmation'], activityEvent: 'payment_reported', botMessageTargets: ['booker', 'administrator'], emailNotificationTargets: ['administrator'] }),
  rule({ id: 'payment_reported.verify_payment.administrator', from: 'payment_reported', action: 'verify_payment', actor: 'administrator', to: 'confirmed', calendarEffect: 'retain', requirements: ['confirmation'], activityEvent: 'payment_verified_booking_confirmed', botMessageTargets: ['booker', 'administrator'], emailNotificationTargets: ['booker'] }),
  rule({ id: 'payment_reported.reject_payment_report.administrator', from: 'payment_reported', action: 'reject_payment_report', actor: 'administrator', to: 'payment_pending', calendarEffect: 'retain', requirements: ['reason'], activityEvent: 'payment_report_rejected', botMessageTargets: ['booker', 'administrator'], emailNotificationTargets: ['booker'] }),
  ...(['pending', 'offered', 'offer_accepted', 'payment_pending', 'payment_reported', 'confirmed', 'approved'] as const).map((from) => rule({ id: `${from}.cancel_booking.administrator`, from, action: 'cancel_booking', actor: 'administrator', to: 'cancelled', calendarEffect: 'release', requirements: ['confirmation', 'reason'], activityEvent: 'booking_cancelled', botMessageTargets: ['booker', 'administrator'], emailNotificationTargets: ['booker'] })),
  ...(['pending', 'offered'] as const).map((from) => rule({ id: `${from}.delete_request.administrator`, from, action: 'delete_request', actor: 'administrator', to: null, calendarEffect: 'release', requirements: ['confirmation'], activityEvent: 'booking_request_deleted', botMessageTargets: [], emailNotificationTargets: [] })),
]);

export type BookingTransitionRequest = Readonly<{ status: string; action: string; actor: string }>;
export type BookingTransitionAllowedDecision = Readonly<{ allowed: true; code: 'allowed'; rule: BookingTransitionRule; nextStatus: BookingStatus | null }>;
export type BookingTransitionDeniedDecision = Readonly<{ allowed: false; code: 'unknown_status' | 'unknown_action' | 'unknown_actor' | 'actor_not_allowed' | 'transition_not_allowed'; message: string }>;
export type BookingTransitionDecision = BookingTransitionAllowedDecision | BookingTransitionDeniedDecision;

export class BookingTransitionError extends Error {
  readonly decision: BookingTransitionDeniedDecision;
  constructor(decision: BookingTransitionDeniedDecision) {
    super(decision.message);
    this.name = 'BookingTransitionError';
    this.decision = decision;
  }
}

export function isBookingStatus(value: string): value is BookingStatus { return Object.hasOwn(BOOKING_STATUSES, value); }
export function isBookingAction(value: string): value is BookingAction { return Object.hasOwn(BOOKING_ACTIONS, value); }
export function isBookingActor(value: string): value is BookingActor { return BOOKING_ACTORS.includes(value as BookingActor); }

export function decideBookingTransition(request: BookingTransitionRequest): BookingTransitionDecision {
  if (!isBookingStatus(request.status)) return { allowed: false, code: 'unknown_status', message: `Unknown booking status: ${request.status}` };
  if (!isBookingAction(request.action)) return { allowed: false, code: 'unknown_action', message: `Unknown booking action: ${request.action}` };
  if (!isBookingActor(request.actor)) return { allowed: false, code: 'unknown_actor', message: `Unknown booking actor: ${request.actor}` };
  const rule = BOOKING_TRANSITION_RULES.find((candidate) => candidate.from === request.status && candidate.action === request.action && candidate.actor === request.actor);
  if (rule) return { allowed: true, code: 'allowed', rule, nextStatus: rule.to };
  const actionExistsForStatus = BOOKING_TRANSITION_RULES.some((candidate) => candidate.from === request.status && candidate.action === request.action);
  return actionExistsForStatus
    ? { allowed: false, code: 'actor_not_allowed', message: `${request.actor} may not ${request.action} while the booking is ${request.status}.` }
    : { allowed: false, code: 'transition_not_allowed', message: `${request.action} is not allowed while the booking is ${request.status}.` };
}

export function assertBookingTransitionAllowed(request: BookingTransitionRequest): BookingTransitionAllowedDecision {
  const decision = decideBookingTransition(request);
  if (!decision.allowed) throw new BookingTransitionError(decision);
  return decision;
}

export function listAllowedBookingTransitions(status: string, actor?: string): readonly BookingTransitionRule[] {
  if (!isBookingStatus(status)) return [];
  if (actor !== undefined && !isBookingActor(actor)) return [];
  return BOOKING_TRANSITION_RULES.filter((candidate) => candidate.from === status && (actor === undefined || candidate.actor === actor));
}
