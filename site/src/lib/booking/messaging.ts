import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import { getPool } from './db';

export type BookingMessageSender = 'booker' | 'administrator' | 'bot';
export type BookingMessageType = 'message' | 'system';
export type BookingMessageViewer = 'booker' | 'administrator';
export type BookingMessageNotificationStatus = 'not_requested' | 'pending' | 'sent' | 'failed' | 'skipped';
export type BookingMessageAudience = 'booker' | 'administrator' | 'both' | 'none';

export type BookingMessage = {
  id: string;
  publicId: string;
  senderType: BookingMessageSender;
  senderName: string;
  messageType: BookingMessageType;
  body: string;
  createdAt: string;
  unreadForViewer: boolean;
  notificationStatus: BookingMessageNotificationStatus;
  notificationRecipient: string | null;
  notificationError: string | null;
};

type MessageRow = Record<string, any>;

function normaliseMessage(row: MessageRow, viewer: BookingMessageViewer): BookingMessage {
  return {
    id: String(row.id),
    publicId: String(row.publicId),
    senderType: row.senderType,
    senderName: row.senderName,
    messageType: row.messageType,
    body: row.body,
    createdAt: new Date(row.createdAt).toISOString(),
    unreadForViewer: viewer === 'booker' ? row.bookerReadAt == null : row.adminReadAt == null,
    notificationStatus: row.notificationStatus,
    notificationRecipient: row.notificationRecipient,
    notificationError: row.notificationError,
  };
}

function accessTokenHash(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function validBookingAccessToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43,128}$/.test(token);
}

function cleanAfterId(value?: string | null): string {
  const after = String(value || '').trim();
  return /^\d{1,20}$/.test(after) ? after : '0';
}

const messageSelect = `
  SELECT bm.id::text, bm.public_id::text AS "publicId",
         bm.sender_type AS "senderType", bm.sender_name AS "senderName",
         bm.message_type AS "messageType", bm.body,
         bm.booker_read_at AS "bookerReadAt", bm.admin_read_at AS "adminReadAt",
         bm.notification_status AS "notificationStatus",
         bm.notification_recipient AS "notificationRecipient",
         bm.notification_error AS "notificationError",
         bm.created_at AS "createdAt"
    FROM booking_messages bm`;

async function markReadByBookingId(bookingId: string, viewer: BookingMessageViewer): Promise<void> {
  const column = viewer === 'booker' ? 'booker_read_at' : 'admin_read_at';
  await getPool().query(
    `UPDATE booking_messages SET ${column} = NOW()
      WHERE provisional_booking_id = $1 AND ${column} IS NULL`,
    [bookingId],
  );
}

export async function getBookingMessagesByReference(
  reference: string,
  viewer: BookingMessageViewer,
  options: { afterId?: string | null; markRead?: boolean } = {},
): Promise<BookingMessage[]> {
  const afterId = cleanAfterId(options.afterId);
  const result = await getPool().query(
    `${messageSelect}
      JOIN provisional_bookings pb ON pb.id = bm.provisional_booking_id
     WHERE pb.public_id = $1::uuid AND bm.id > $2::bigint
     ORDER BY bm.id`,
    [reference, afterId],
  );
  const booking = await getPool().query(
    `SELECT id::text FROM provisional_bookings WHERE public_id = $1::uuid`,
    [reference],
  );
  if (options.markRead !== false && booking.rowCount) {
    await markReadByBookingId(String(booking.rows[0].id), viewer);
  }
  return result.rows.map((row: MessageRow) => normaliseMessage(row, viewer));
}

export async function getBookingMessagesByToken(
  token: string,
  viewer: BookingMessageViewer,
  options: { afterId?: string | null; markRead?: boolean } = {},
): Promise<BookingMessage[]> {
  if (!validBookingAccessToken(token)) return [];
  const afterId = cleanAfterId(options.afterId);
  const tokenHash = accessTokenHash(token);
  const result = await getPool().query(
    `WITH resolved AS (
       SELECT id FROM provisional_bookings WHERE customer_access_token = $1
       UNION
       SELECT provisional_booking_id FROM booking_offers WHERE access_token_hash = $2
     )
     ${messageSelect}
     JOIN resolved r ON r.id = bm.provisional_booking_id
     WHERE bm.id > $3::bigint
     ORDER BY bm.id`,
    [token, tokenHash, afterId],
  );
  const booking = await getPool().query(
    `SELECT id::text FROM provisional_bookings WHERE customer_access_token = $1
     UNION
     SELECT provisional_booking_id::text FROM booking_offers WHERE access_token_hash = $2
     LIMIT 1`,
    [token, tokenHash],
  );
  if (options.markRead !== false && booking.rowCount) {
    await markReadByBookingId(String(booking.rows[0].id), viewer);
  }
  return result.rows.map((row: MessageRow) => normaliseMessage(row, viewer));
}

