import type { APIRoute } from 'astro';
import { isSameOrigin } from '../../lib/admin/auth';
import { getProperty } from '../../lib/booking/config';
import { isIsoDate, nightsBetween } from '../../lib/booking/dates';
import { createProvisionalBooking } from '../../lib/booking/repository';
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
    const email = cleanText(input.email, 254).toLowerCase();
    const telephone = cleanText(input.telephone, 80);
    const message = cleanText(input.message, 2000);

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
      (email.length > 0 && !/^\S+@\S+\.\S+$/.test(email))
    ) {
      return Response.json(
        { error: `Please check the dates, guest number and contact details. The minimum stay is ${property.minimumNights} nights.` },
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
    const pricingQuote = await getPublishedPricingQuote(pricingInput);
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
            eligible: true,
            message: 'Jenna will confirm the price for this provisional request.',
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
      message,
      pricingQuote,
    });
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
