import type { APIRoute } from 'astro';
import { syncAllProperties } from '../../../lib/booking/sync';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, url }) => {
  const expected = process.env.CALENDAR_SYNC_TOKEN?.trim();
  const supplied = request.headers.get('authorization');
  const tokenAuthorised = Boolean(expected && supplied === `Bearer ${expected}`);
  const sessionAuthorised = Boolean(locals.adminUser);

  if (!tokenAuthorised && !sessionAuthorised) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  if (sessionAuthorised && !tokenAuthorised) {
    const origin = request.headers.get('origin');
    const fetchSite = request.headers.get('sec-fetch-site');
    if ((origin && origin !== url.origin) || fetchSite === 'cross-site') {
      return Response.json({ error: 'Cross-site calendar synchronisation is forbidden.' }, { status: 403 });
    }
  }

  if (!request.headers.get('content-type')?.includes('application/json')) {
    return Response.json({ error: 'JSON request required.' }, { status: 415 });
  }

  try {
    const results = await syncAllProperties();
    return Response.json(
      {
        ok: results.every((result) => result.ok),
        completedAt: new Date().toISOString(),
        results,
      },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Calendar sync failed.' }, { status: 500 });
  }
};
