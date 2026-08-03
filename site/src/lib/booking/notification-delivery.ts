import { getPool } from './db.ts';
import { getProperty } from './config.ts';
import type { ProvisionalBookingRequest } from './repository.ts';
import { sendEmail, type EmailSendResult } from '../email/sender.ts';
import { hashRecipient, maskTelephone } from './whatsapp-phone.ts';
import {
  getWhatsAppTemplate,
  isWhatsAppNotificationEvent,
  whatsappEventSummaries,
  whatsappTemplateParameters,
  type WhatsAppNotificationEvent,
} from './whatsapp-templates.ts';
import { getWhatsAppConfiguration, sendWhatsAppTemplate } from './whatsapp-provider.ts';

export type NotificationDeliveryStatus = 'not_requested' | 'queued' | 'submitted' | 'sent' | 'delivered' | 'read' | 'failed' | 'skipped';
export type NotificationChannel = 'email' | 'whatsapp';
export type EmailDelivery = EmailSendResult & { recipient: string };

export type NotificationOutcome = {
  channel: NotificationChannel | null;
  status: NotificationDeliveryStatus;
  fallbackUsed: boolean;
  reason?: string;
};

const progress: Record<NotificationDeliveryStatus, number> = {
  not_requested: 0, queued: 1, submitted: 2, sent: 3, delivered: 4, read: 5, failed: 6, skipped: 6,
};

export function nextDeliveryStatus(current: NotificationDeliveryStatus, incoming: NotificationDeliveryStatus): NotificationDeliveryStatus {
  if (current === 'read' || current === 'failed' || current === 'skipped') return current;
  if (incoming === 'failed') return current === 'delivered' ? current : 'failed';
  return progress[incoming] > progress[current] ? incoming : current;
}

export function hasActiveWhatsAppConsentForCurrentNumber(
  booking: Pick<
    ProvisionalBookingRequest,
    'whatsappConsentStatus' | 'telephoneE164' | 'whatsappConsentNumberE164'
  >,
): boolean {
  return booking.whatsappConsentStatus === 'active'
    && Boolean(booking.telephoneE164)
    && booking.whatsappConsentNumberE164 === booking.telephoneE164;
}

function safeContext(value: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!value) return {};
  const denied = /token|secret|telephone|phone|email|url|reason/i;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !denied.test(key)));
}

async function ensureEvent(input: {
  bookingId: string;
  eventType: string;
  target: 'booker' | 'administrator';
  sourceKey: string;
  templateName?: string;
  templateVersion?: string;
  context?: Record<string, unknown>;
}): Promise<string> {
  const result = await getPool().query(
    `INSERT INTO booking_notification_events
       (provisional_booking_id, event_type, target, source_key, template_name, template_version, context)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     ON CONFLICT (source_key) DO UPDATE SET source_key = EXCLUDED.source_key
     RETURNING id::text`,
    [input.bookingId, input.eventType, input.target, input.sourceKey, input.templateName || null,
      input.templateVersion || null, JSON.stringify(safeContext(input.context))],
  );
  return result.rows[0].id;
}

async function recordDelivery(input: {
  eventId: string;
  channel: NotificationChannel;
  provider?: string | null;
  recipient?: string | null;
  status: NotificationDeliveryStatus;
  providerMessageId?: string | null;
  idempotencyKey: string;
  error?: string | null;
}): Promise<string> {
  const recipient = input.recipient?.trim() || null;
  const result = await getPool().query(
    `INSERT INTO booking_notification_deliveries
       (notification_event_id, channel, provider, recipient_masked, recipient_hash, status,
        provider_message_id, idempotency_key, submitted_at, sent_at, failed_at, error_detail)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
       CASE WHEN $6 = 'submitted' THEN NOW() END,
       CASE WHEN $6 = 'sent' THEN NOW() END,
       CASE WHEN $6 = 'failed' THEN NOW() END, $9)
     ON CONFLICT (idempotency_key) DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
     RETURNING id::text`,
    [input.eventId, input.channel, input.provider || null,
      recipient ? (input.channel === 'whatsapp' ? maskTelephone(recipient) : recipient.replace(/(^.).*(@.*$)/, '$1***$2')) : null,
      recipient ? hashRecipient(recipient) : null, input.status, input.providerMessageId || null,
      input.idempotencyKey, input.error?.slice(0, 300) || null],
  );
  return result.rows[0].id;
}

