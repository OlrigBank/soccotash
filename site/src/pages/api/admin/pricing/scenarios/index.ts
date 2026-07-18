import type { APIRoute } from 'astro';
import { audit, isSameOrigin } from '../../../../../lib/admin/auth';
import { getProperty } from '../../../../../lib/booking/config';
import { isIsoDate, nightsBetween } from '../../../../../lib/booking/dates';
import { getBlocks } from '../../../../../lib/booking/repository';
import { modelPricingScenario } from '../../../../../lib/pricing/scenario';
import { getPricingPlan, savePricingScenarioRun } from '../../../../../lib/pricing/repository';
import type { PricingScenarioInput } from '../../../../../lib/pricing/types';

export const prerender = false;

function text(value: unknown, maximum = 160): string {
  return String(value ?? '').trim().slice(0, maximum);
}
function numeric(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.adminUser) return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  if (!isSameOrigin(request)) return Response.json({ error: 'Cross-origin request rejected.' }, { status: 403 });
  if (!request.headers.get('content-type')?.includes('application/json')) {
    return Response.json({ error: 'JSON request required.' }, { status: 415 });
  }
  try {
    const raw = await request.json();
    const planId = text(raw.planId, 30);
    const propertyId = text(raw.propertyId, 80);
    const property = getProperty(propertyId);
    const plan = await getPricingPlan(planId);
    if (!property || !plan || plan.propertyId !== propertyId) {
      return Response.json({ error: 'Pricing plan not found for this listing.' }, { status: 404 });
    }
    const input: PricingScenarioInput = {
      propertyId,
      name: text(raw.name) || `${property.name} pricing model`,
      startDate: text(raw.startDate, 10),
      endDate: text(raw.endDate, 10),
      occupancyPercent: numeric(raw.occupancyPercent, 65),
      averageStayNights: numeric(raw.averageStayNights, 4),
      cancellationRatePercent: numeric(raw.cancellationRatePercent, 6),
      averageLeadDays: numeric(raw.averageLeadDays, 90),
      guests: Math.round(numeric(raw.guests, 2)),
      pets: Math.round(numeric(raw.pets, 0)),
      cancellationPlan: text(raw.cancellationPlan, 40) || 'flexible',
      channelMix: {
        direct: numeric(raw.directPercent, 30),
        airbnb: numeric(raw.airbnbPercent, 60),
        booking_com: numeric(raw.bookingComPercent, 10),
      },
    };
    const periodNights = isIsoDate(input.startDate) && isIsoDate(input.endDate) ? nightsBetween(input.startDate, input.endDate) : 0;
    if (periodNights < 1 || periodNights > 731) {
      return Response.json({ error: 'The model period must be between 1 night and 2 years.' }, { status: 400 });
    }
    if (input.occupancyPercent < 0 || input.occupancyPercent > 100 || input.cancellationRatePercent < 0 || input.cancellationRatePercent > 100) {
      return Response.json({ error: 'Occupancy and cancellation assumptions must be between 0% and 100%.' }, { status: 400 });
    }
    if (input.averageStayNights < 1 || input.averageStayNights > 60 || input.averageLeadDays < 0 || input.averageLeadDays > 730) {
      return Response.json({ error: 'Check the average stay and booking-lead assumptions.' }, { status: 400 });
    }
    const channelTotal = input.channelMix.direct + input.channelMix.airbnb + input.channelMix.booking_com;
    if (Object.values(input.channelMix).some((value) => value < 0 || value > 100) || Math.abs(channelTotal - 100) > 0.01) {
      return Response.json({ error: 'Channel percentages must be between 0 and 100 and add up to 100%.' }, { status: 400 });
    }
    if (input.guests < 1 || input.guests > property.maximumGuests || input.pets < 0 || input.pets > 10) {
      return Response.json({ error: 'Guest or pet assumptions are outside the listing limits.' }, { status: 400 });
    }
    const blocks = await getBlocks(propertyId, input.startDate, input.endDate);
    const result = modelPricingScenario(plan, input, blocks);
    const run = await savePricingScenarioRun(plan.id, propertyId, input.name, locals.adminUser.id, input, result);
    await audit(locals.adminUser.id, 'pricing.scenario.created', { runId: run.publicId, planId, propertyId });
    return Response.json({ run }, { status: 201, headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const messages: Record<string, string> = {
      SCENARIO_DATES_REQUIRED: 'Choose valid model start and end dates.',
      SCENARIO_DATE_RANGE: 'The model period must be between 1 night and 2 years.',
      SCENARIO_PLAN_PROPERTY: 'The selected plan does not belong to this listing.',
    };
    if (messages[code]) return Response.json({ error: messages[code] }, { status: 400 });
    console.error(error);
    return Response.json({ error: 'The pricing scenario could not be calculated.' }, { status: 500 });
  }
};
