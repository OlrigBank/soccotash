ALTER TABLE holiday_plans
  ADD COLUMN plan_role TEXT NOT NULL DEFAULT 'original'
    CHECK (plan_role IN ('original', 'guest_copy')),
  ADD COLUMN source_plan_id BIGINT REFERENCES holiday_plans(id) ON DELETE RESTRICT,
  ADD COLUMN guest_display_name TEXT
    CHECK (guest_display_name IS NULL OR char_length(btrim(guest_display_name)) BETWEEN 1 AND 160);

DROP INDEX holiday_plans_booking_idx;

CREATE UNIQUE INDEX holiday_plans_booking_original_idx
  ON holiday_plans(booking_id)
  WHERE booking_id IS NOT NULL AND plan_role = 'original';

CREATE INDEX holiday_plans_booking_family_idx
  ON holiday_plans(booking_id, created_at)
  WHERE booking_id IS NOT NULL AND archived_at IS NULL;

ALTER TABLE holiday_plans ADD CONSTRAINT holiday_plans_family_role_check CHECK (
  (plan_type = 'example' AND plan_role = 'original' AND source_plan_id IS NULL AND guest_display_name IS NULL)
  OR
  (plan_type = 'booking_linked' AND plan_role = 'original' AND source_plan_id IS NULL AND guest_display_name IS NULL)
  OR
  (plan_type = 'booking_linked' AND plan_role = 'guest_copy' AND source_plan_id IS NOT NULL AND guest_display_name IS NOT NULL)
);
