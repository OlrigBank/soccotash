ALTER TABLE plan_items
  ADD COLUMN source_url TEXT CHECK (
    source_url IS NULL OR (
      char_length(source_url) <= 2000
      AND source_url ~ '^https?://'
    )
  );

CREATE TABLE plan_candidate_activities (
  id BIGSERIAL PRIMARY KEY,
  public_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  holiday_plan_id BIGINT NOT NULL REFERENCES holiday_plans(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 10000),
  source_url TEXT CHECK (
    source_url IS NULL OR (
      char_length(source_url) <= 2000
      AND source_url ~ '^https?://'
    )
  ),
  local_guide_entry_id BIGINT REFERENCES local_guide_entries(id) ON DELETE RESTRICT,
  position INTEGER NOT NULL CHECK (position >= 0),
  created_by_admin_user_id BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  updated_by_admin_user_id BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (local_guide_entry_id IS NULL OR source_url IS NULL),
  UNIQUE (holiday_plan_id, position)
);

CREATE INDEX plan_candidate_activities_plan_idx
  ON plan_candidate_activities(holiday_plan_id, position);

CREATE INDEX plan_candidate_activities_guide_idx
  ON plan_candidate_activities(local_guide_entry_id)
  WHERE local_guide_entry_id IS NOT NULL;

INSERT INTO plan_days (holiday_plan_id, day_date, title, summary, position)
SELECT plan.id, plan.starts_on + day.day_number, 'Day ' || (day.day_number + 1), '', (day.day_number + 1) * 10
  FROM holiday_plans plan
  CROSS JOIN LATERAL generate_series(0, plan.duration_days - 1) AS day(day_number)
 WHERE plan.plan_type = 'booking_linked'
   AND plan.starts_on IS NOT NULL
   AND plan.duration_days IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM plan_days existing WHERE existing.holiday_plan_id = plan.id);
