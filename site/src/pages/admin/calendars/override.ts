import type { APIRoute } from 'astro';
import { audit, isSameOrigin } from '../../../lib/admin/auth';
import { isIsoDate } from '../../../lib/booking/dates';
import {
  removeCalendarAvailabilityOverride,
  setCalendarAvailabilityOverride,
} from '../../../lib/booking/repository';

export const prerender = false;

function returnLocation(form: FormData, result: string): string {
  const month = String(form.get('month') || '');
  const property = String(form.get('selectedProperty') || 'all');
  const params = new URLSearchParams({ result });
  if (/^\d{4}-\d{2}$/.test(month)) params.set('month', month);
  if (property === 'all' || /^[a-z0-9-]+$/.test(property)) params.set('property', property);
  const bookingReference = String(form.get('bookingReference') || '');
  if (/^[0-9a-f-]{36}$/i.test(bookingReference)) params.set('booking', bookingReference);
  return `/admin/calendars/?${params}`;
}

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!isSameOrigin(request)) {
    return new Response('Cross-site form submission forbidden.', { status: 403 });
  }

  const form = await request.formData();
  const action = String(form.get('action') || '');
  const propertyId = String(form.get('propertyId') || '').trim();
  const date = String(form.get('date') || '').trim();
  const reason = String(form.get('reason') || '').trim();
  const bookingReferenceInput = String(form.get('bookingReference') || '');
  const bookingReference = /^[0-9a-f-]{36}$/i.test(bookingReferenceInput) ? bookingReferenceInput : null;

  if (!isIsoDate(date) || !propertyId || !['create', 'remove'].includes(action)) {
    return redirect(returnLocation(form, 'invalid'), 303);
  }
  if (action === 'create' && form.get('confirmed') !== 'yes') {
    return redirect(returnLocation(form, 'confirmation-required'), 303);
  }

  try {
    if (action === 'create') {
      await setCalendarAvailabilityOverride({
        propertyId,
        date,
        reason,
        adminUserId: locals.adminUser!.id,
        bookingReference,
      });
      await audit(locals.adminUser!.id, 'calendar.availability_override_created', {
        propertyId,
        date,
        reason: reason || null,
        bookingReference,
      });
      return redirect(returnLocation(form, 'unblocked'), 303);
    }

    const removed = await removeCalendarAvailabilityOverride(propertyId, date);
    if (removed) {
      await audit(locals.adminUser!.id, 'calendar.availability_override_removed', { propertyId, date });
    }
    return redirect(returnLocation(form, removed ? 'restored' : 'not-found'), 303);
  } catch (error) {
    console.error('Calendar availability override failed', error);
    return redirect(returnLocation(form, 'failed'), 303);
  }
};
