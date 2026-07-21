ALTER TABLE provisional_bookings
  DROP CONSTRAINT IF EXISTS provisional_bookings_status_check;

ALTER TABLE provisional_bookings
  ADD CONSTRAINT provisional_bookings_status_check
  CHECK (status IN (
    'pending', 'offered', 'offer_accepted', 'approved',
    'declined', 'cancelled', 'expired'
  ));

ALTER TABLE booking_offers
  ADD COLUMN IF NOT EXISTS access_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS customer_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS first_viewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS declined_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS token_revoked_at TIMESTAMPTZ;

ALTER TABLE booking_offers
  DROP CONSTRAINT IF EXISTS booking_offers_customer_status_check;

ALTER TABLE booking_offers
  ADD CONSTRAINT booking_offers_customer_status_check
  CHECK (customer_status IN (
    'pending', 'active', 'accepted', 'declined', 'expired', 'superseded'
  ));

CREATE UNIQUE INDEX IF NOT EXISTS booking_offers_access_token_hash_idx
  ON booking_offers(access_token_hash)
  WHERE access_token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS booking_offers_customer_status_idx
  ON booking_offers(customer_status, valid_until);

CREATE TABLE IF NOT EXISTS booking_activity (
  id BIGSERIAL PRIMARY KEY,
  provisional_booking_id BIGINT NOT NULL REFERENCES provisional_bookings(id) ON DELETE CASCADE,
  booking_offer_id BIGINT REFERENCES booking_offers(id) ON DELETE CASCADE,
  actor TEXT NOT NULL CHECK (actor IN ('administrator', 'customer', 'system')),
  event_type TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS booking_activity_booking_idx
  ON booking_activity(provisional_booking_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS booking_activity_offer_idx
  ON booking_activity(booking_offer_id, created_at DESC, id DESC);
