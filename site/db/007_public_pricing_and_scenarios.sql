ALTER TABLE provisional_bookings
  ADD COLUMN IF NOT EXISTS pets INTEGER NOT NULL DEFAULT 0 CHECK (pets >= 0),
  ADD COLUMN IF NOT EXISTS pricing_plan_id BIGINT REFERENCES pricing_plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pricing_plan_version INTEGER,
  ADD COLUMN IF NOT EXISTS pricing_currency TEXT,
  ADD COLUMN IF NOT EXISTS accommodation_pence INTEGER,
  ADD COLUMN IF NOT EXISTS fees_pence INTEGER,
  ADD COLUMN IF NOT EXISTS guest_total_pence INTEGER,
  ADD COLUMN IF NOT EXISTS channel_commission_pence INTEGER,
  ADD COLUMN IF NOT EXISTS owner_revenue_pence INTEGER,
  ADD COLUMN IF NOT EXISTS pricing_input JSONB,
  ADD COLUMN IF NOT EXISTS pricing_result JSONB,
  ADD COLUMN IF NOT EXISTS quoted_at TIMESTAMPTZ;


-- The migration 004 starter baseline was deliberately an admin-only example.
-- Archive only that untouched seed before public quotes start using published plans.
UPDATE pricing_plans
   SET status = 'archived', updated_at = NOW()
 WHERE status = 'published'
   AND name = 'Olrig Bank — example baseline'
   AND created_by IS NULL
   AND published_by IS NULL;

CREATE INDEX IF NOT EXISTS provisional_bookings_pricing_plan_idx
  ON provisional_bookings(pricing_plan_id, created_at DESC);

CREATE TABLE IF NOT EXISTS pricing_scenario_runs (
  id BIGSERIAL PRIMARY KEY,
  public_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  plan_id BIGINT NOT NULL REFERENCES pricing_plans(id) ON DELETE CASCADE,
  property_id TEXT NOT NULL,
  name TEXT NOT NULL,
  admin_user_id BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  input JSONB NOT NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS pricing_scenario_runs_property_idx
  ON pricing_scenario_runs(property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pricing_scenario_runs_plan_idx
  ON pricing_scenario_runs(plan_id, created_at DESC);
