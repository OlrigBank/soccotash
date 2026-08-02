import type { APIRoute } from 'astro';
import { isSameOrigin } from '../../lib/admin/auth';
import { getProperty } from '../../lib/booking/config';
import { isIsoDate, nightsBetween } from '../../lib/booking/dates';
import { createProvisionalBooking, getProvisionalBookingRequest } from '../../lib/booking/repository';
import { deliverBookingNotification } from '../../lib/booking/notification-delivery';
import { WHATSAPP_CONSENT_VERSION, validateWhatsAppConsent } from '../../lib/booking/whatsapp-phone';
import { validateBookerContact, validBookerEmail } from '../../lib/booking/booking-contact';
import { sendEmail } from '../../lib/email/sender';
import { getPublishedPricingQuote, publicQuotePayload } from '../../lib/pricing/public';
import type { PricingSimulationInput } from '../../lib/pricing/types';

export const prerender = false;

function cleanText(value: unknown, maximumLength: number): string {
  return String(value || '').trim().slice(0, maximumLength);
}

export const POST: APIRoute = async ({ request }) => {
  try {
    if (!isSameOrigin(request)) return Response.json({ error: 'Cross-origin request rejected.' }, { status: 403 });
    if (!request.headers.get('content-type')?.includes('application/json')) {
      return Response.json({ error: 'JSON request required.' }, { status: 415 });
    }

    const input = await request.json();
    const property = getProperty(String(input.propertyId || ''));
    if (!property) return Response.json({ error: 'Unknown property.' }, { status: 400 });

    const arrival = String(input.arrival || '');
    const departure = String(input.departure || '');
    const guests = Number(input.guests);
    const pets = Number(input.pets || 0);
    const name = cleanText(input.name, 120);
    const contact = validateBookerContact({ email: input.email, telephone: input.telephone });
    const { email, telephone } = contact;
    const whatsappConsentRequested = input.whatsappConsent === 'yes' || input.whatsappConsent === true;
    const message = cleanText(input.message, 2000);
    let whatsappConsent: ReturnType<typeof validateWhatsAppConsent>;
    try {
      whatsappConsent = validateWhatsAppConsent({ telephone, requested: whatsappConsentRequested });
    } catch {
      return Response.json({ error: 'Enter a valid telephone number, including the country code, to receive WhatsApp messages.' }, { status: 400 });
    }

    if (!isIsoDate(arrival) || !isIsoDate(departure)) {
      return Response.json({ error: 'Please provide valid arrival and departure dates.' }, { status: 400 });
    }

    const nights = nightsBetween(arrival, departure);
    const today = new Date().toISOString().slice(0, 10);
    if (
      arrival < today ||
      nights < property.minimumNights ||
      nights > 365 ||
      !Number.isInteger(guests) ||
      guests < 1 ||
      guests > property.maximumGuests ||
      !Number.isInteger(pets) ||
      pets < 0 ||
      pets > 10 ||
      name.length < 2 ||
      (email.length > 0 && !validBookerEmail(email)) ||
      !contact.valid
    ) {
      return Response.json(
        { error: `Please check the dates, guest number and contact details. The minimum stay is ${property.minimumNights} ${property.minimumNights === 1 ? 'night' : 'nights'}.` },
        { status: 400 },
      );
    }

    const pricingInput: PricingSimulationInput = {
      propertyId: property.id,
      arrival,
      departure,
      bookingDate: today,
      guests,
      pets,
      channel: 'direct',
      cancellationPlan: 'flexible',
    };
    const pricingQuote = property.administratorPriced ? null : await getPublishedPricingQuote(pricingInput);
    const reviewedPricing = input.reviewedPricing && typeof input.reviewedPricing === 'object'
      ? input.reviewedPricing as Record<string, unknown>
      : null;
    if (reviewedPricing) {
      const reviewedAvailable = reviewedPricing.pricingAvailable === true;
      const currentAvailable = Boolean(pricingQuote);
      const quoteChanged = reviewedAvailable !== currentAvailable || (pricingQuote && (
        String(reviewedPricing.planId ?? '') !== String(pricingQuote.plan.id) ||
        Number(reviewedPricing.planVersion) !== pricingQuote.plan.version ||
        Number(reviewedPricing.guestTotalPence) !== pricingQuote.result.guestTotalPence
      ));
      if (quoteChanged) {
        return Response.json({
          error: pricingQuote
            ? 'The published provisional cost changed before submission. Review the updated calculation and submit again.'
            : 'The published price is no longer available. Review the updated enquiry details and submit again.',
          quote: pricingQuote ? publicQuotePayload(pricingQuote) : {
            pricingAvailable: false,
            administratorPriced: property.administratorPriced === true,
            eligible: true,
            message: property.administratorPriced
              ? 'Price to be agreed. Jenna will confirm it when preparing your offer.'
              : 'Jenna will confirm the price for this provisional request.',
          },
        }, { status: 409, headers: { 'cache-control': 'no-store' } });
      }
    }
    if (pricingQuote && !pricingQuote.result.eligible) {
      const restrictions = pricingQuote.result.lines
        .filter((line) => line.category === 'restriction')
        .map((line) => line.detail)
        .join(' ');
      return Response.json({ error: restrictions || 'This stay does not meet the published booking rules.' }, { status: 422 });
    }

    const booking = await createProvisionalBooking({
      propertyId: property.id,
      arrival,
      departure,
      guests,
      pets,
      name,
      email,
      telephone,
      telephoneE164: whatsappConsent.telephoneE164,
      whatsappConsentRequested,
      whatsappConsentVersion: WHATSAPP_CONSENT_VERSION,
      message,
      pricingQuote,
    });
    const saved = await getProvisionalBookingRequest(booking.reference);
    if (saved) {
      const origin = (process.env.BOOKING_PUBLIC_URL || new URL(request.url).origin).replace(/\/$/, '');
      const manageUrl = `${origin}/booking/manage/${booking.accessToken}/`;
      try {
        await deliverBookingNotification({
          booking: saved,
          eventType: 'booking_request_received',
          sourceKey: `booking-request-received:${saved.reference}`,
          target: 'booker',
          propertyName: property.name,
          manageUrl,
          emailDelivery: saved.email ? async () => {
            const sent = await sendEmail({
              to: saved.email,
              subject: `Your ${property.name} booking request`,
              text: `Dear ${saved.name},\n\nYour booking request has been received. Updates will appear on your private booking page:\n${manageUrl}\n\nOlrig Bank`,
              html: `<p>Dear ${saved.name.replace(/[&<>]/g, '')},</p><p>Your booking request has been received.</p><p><a href="${manageUrl}">Open your private booking page</a></p><p>Olrig Bank</p>`,
            });
            return { ...sent, recipient: saved.email };
          } : undefined,
        });
      } catch {
        console.error('Booking notification could not be recorded after request creation.');
      }
    }
    return Response.json({
      reference: booking.reference,
      status: 'pending',
      managePath: `/booking/manage/${booking.accessToken}/`,
      pricingAvailable: Boolean(pricingQuote),
      currency: pricingQuote?.result.currency,
      guestTotalPence: pricingQuote?.result.guestTotalPence,
      pricingPlanVersion: pricingQuote?.plan.version,
      quote: pricingQuote ? publicQuotePayload(pricingQuote) : null,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'DATES_UNAVAILABLE') {
      return Response.json({ error: 'Those dates are no longer available.' }, { status: 409 });
    }
    console.error(error);
    return Response.json({ error: 'The request could not be saved.' }, { status: 500 });
  }
};
