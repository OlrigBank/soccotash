import crypto from 'node:crypto';
import type { APIRoute } from 'astro';
import { processWhatsAppStatus, type NotificationDeliveryStatus } from '../../../lib/booking/notification-delivery.ts';
import { verifyWhatsAppSignature } from '../../../lib/booking/whatsapp-provider.ts';
import { receiveWhatsAppInbound, type WhatsAppInboundMessage } from '../../../lib/booking/whatsapp-inbound.ts';

export const prerender = false;

export const WHATSAPP_WEBHOOK_MAX_BYTES = 1024 * 1024;

function secureTextEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && crypto.timingSafeEqual(leftBytes, rightBytes);
}

export const GET: APIRoute = async ({ url }) => {
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  const configured = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || '';
  if (mode === 'subscribe' && configured && token && secureTextEqual(token, configured) && challenge) {
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

export type WhatsAppStatusInput = {
  providerMessageId: string;
  status: NotificationDeliveryStatus;
  providerEventKey: string;
  timestamp: Date | null;
  errorCode: string | null;
};

function deliveryStatus(value: string): NotificationDeliveryStatus | null {
  return value === 'sent' || value === 'delivered' || value === 'read' || value === 'failed' ? value : null;
}

export function parseWhatsAppStatuses(payload: unknown): WhatsAppStatusInput[] | null {
  if (!payload || typeof payload !== 'object') return null;
  const envelope = payload as { object?: unknown; entry?: unknown };
  if (envelope.object !== 'whatsapp_business_account' || !Array.isArray(envelope.entry)) return null;
  const statuses: Array<MetaStatus & { order: number }> = [];
  let order = 0;
  for (const entry of envelope.entry) {
    if (!entry || typeof entry !== 'object' || !Array.isArray((entry as { changes?: unknown }).changes)) return null;
    for (const change of (entry as { changes: unknown[] }).changes) {
      if (!change || typeof change !== 'object') return null;
      const typedChange = change as { field?: unknown; value?: { statuses?: unknown } };
      if (typedChange.field !== 'messages') continue;
      if (typedChange.value?.statuses !== undefined && !Array.isArray(typedChange.value.statuses)) return null;
      for (const item of typedChange.value?.statuses || []) {
        if (item && typeof item === 'object') statuses.push({ ...(item as MetaStatus), order: order++ });
      }
    }
  }
  return statuses.flatMap((item) => {
    const status = deliveryStatus(String(item.status || ''));
    const providerMessageId = String(item.id || '');
    if (!status || !providerMessageId) return [];
    const errorCode = item.errors?.[0]?.code == null ? null : String(item.errors[0].code);
    const timestampValue = String(item.timestamp || '');
    const timestamp = /^\d+$/.test(timestampValue) ? new Date(Number(timestampValue) * 1000) : null;
    const keyMaterial = `${providerMessageId}:${status}:${timestampValue}:${errorCode || ''}`;
    return [{
      providerMessageId,
      status,
      providerEventKey: crypto.createHash('sha256').update(keyMaterial).digest('hex'),
      timestamp,
      errorCode,
      order: item.order,
    }];
  }).sort((left, right) => {
    if (left.providerMessageId !== right.providerMessageId) return left.providerMessageId.localeCompare(right.providerMessageId);
    const leftTime = left.timestamp?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const rightTime = right.timestamp?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return leftTime - rightTime || left.order - right.order;
  }).map(({ order: _order, ...item }) => item);
}

export function parseWhatsAppInboundMessages(payload: unknown): WhatsAppInboundMessage[] | null {
  if (!payload || typeof payload !== 'object') return null;
  const envelope = payload as { object?: unknown; entry?: unknown };
  if (envelope.object !== 'whatsapp_business_account' || !Array.isArray(envelope.entry)) return null;
  const messages: WhatsAppInboundMessage[] = [];
  for (const entry of envelope.entry) {
    if (!entry || typeof entry !== 'object' || !Array.isArray((entry as { changes?: unknown }).changes)) return null;
    for (const change of (entry as { changes: unknown[] }).changes) {
      if (!change || typeof change !== 'object') return null;
      const typed = change as { field?: unknown; value?: { messages?: unknown } };
      if (typed.field !== 'messages') continue;
      if (typed.value?.messages !== undefined && !Array.isArray(typed.value.messages)) return null;
      for (const item of typed.value?.messages || []) {
        if (!item || typeof item !== 'object') continue;
        const message = item as { id?: unknown; from?: unknown };
        const providerMessageId = typeof message.id === 'string' ? message.id.trim() : '';
        const telephone = typeof message.from === 'string' ? message.from.trim() : '';
        if (providerMessageId && telephone) messages.push({ providerMessageId, telephone });
      }
    }
  }
  return messages;
}

export async function handleWhatsAppPost(
  request: Request,
  processStatus: (input: WhatsAppStatusInput) => Promise<unknown> = processWhatsAppStatus,
  processInbound: (input: WhatsAppInboundMessage) => Promise<unknown> = receiveWhatsAppInbound,
): Promise<Response> {
  const contentLength = Number(request.headers.get('content-length') || '0');
  if (Number.isFinite(contentLength) && contentLength > WHATSAPP_WEBHOOK_MAX_BYTES) {
    return new Response('Payload too large', { status: 413 });
  }
  const rawBody = new Uint8Array(await request.arrayBuffer());
  if (rawBody.byteLength > WHATSAPP_WEBHOOK_MAX_BYTES) return new Response('Payload too large', { status: 413 });
  if (!verifyWhatsAppSignature(rawBody, request.headers.get('x-hub-signature-256'))) {
    return new Response('Invalid signature', { status: 401 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(rawBody).toString('utf8'));
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }
  const statuses = parseWhatsAppStatuses(payload);
  const messages = parseWhatsAppInboundMessages(payload);
  if (!statuses || !messages) return new Response('Invalid webhook envelope', { status: 400 });
  for (const status of statuses) await processStatus(status);
  for (const message of messages) await processInbound(message);
  return new Response('EVENT_RECEIVED', { status: 200 });
}

export const POST: APIRoute = async ({ request }) => handleWhatsAppPost(request);
