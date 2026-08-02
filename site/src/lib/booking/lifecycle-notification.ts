import {
  deliverBookingLifecycleEmail,
  type BookingLifecycleEmailInput,
} from './lifecycle-email.ts';
import { getLifecycleEmailTargets } from './lifecycle-email.ts';
import { deliverBookingNotification } from './notification-delivery.ts';

export async function deliverBookingLifecycleNotification(
  input: BookingLifecycleEmailInput & { notificationSourceKey: string },
) {
  const target = getLifecycleEmailTargets(input.event)[0];
  return deliverBookingNotification({
    booking: input.booking,
    eventType: input.event,
    sourceKey: input.notificationSourceKey,
    target,
    propertyName: input.propertyName,
    manageUrl: input.manageUrl,
    context: { paymentStage: input.paymentStage, paymentAmountPence: input.paymentAmountPence },
    emailDelivery: async () => {
      const outcome = await deliverBookingLifecycleEmail(input);
      if (outcome.status === 'skipped') return null;
      if (outcome.status === 'failed') throw new Error(outcome.error);
      return { provider: outcome.provider, messageId: outcome.messageId, recipient: outcome.recipient };
    },
  });
}
