ALTER TABLE calendar_availability_overrides
  ADD COLUMN IF NOT EXISTS provisional_booking_id BIGINT
  REFERENCES provisional_bookings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS calendar_availability_overrides_booking_idx
  ON calendar_availability_overrides(provisional_booking_id)
  WHERE provisional_booking_id IS NOT NULL;
