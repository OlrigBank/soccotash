import { sessionAccount } from '../../lib/booker/accounts.ts';
import { getEditableRequestJourney } from '../../lib/booking/request-journey.ts';
import type { APIRoute } from 'astro';
import { getAvailabilityProperty, getProperty } from '../../lib/booking/config';
import { isIsoDate, nightsBetween } from '../../lib/booking/dates';
import { getBlocks, isCalendarStale } from '../../lib/booking/repository';
import { syncProperty } from '../../lib/booking/sync';

export const prerender = false;

export const GET: APIRoute = async ({ url, cookies }) => {
  const propertyId = url.searchParams.get('property') || '';
  const from = url.searchParams.get('from') || '';
  const to = url.searchParams.get('to') || '';
  const property = getProperty(propertyId);
  const availabilityProperty = property ? getAvailabilityProperty(property) : undefined;
  const rangeNights = isIsoDate(from) && isIsoDate(to) ? nightsBetween(from, to) : 0;

  if (!property || !availabilityProperty || !isIsoDate(from) || !isIsoDate(to) || rangeNights < 1 || rangeNights > 730) {
    return Response.json({ error: 'Invalid property or date range.' }, { status: 400 });
  }

  try {
    const reference = url.searchParams.get('bookingReference');
    const journey = reference ? await getEditableRequestJourney(reference, await sessionAccount(cookies)) : null;
    if (reference && !journey) return Response.json({ error: 'This booking can no longer be edited here. Return to your booking.' }, { status: 409, headers: { 'cache-control': 'private, no-store' } });
    let refreshWarning: string | undefined;
    if (await isCalendarStale(availabilityProperty.id, 30)) {
      try {
        await syncProperty(availabilityProperty.id);
      } catch (error) {
        console.error('Calendar refresh failed; serving stored availability.', error);
        refreshWarning = 'The latest Airbnb refresh failed; stored availability is being shown.';
      }
    }
    return Response.json(
      {
        propertyId,
        availabilityPropertyId: availabilityProperty.id,
        from,
        to,
        blocks: await getBlocks(propertyId, from, to, journey?.id),
        refreshWarning,
      },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Availability is temporarily unavailable.' }, { status: 503 });
  }
};
