import type { APIRoute } from 'astro';
import { getProperties } from '../../lib/booking/config.ts';
import { getProvisionalBookingRequest, recordBookingActivity } from '../../lib/booking/repository.ts';
import { deliverBookingLifecycleNotification } from '../../lib/booking/lifecycle-notification.ts';
import { closeUnpaidCheckout, recordPaidCheckout, refundUnexpectedCheckout, verifyStripeEvent } from '../../lib/booking/stripe-checkout.ts';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  let event: Record<string, any>;
  try { event = verifyStripeEvent(await request.text(), request.headers.get('stripe-signature')); }
  catch { return new Response('Invalid signature.', { status: 400 }); }
  const session = event.data?.object;
  if (!session || typeof session !== 'object') return new Response('Invalid event.', { status: 400 });
  try {
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      if (session.payment_status !== 'paid') return new Response('Accepted.', { status: 200 });
      const outcome = await recordPaidCheckout(session);
      if (outcome.result === 'refund_required') {
        try { await refundUnexpectedCheckout(session); }
        catch (error) { console.error('Stripe refund requires attention:', error instanceof Error ? error.message : 'unknown error'); }
      }
      if (outcome.result === 'recorded' && outcome.bookingReference && outcome.stage) {
        try {
          const booking = await getProvisionalBookingRequest(outcome.bookingReference);
          if (booking) {
            const eventType = outcome.stage === 'balance' ? 'card_balance_payment_verified' : 'card_payment_verified_booking_confirmed';
            const propertyName = getProperties().find((property) => property.id === booking.propertyId)?.name || booking.propertyId;
            const origin = String(process.env.BOOKING_PUBLIC_URL || new URL(request.url).origin).replace(/\/$/, '');
            const notification = await deliverBookingLifecycleNotification({ event: eventType, booking, propertyName,
              manageUrl: `${origin}/booking/manage/${outcome.bookingReference}/reservation/`,
              paymentStage: outcome.stage, paymentAmountPence: outcome.amountPence, paymentCurrency: outcome.currency,
              notificationSourceKey: `card-payment:${session.id}` });
            await recordBookingActivity({ bookingReference: outcome.bookingReference, actor: 'system',
              eventType: `${eventType}_email_${notification.status}`, details: notification });
          }
        } catch (error) { console.error('Card payment notification failed:', error instanceof Error ? error.message : 'unknown error'); }
      }
    } else if (event.type === 'checkout.session.expired') await closeUnpaidCheckout(session, 'expired');
    else if (event.type === 'checkout.session.async_payment_failed') await closeUnpaidCheckout(session, 'failed');
    return new Response('Accepted.', { status: 200 });
  } catch (error) {
    console.error('Stripe webhook processing failed:', error instanceof Error ? error.message : 'unknown error');
    return new Response('Webhook processing failed.', { status: 500 });
  }
};
