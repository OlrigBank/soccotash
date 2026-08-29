import { getPool } from './db.ts';
import { hashRecipient, maskTelephone, normaliseWhatsAppTelephone } from './whatsapp-phone.ts';
import { sendWhatsAppText } from './whatsapp-provider.ts';

export type WhatsAppInboundMessage = {
  providerMessageId: string;
  telephone: string;
};

export type InboundReceiptResult = 'disabled' | 'unknown' | 'duplicate' | 'suppressed' | 'submitted' | 'failed' | 'unavailable';

export function inboundReplyEnabled(): boolean {
  return String(process.env.WHATSAPP_INBOUND_AUTO_REPLY_ENABLED || '').trim().toLowerCase() === 'true';
}

export function inboundReplyText(): string {
  const base = String(process.env.BOOKING_PUBLIC_URL || '').trim().replace(/\/$/, '');
  if (!/^https:\/\//i.test(base)) throw new Error('WHATSAPP_INBOUND_CONTACT_URL_NOT_CONFIGURED');
  return `Thank you for your message. This WhatsApp number is used for Olrig Bank booking notifications only, and incoming messages are not monitored.\n\nFor booking queries, please use your private booking chat. For other enquiries, please use one of the methods on our Contact page: ${base}/contact/`;
}

function normaliseMetaSender(value: string): string | null {
  const sender = String(value || '').trim();
  return normaliseWhatsAppTelephone(sender.startsWith('+') ? sender : `+${sender}`);
}

async function recordInbound(input: WhatsAppInboundMessage): Promise<{ id: string; result: 'pending' | 'duplicate' | 'suppressed' | 'unknown' }> {
  const telephone = normaliseMetaSender(input.telephone);
  if (!telephone || !input.providerMessageId.trim()) return { id: '', result: 'unknown' };
  const recipientHash = hashRecipient(telephone);
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [recipientHash]);
    const duplicate = await client.query(
      `SELECT id::text FROM whatsapp_inbound_acknowledgements WHERE provider_message_id = $1`,
      [input.providerMessageId],
    );
    if (duplicate.rowCount) {
      await client.query('COMMIT');
      return { id: duplicate.rows[0].id, result: 'duplicate' };
    }
    const booking = await client.query(
      `SELECT id::text FROM provisional_bookings
        WHERE guest_telephone_e164 = $1 ORDER BY id DESC LIMIT 1`,
      [telephone],
    );
    if (!booking.rowCount) {
      await client.query('COMMIT');
      return { id: '', result: 'unknown' };
    }
    const recent = await client.query(
      `SELECT 1 FROM whatsapp_inbound_acknowledgements
        WHERE recipient_hash = $1 AND (
          (status IN ('pending', 'processing') AND received_at > NOW() - INTERVAL '24 hours')
          OR (status = 'submitted' AND responded_at > NOW() - INTERVAL '24 hours')
        ) LIMIT 1`,
      [recipientHash],
    );
    const status = recent.rowCount ? 'suppressed' : 'pending';
    const inserted = await client.query(
      `INSERT INTO whatsapp_inbound_acknowledgements
         (provider_message_id, provisional_booking_id, recipient_masked, recipient_hash, status)
       VALUES ($1, $2, $3, $4, $5) RETURNING id::text`,
      [input.providerMessageId, booking.rows[0].id, maskTelephone(telephone), recipientHash, status],
    );
    await client.query('COMMIT');
    return { id: inserted.rows[0].id, result: status };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function processInboundAcknowledgement(
  id: string,
  send: typeof sendWhatsAppText = sendWhatsAppText,
): Promise<'submitted' | 'failed' | 'unavailable'> {
  const claimed = await getPool().query(
    `UPDATE whatsapp_inbound_acknowledgements acknowledgement
        SET status = 'processing', attempts = attempts + 1,
            lease_expires_at = NOW() + INTERVAL '5 minutes', updated_at = NOW()
      FROM provisional_bookings booking
      WHERE acknowledgement.id = $1
        AND booking.id = acknowledgement.provisional_booking_id
        AND (acknowledgement.status IN ('pending', 'failed')
          OR (acknowledgement.status = 'processing' AND acknowledgement.lease_expires_at < NOW()))
        AND acknowledgement.available_at <= NOW()
        AND acknowledgement.attempts < 3
      RETURNING acknowledgement.id::text, acknowledgement.recipient_hash,
                booking.guest_telephone_e164 AS telephone`,
    [id],
  );
  if (!claimed.rowCount) return 'unavailable';
  const row = claimed.rows[0];
  if (!row.telephone || hashRecipient(row.telephone) !== row.recipient_hash) {
    await getPool().query(
      `UPDATE whatsapp_inbound_acknowledgements SET status = 'cancelled', lease_expires_at = NULL,
         last_error = 'Booking telephone changed or was removed.', updated_at = NOW() WHERE id = $1`, [id],
    );
    return 'unavailable';
  }
  try {
    const sent = await send({ to: row.telephone, body: inboundReplyText() });
    await getPool().query(
      `UPDATE whatsapp_inbound_acknowledgements SET status = 'submitted', response_message_id = $2,
         responded_at = NOW(), lease_expires_at = NULL, last_error = NULL, updated_at = NOW() WHERE id = $1`,
      [id, sent.messageId],
    );
    return 'submitted';
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await getPool().query(
      `UPDATE whatsapp_inbound_acknowledgements SET status = 'failed', lease_expires_at = NULL,
         available_at = NOW() + LEAST(attempts, 10) * INTERVAL '1 minute',
         last_error = $2, updated_at = NOW() WHERE id = $1`, [id, reason.slice(0, 300)],
    );
    return 'failed';
  }
}

export async function receiveWhatsAppInbound(input: WhatsAppInboundMessage): Promise<InboundReceiptResult> {
  if (!inboundReplyEnabled()) return 'disabled';
  const receipt = await recordInbound(input);
  if (receipt.result !== 'pending') return receipt.result;
  return processInboundAcknowledgement(receipt.id);
}

export async function processQueuedInboundAcknowledgements(limit = 20): Promise<{ processed: number; failed: number }> {
  const bounded = Math.max(1, Math.min(100, Math.trunc(limit) || 20));
  let processed = 0;
  let failed = 0;
  while (processed + failed < bounded) {
    const next = await getPool().query(
      `SELECT id::text FROM whatsapp_inbound_acknowledgements
        WHERE available_at <= NOW() AND attempts < 3
          AND (status IN ('pending', 'failed') OR (status = 'processing' AND lease_expires_at < NOW()))
        ORDER BY available_at, id LIMIT 1`,
    );
    if (!next.rowCount) break;
    const result = await processInboundAcknowledgement(next.rows[0].id);
    if (result === 'submitted') processed += 1;
    else if (result === 'failed') failed += 1;
    else break;
  }
  return { processed, failed };
}
