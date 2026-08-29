import type { APIRoute } from 'astro';
import { processQueuedInboundAcknowledgements } from '../../../lib/booking/whatsapp-inbound.ts';

export const prerender = false;

export async function handleInboundWhatsAppReplyProcessing(
  request: Request,
  processReplies: (limit?: number) => Promise<{ processed: number; failed: number }> = processQueuedInboundAcknowledgements,
): Promise<Response> {
  const expected = process.env.CALENDAR_SYNC_TOKEN?.trim();
  if (!expected || request.headers.get('authorization') !== `Bearer ${expected}`) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  if (!request.headers.get('content-type')?.includes('application/json')) {
    return Response.json({ error: 'JSON request required.' }, { status: 415 });
  }
  try {
    const result = await processReplies(20);
    return Response.json({ ok: result.failed === 0, ...result, completedAt: new Date().toISOString() }, {
      status: result.failed === 0 ? 200 : 503,
      headers: { 'cache-control': 'no-store' },
    });
  } catch (error) {
    console.error('Inbound WhatsApp reply processing failed.', error instanceof Error ? error.message : String(error));
    return Response.json({ error: 'Inbound WhatsApp reply processing failed.' }, { status: 500 });
  }
}

export const POST: APIRoute = async ({ request }) => handleInboundWhatsAppReplyProcessing(request);
