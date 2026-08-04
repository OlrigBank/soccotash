import type { APIRoute } from 'astro';
import { resolveBookingAccessCredential } from '../../../../lib/booking/booking-access';
import { getBookingMessagesByToken } from '../../../../lib/booking/messaging';
import { getCustomerBookingPage } from '../../../../lib/booking/repository';

export const prerender = false;

export const GET: APIRoute = async ({ params, url }) => {
  const token = String(params.token || '');
  const access = await resolveBookingAccessCredential(token);
  if (!access.allowed) return Response.json({ error: 'Booking not found.' }, { status: 404 });
  const booking = await getCustomerBookingPage(token, false);
  if (!booking) return Response.json({ error: 'Booking not found.' }, { status: 404 });
  const messages = await getBookingMessagesByToken(token, 'booker', {
    afterId: url.searchParams.get('after'),
    markRead: true,
  });
  return Response.json({
    messages,
    latestMessageId: messages.at(-1)?.id || url.searchParams.get('after') || '0',
    bookingStatus: booking.bookingStatus,
    customerStatus: booking.customerStatus,
    reservationVersion: `${booking.bookingStatus}:${booking.customerStatus}:${booking.offerId || ''}:${booking.publishedAt || ''}:${booking.arrival}:${booking.departure}:${booking.bespokeSuggestedArrival || ''}`,
  }, { headers: { 'cache-control': 'no-store, private' } });
};
