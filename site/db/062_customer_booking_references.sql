CREATE FUNCTION generate_customer_booking_reference() RETURNS TEXT
LANGUAGE plpgsql AS $$
DECLARE
  alphabet CONSTANT TEXT := '23456789BCDFGHJKMNPQRSTVWXYZ';
  result TEXT := 'OB-';
BEGIN
  FOR position IN 1..8 LOOP
    result := result || substr(alphabet, (get_byte(gen_random_bytes(1), 0) % length(alphabet)) + 1, 1);
  END LOOP;
  RETURN result;
END;
$$;

ALTER TABLE provisional_bookings ADD COLUMN customer_reference TEXT;
ALTER TABLE provisional_bookings
  ADD CONSTRAINT provisional_bookings_customer_reference_format
  CHECK (customer_reference ~ '^OB-[23456789BCDFGHJKMNPQRSTVWXYZ]{8}$');
CREATE UNIQUE INDEX provisional_bookings_customer_reference_key
  ON provisional_bookings(customer_reference);

DO $$
DECLARE
  booking_id BIGINT;
BEGIN
  FOR booking_id IN SELECT id FROM provisional_bookings WHERE customer_reference IS NULL LOOP
    LOOP
      BEGIN
        UPDATE provisional_bookings
           SET customer_reference = generate_customer_booking_reference()
         WHERE id = booking_id;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        -- Generate another value if an existing booking received the same reference.
      END;
    END LOOP;
  END LOOP;
END;
$$;

ALTER TABLE provisional_bookings
  ALTER COLUMN customer_reference SET DEFAULT generate_customer_booking_reference(),
  ALTER COLUMN customer_reference SET NOT NULL;
