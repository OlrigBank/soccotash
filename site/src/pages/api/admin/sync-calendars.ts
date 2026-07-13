import type { APIRoute } from 'astro';
import { syncAllProperties } from '../../../lib/booking/sync';
export const prerender = false;
export const POST: APIRoute = async ({ request }) => {
  const expected = process.env.CALENDAR_SYNC_TOKEN;
  const supplied = request.headers.get('authorization');
  if (!expected || supplied !== `Bearer ${expected}`) return new Response('Unauthorized', { status: 401 });
  try { return Response.json({ results: await syncAllProperties() }); }
  catch (error) { console.error(error); return Response.json({ error: 'Calendar sync failed.' }, { status: 500 }); }
};
