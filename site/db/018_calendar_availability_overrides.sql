CREATE TABLE IF NOT EXISTS calendar_availability_overrides (
  id BIGSERIAL PRIMARY KEY,
  property_id TEXT NOT NULL,
  available_on DATE NOT NULL,
  reason TEXT,
  created_by BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (property_id, available_on)
);

CREATE INDEX IF NOT EXISTS calendar_availability_overrides_dates_idx
  ON calendar_availability_overrides(property_id, available_on);
