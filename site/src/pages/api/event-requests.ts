import type { APIRoute } from 'astro';
import { isSameOrigin } from '../../lib/admin/auth';
import { createEventRequest, type EventRequestInput } from '../../lib/booking/events';
import { getProvisionalBookingRequest } from '../../lib/booking/repository';
import { deliverBookingNotification } from '../../lib/booking/notification-delivery';
import { validateWhatsAppConsent, WHATSAPP_CONSENT_VERSION } from '../../lib/booking/whatsapp-phone';
import { getBookingManagementRecipients, sendEmail } from '../../lib/email/sender';

export const prerender = false;

const text = (value: unknown, maximum: number) => String(value || '').trim().slice(0, maximum);
const integer = (value: unknown) => Number.isInteger(Number(value)) ? Number(value) : Number.NaN;
const yes = (value: unknown) => value === true || value === 'yes';

export const POST: APIRoute = async ({ request }) => {
  try {
    if (!isSameOrigin(request)) return Response.json({ error: 'Cross-origin request rejected.' }, { status: 403 });
    if (!request.headers.get('content-type')?.includes('application/json')) return Response.json({ error: 'JSON request required.' }, { status: 415 });
    const body = await request.json();
    const telephone = text(body.telephone, 80);
    const whatsappConsentRequested = yes(body.whatsappConsent);
    let whatsapp;
    try {
      whatsapp = validateWhatsAppConsent({ telephone, requested: whatsappConsentRequested });
    } catch {
      return Response.json({ error: 'Enter a valid telephone number with country code for WhatsApp messages.' }, { status: 400 });
    }
    const input: EventRequestInput = {
      name: text(body.name, 120), email: text(body.email, 254).toLowerCase(), telephone,
      telephoneE164: whatsapp.telephoneE164, whatsappConsentRequested,
      whatsappConsentVersion: WHATSAPP_CONSENT_VERSION,
      eventName: text(body.eventName, 160), eventType: text(body.eventType, 40),
      eventTypeOther: text(body.eventTypeOther, 120), description: text(body.description, 5000),
      setupStartAt: text(body.setupStartAt, 40), eventStartAt: text(body.eventStartAt, 40),
      eventEndAt: text(body.eventEndAt, 40), clearingEndAt: text(body.clearingEndAt, 40),
      daytimeAttendees: integer(body.daytimeAttendees), overnightGuests: integer(body.overnightGuests),
      requestedResourceIds: Array.isArray(body.requestedResourceIds) ? body.requestedResourceIds.map(String) : [],
      requestedAreasText: text(body.requestedAreasText, 1000), accommodationRequired: yes(body.accommodationRequired),
      accommodationNotes: text(body.accommodationNotes, 1000), cateringRequirements: text(body.cateringRequirements, 1000),
      parkingRequirements: text(body.parkingRequirements, 1000), accessibilityRequirements: text(body.accessibilityRequirements, 1000),
      equipmentRequirements: text(body.equipmentRequirements, 1000), publicAccess: yes(body.publicAccess),
      amplifiedMusic: yes(body.amplifiedMusic), outsideSuppliers: yes(body.outsideSuppliers),
      budgetExpectation: text(body.budgetExpectation, 500), acknowledgement: yes(body.acknowledgement),
    };
    const created = await createEventRequest(input);
    const saved = await getProvisionalBookingRequest(created.reference);
    if (saved) {
      const origin = (process.env.BOOKING_PUBLIC_URL || new URL(request.url).origin).replace(/\/$/, '');
      const manageUrl = `${origin}/booking/manage/${created.accessToken}/`;
      try {
        await deliverBookingNotification({
          booking: saved, eventType: 'event_request_received', target: 'booker',
          sourceKey: `event-request-received:${saved.reference}`, propertyName: 'Olrig Bank', manageUrl,
          context: { bookingKind: 'event' },
          emailDelivery: async () => {
            const sent = await sendEmail({
              to: saved.email, subject: 'Your Olrig Bank event enquiry',
              text: `Dear ${saved.name},\n\nWe received your event enquiry “${input.eventName}”. It is an enquiry, not a confirmed reservation. Updates and any tailored offer will appear here:\n${manageUrl}\n\nOlrig Bank`,
              html: `<p>Dear ${saved.name.replace(/[&<>]/g, '')},</p><p>We received your event enquiry <strong>${input.eventName.replace(/[&<>]/g, '')}</strong>. It is an enquiry, not a confirmed reservation.</p><p><a href="${manageUrl}">Open your private event page</a></p><p>Olrig Bank</p>`,
            });
            return { ...sent, recipient: saved.email };
          },
        });
        const administrator = getBookingManagementRecipients()[0];
        if (administrator) await deliverBookingNotification({
          booking: saved, eventType: 'event_request_received', target: 'administrator',
          sourceKey: `event-request-received-administrator:${saved.reference}`, propertyName: 'Olrig Bank',
          context: { bookingKind: 'event' },
          emailDelivery: async () => {
            const sent = await sendEmail({
              to: administrator, subject: 'New Olrig Bank event enquiry',
              text: `A new event enquiry has been received from ${saved.name}. Review it in the authenticated booking administration area.\n\nReference: ${saved.reference}`,
              html: `<p>A new event enquiry has been received from ${saved.name.replace(/[&<>]/g, '')}.</p><p>Review it in the authenticated booking administration area.</p><p>Reference: <code>${saved.reference}</code></p>`,
            });
            return { ...sent, recipient: administrator };
          },
        });
      } catch { console.error('Event acknowledgement could not be delivered or recorded.'); }
    }
    return Response.json({ reference: created.reference, status: 'pending', managePath: `/booking/manage/${created.accessToken}/` }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('EVENT_VALIDATION:')) {
      const errors = error.message.slice('EVENT_VALIDATION:'.length).split('|');
      return Response.json({ error: errors[0], errors }, { status: 400 });
    }
    console.error(error);
    return Response.json({ error: 'The event enquiry could not be saved.' }, { status: 500 });
  }
};
