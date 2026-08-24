ALTER TABLE provisional_bookings
  ADD COLUMN IF NOT EXISTS occupancy_policy_id BIGINT REFERENCES occupancy_policies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS occupancy_policy_version INTEGER,
  ADD COLUMN IF NOT EXISTS occupancy_assessment_input JSONB,
  ADD COLUMN IF NOT EXISTS occupancy_assessment_outcome TEXT
    CHECK (occupancy_assessment_outcome IN ('standard', 'bespoke', 'host_decision_required')),
  ADD COLUMN IF NOT EXISTS occupancy_assessment_reasons JSONB,
  ADD COLUMN IF NOT EXISTS occupancy_assessed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS provisional_bookings_occupancy_policy_idx
  ON provisional_bookings(occupancy_policy_id, occupancy_policy_version);

COMMENT ON COLUMN provisional_bookings.occupancy_assessment_input IS
  'Immutable party composition assessed when the booking request was submitted.';
COMMENT ON COLUMN provisional_bookings.occupancy_assessment_reasons IS
  'Immutable stable reason codes and Booker-safe messages returned by occupancy assessment.';
