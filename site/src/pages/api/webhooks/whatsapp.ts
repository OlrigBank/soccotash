import crypto from 'node:crypto';
import type { APIRoute } from 'astro';
import { processWhatsAppStatus, type NotificationDeliveryStatus } from '../../../lib/booking/notification-delivery';
import { verifyWhatsAppSignature } from '../../../lib/booking/whatsapp-provider';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  const configured = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || '';
  if (mode === 'subscribe' && configured && token === configured && challenge) {
    return new Response(challenge, { status: 200, headers: { 'cache-control': 'no-store' } });
  }
  return new Response('Forbidden', { status: 403 });
};

type MetaStatus = {
  id?: string;
  status?: string;
  timestamp?: string;
  errors?: Array<{ code?: number; error_data?: { details?: string } }>;
};

function deliveryStatus(value: string): NotificationDeliveryStatus | null {
  return value === 'sent' || value === 'delivered' || value === 'read' || value === 'failed' ? value : null;
}

export const POST: APIRoute = async ({ request }) => {
  const rawBody = await request.text();
  if (!verifyWhatsAppSignature(rawBody, request.headers.get('x-hub-signature-256'))) {
    return new Response('Invalid signature', { status: 401 });
  }
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }
  const statuses: MetaStatus[] = [];
  for (const entry of Array.isArray(payload?.entry) ? payload.entry : []) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      if (Array.isArray(change?.value?.statuses)) statuses.push(...change.value.statuses);
    }
  }
  await Promise.all(statuses.map(async (item) => {
    const status = deliveryStatus(String(item.status || ''));
    const providerMessageId = String(item.id || '');
    if (!status || !providerMessageId) return;
    const errorCode = item.errors?.[0]?.code == null ? null : String(item.errors[0].code);
    const keyMaterial = `${providerMessageId}:${status}:${item.timestamp || ''}:${errorCode || ''}`;
    await processWhatsAppStatus({
      providerMessageId,
      status,
      providerEventKey: crypto.createHash('sha256').update(keyMaterial).digest('hex'),
      timestamp: /^\d+$/.test(String(item.timestamp || '')) ? new Date(Number(item.timestamp) * 1000) : null,
      errorCode,
    });
  }));
  return new Response('EVENT_RECEIVED', { status: 200 });
};