async function existingDelivery(idempotencyKey: string): Promise<{ channel: NotificationChannel; status: NotificationDeliveryStatus } | null> {
  const result = await getPool().query(
    `SELECT channel, status FROM booking_notification_deliveries WHERE idempotency_key = $1`,
    [idempotencyKey],
  );
  return result.rowCount ? result.rows[0] : null;
}

async function claimDelivery(input: {
  eventId: string;
  channel: NotificationChannel;
  recipient?: string | null;
  idempotencyKey: string;
}): Promise<{ claimed: boolean; id: string; channel: NotificationChannel; status: NotificationDeliveryStatus }> {
  const recipient = input.recipient?.trim() || null;
  const inserted = await getPool().query(
    `INSERT INTO booking_notification_deliveries
       (notification_event_id, channel, recipient_masked, recipient_hash, status, idempotency_key)
     VALUES ($1, $2, $3, $4, 'queued', $5)
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING id::text, channel, status`,
    [input.eventId, input.channel,
      recipient ? (input.channel === 'whatsapp' ? maskTelephone(recipient) : recipient.replace(/(^.).*(@.*$)/, '$1***$2')) : null,
      recipient ? hashRecipient(recipient) : null, input.idempotencyKey],
  );
  if (inserted.rowCount) return { claimed: true, ...inserted.rows[0] };
  const existing = await getPool().query(
    `SELECT id::text, channel, status FROM booking_notification_deliveries WHERE idempotency_key = $1`,
    [input.idempotencyKey],
  );
  return { claimed: false, ...existing.rows[0] };
}

async function finishDelivery(input: {
  id: string;
  status: NotificationDeliveryStatus;
  provider?: string | null;
  providerMessageId?: string | null;
  error?: string | null;
  recipient?: string | null;
  channel?: NotificationChannel;
}): Promise<void> {
  const recipient = input.recipient?.trim() || null;
  await getPool().query(
    `UPDATE booking_notification_deliveries
        SET status = $2, provider = COALESCE($3, provider), provider_message_id = COALESCE($4, provider_message_id),
            submitted_at = CASE WHEN $2 = 'submitted' THEN COALESCE(submitted_at, NOW()) ELSE submitted_at END,
            sent_at = CASE WHEN $2 = 'sent' THEN COALESCE(sent_at, NOW()) ELSE sent_at END,
            failed_at = CASE WHEN $2 = 'failed' THEN COALESCE(failed_at, NOW()) ELSE failed_at END,
            error_detail = $5,
            recipient_masked = COALESCE($6, recipient_masked), recipient_hash = COALESCE($7, recipient_hash),
            updated_at = NOW()
      WHERE id = $1`,
    [input.id, input.status, input.provider || null, input.providerMessageId || null, input.error?.slice(0, 300) || null,
      recipient ? (input.channel === 'whatsapp' ? maskTelephone(recipient) : recipient.replace(/(^.).*(@.*$)/, '$1***$2')) : null,
      recipient ? hashRecipient(recipient) : null],
  );
}

