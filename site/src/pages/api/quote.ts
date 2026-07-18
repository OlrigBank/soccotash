import type { APIRoute } from 'astro';
import { isSameOrigin } from '../../lib/admin/auth';
import { getProperty } from '../../lib/booking/config';
import { isIsoDate, nightsBetween } from '../../lib/booking/dates';
import { getBlocks } from '../../lib/booking/repository';
import { getPublishedPricingQuote, publicQuotePayload } from '../../lib/pricing/public';
import type { PricingSimulationInput } from '../../lib/pricing/types';

export const prerender = false;

function number(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const POST: APIRoute = async ({ request }) => {
  if (!isSameOrigin(request)) return Response.json({ error: 'Cross-origin request rejected.' }, { status: 403 });
  if (!request.headers.get('content-type')?.includes('application/json')) {
    return Response.json({ error: 'JSON request required.' }, { status: 415 });
  }

  try {
    const raw = await request.json();
    const propertyId = String(raw.propertyId || '');
    const property = getProperty(propertyId);
    const arrival = String(raw.arrival || '');
    const departure = String(raw.departure || '');
    const guests = Math.round(number(raw.guests, 1));
    const pets = Math.round(number(raw.pets, 0));
    const nights = isIsoDate(arrival) && isIsoDate(departure) ? nightsBetween(arrival, departure) : 0;
    const today = new Date().toISOString().slice(0, 10);

    if (!property || !isIsoDate(arrival) || !isIsoDate(departure) || arrival < today || nights < property.minimumNights || nights > 365) {
      return Response.json({ error: 'Please provide a valid property and stay.' }, { status: 400 });
    }
    if (!Number.isInteger(guests) || guests < 1 || guests > property.maximumGuests || !Number.isInteger(pets) || pets < 0 || pets > 10) {
      return Response.json({ error: 'Please check the guest and pet numbers.' }, { status: 400 });
    }
    if ((await getBlocks(propertyId, arrival, departure)).length) {
      return Response.json({ error: 'Those dates are unavailable.' }, { status: 409 });
    }

    const input: PricingSimulationInput = {
      propertyId,
      arrival,
      departure,
      bookingDate: today,
      guests,
      pets,
      channel: 'direct',
      cancellationPlan: 'flexible',
    };
    const quote = await getPublishedPricingQuote(input);
    if (!quote) {
      return Response.json({
        pricingAvailable: false,
        eligible: true,
        message: 'No published online price is available for this listing. Jenna will confirm the price with the provisional request.',
      }, { headers: { 'cache-control': 'no-store' } });
    }
    const payload = publicQuotePayload(quote);
    return Response.json({
      ...payload,
      error: quote.result.eligible ? undefined : (payload.restrictions.join(' ') || 'This stay does not meet the published booking rules.'),
    }, {
      status: quote.result.eligible ? 200 : 422,
      headers: { 'cache-control': 'no-store' },
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'A price could not be calculated.' }, { status: 500 });
  }
};
