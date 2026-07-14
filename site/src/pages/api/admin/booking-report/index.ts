import type { APIRoute } from 'astro';
import { getBookingReport } from '../../../../lib/booking/repository';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const expected = process.env.CALENDAR_SYNC_TOKEN;
  const supplied = request.headers.get('authorization');
  if (!expected || supplied !== `Bearer ${expected}`) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    return Response.json(await getBookingReport(), {
      headers: { 'cache-control': 'no-store' },
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Booking report is unavailable.' }, { status: 500 });
  }
};
