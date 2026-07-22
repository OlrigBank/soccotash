ALTER TABLE provisional_bookings
  DROP CONSTRAINT IF EXISTS provisional_bookings_status_check;

ALTER TABLE provisional_bookings
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

UPDATE provisional_bookings pb
   SET status = 'confirmed',
       confirmed_at = COALESCE(
         pb.confirmed_at,
         (
           SELECT MAX(bo.accepted_at)
             FROM booking_offers bo
            WHERE bo.provisional_booking_id = pb.id
              AND bo.customer_status = 'accepted'
         ),
         NOW()
       )
 WHERE pb.status = 'offer_accepted';

ALTER TABLE provisional_bookings
  ADD CONSTRAINT provisional_bookings_status_check
  CHECK (status IN (
    'pending', 'offered', 'offer_accepted', 'confirmed', 'approved',
    'declined', 'cancelled', 'expired'
  ));

CREATE INDEX IF NOT EXISTS provisional_bookings_confirmed_dates_idx
  ON provisional_bookings(property_id, arrival, departure)
  WHERE status IN ('confirmed', 'approved');
