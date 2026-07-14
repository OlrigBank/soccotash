import type { APIRoute } from 'astro';
import { getProperty } from '../../lib/booking/config';
import { isIsoDate, nightsBetween } from '../../lib/booking/dates';
import { getBlocks, isCalendarStale } from '../../lib/booking/repository';
import { syncProperty } from '../../lib/booking/sync';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const propertyId = url.searchParams.get('property') || '';
  const from = url.searchParams.get('from') || '';
  const to = url.searchParams.get('to') || '';
  const rangeNights = isIsoDate(from) && isIsoDate(to) ? nightsBetween(from, to) : 0;

  if (!getProperty(propertyId) || !isIsoDate(from) || !isIsoDate(to) || rangeNights < 1 || rangeNights > 730) {
    return Response.json({ error: 'Invalid property or date range.' }, { status: 400 });
  }

  try {
    let refreshWarning: string | undefined;
    if (await isCalendarStale(propertyId, 30)) {
      try {
        await syncProperty(propertyId);
      } catch (error) {
        console.error('Calendar refresh failed; serving stored availability.', error);
        refreshWarning = 'The latest Airbnb refresh failed; stored availability is being shown.';
      }
    }
    return Response.json(
      { propertyId, from, to, blocks: await getBlocks(propertyId, from, to), refreshWarning },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Availability is temporarily unavailable.' }, { status: 503 });
  }
};
