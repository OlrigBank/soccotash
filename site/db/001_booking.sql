CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS booking_blocks (
  id BIGSERIAL PRIMARY KEY,
  property_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('airbnb', 'manual')),
  external_uid TEXT NOT NULL,
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_on > starts_on),
  UNIQUE (property_id, source, external_uid)
);
CREATE INDEX IF NOT EXISTS booking_blocks_dates_idx ON booking_blocks(property_id, starts_on, ends_on);

CREATE TABLE IF NOT EXISTS calendar_sync_status (
  property_id TEXT PRIMARY KEY,
  last_attempt_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_error TEXT
);

CREATE TABLE IF NOT EXISTS provisional_bookings (
  id BIGSERIAL PRIMARY KEY,
  public_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  property_id TEXT NOT NULL,
  arrival DATE NOT NULL,
  departure DATE NOT NULL,
  guests INTEGER NOT NULL CHECK (guests > 0),
  guest_name TEXT NOT NULL,
  guest_email TEXT NOT NULL,
  guest_telephone TEXT,
  guest_message TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (departure > arrival)
);
CREATE INDEX IF NOT EXISTS provisional_booking_dates_idx ON provisional_bookings(property_id, arrival, departure);
