ALTER TABLE provisional_bookings
  ADD COLUMN IF NOT EXISTS originated_as_bespoke BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE provisional_bookings pb
   SET originated_as_bespoke = TRUE
 WHERE pb.property_id = 'bespoke-arrangement'
    OR EXISTS (
      SELECT 1
        FROM booking_activity ba
       WHERE ba.provisional_booking_id = pb.id
         AND ba.event_type = 'bespoke_arrangement_assigned'
    );

CREATE OR REPLACE FUNCTION mark_bespoke_booking_origin()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.property_id = 'bespoke-arrangement' THEN
    NEW.originated_as_bespoke := TRUE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS provisional_bookings_bespoke_origin_insert ON provisional_bookings;
CREATE TRIGGER provisional_bookings_bespoke_origin_insert
BEFORE INSERT ON provisional_bookings
FOR EACH ROW EXECUTE FUNCTION mark_bespoke_booking_origin();
