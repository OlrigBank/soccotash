CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS properties (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Europe/London',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS resources (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  resource_type TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (property_id, slug)
);

CREATE TABLE IF NOT EXISTS booking_arrangements (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  legacy_property_id TEXT UNIQUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (property_id, slug)
);

CREATE TABLE IF NOT EXISTS arrangement_resources (
  arrangement_id TEXT NOT NULL REFERENCES booking_arrangements(id) ON DELETE CASCADE,
  resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE RESTRICT,
  display_order INTEGER NOT NULL DEFAULT 0,
  role TEXT NOT NULL DEFAULT 'included',
  PRIMARY KEY (arrangement_id, resource_id)
);

INSERT INTO properties (id, slug, name, timezone)
VALUES ('olrig-bank', 'olrig-bank', 'Olrig Bank', 'Europe/London')
ON CONFLICT (id) DO UPDATE SET slug = EXCLUDED.slug, name = EXCLUDED.name, timezone = EXCLUDED.timezone;

INSERT INTO resources (id, property_id, slug, name, resource_type) VALUES
  ('main-house', 'olrig-bank', 'main-house', 'Main House', 'accommodation'),
  ('cottage', 'olrig-bank', 'cottage', 'Cottage', 'accommodation'),
  ('grounds', 'olrig-bank', 'grounds', 'Grounds', 'outdoor')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, resource_type = EXCLUDED.resource_type, active = TRUE;

INSERT INTO booking_arrangements (id, property_id, slug, name, legacy_property_id) VALUES
  ('main-house-stay', 'olrig-bank', 'main-house-stay', 'Main House stay', 'main-house'),
  ('cottage-stay', 'olrig-bank', 'cottage-stay', 'Cottage stay', 'cottage'),
  ('olrig-bank-stay', 'olrig-bank', 'olrig-bank-stay', 'Olrig Bank stay', 'whole-property')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, legacy_property_id = EXCLUDED.legacy_property_id, active = TRUE;

INSERT INTO arrangement_resources (arrangement_id, resource_id, display_order) VALUES
  ('main-house-stay', 'main-house', 10),
  ('cottage-stay', 'cottage', 10),
  ('olrig-bank-stay', 'main-house', 10),
  ('olrig-bank-stay', 'cottage', 20),
  ('olrig-bank-stay', 'grounds', 30)
ON CONFLICT (arrangement_id, resource_id) DO UPDATE SET display_order = EXCLUDED.display_order;

