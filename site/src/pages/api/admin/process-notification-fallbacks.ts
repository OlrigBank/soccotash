import type { APIRoute } from 'astro';
import { processQueuedWhatsAppFallbacks } from '../../../lib/booking/notification-delivery.ts';

export const prerender = false;

export async function handleNotificationFallbackProcessing(
  request: Request,
  processFallbacks: (limit?: number) => Promise<{ processed: number; failed: number }> = processQueuedWhatsAppFallbacks,
): Promise<Response> {
  const expected = process.env.CALENDAR_SYNC_TOKEN?.trim();
  const supplied = request.headers.get('authorization');
  if (!expected || supplied !== `Bearer ${expected}`) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  if (!request.headers.get('content-type')?.includes('application/json')) {
    return Response.json({ error: 'JSON request required.' }, { status: 415 });
  }
  try {
    const result = await processFallbacks(20);
    return Response.json({ ok: result.failed === 0, ...result, completedAt: new Date().toISOString() }, {
      status: result.failed === 0 ? 200 : 503,
      headers: { 'cache-control': 'no-store' },
    });
  } catch (error) {
    console.error('Notification fallback processing failed.', error instanceof Error ? error.message : String(error));
    return Response.json({ error: 'Notification fallback processing failed.' }, { status: 500 });
  }
}

export const POST: APIRoute = async ({ request }) => handleNotificationFallbackProcessing(request);
