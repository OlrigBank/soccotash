import type { APIRoute } from 'astro';
import { audit, isSameOrigin } from '../../../../../lib/admin/auth';
import { assignBespokeBookingArrangement } from '../../../../../lib/booking/repository';

export const prerender = false;

const allowedArrangements = new Set(['main-house', 'cottage', 'whole-property']);

export const POST: APIRoute = async ({ params, request, locals, redirect }) => {
  if (!isSameOrigin(request)) {
    return new Response('Cross-site form submission forbidden.', { status: 403 });
  }

  const reference = String(params.reference || '');
  if (!/^[0-9a-f-]{36}$/i.test(reference)) {
    return new Response('Booking request not found.', { status: 404 });
  }

  const form = await request.formData();
  const propertyId = String(form.get('assignedPropertyId') || '').trim();
  if (!allowedArrangements.has(propertyId)) {
    return redirect(`/admin/bookings/${reference}/?arrangementError=invalid`, 303);
  }

  try {
    const result = await assignBespokeBookingArrangement(reference, propertyId);
    if (result === 'not_found') {
      return new Response('Booking request not found.', { status: 404 });
    }
    if (result === 'dates_unavailable') {
      return redirect(`/admin/bookings/${reference}/?arrangementError=unavailable`, 303);
    }
    if (result !== 'updated') {
      return redirect(`/admin/bookings/${reference}/?arrangementError=stale`, 303);
    }

    await audit(locals.adminUser!.id, 'booking.bespoke_arrangement_assigned', {
      bookingReference: reference,
      propertyId,
    });
    return redirect(`/admin/bookings/${reference}/?arrangement=assigned`, 303);
  } catch (error) {
    console.error('Bespoke stay assignment failed', error);
    return redirect(`/admin/bookings/${reference}/?arrangementError=failed`, 303);
  }
};
