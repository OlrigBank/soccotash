ALTER TABLE provisional_bookings
  DROP CONSTRAINT IF EXISTS provisional_bookings_status_check;

ALTER TABLE provisional_bookings
  ADD CONSTRAINT provisional_bookings_status_check
  CHECK (status IN ('pending', 'offered', 'approved', 'declined', 'cancelled'));

CREATE TABLE IF NOT EXISTS booking_offers (
  id BIGSERIAL PRIMARY KEY,
  public_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  provisional_booking_id BIGINT NOT NULL REFERENCES provisional_bookings(id) ON DELETE CASCADE,
  admin_user_id BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  currency TEXT NOT NULL DEFAULT 'GBP',
  line_items JSONB NOT NULL,
  total_pence INTEGER NOT NULL CHECK (total_pence >= 0),
  offer_message TEXT,
  terms TEXT,
  valid_until DATE,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  delivery_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending', 'sent', 'failed')),
  delivery_message_id TEXT,
  delivery_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS booking_offers_booking_idx
  ON booking_offers(provisional_booking_id, created_at DESC);

CREATE INDEX IF NOT EXISTS booking_offers_delivery_idx
  ON booking_offers(delivery_status, created_at DESC);
