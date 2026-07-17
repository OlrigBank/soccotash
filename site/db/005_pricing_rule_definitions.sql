CREATE TABLE IF NOT EXISTS pricing_rule_definitions (
  id BIGSERIAL PRIMARY KEY,
  base_type TEXT NOT NULL CHECK (base_type IN (
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
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL CHECK (category IN (
    'Base pricing',
    'Seasons and dates',
    'Stay rules',
    'Booking window',
    'Fees',
    'Channels'
  )),
  default_name TEXT NOT NULL,
  default_priority INTEGER NOT NULL DEFAULT 50 CHECK (default_priority BETWEEN 0 AND 999),
  default_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  default_stackable BOOLEAN NOT NULL DEFAULT TRUE,
  default_stacking_group TEXT,
  default_conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  default_action JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  updated_by BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pricing_rule_definitions_active_idx
  ON pricing_rule_definitions(active, category, label);

ALTER TABLE pricing_rules
  ADD COLUMN IF NOT EXISTS rule_definition_id BIGINT
  REFERENCES pricing_rule_definitions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS pricing_rules_definition_idx
  ON pricing_rules(rule_definition_id);
