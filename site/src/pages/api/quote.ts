import type { APIRoute } from 'astro';
import { isSameOrigin } from '../../lib/admin/auth';
import { getProperty } from '../../lib/booking/config';
import { isIsoDate, nightsBetween } from '../../lib/booking/dates';
import { getBlocks } from '../../lib/booking/repository';
import { getPublishedPricingQuote, publicQuotePayload } from '../../lib/pricing/public';
import type { PricingSimulationInput } from '../../lib/pricing/types';
import { compatibilityGuestTotal, validatePartyComposition } from '../../lib/booking/party-composition';
import { assessPublishedOccupancy } from '../../lib/occupancy/assessment';

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
    const party = validatePartyComposition({
      adults: number(raw.adults, number(raw.guests, 1)),
      children: number(raw.children, 0),
      infants: number(raw.infants, 0),
    });
    const guests = compatibilityGuestTotal(party);
    const pets = Math.round(number(raw.pets, 0));
    const nights = isIsoDate(arrival) && isIsoDate(departure) ? nightsBetween(arrival, departure) : 0;
    const today = new Date().toISOString().slice(0, 10);

    if (!property || !isIsoDate(arrival) || !isIsoDate(departure) || arrival < today || nights < property.minimumNights || nights > 365) {
      return Response.json({ error: 'Please provide a valid property and stay.' }, { status: 400 });
    }
    if (!Number.isInteger(pets) || pets < 0) {
      return Response.json({ error: 'Please check the guest and pet numbers.' }, { status: 400 });
    }
    if (propertyId !== 'bespoke-arrangement' && (await getBlocks(propertyId, arrival, departure)).length) {
      return Response.json({ error: 'Those dates are unavailable.' }, { status: 409 });
    }

    const occupancyAssessment = await assessPublishedOccupancy(propertyId, {
      ...party, pets, serviceAnimals: 0,
    });
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
    const requiresHostAgreement = occupancyAssessment.result.outcome !== 'standard';
    const publishedQuote = property.administratorPriced ? null : await getPublishedPricingQuote(input);
    const quote = requiresHostAgreement ? null : publishedQuote;
    if (!quote) {
      const estimatedPricing = requiresHostAgreement && publishedQuote?.result.eligible
        ? publicQuotePayload(publishedQuote)
        : null;
      return Response.json({
        pricingAvailable: false,
        administratorPriced: property.administratorPriced === true,
        hostDecisionRequired: requiresHostAgreement,
        eligible: true,
        estimatedPricing,
        occupancyAssessment: { ...occupancyAssessment.result, standardThresholds: occupancyAssessment.standardThresholds },
        message: requiresHostAgreement
          ? occupancyAssessment.result.reasons.map((reason) => reason.message).join(' ')
          : property.administratorPriced
          ? 'Price to be agreed. Jenna will confirm it when preparing your offer.'
          : 'No published online price is available for this listing. Jenna will confirm the price with the provisional request.',
      }, { headers: { 'cache-control': 'no-store' } });
    }
    const payload = publicQuotePayload(quote);
    return Response.json({
      ...payload,
      occupancyAssessment: { ...occupancyAssessment.result, standardThresholds: occupancyAssessment.standardThresholds },
      error: quote.result.eligible ? undefined : (payload.restrictions.join(' ') || 'This stay does not meet the published booking rules.'),
    }, {
      status: quote.result.eligible ? 200 : 422,
      headers: { 'cache-control': 'no-store' },
    });
  } catch (error) {
    if (error instanceof Error && ['INVALID_PARTY_COMPOSITION', 'INVALID_OCCUPANCY_INPUT'].includes((error as Error & { code?: string }).code || error.message)) {
      return Response.json({ error: 'Please enter at least one adult and non-negative whole-number party counts.' }, { status: 400 });
    }
    console.error(error);
    return Response.json({ error: 'A price could not be calculated.' }, { status: 500 });
  }
};
