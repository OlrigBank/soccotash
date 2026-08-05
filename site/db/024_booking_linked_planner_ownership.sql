CREATE TABLE IF NOT EXISTS plan_participants (
  id BIGSERIAL PRIMARY KEY,
  public_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  holiday_plan_id BIGINT NOT NULL REFERENCES holiday_plans(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'contributor', 'viewer')),
  participant_type TEXT NOT NULL CHECK (participant_type IN ('booker', 'guest', 'administrator')),
  booking_id BIGINT REFERENCES provisional_bookings(id) ON DELETE RESTRICT,
  admin_user_id BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 160),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (participant_type = 'administrator' AND admin_user_id IS NOT NULL AND booking_id IS NULL)
    OR (participant_type IN ('booker', 'guest') AND booking_id IS NOT NULL AND admin_user_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS plan_participants_owner_idx
  ON plan_participants(holiday_plan_id) WHERE role = 'owner';
CREATE INDEX IF NOT EXISTS plan_participants_booking_idx
  ON plan_participants(booking_id) WHERE booking_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS plan_participants_booker_idx
  ON plan_participants(holiday_plan_id, booking_id) WHERE participant_type = 'booker';
CREATE UNIQUE INDEX IF NOT EXISTS plan_participants_administrator_idx
  ON plan_participants(holiday_plan_id, admin_user_id) WHERE participant_type = 'administrator';
