ALTER TABLE provisional_bookings
  ADD COLUMN IF NOT EXISTS original_arrival DATE,
  ADD COLUMN IF NOT EXISTS original_departure DATE,
  ADD COLUMN IF NOT EXISTS bespoke_suggested_arrival DATE,
  ADD COLUMN IF NOT EXISTS bespoke_suggested_departure DATE,
  ADD COLUMN IF NOT EXISTS bespoke_suggestion_created_at TIMESTAMPTZ;

UPDATE provisional_bookings
   SET original_arrival = COALESCE(original_arrival, arrival),
       original_departure = COALESCE(original_departure, departure)
 WHERE original_arrival IS NULL OR original_departure IS NULL;

ALTER TABLE provisional_bookings
  ALTER COLUMN original_arrival SET NOT NULL,
  ALTER COLUMN original_departure SET NOT NULL;

CREATE OR REPLACE FUNCTION initialise_original_booking_dates()
RETURNS TRIGGER AS $$
BEGIN
  NEW.original_arrival := COALESCE(NEW.original_arrival, NEW.arrival);
  NEW.original_departure := COALESCE(NEW.original_departure, NEW.departure);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS provisional_bookings_original_dates_insert ON provisional_bookings;
CREATE TRIGGER provisional_bookings_original_dates_insert
BEFORE INSERT ON provisional_bookings
FOR EACH ROW EXECUTE FUNCTION initialise_original_booking_dates();

ALTER TABLE provisional_bookings
  ADD CONSTRAINT provisional_bookings_original_dates_check
  CHECK (original_departure > original_arrival),
  ADD CONSTRAINT provisional_bookings_bespoke_suggestion_check
  CHECK (
    (bespoke_suggested_arrival IS NULL AND bespoke_suggested_departure IS NULL AND bespoke_suggestion_created_at IS NULL)
    OR
    (bespoke_suggested_arrival IS NOT NULL AND bespoke_suggested_departure > bespoke_suggested_arrival AND bespoke_suggestion_created_at IS NOT NULL)
  );
