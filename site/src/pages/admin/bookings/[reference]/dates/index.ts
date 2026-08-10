import type { APIRoute } from 'astro';
import { audit, isSameOrigin } from '../../../../../lib/admin/auth';
import { isIsoDate, nightsBetween } from '../../../../../lib/booking/dates';
import { suggestBespokeBookingDates } from '../../../../../lib/booking/repository';

export const prerender = false;

export const POST: APIRoute = async ({ params, request, locals, redirect }) => {
  if (!isSameOrigin(request)) return new Response('Cross-site form submission forbidden.', { status: 403 });
  const reference = String(params.reference || '');
  if (!/^[0-9a-f-]{36}$/i.test(reference)) return new Response('Booking request not found.', { status: 404 });
  const form = await request.formData();
  const arrival = String(form.get('arrival') || '');
  const departure = String(form.get('departure') || '');
  const today = new Date().toISOString().slice(0, 10);
  const nights = isIsoDate(arrival) && isIsoDate(departure) ? nightsBetween(arrival, departure) : 0;
  const calendarReturn = `/admin/calendars/?month=${arrival.slice(0, 7)}&property=bespoke-arrangement&booking=${reference}`;
  if (!isIsoDate(arrival) || !isIsoDate(departure) || arrival < today || nights < 1 || nights > 365) {
    return redirect(`${calendarReturn}&result=invalid-dates`, 303);
  }
  try {
    const result = await suggestBespokeBookingDates(reference, arrival, departure);
    if (result === 'not_found') return new Response('Booking request not found.', { status: 404 });
    if (result === 'dates_unavailable') return redirect(`${calendarReturn}&result=dates-unavailable`, 303);
    if (result === 'duration_mismatch') return redirect(`${calendarReturn}&result=duration-mismatch`, 303);
    if (result !== 'updated') return redirect(`${calendarReturn}&result=booking-stale`, 303);
    await audit(locals.adminUser!.id, 'booking.bespoke_dates_suggested', { bookingReference: reference, arrival, departure });
    return redirect(`/admin/bookings/${reference}/reservation/?dates=suggested`, 303);
  } catch (error) {
    console.error('Bespoke date update failed', error);
    return redirect(`${calendarReturn}&result=date-update-failed`, 303);
  }
};