ALTER TABLE provisional_bookings
  ADD COLUMN IF NOT EXISTS booking_kind TEXT NOT NULL DEFAULT 'stay',
  ADD COLUMN IF NOT EXISTS property_ref TEXT REFERENCES properties(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS booking_arrangement_id TEXT REFERENCES booking_arrangements(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS booking_title TEXT;

ALTER TABLE provisional_bookings DROP CONSTRAINT IF EXISTS provisional_bookings_booking_kind_check;
ALTER TABLE provisional_bookings ADD CONSTRAINT provisional_bookings_booking_kind_check
  CHECK (booking_kind IN ('stay', 'event'));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM provisional_bookings pb
    WHERE NOT EXISTS (
      SELECT 1 FROM booking_arrangements ba WHERE ba.legacy_property_id = pb.property_id
    )
  ) THEN
    RAISE EXCEPTION 'Migration 018 cannot map one or more legacy provisional_bookings.property_id values';
  END IF;
END $$;

UPDATE provisional_bookings pb
SET property_ref = 'olrig-bank',
    booking_arrangement_id = ba.id,
    booking_title = COALESCE(pb.booking_title, ba.name)
FROM booking_arrangements ba
WHERE ba.legacy_property_id = pb.property_id
  AND (pb.property_ref IS NULL OR pb.booking_arrangement_id IS NULL OR pb.booking_title IS NULL);

CREATE TABLE IF NOT EXISTS event_details (
  provisional_booking_id BIGINT PRIMARY KEY REFERENCES provisional_bookings(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_type_other TEXT,
  description TEXT NOT NULL,
  event_start_at TIMESTAMPTZ NOT NULL,
  event_end_at TIMESTAMPTZ NOT NULL,
  setup_start_at TIMESTAMPTZ NOT NULL,
  clearing_end_at TIMESTAMPTZ NOT NULL,
  daytime_attendees INTEGER NOT NULL DEFAULT 0 CHECK (daytime_attendees >= 0),
  overnight_guests INTEGER NOT NULL DEFAULT 0 CHECK (overnight_guests >= 0),
  requested_resource_ids TEXT[] NOT NULL DEFAULT '{}',
  requested_areas_text TEXT,
  accommodation_required BOOLEAN NOT NULL DEFAULT FALSE,
  accommodation_notes TEXT,
  catering_requirements TEXT,
  parking_requirements TEXT,
  accessibility_requirements TEXT,
  equipment_requirements TEXT,
  public_access BOOLEAN NOT NULL DEFAULT FALSE,
  amplified_music BOOLEAN NOT NULL DEFAULT FALSE,
  outside_suppliers BOOLEAN NOT NULL DEFAULT FALSE,
  budget_expectation TEXT,
  original_submission JSONB NOT NULL,
  working_details JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (setup_start_at <= event_start_at),
  CHECK (event_end_at > event_start_at),
  CHECK (clearing_end_at >= event_end_at)
);

CREATE TABLE IF NOT EXISTS booking_resource_allocations (
  id BIGSERIAL PRIMARY KEY,
  public_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  provisional_booking_id BIGINT NOT NULL REFERENCES provisional_bookings(id) ON DELETE CASCADE,
  resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE RESTRICT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  allocation_state TEXT NOT NULL DEFAULT 'released',
  purpose TEXT NOT NULL DEFAULT 'occupancy',
  hold_expires_at TIMESTAMPTZ,
  booking_offer_id BIGINT REFERENCES booking_offers(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_at > start_at),
  CHECK (allocation_state IN ('released', 'hold', 'offered', 'accepted', 'confirmed'))
);

CREATE INDEX IF NOT EXISTS booking_resource_allocations_booking_idx
  ON booking_resource_allocations(provisional_booking_id, start_at, end_at);
CREATE INDEX IF NOT EXISTS booking_resource_allocations_resource_idx
  ON booking_resource_allocations(resource_id, start_at, end_at);

ALTER TABLE booking_resource_allocations
  DROP CONSTRAINT IF EXISTS booking_resource_allocations_no_blocking_overlap;
ALTER TABLE booking_resource_allocations
  ADD CONSTRAINT booking_resource_allocations_no_blocking_overlap
  EXCLUDE USING gist (
    resource_id WITH =,
    tstzrange(start_at, end_at, '[)') WITH &&
  ) WHERE (allocation_state IN ('hold', 'offered', 'accepted', 'confirmed'));

INSERT INTO booking_resource_allocations
  (provisional_booking_id, resource_id, start_at, end_at, allocation_state, purpose)
SELECT pb.id,
       ar.resource_id,
       (pb.arrival::timestamp + TIME '16:00') AT TIME ZONE 'Europe/London',
       (pb.departure::timestamp + TIME '10:00') AT TIME ZONE 'Europe/London',
       CASE
         WHEN pb.status IN ('offered') THEN 'offered'
         WHEN pb.status IN ('offer_accepted', 'payment_pending', 'payment_reported') THEN 'accepted'
         WHEN pb.status IN ('confirmed', 'approved') THEN 'confirmed'
         ELSE 'released'
       END,
       'stay'
FROM provisional_bookings pb
JOIN arrangement_resources ar ON ar.arrangement_id = pb.booking_arrangement_id
WHERE pb.booking_kind = 'stay'
  -- Historical whole-property records used Main House availability only. Do
  -- not invent Cottage/grounds occupancy that the legacy record cannot prove.
  AND NOT (pb.property_id = 'whole-property' AND ar.resource_id <> 'main-house')
  AND NOT EXISTS (
    SELECT 1 FROM booking_resource_allocations bra
    WHERE bra.provisional_booking_id = pb.id AND bra.resource_id = ar.resource_id
  );

ALTER TABLE booking_blocks ADD COLUMN IF NOT EXISTS resource_id TEXT REFERENCES resources(id) ON DELETE RESTRICT;
UPDATE booking_blocks
SET resource_id = CASE property_id WHEN 'main-house' THEN 'main-house' WHEN 'cottage' THEN 'cottage' ELSE resource_id END
WHERE resource_id IS NULL;

ALTER TABLE booking_offers
  ADD COLUMN IF NOT EXISTS event_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS allocation_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS payment_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS terms_snapshot JSONB;

CREATE OR REPLACE FUNCTION protect_event_original_submission() RETURNS trigger AS $$
BEGIN
  IF NEW.original_submission IS DISTINCT FROM OLD.original_submission THEN
    RAISE EXCEPTION 'The original event submission is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS event_original_submission_immutable ON event_details;
CREATE TRIGGER event_original_submission_immutable
BEFORE UPDATE ON event_details FOR EACH ROW EXECUTE FUNCTION protect_event_original_submission();

CREATE OR REPLACE FUNCTION protect_published_offer_snapshots() RETURNS trigger AS $$
BEGIN
  IF OLD.published_at IS NOT NULL AND (
    NEW.line_items IS DISTINCT FROM OLD.line_items OR
    NEW.total_pence IS DISTINCT FROM OLD.total_pence OR
    NEW.event_snapshot IS DISTINCT FROM OLD.event_snapshot OR
    NEW.allocation_snapshot IS DISTINCT FROM OLD.allocation_snapshot OR
    NEW.payment_snapshot IS DISTINCT FROM OLD.payment_snapshot OR
    NEW.terms_snapshot IS DISTINCT FROM OLD.terms_snapshot
  ) THEN
    RAISE EXCEPTION 'Published offer snapshots are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS booking_offer_snapshots_immutable ON booking_offers;
CREATE TRIGGER booking_offer_snapshots_immutable
BEFORE UPDATE ON booking_offers FOR EACH ROW EXECUTE FUNCTION protect_published_offer_snapshots();
