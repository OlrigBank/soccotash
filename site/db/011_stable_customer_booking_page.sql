ALTER TABLE provisional_bookings
  ADD COLUMN IF NOT EXISTS customer_access_token TEXT,
  ADD COLUMN IF NOT EXISTS customer_first_viewed_at TIMESTAMPTZ;

UPDATE provisional_bookings
   SET customer_access_token = translate(rtrim(encode(gen_random_bytes(32), 'base64'), '='), '+/', '-_')
 WHERE customer_access_token IS NULL;

ALTER TABLE provisional_bookings
  ALTER COLUMN customer_access_token SET DEFAULT translate(rtrim(encode(gen_random_bytes(32), 'base64'), '='), '+/', '-_'),
  ALTER COLUMN customer_access_token SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS provisional_bookings_customer_access_token_idx
  ON provisional_bookings(customer_access_token);

ALTER TABLE provisional_bookings
  DROP CONSTRAINT IF EXISTS provisional_bookings_customer_access_token_format_check;

ALTER TABLE provisional_bookings
  ADD CONSTRAINT provisional_bookings_customer_access_token_format_check
  CHECK (customer_access_token ~ '^[A-Za-z0-9_-]{43}$');

ALTER TABLE booking_offers
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

UPDATE booking_offers
   SET published_at = COALESCE(published_at, sent_at, created_at)
 WHERE delivery_status = 'sent';

ALTER TABLE booking_offers
  DROP CONSTRAINT IF EXISTS booking_offers_delivery_status_check;

ALTER TABLE booking_offers
  ADD CONSTRAINT booking_offers_delivery_status_check
  CHECK (delivery_status IN ('pending', 'sent', 'failed', 'not_requested'));

CREATE INDEX IF NOT EXISTS booking_offers_published_idx
  ON booking_offers(provisional_booking_id, published_at DESC, id DESC)
  WHERE published_at IS NOT NULL;
