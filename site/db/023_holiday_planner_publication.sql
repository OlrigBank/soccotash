ALTER TABLE holiday_plans
  ADD COLUMN IF NOT EXISTS public_slug TEXT;

ALTER TABLE holiday_plans
  DROP CONSTRAINT IF EXISTS holiday_plans_public_slug_format;
ALTER TABLE holiday_plans
  ADD CONSTRAINT holiday_plans_public_slug_format CHECK (
    public_slug IS NULL OR public_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  );

CREATE UNIQUE INDEX IF NOT EXISTS holiday_plans_public_slug_idx
  ON holiday_plans(public_slug) WHERE public_slug IS NOT NULL;
