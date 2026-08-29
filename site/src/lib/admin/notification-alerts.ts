import { getPool } from '../booking/db.ts';

type AlertDatabase = Pick<ReturnType<typeof getPool>, 'query'>;

export type NotificationAlertKind =
  | 'fallback_pending'
  | 'fallback_email_failed'
  | 'whatsapp_stale'
  | 'whatsapp_failed_without_fallback';

export type NotificationAlert = {
  kind: NotificationAlertKind;
  eventType: string;
  bookingReference: string;
  recipientMasked: string | null;
  status: string;
  attempts: number;
  occurredAt: string;
};

export async function listNotificationAlerts(database: AlertDatabase = getPool()): Promise<NotificationAlert[]> {
  const result = await database.query(
    `SELECT kind, event_type AS "eventType", booking_reference AS "bookingReference",
            recipient_masked AS "recipientMasked", status, attempts,
            occurred_at AS "occurredAt"
       FROM (
         SELECT 'fallback_pending'::text AS kind, bne.event_type,
                pb.public_id::text AS booking_reference, wa.recipient_masked,
                j.status, j.attempts, j.created_at AS occurred_at
           FROM booking_notification_fallback_jobs j
           JOIN booking_notification_deliveries wa ON wa.id = j.whatsapp_delivery_id
           JOIN booking_notification_events bne ON bne.id = wa.notification_event_id
           JOIN provisional_bookings pb ON pb.id = bne.provisional_booking_id
          WHERE j.status IN ('pending', 'processing')
         UNION ALL
         SELECT 'fallback_email_failed', bne.event_type, pb.public_id::text,
                wa.recipient_masked, email.status, j.attempts, email.updated_at
           FROM booking_notification_fallback_jobs j
           JOIN booking_notification_deliveries wa ON wa.id = j.whatsapp_delivery_id
           JOIN booking_notification_events bne ON bne.id = wa.notification_event_id
           JOIN provisional_bookings pb ON pb.id = bne.provisional_booking_id
           JOIN booking_notification_deliveries email ON email.id = wa.fallback_delivery_id
          WHERE email.status = 'failed'
         UNION ALL
         SELECT 'whatsapp_stale', bne.event_type, pb.public_id::text,
                wa.recipient_masked, wa.status, 0, wa.updated_at
           FROM booking_notification_deliveries wa
           JOIN booking_notification_events bne ON bne.id = wa.notification_event_id
           JOIN provisional_bookings pb ON pb.id = bne.provisional_booking_id
          WHERE wa.channel = 'whatsapp' AND wa.status = 'submitted'
            AND wa.updated_at < NOW() - INTERVAL '15 minutes'
         UNION ALL
         SELECT 'whatsapp_failed_without_fallback', bne.event_type,
                pb.public_id::text, wa.recipient_masked, wa.status, 0, wa.updated_at
           FROM booking_notification_deliveries wa
           JOIN booking_notification_events bne ON bne.id = wa.notification_event_id
           JOIN provisional_bookings pb ON pb.id = bne.provisional_booking_id
           LEFT JOIN booking_notification_fallback_jobs j ON j.whatsapp_delivery_id = wa.id
           LEFT JOIN booking_notification_deliveries email ON email.id = wa.fallback_delivery_id
          WHERE wa.channel = 'whatsapp' AND wa.status = 'failed'
            AND j.id IS NULL AND (email.id IS NULL OR email.status <> 'sent')
       ) alerts
      ORDER BY occurred_at DESC`,
  );
  return result.rows.map((row) => ({
    ...row,
    attempts: Number(row.attempts || 0),
    occurredAt: new Date(row.occurredAt).toISOString(),
  }));
}

export async function countNotificationAlerts(database: AlertDatabase = getPool()): Promise<number> {
  return (await listNotificationAlerts(database)).length;
}
