import type { APIRoute } from 'astro';
import { isSameOrigin } from '../../lib/admin/auth';
import { getProperty } from '../../lib/booking/config';
import { isIsoDate, nightsBetween } from '../../lib/booking/dates';
import { createProvisionalBooking } from '../../lib/booking/repository';
import { getPublishedPricingQuote } from '../../lib/pricing/public';
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
      !/^\S+@\S+\.\S+$/.test(email)
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
    if (pricingQuote && !pricingQuote.result.eligible) {
      const restrictions = pricingQuote.result.lines
        .filter((line) => line.category === 'restriction')
        .map((line) => line.detail)
        .join(' ');
      return Response.json({ error: restrictions || 'This stay does not meet the published booking rules.' }, { status: 422 });
    }

    const reference = await createProvisionalBooking({
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
      reference,
      status: 'pending',
      pricingAvailable: Boolean(pricingQuote),
      currency: pricingQuote?.result.currency,
      guestTotalPence: pricingQuote?.result.guestTotalPence,
      pricingPlanVersion: pricingQuote?.plan.version,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'DATES_UNAVAILABLE') {
      return Response.json({ error: 'Those dates are no longer available.' }, { status: 409 });
    }
    console.error(error);
    return Response.json({ error: 'The request could not be saved.' }, { status: 500 });
  }
};
