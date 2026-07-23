import type { APIRoute } from 'astro';
import { getBookingMessagesByToken, validBookingAccessToken } from '../../../../lib/booking/messaging';
import { getCustomerBookingPage } from '../../../../lib/booking/repository';

export const prerender = false;

export const GET: APIRoute = async ({ params, url }) => {
  const token = String(params.token || '');
  if (!validBookingAccessToken(token)) return Response.json({ error: 'Booking not found.' }, { status: 404 });
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
    reservationVersion: `${booking.bookingStatus}:${booking.customerStatus}:${booking.offerId || ''}:${booking.publishedAt || ''}`,
  }, { headers: { 'cache-control': 'no-store, private' } });
};