export async function createAdministratorBookingMessage(input: {
  reference: string;
  adminUserId: string;
  adminDisplayName: string;
  body: string;
  notificationRequested: boolean;
  notificationRecipient?: string | null;
}): Promise<BookingMessage> {
  const result = await getPool().query(
    `INSERT INTO booking_messages (
       provisional_booking_id, admin_user_id, sender_type, sender_name,
       message_type, body, booker_read_at, admin_read_at,
       notification_status, notification_recipient
     )
     SELECT pb.id, $2, 'administrator', $3, 'message', $4,
            NULL, NOW(), CASE WHEN $5::boolean THEN 'pending' ELSE 'not_requested' END, $6
       FROM provisional_bookings pb
      WHERE pb.public_id = $1::uuid
     RETURNING id::text, public_id::text AS "publicId", sender_type AS "senderType",
               sender_name AS "senderName", message_type AS "messageType", body,
               booker_read_at AS "bookerReadAt", admin_read_at AS "adminReadAt",
               notification_status AS "notificationStatus",
               notification_recipient AS "notificationRecipient",
               notification_error AS "notificationError", created_at AS "createdAt"`,
    [
      input.reference,
      input.adminUserId,
      input.adminDisplayName || 'Jenna',
      input.body,
      input.notificationRequested,
      input.notificationRecipient || null,
    ],
  );
  if (!result.rowCount) throw new Error('BOOKING_NOT_FOUND');
  return normaliseMessage(result.rows[0], 'administrator');
}

export async function createBookerBookingMessage(input: {
  token: string;
  body: string;
  notificationRequested: boolean;
  notificationRecipient?: string | null;
}): Promise<BookingMessage> {
  if (!validBookingAccessToken(input.token)) throw new Error('BOOKING_NOT_FOUND');
  const tokenHash = accessTokenHash(input.token);
  const result = await getPool().query(
    `WITH resolved AS (
       SELECT id FROM provisional_bookings WHERE customer_access_token = $1
       UNION
       SELECT provisional_booking_id FROM booking_offers WHERE access_token_hash = $2
     )
     INSERT INTO booking_messages (
       provisional_booking_id, sender_type, sender_name, message_type, body,
       booker_read_at, admin_read_at, notification_status, notification_recipient
     )
     SELECT pb.id, 'booker', pb.guest_name, 'message', $3,
            NOW(), NULL, CASE WHEN $4::boolean THEN 'pending' ELSE 'not_requested' END, $5
       FROM provisional_bookings pb
       JOIN resolved r ON r.id = pb.id
     RETURNING id::text, public_id::text AS "publicId", sender_type AS "senderType",
               sender_name AS "senderName", message_type AS "messageType", body,
               booker_read_at AS "bookerReadAt", admin_read_at AS "adminReadAt",
               notification_status AS "notificationStatus",
               notification_recipient AS "notificationRecipient",
               notification_error AS "notificationError", created_at AS "createdAt"`,
    [
      input.token,
      tokenHash,
      input.body,
      input.notificationRequested,
      input.notificationRecipient || null,
    ],
  );
  if (!result.rowCount) throw new Error('BOOKING_NOT_FOUND');
  return normaliseMessage(result.rows[0], 'booker');
}

function readDatesForAudience(audience: BookingMessageAudience): { bookerReadAt: Date | null; adminReadAt: Date | null } {
  const now = new Date();
  return {
    bookerReadAt: audience === 'booker' || audience === 'both' ? null : now,
    adminReadAt: audience === 'administrator' || audience === 'both' ? null : now,
  };
}

