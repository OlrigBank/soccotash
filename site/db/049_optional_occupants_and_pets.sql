CREATE TABLE IF NOT EXISTS booking_occupants (
  id BIGSERIAL PRIMARY KEY,
  public_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  provisional_booking_id BIGINT NOT NULL REFERENCES provisional_bookings(id) ON DELETE CASCADE,
  preferred_name TEXT NOT NULL CHECK (length(trim(preferred_name)) BETWEEN 1 AND 120),
  category TEXT NOT NULL CHECK (category IN ('adult', 'child', 'infant')),
  position INTEGER NOT NULL CHECK (position >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provisional_booking_id, position)
);

CREATE TABLE IF NOT EXISTS booking_pets (
  id BIGSERIAL PRIMARY KEY,
  public_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  provisional_booking_id BIGINT NOT NULL REFERENCES provisional_bookings(id) ON DELETE CASCADE,
  species TEXT NOT NULL CHECK (species IN ('dog', 'cat', 'other')),
  other_species TEXT,
  breed TEXT,
  size TEXT CHECK (size IS NULL OR size IN ('small', 'medium', 'large')),
  service_animal BOOLEAN NOT NULL DEFAULT FALSE,
  position INTEGER NOT NULL CHECK (position >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (species <> 'other' OR length(trim(other_species)) BETWEEN 1 AND 80),
  CHECK (species = 'other' OR other_species IS NULL),
  UNIQUE (provisional_booking_id, position)
);

CREATE INDEX IF NOT EXISTS booking_occupants_booking_idx ON booking_occupants(provisional_booking_id);
CREATE INDEX IF NOT EXISTS booking_pets_booking_idx ON booking_pets(provisional_booking_id);

COMMENT ON TABLE booking_occupants IS
  'Optional preferred names for people already represented by authoritative booking party counts; these records grant no access.';
COMMENT ON TABLE booking_pets IS
  'One descriptive record per pet in the authoritative provisional_bookings.pets count.';
