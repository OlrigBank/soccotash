ALTER TABLE provisional_bookings
  ADD COLUMN IF NOT EXISTS promo_code VARCHAR(80);

COMMENT ON COLUMN provisional_bookings.promo_code IS
  'Optional code supplied for host review only; no automatic discount is applied.';
