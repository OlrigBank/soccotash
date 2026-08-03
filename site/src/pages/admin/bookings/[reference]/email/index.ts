import { randomUUID } from 'node:crypto';
import type { APIRoute } from 'astro';
import { audit, isSameOrigin } from '../../../../../lib/admin/auth';
import {
  adminContactUpdateStatus,
  logBookerContactUpdate,
  resolveAdminTelephoneUpdate,
  updateProvisionalBookingContact,
} from '../../../../../lib/booking/booking-contact';
import { getProvisionalBookingRequest } from '../../../../../lib/booking/repository';

export const prerender = false;

export const POST: APIRoute = async ({ params, request, locals, redirect }) => {
  if (!isSameOrigin(request)) {
    return new Response('Cross-site form submission forbidden.', { status: 403 });
  }

  const reference = String(params.reference || '');
  if (!/^[0-9a-f-]{36}$/i.test(reference)) {
    return new Response('Booking request not found.', { status: 404 });
  }

  const traceId = randomUUID();
  logBookerContactUpdate(traceId, 'route.received', reference);

  const form = await request.formData();
  const email = String(form.get('contactEmail') || '').trim().toLowerCase();
  const removalRequested = form.get('removeContactTelephone') === 'yes';
  const telephone = resolveAdminTelephoneUpdate(
    form.get('contactTelephone'),
    removalRequested,
  );

  const booking = await getProvisionalBookingRequest(reference);
  if (!booking) {
    return new Response('Booking request not found.', { status: 404 });
  }
  logBookerContactUpdate(traceId, 'route.booking_loaded', reference);

  const result = await updateProvisionalBookingContact({ reference, email, telephone, traceId });
  logBookerContactUpdate(traceId, 'route.helper_returned', reference, {
    status: result.status,
    activityId: result.status === 'updated' ? result.activityId : null,
  });
  if (result.status === 'not_found') {
    return new Response('Booking request not found.', { status: 404 });
  }
  if (result.status !== 'updated') return redirect(`/admin/bookings/${reference}/?contact=${result.status}`, 303);

  await audit(locals.adminUser!.id, 'booking.contact_updated', {
    bookingReference: reference,
    previousEmail: booking.email,
    newEmail: result.email,
    previousTelephone: booking.telephone,
    newTelephone: result.telephone,
    whatsappConsentInvalidated: result.whatsappConsentInvalidated,
  });
  logBookerContactUpdate(traceId, 'route.security_audit_recorded', reference, {
    activityId: result.activityId,
  });

  const contactStatus = adminContactUpdateStatus(removalRequested, result.telephone);
  logBookerContactUpdate(traceId, 'route.redirected', reference, {
    activityId: result.activityId,
    contactStatus,
  });
  return redirect(`/admin/bookings/${reference}/?contact=${contactStatus}&contactActivity=${encodeURIComponent(result.activityId)}`, 303);
};
