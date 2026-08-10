ALTER TABLE provisional_bookings
  ADD COLUMN deletion_requested_at TIMESTAMPTZ,
  ADD COLUMN deletion_requested_by_admin_user_id BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  ADD COLUMN deletion_reason TEXT CHECK (deletion_reason IS NULL OR char_length(btrim(deletion_reason)) BETWEEN 1 AND 1000);

ALTER TABLE provisional_bookings ADD CONSTRAINT provisional_bookings_deletion_state_check CHECK (
  (deletion_requested_at IS NULL AND deletion_requested_by_admin_user_id IS NULL AND deletion_reason IS NULL)
  OR
  (deletion_requested_at IS NOT NULL AND deletion_requested_by_admin_user_id IS NOT NULL AND deletion_reason IS NOT NULL)
);

CREATE INDEX provisional_bookings_active_created_idx ON provisional_bookings(created_at DESC)
  WHERE deletion_requested_at IS NULL;
CREATE INDEX provisional_bookings_deletion_queue_idx ON provisional_bookings(deletion_requested_at DESC)
  WHERE deletion_requested_at IS NOT NULL;

ALTER TABLE holiday_plans
  ADD COLUMN deletion_requested_at TIMESTAMPTZ,
  ADD COLUMN deletion_booking_id BIGINT REFERENCES provisional_bookings(id) ON DELETE RESTRICT;

ALTER TABLE holiday_plans ADD CONSTRAINT holiday_plans_deletion_state_check CHECK (
  (deletion_requested_at IS NULL AND deletion_booking_id IS NULL)
  OR
  (deletion_requested_at IS NOT NULL AND deletion_booking_id IS NOT NULL)
);

ALTER TABLE plan_candidate_activities
  ADD COLUMN local_guide_retention_opt_out BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN local_guide_retention_decided_at TIMESTAMPTZ;

ALTER TABLE guide_contribution_candidates
  ADD COLUMN plan_candidate_activity_id BIGINT REFERENCES plan_candidate_activities(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX guide_contribution_active_candidate_activity_idx
  ON guide_contribution_candidates(plan_candidate_activity_id)
  WHERE plan_candidate_activity_id IS NOT NULL AND status IN ('pending','under_review','accepted');
