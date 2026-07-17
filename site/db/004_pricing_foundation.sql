CREATE TABLE IF NOT EXISTS pricing_plans (
  id BIGSERIAL PRIMARY KEY,
  property_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  currency TEXT NOT NULL DEFAULT 'GBP' CHECK (currency ~ '^[A-Z]{3}$'),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  based_on_plan_id BIGINT REFERENCES pricing_plans(id) ON DELETE SET NULL,
  created_by BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  published_by BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS pricing_plans_property_idx
  ON pricing_plans(property_id, status, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS pricing_plans_one_published_per_property_idx
  ON pricing_plans(property_id) WHERE status = 'published';

CREATE TABLE IF NOT EXISTS pricing_rules (
  id BIGSERIAL PRIMARY KEY,
  plan_id BIGINT NOT NULL REFERENCES pricing_plans(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'default_nightly_price',
    'weekend_adjustment',
    'seasonal_adjustment',
    'date_override',
    'minimum_stay',
    'fixed_package',
    'length_discount',
    'early_booking_discount',
    'last_minute_discount',
    'extra_guest_charge',
    'cleaning_fee',
    'pet_fee',
    'channel_commission',
    'non_refundable_discount'
  )),
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  priority INTEGER NOT NULL DEFAULT 50,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  stackable BOOLEAN NOT NULL DEFAULT TRUE,
  stacking_group TEXT,
  conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  action JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(plan_id, position)
);
CREATE INDEX IF NOT EXISTS pricing_rules_plan_idx
  ON pricing_rules(plan_id, position, priority DESC);

CREATE TABLE IF NOT EXISTS pricing_simulation_log (
  id BIGSERIAL PRIMARY KEY,
  plan_id BIGINT REFERENCES pricing_plans(id) ON DELETE SET NULL,
  admin_user_id BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  input JSONB NOT NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS pricing_simulation_log_created_idx
  ON pricing_simulation_log(created_at DESC);

-- Starter plans make the rule builder and current/proposed comparison immediately usable.
-- They are not connected to the public booking flow in this phase.
DO $$
DECLARE
  baseline_id BIGINT;
  proposal_id BIGINT;
BEGIN
  SELECT id INTO baseline_id
  FROM pricing_plans
  WHERE property_id = 'main-house' AND name = 'Olrig Bank — example baseline'
  LIMIT 1;

  IF baseline_id IS NULL THEN
    INSERT INTO pricing_plans (property_id, name, status, currency, version, published_at)
    VALUES ('main-house', 'Olrig Bank — example baseline', 'published', 'GBP', 1, NOW())
    RETURNING id INTO baseline_id;

    INSERT INTO pricing_rules
      (plan_id, type, name, position, priority, enabled, stackable, stacking_group, conditions, action)
    VALUES
      (baseline_id, 'default_nightly_price', 'Default nightly price', 10, 100, TRUE, TRUE, NULL, '{}', '{"amountPence":39500}'),
      (baseline_id, 'weekend_adjustment', 'Friday and Saturday adjustment', 20, 70, TRUE, TRUE, 'day-of-week', '{}', '{"percentage":15,"daysOfWeek":[5,6]}'),
      (baseline_id, 'length_discount', 'Seven-night discount', 30, 50, TRUE, FALSE, 'length-of-stay-discount', '{"minimumNights":7}', '{"percentage":10}'),
      (baseline_id, 'cleaning_fee', 'Cleaning charge', 40, 40, TRUE, TRUE, 'cleaning', '{}', '{"amountPence":15000}'),
      (baseline_id, 'channel_commission', 'Airbnb host commission', 50, 20, TRUE, TRUE, 'channel-commission', '{"channel":"airbnb"}', '{"percentage":15.5}');
  END IF;

  SELECT id INTO proposal_id
  FROM pricing_plans
  WHERE property_id = 'main-house' AND name = 'Olrig Bank — example summer proposal'
  LIMIT 1;

  IF proposal_id IS NULL THEN
    INSERT INTO pricing_plans (property_id, name, status, currency, version, based_on_plan_id)
    VALUES ('main-house', 'Olrig Bank — example summer proposal', 'draft', 'GBP', 2, baseline_id)
    RETURNING id INTO proposal_id;

    INSERT INTO pricing_rules
      (plan_id, type, name, position, priority, enabled, stackable, stacking_group, conditions, action)
    SELECT proposal_id, type, name, position, priority, enabled, stackable, stacking_group, conditions, action
    FROM pricing_rules
    WHERE plan_id = baseline_id
    ORDER BY position;

    UPDATE pricing_rules SET position = position + 1000 WHERE plan_id = proposal_id AND position >= 30;
    UPDATE pricing_rules SET position = position - 980 WHERE plan_id = proposal_id AND position >= 1030;
    INSERT INTO pricing_rules
      (plan_id, type, name, position, priority, enabled, stackable, stacking_group, conditions, action)
    VALUES
      (proposal_id, 'seasonal_adjustment', 'Summer uplift', 30, 60, TRUE, FALSE, 'seasonal-price',
       '{"arrivalDateFrom":"2027-07-01","arrivalDateTo":"2027-08-31","minimumNights":3}',
       '{"percentage":20}'),
      (proposal_id, 'early_booking_discount', 'Early-booking discount', 40, 45, TRUE, FALSE, 'booking-window-discount',
       '{"minimumLeadDays":180}', '{"percentage":10}');
  END IF;
END $$;
