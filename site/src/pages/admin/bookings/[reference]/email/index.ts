import type { APIRoute } from 'astro';
import { audit, isSameOrigin } from '../../../../../lib/admin/auth';
import { updateProvisionalBookingEmail } from '../../../../../lib/booking/booking-contact';
import { getProvisionalBookingRequest } from '../../../../../lib/booking/repository';

export const prerender = false;

function validOptionalEmail(value: string): boolean {
  return value === '' || (
    value.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  );
}

export const POST: APIRoute = async ({ params, request, locals, redirect }) => {
  if (!isSameOrigin(request)) {
    return new Response('Cross-site form submission forbidden.', { status: 403 });
  }

  const reference = String(params.reference || '');
  if (!/^[0-9a-f-]{36}$/i.test(reference)) {
    return new Response('Booking request not found.', { status: 404 });
  }

  const form = await request.formData();
  const email = String(form.get('contactEmail') || '').trim().toLowerCase();
  if (!validOptionalEmail(email)) {
    return redirect(`/admin/bookings/${reference}/?contact=invalid`, 303);
  }

  const booking = await getProvisionalBookingRequest(reference);
  if (!booking) {
    return new Response('Booking request not found.', { status: 404 });
  }

  const storedEmail = await updateProvisionalBookingEmail(reference, email);
  if (storedEmail === null) {
    return new Response('Booking request not found.', { status: 404 });
  }

  await audit(locals.adminUser!.id, 'booking.contact_email_updated', {
    bookingReference: reference,
    previousEmail: booking.email,
    newEmail: storedEmail,
  });

  return redirect(`/admin/bookings/${reference}/?contact=1`, 303);
};
