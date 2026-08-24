ALTER TABLE provisional_bookings
  ADD COLUMN IF NOT EXISTS adults INTEGER,
  ADD COLUMN IF NOT EXISTS children INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS infants INTEGER NOT NULL DEFAULT 0;

-- There are no real historical bookings at this point. The approved migration
-- assumption is therefore that every legacy guest was an adult.
UPDATE provisional_bookings
   SET adults = guests
 WHERE adults IS NULL;

ALTER TABLE provisional_bookings
  ALTER COLUMN adults SET NOT NULL;

CREATE OR REPLACE FUNCTION sync_provisional_booking_party_compatibility()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Transitional legacy inserts provide only guests. Interpret that value as
  -- adults, matching the one-time migration rule.
  IF NEW.adults IS NULL THEN
    NEW.adults := NEW.guests;
  END IF;

  -- Preserve the same interpretation for a legacy update that changes only
  -- guests. Structured updates must change the category columns instead.
  IF TG_OP = 'UPDATE'
     AND NEW.guests IS DISTINCT FROM OLD.guests
     AND NEW.adults IS NOT DISTINCT FROM OLD.adults
     AND NEW.children IS NOT DISTINCT FROM OLD.children
     AND NEW.infants IS NOT DISTINCT FROM OLD.infants THEN
    NEW.adults := NEW.guests;
    NEW.children := 0;
    NEW.infants := 0;
  END IF;

  NEW.children := COALESCE(NEW.children, 0);
  NEW.infants := COALESCE(NEW.infants, 0);

  -- During the transition, guests has exactly one meaning: adults plus
  -- children. Infants are recorded but excluded from this compatibility total.
  NEW.guests := NEW.adults + NEW.children;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS provisional_booking_party_compatibility
  ON provisional_bookings;
CREATE TRIGGER provisional_booking_party_compatibility
BEFORE INSERT OR UPDATE OF guests, adults, children, infants
ON provisional_bookings
FOR EACH ROW
EXECUTE FUNCTION sync_provisional_booking_party_compatibility();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'provisional_bookings_adults_check'
       AND conrelid = 'provisional_bookings'::regclass
  ) THEN
    ALTER TABLE provisional_bookings
      ADD CONSTRAINT provisional_bookings_adults_check CHECK (adults >= 1);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'provisional_bookings_children_check'
       AND conrelid = 'provisional_bookings'::regclass
  ) THEN
    ALTER TABLE provisional_bookings
      ADD CONSTRAINT provisional_bookings_children_check CHECK (children >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'provisional_bookings_infants_check'
       AND conrelid = 'provisional_bookings'::regclass
  ) THEN
    ALTER TABLE provisional_bookings
      ADD CONSTRAINT provisional_bookings_infants_check CHECK (infants >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'provisional_bookings_guests_compatibility_check'
       AND conrelid = 'provisional_bookings'::regclass
  ) THEN
    ALTER TABLE provisional_bookings
      ADD CONSTRAINT provisional_bookings_guests_compatibility_check
      CHECK (guests = adults + children);
  END IF;
END;
$$;

COMMENT ON COLUMN provisional_bookings.guests IS
  'Transitional compatibility total: adults plus children; infants are excluded.';
COMMENT ON COLUMN provisional_bookings.adults IS
  'Authoritative count of occupants aged 13 or over on arrival.';
COMMENT ON COLUMN provisional_bookings.children IS
  'Authoritative count of occupants aged 2 to 12 on arrival.';
COMMENT ON COLUMN provisional_bookings.infants IS
  'Authoritative count of occupants under 2 on arrival.';
