-- Zero identifies existing bookings and requests submitted for host review.
ALTER TABLE provisional_bookings
  ADD COLUMN request_journey_revision INTEGER NOT NULL DEFAULT 0
  CHECK (request_journey_revision >= 0);
