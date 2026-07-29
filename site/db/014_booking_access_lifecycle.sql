ALTER TABLE provisional_bookings
  ADD COLUMN IF NOT EXISTS customer_access_token_issued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS customer_access_token_revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS customer_access_last_used_at TIMESTAMPTZ;

UPDATE provisional_bookings
   SET customer_access_token_issued_at = COALESCE(customer_access_token_issued_at, created_at)
 WHERE customer_access_token_issued_at IS NULL;

ALTER TABLE provisional_bookings
  ALTER COLUMN customer_access_token_issued_at SET DEFAULT NOW(),
  ALTER COLUMN customer_access_token_issued_at SET NOT NULL;

-- Revoked offer credentials must become unusable even by older resolver code.
UPDATE booking_offers
   SET access_token_hash = NULL
 WHERE token_revoked_at IS NOT NULL
   AND access_token_hash IS NOT NULL;

CREATE OR REPLACE FUNCTION clear_revoked_booking_offer_access_token()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.token_revoked_at IS NOT NULL THEN
    NEW.access_token_hash := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS booking_offer_clear_revoked_access_token ON booking_offers;
CREATE TRIGGER booking_offer_clear_revoked_access_token
BEFORE INSERT OR UPDATE OF token_revoked_at, access_token_hash ON booking_offers
FOR EACH ROW
EXECUTE FUNCTION clear_revoked_booking_offer_access_token();
