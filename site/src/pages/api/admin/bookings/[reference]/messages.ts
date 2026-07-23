import type { APIRoute } from 'astro';
import { getBookingMessagesByReference } from '../../../../../lib/booking/messaging';
import { getCustomerBookingPageByReference } from '../../../../../lib/booking/repository';

export const prerender = false;

export const GET: APIRoute = async ({ params, url }) => {
  const reference = String(params.reference || '');
  if (!/^[0-9a-f-]{36}$/i.test(reference)) return Response.json({ error: 'Booking not found.' }, { status: 404 });
  const booking = await getCustomerBookingPageByReference(reference);
  if (!booking) return Response.json({ error: 'Booking not found.' }, { status: 404 });
  const messages = await getBookingMessagesByReference(reference, 'administrator', {
    afterId: url.searchParams.get('after'),
    markRead: true,
  });
  return Response.json({
    messages,
    latestMessageId: messages.at(-1)?.id || url.searchParams.get('after') || '0',
    bookingStatus: booking.bookingStatus,
    reservationVersion: `${booking.bookingStatus}:${booking.customerStatus}:${booking.offerId || ''}:${booking.publishedAt || ''}`,
  }, { headers: { 'cache-control': 'no-store, private' } });
};
