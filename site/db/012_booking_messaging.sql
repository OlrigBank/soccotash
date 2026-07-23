CREATE TABLE IF NOT EXISTS booking_messages (
  id BIGSERIAL PRIMARY KEY,
  public_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  provisional_booking_id BIGINT NOT NULL REFERENCES provisional_bookings(id) ON DELETE CASCADE,
  booking_offer_id BIGINT REFERENCES booking_offers(id) ON DELETE SET NULL,
  admin_user_id BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('booker', 'administrator', 'bot')),
  sender_name TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'message' CHECK (message_type IN ('message', 'system')),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 10000),
  source_key TEXT UNIQUE,
  booker_read_at TIMESTAMPTZ,
  admin_read_at TIMESTAMPTZ,
  notification_status TEXT NOT NULL DEFAULT 'not_requested'
    CHECK (notification_status IN ('not_requested', 'pending', 'sent', 'failed', 'skipped')),
  notification_recipient TEXT,
  notification_message_id TEXT,
  notification_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS booking_messages_booking_idx
  ON booking_messages(provisional_booking_id, id);

CREATE INDEX IF NOT EXISTS booking_messages_admin_unread_idx
  ON booking_messages(provisional_booking_id, id)
  WHERE admin_read_at IS NULL;

CREATE INDEX IF NOT EXISTS booking_messages_booker_unread_idx
  ON booking_messages(provisional_booking_id, id)
  WHERE booker_read_at IS NULL;

-- Preserve the original message supplied with an existing request as the first
-- immutable Booker message. Existing history is marked read so deployment does
-- not create a misleading backlog of unread messages.
INSERT INTO booking_messages (
  provisional_booking_id, sender_type, sender_name, message_type, body,
  source_key, booker_read_at, admin_read_at, created_at
)
SELECT pb.id, 'booker', pb.guest_name, 'message', pb.guest_message,
       'legacy:request-message:' || pb.id::text,
       pb.created_at, pb.created_at, pb.created_at
  FROM provisional_bookings pb
 WHERE NULLIF(btrim(pb.guest_message), '') IS NOT NULL
ON CONFLICT (source_key) DO NOTHING;

-- Add the friendly acknowledgement that now accompanies every booking request.
INSERT INTO booking_messages (
  provisional_booking_id, sender_type, sender_name, message_type, body,
  source_key, booker_read_at, admin_read_at, created_at
)
SELECT pb.id, 'bot', 'Olrig Bot', 'system',
       'Your booking request has been received. Jenna will review the dates and price, and any update will appear in this conversation.',
       'legacy:request-received:' || pb.id::text,
       pb.created_at, pb.created_at, pb.created_at + INTERVAL '1 millisecond'
  FROM provisional_bookings pb
ON CONFLICT (source_key) DO NOTHING;

-- Earlier offer messages become administrator messages in the conversation.
INSERT INTO booking_messages (
  provisional_booking_id, booking_offer_id, admin_user_id,
  sender_type, sender_name, message_type, body, source_key,
  booker_read_at, admin_read_at, created_at
)
SELECT bo.provisional_booking_id, bo.id, bo.admin_user_id,
       'administrator', COALESCE(NULLIF(au.display_name, ''), 'Jenna'),
       'message', bo.offer_message,
       'legacy:offer-message:' || bo.id::text,
       COALESCE(bo.published_at, bo.created_at), COALESCE(bo.published_at, bo.created_at),
       COALESCE(bo.published_at, bo.created_at)
  FROM booking_offers bo
  LEFT JOIN admin_users au ON au.id = bo.admin_user_id
 WHERE bo.published_at IS NOT NULL
   AND NULLIF(btrim(bo.offer_message), '') IS NOT NULL
ON CONFLICT (source_key) DO NOTHING;

-- Convert relevant existing activity into friendly Olrig Bot notices. Purely
-- technical audit events remain in booking_activity only.
INSERT INTO booking_messages (
  provisional_booking_id, booking_offer_id, sender_type, sender_name,
  message_type, body, source_key, booker_read_at, admin_read_at, created_at
)
SELECT ba.provisional_booking_id, ba.booking_offer_id, 'bot', 'Olrig Bot',
       'system',
       CASE ba.event_type
         WHEN 'offer_published' THEN 'A booking offer has been published. Open Reservation details to review the price, terms and response options.'
         WHEN 'offer_expired' THEN 'The booking offer has expired. Send a message if you would like Olrig Bank to reconsider the stay.'
         WHEN 'booking_confirmed' THEN 'The Booker accepted the offer. This direct booking is now confirmed.'
         WHEN 'offer_declined' THEN 'The Booker declined the booking offer.'
         WHEN 'offer_email_sent' THEN 'The optional email copy of the booking offer was sent successfully.'
         WHEN 'offer_email_failed' THEN 'The booking offer remains available here, but its optional email copy could not be sent.'
         WHEN 'booking_confirmation_email_sent' THEN 'The optional booking confirmation email was sent successfully.'
         WHEN 'booking_confirmation_email_failed' THEN 'The booking is confirmed here, but the optional confirmation email could not be sent.'
         WHEN 'customer_response_email_sent' THEN 'The optional email copy of the Booker response was sent successfully.'
         WHEN 'customer_response_email_failed' THEN 'The Booker response is recorded here, but its optional email copy could not be sent.'
         WHEN 'management_response_email_sent' THEN 'Olrig Bank administrators were notified of the Booker response by email.'
         WHEN 'management_response_email_failed' THEN 'The Booker response is recorded here, but the administrator email notification could not be sent.'
         WHEN 'booking_cancelled' THEN 'This booking has been cancelled. The conversation remains available as the permanent record.'
         WHEN 'booking_amended' THEN 'The reservation details have been amended. Open Reservation details to review the changes.'
         WHEN 'payment_requested' THEN 'Payment information has been added to the booking. Open Reservation details to review it.'
         WHEN 'payment_received' THEN 'Payment has been recorded for this booking.'
         ELSE NULL
       END,
       'legacy:activity:' || ba.id::text,
       ba.created_at, ba.created_at, ba.created_at
  FROM booking_activity ba
 WHERE ba.event_type IN (
   'offer_published', 'offer_expired', 'booking_confirmed', 'offer_declined',
   'offer_email_sent', 'offer_email_failed',
   'booking_confirmation_email_sent', 'booking_confirmation_email_failed',
   'customer_response_email_sent', 'customer_response_email_failed',
   'management_response_email_sent', 'management_response_email_failed',
   'booking_cancelled', 'booking_amended', 'payment_requested', 'payment_received'
 )
ON CONFLICT (source_key) DO NOTHING;