async function deliverEmailFallback(input: {
  eventId: string;
  sourceKey: string;
  emailDelivery?: () => Promise<EmailDelivery | null>;
}): Promise<NotificationOutcome> {
  const prior = await existingDelivery(`${input.sourceKey}:email`);
  if (prior) return { channel: prior.channel, status: prior.status, fallbackUsed: true };
  const claim = await claimDelivery({ eventId: input.eventId, channel: 'email', idempotencyKey: `${input.sourceKey}:email` });
  if (!claim.claimed) return { channel: claim.channel, status: claim.status, fallbackUsed: true };
  await getPool().query(
    `UPDATE booking_notification_deliveries
        SET fallback_delivery_id = $2, updated_at = NOW()
      WHERE notification_event_id = $1 AND channel = 'whatsapp' AND fallback_delivery_id IS NULL`,
    [input.eventId, claim.id],
  );
  if (!input.emailDelivery) {
    await finishDelivery({ id: claim.id, status: 'skipped', error: 'No email delivery is available.' });
    return { channel: null, status: 'skipped', fallbackUsed: true, reason: 'No email delivery is available.' };
  }
  try {
    const sent = await input.emailDelivery();
    if (!sent) {
      await finishDelivery({ id: claim.id, status: 'skipped', error: 'No email recipient is configured.' });
      return { channel: 'email', status: 'skipped', fallbackUsed: true, reason: 'No email recipient is configured.' };
    }
    await finishDelivery({ id: claim.id, status: 'sent', provider: sent.provider, providerMessageId: sent.messageId,
      recipient: sent.recipient, channel: 'email' });
    return { channel: 'email', status: 'sent', fallbackUsed: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await finishDelivery({ id: claim.id, status: 'failed', error: reason });
    return { channel: 'email', status: 'failed', fallbackUsed: true, reason };
  }
}

export async function deliverBookingNotification(input: {
  booking: ProvisionalBookingRequest;
  eventType: string;
  sourceKey: string;
  target: 'booker' | 'administrator';
  propertyName: string;
  manageUrl?: string;
  context?: Record<string, unknown>;
  emailDelivery?: () => Promise<EmailDelivery | null>;
}): Promise<NotificationOutcome> {
  const supported = isWhatsAppNotificationEvent(input.eventType);
  const template = supported ? getWhatsAppTemplate(input.eventType as WhatsAppNotificationEvent) : null;
  const eventId = await ensureEvent({
    bookingId: String(input.booking.internalId), eventType: input.eventType, target: input.target,
    sourceKey: input.sourceKey, templateName: template?.name, templateVersion: template?.version, context: input.context,
  });

  if (input.target !== 'booker') return deliverEmailFallback({ eventId, sourceKey: input.sourceKey, emailDelivery: input.emailDelivery });

  const consentActive = hasActiveWhatsAppConsentForCurrentNumber(input.booking);
  const configuration = getWhatsAppConfiguration();
  const priorWhatsApp = await existingDelivery(`${input.sourceKey}:whatsapp`);
  if (priorWhatsApp) return { channel: priorWhatsApp.channel, status: priorWhatsApp.status, fallbackUsed: false };
  if (!consentActive || !configuration.configured || !supported || !input.manageUrl) {
    const reason = !consentActive ? 'WhatsApp consent is not active.'
      : !configuration.configured ? 'WhatsApp is not configured.'
        : !supported ? 'This event has no WhatsApp template.' : 'No private booking link is available.';
    await recordDelivery({ eventId, channel: 'whatsapp', status: 'skipped', idempotencyKey: `${input.sourceKey}:whatsapp`, error: reason });
    return deliverEmailFallback({ eventId, sourceKey: input.sourceKey, emailDelivery: input.emailDelivery });
  }

  const claim = await claimDelivery({
    eventId, channel: 'whatsapp', recipient: input.booking.telephoneE164,
    idempotencyKey: `${input.sourceKey}:whatsapp`,
  });
  if (!claim.claimed) return { channel: claim.channel, status: claim.status, fallbackUsed: false };

  try {
    const result = await sendWhatsAppTemplate({
      to: input.booking.telephoneE164!, templateName: template!.name, language: template!.language,
      parameters: whatsappTemplateParameters({ event: input.eventType as WhatsAppNotificationEvent,
        guestName: input.booking.name, propertyName: input.propertyName, manageUrl: input.manageUrl }),
    });
    await finishDelivery({ id: claim.id, provider: result.provider, status: 'submitted', providerMessageId: result.messageId });
    return { channel: 'whatsapp', status: 'submitted', fallbackUsed: false };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await finishDelivery({ id: claim.id, provider: 'meta', status: 'failed', error: reason });
    return deliverEmailFallback({ eventId, sourceKey: input.sourceKey, emailDelivery: input.emailDelivery });
  }
}

async function genericFailureFallback(deliveryId: string): Promise<void> {
  const result = await getPool().query(
    `SELECT bne.id::text AS event_id, bne.source_key, bne.event_type,
            pb.guest_email, pb.guest_name, pb.customer_access_token, pb.property_id
       FROM booking_notification_deliveries bnd
       JOIN booking_notification_events bne ON bne.id = bnd.notification_event_id
       JOIN provisional_bookings pb ON pb.id = bne.provisional_booking_id
      WHERE bnd.id = $1`, [deliveryId],
  );
  if (!result.rowCount) return;
  const row = result.rows[0];
  if (!row.guest_email || !isWhatsAppNotificationEvent(row.event_type)) {
    await recordDelivery({ eventId: row.event_id, channel: 'email', status: 'skipped', idempotencyKey: `${row.source_key}:email`, error: 'No fallback email recipient.' });
    return;
  }
  const base = (process.env.BOOKING_PUBLIC_URL || '').replace(/\/$/, '');
  const manageUrl = `${base}/booking/manage/${row.customer_access_token}/`;
  const propertyName = getProperty(row.property_id)?.name || 'Olrig Bank';
  const summary = whatsappEventSummaries[row.event_type as WhatsAppNotificationEvent];
  await deliverEmailFallback({ eventId: row.event_id, sourceKey: row.source_key, emailDelivery: async () => {
    const sent = await sendEmail({
      to: row.guest_email,
      subject: `${propertyName} booking update`,
      text: `Dear ${row.guest_name},\n\n${summary}\n\nOpen your private booking page:\n${manageUrl}\n\nOlrig Bank`,
      html: `<p>Dear ${String(row.guest_name).replace(/[&<>]/g, '')},</p><p>${summary}</p><p><a href="${manageUrl}">Open your private booking page</a></p><p>Olrig Bank</p>`,
    });
    return { ...sent, recipient: row.guest_email };
  } });
}

export async function processWhatsAppStatus(input: {
  providerMessageId: string;
  status: NotificationDeliveryStatus;
  providerEventKey: string;
  timestamp?: Date | null;
  errorCode?: string | null;
}): Promise<'updated' | 'duplicate' | 'unknown'> {
  const client = await getPool().connect();
  let deliveryId = '';
  let status: NotificationDeliveryStatus = input.status;
  try {
    await client.query('BEGIN');
    const current = await client.query(
      `SELECT id::text, status FROM booking_notification_deliveries
        WHERE provider = 'meta' AND provider_message_id = $1 FOR UPDATE`, [input.providerMessageId],
    );
    if (!current.rowCount) {
      await client.query('COMMIT');
      return 'unknown';
    }
    deliveryId = current.rows[0].id;
    const inserted = await client.query(
      `INSERT INTO booking_notification_status_events
         (delivery_id, provider_event_key, status, provider_timestamp, error_code)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (provider_event_key) DO NOTHING RETURNING id`,
      [deliveryId, input.providerEventKey, input.status, input.timestamp || null, input.errorCode || null],
    );
    if (!inserted.rowCount) {
      await client.query('COMMIT');
      return 'duplicate';
    }
    status = nextDeliveryStatus(current.rows[0].status, input.status);
    await client.query(
      `UPDATE booking_notification_deliveries SET status = $2, updated_at = NOW(),
         sent_at = CASE WHEN $2 = 'sent' THEN COALESCE(sent_at, NOW()) ELSE sent_at END,
         delivered_at = CASE WHEN $2 = 'delivered' THEN COALESCE(delivered_at, NOW()) ELSE delivered_at END,
         read_at = CASE WHEN $2 = 'read' THEN COALESCE(read_at, NOW()) ELSE read_at END,
         failed_at = CASE WHEN $2 = 'failed' THEN COALESCE(failed_at, NOW()) ELSE failed_at END,
         error_code = CASE WHEN $2 = 'failed' THEN $3 ELSE error_code END
       WHERE id = $1`, [deliveryId, status, input.errorCode || null],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  if (status === 'failed') await genericFailureFallback(deliveryId);
  return 'updated';
}

export async function getBookingNotificationHistory(bookingId: string) {
  const result = await getPool().query(
    `SELECT bne.event_type AS "eventType", bne.target, bnd.channel, bnd.provider,
            bnd.recipient_masked AS "recipientMasked", bnd.status,
            bnd.created_at AS "createdAt", bnd.updated_at AS "updatedAt"
       FROM booking_notification_events bne
       JOIN booking_notification_deliveries bnd ON bnd.notification_event_id = bne.id
      WHERE bne.provisional_booking_id = $1 ORDER BY bnd.created_at DESC`, [bookingId],
  );
  return result.rows.map((row) => ({ ...row, createdAt: new Date(row.createdAt).toISOString(), updatedAt: new Date(row.updatedAt).toISOString() }));
}
