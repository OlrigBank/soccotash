import {
  assertBookingTransitionAllowed,
  type BookingActor,
  type BookingStatus,
  type BookingTransitionAllowedDecision,
} from './lifecycle.ts';

export type PaymentLifecycleAction = 'report_payment' | 'verify_payment' | 'reject_payment_report';

export type PaymentTransitionPlan = Readonly<{
  action: PaymentLifecycleAction;
  actor: BookingActor;
  from: BookingStatus;
  to: BookingStatus;
  activityEvent: string;
  reason: string | null;
}>;

function cleanReason(reason: string): string {
  return reason.trim().replace(/\s+/g, ' ').slice(0, 1000);
}

export function planPaymentTransition(input: {
  status: string;
  action: PaymentLifecycleAction;
  actor: BookingActor;
  reason?: string | null;
}): PaymentTransitionPlan {
  const decision: BookingTransitionAllowedDecision = assertBookingTransitionAllowed({
    status: input.status,
    action: input.action,
    actor: input.actor,
  });
  if (decision.nextStatus === null) throw new Error('PAYMENT_TRANSITION_CANNOT_DELETE_BOOKING');

  const reason = input.action === 'reject_payment_report' ? cleanReason(input.reason || '') : null;
  if (input.action === 'reject_payment_report' && !reason) throw new Error('PAYMENT_REJECTION_REASON_REQUIRED');

  return Object.freeze({
    action: input.action,
    actor: input.actor,
    from: decision.rule.from,
    to: decision.nextStatus,
    activityEvent: decision.rule.activityEvent,
    reason,
  });
}
