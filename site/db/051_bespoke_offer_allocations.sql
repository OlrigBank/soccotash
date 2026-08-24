CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS booking_offer_allocations (
  id BIGSERIAL PRIMARY KEY,
  booking_offer_id BIGINT NOT NULL UNIQUE REFERENCES booking_offers(id) ON DELETE CASCADE,
  bundle_id BIGINT REFERENCES accommodation_bundles(id) ON DELETE SET NULL,
  arrangement_name TEXT NOT NULL CHECK(length(trim(arrangement_name)) BETWEEN 1 AND 160),
  approved_sleeping_capacity INTEGER NOT NULL CHECK(approved_sleeping_capacity >= 0),
  alternative_sleeping_notes TEXT,
  explanatory_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS booking_offer_allocation_resources (
  allocation_id BIGINT NOT NULL REFERENCES booking_offer_allocations(id) ON DELETE CASCADE,
  resource_id BIGINT NOT NULL REFERENCES accommodation_resources(id) ON DELETE RESTRICT,
  resource_key TEXT NOT NULL,
  resource_name TEXT NOT NULL,
  sleeping_capacity INTEGER NOT NULL CHECK(sleeping_capacity >= 0),
  availability_property_id TEXT,
  position INTEGER NOT NULL CHECK(position >= 0),
  PRIMARY KEY(allocation_id,resource_id)
);
CREATE TABLE IF NOT EXISTS accommodation_resource_reservations (
  id BIGSERIAL PRIMARY KEY,
  resource_id BIGINT NOT NULL REFERENCES accommodation_resources(id) ON DELETE RESTRICT,
  provisional_booking_id BIGINT NOT NULL REFERENCES provisional_bookings(id) ON DELETE CASCADE,
  booking_offer_id BIGINT NOT NULL REFERENCES booking_offers(id) ON DELETE RESTRICT,
  starts_on DATE NOT NULL, ends_on DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','released')),
  reserved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), released_at TIMESTAMPTZ,
  release_reason TEXT, CHECK(ends_on > starts_on),
  UNIQUE(resource_id,booking_offer_id)
);
ALTER TABLE accommodation_resource_reservations
  ADD CONSTRAINT accommodation_resource_reservations_no_overlap
  EXCLUDE USING gist(resource_id WITH =, daterange(starts_on,ends_on,'[)') WITH &&)
  WHERE(status='active');
CREATE INDEX IF NOT EXISTS accommodation_resource_reservations_booking_idx ON accommodation_resource_reservations(provisional_booking_id,status);

COMMENT ON TABLE booking_offer_allocations IS 'Immutable accommodation snapshot attached to one offer; original requested occupancy remains on provisional_bookings.';
COMMENT ON TABLE accommodation_resource_reservations IS 'Accepted allocation reservations. Supersession/expiry before acceptance creates none; cancellation releases active rows.';
