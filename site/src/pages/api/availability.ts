import type { APIRoute } from 'astro';
import { getProperty } from '../../lib/booking/config';
import { getBlocks, isCalendarStale } from '../../lib/booking/repository';
import { syncProperty } from '../../lib/booking/sync';

export const prerender = false;
export const GET: APIRoute = async ({ url }) => {
  const propertyId = url.searchParams.get('property') || '';
  const from = url.searchParams.get('from') || '';
  const to = url.searchParams.get('to') || '';
  if (!getProperty(propertyId) || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return Response.json({ error: 'Invalid property or date range.' }, { status: 400 });
  }
  try {
    if (await isCalendarStale(propertyId, 30)) {
      try { await syncProperty(propertyId); } catch (error) { console.error('Calendar refresh failed; serving stored availability.', error); }
    }
    return Response.json({ propertyId, from, to, blocks: await getBlocks(propertyId, from, to) });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Availability is temporarily unavailable.' }, { status: 503 });
  }
};