export async function insertBotBookingMessage(
  client: PoolClient,
  input: {
    bookingId: string | number;
    offerId?: string | number | null;
    body: string;
    audience: BookingMessageAudience;
    sourceKey?: string | null;
  },
): Promise<void> {
  const reads = readDatesForAudience(input.audience);
  await client.query(
    `INSERT INTO booking_messages (
       provisional_booking_id, booking_offer_id, sender_type, sender_name,
       message_type, body, source_key, booker_read_at, admin_read_at
     ) VALUES ($1, $2, 'bot', 'Olrig Bot', 'system', $3, $4, $5, $6)
     ON CONFLICT (source_key) DO NOTHING`,
    [
      input.bookingId,
      input.offerId || null,
      input.body,
      input.sourceKey || null,
      reads.bookerReadAt,
      reads.adminReadAt,
    ],
  );
}

export async function insertAdministratorOfferMessage(
  client: PoolClient,
  input: {
    bookingId: string | number;
    offerId: string | number;
    adminUserId: string | number;
    adminDisplayName: string;
    body: string;
  },
): Promise<void> {
  if (!input.body.trim()) return;
  await client.query(
    `INSERT INTO booking_messages (
       provisional_booking_id, booking_offer_id, admin_user_id,
       sender_type, sender_name, message_type, body, source_key,
       booker_read_at, admin_read_at
     ) VALUES ($1, $2, $3, 'administrator', $4, 'message', $5, $6, NULL, NOW())
     ON CONFLICT (source_key) DO NOTHING`,
    [
      input.bookingId,
      input.offerId,
      input.adminUserId,
      input.adminDisplayName || 'Jenna',
      input.body,
      `offer-message:${input.offerId}`,
    ],
  );
}

export async function markBookingMessageNotification(input: {
  messageId: string;
  status: Exclude<BookingMessageNotificationStatus, 'pending' | 'not_requested'>;
  recipient?: string | null;
  messageIdFromProvider?: string | null;
  error?: string | null;
}): Promise<void> {
  await getPool().query(
    `UPDATE booking_messages
        SET notification_status = $2,
            notification_recipient = COALESCE($3, notification_recipient),
            notification_message_id = $4,
            notification_error = $5
      WHERE id = $1`,
    [
      input.messageId,
      input.status,
      input.recipient || null,
      input.messageIdFromProvider || null,
      input.error ? input.error.slice(0, 4000) : null,
    ],
  );
}

export function botMessageForActivity(eventType: string): { body: string; audience: BookingMessageAudience } | null {
  const messages: Record<string, { body: string; audience: BookingMessageAudience }> = {
    offer_email_sent: {
      body: 'The optional email copy of the booking offer was sent successfully.',
      audience: 'booker',
    },
    offer_email_failed: {
      body: 'The booking offer remains available here, but its optional email copy could not be sent.',
      audience: 'booker',
    },
    booking_confirmation_email_sent: {
      body: 'The optional booking confirmation email was sent successfully.',
      audience: 'booker',
    },
    booking_confirmation_email_failed: {
      body: 'The booking is confirmed here, but the optional confirmation email could not be sent.',
      audience: 'booker',
    },
    customer_response_email_sent: {
      body: 'The optional email copy of the Booker response was sent successfully.',
      audience: 'booker',
    },
    customer_response_email_failed: {
      body: 'The Booker response is recorded here, but its optional email copy could not be sent.',
      audience: 'booker',
    },
    management_response_email_sent: {
      body: 'Olrig Bank administrators were notified of the Booker response by email.',
      audience: 'administrator',
    },
    management_response_email_failed: {
      body: 'The Booker response is recorded here, but the administrator email notification could not be sent.',
      audience: 'administrator',
    },
    booking_cancelled: {
      body: 'This booking has been cancelled. The conversation remains available as the permanent record.',
      audience: 'both',
    },
    booking_amended: {
      body: 'The reservation details have been amended. Open Reservation details to review the changes.',
      audience: 'both',
    },
    payment_requested: {
      body: 'Payment information has been added to the booking. Open Reservation details to review it.',
      audience: 'booker',
    },
    payment_received: {
      body: 'Payment has been recorded for this booking.',
      audience: 'both',
    },
  };
  return messages[eventType] || null;
}
