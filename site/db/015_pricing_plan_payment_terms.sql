-- Payment amounts and deadlines are versioned pricing-plan rules, not global environment settings.
ALTER TABLE pricing_rules
  DROP CONSTRAINT IF EXISTS pricing_rules_type_check;
ALTER TABLE pricing_rules
  ADD CONSTRAINT pricing_rules_type_check CHECK (type IN (
    'default_nightly_price',
    'weekend_adjustment',
    'seasonal_adjustment',
    'date_override',
    'minimum_stay',
    'maximum_stay',
    'arrival_day_restriction',
    'departure_day_restriction',
    'fixed_package',
    'price_floor',
    'length_discount',
    'early_booking_discount',
    'last_minute_discount',
    'deposit_percentage',
    'initial_payment_deadline',
    'balance_payment_deadline',
    'extra_guest_charge',
    'cleaning_fee',
    'pet_fee',
    'channel_commission',
    'non_refundable_discount'
  ));

ALTER TABLE pricing_rule_definitions
  DROP CONSTRAINT IF EXISTS pricing_rule_definitions_base_type_check;
ALTER TABLE pricing_rule_definitions
  ADD CONSTRAINT pricing_rule_definitions_base_type_check CHECK (base_type IN (
    'default_nightly_price',
    'weekend_adjustment',
    'seasonal_adjustment',
    'date_override',
    'minimum_stay',
    'maximum_stay',
    'arrival_day_restriction',
    'departure_day_restriction',
    'fixed_package',
    'price_floor',
    'length_discount',
    'early_booking_discount',
    'last_minute_discount',
    'deposit_percentage',
    'initial_payment_deadline',
    'balance_payment_deadline',
    'extra_guest_charge',
    'cleaning_fee',
    'pet_fee',
    'channel_commission',
    'non_refundable_discount'
  ));

ALTER TABLE provisional_bookings
  ADD COLUMN IF NOT EXISTS payment_terms_snapshot JSONB;

-- Preserve the launch terms on every existing plan, including the currently published plan.
INSERT INTO pricing_rules
  (plan_id, type, name, position, priority, enabled, stackable, stacking_group, conditions, action)
SELECT p.id, defaults.type, defaults.name,
       COALESCE((SELECT MAX(position) FROM pricing_rules WHERE plan_id = p.id), 0) + defaults.position_offset,
       100, TRUE, FALSE, 'payment-terms', '{}'::jsonb, defaults.action
  FROM pricing_plans p
 CROSS JOIN (
   VALUES
     ('deposit_percentage', 'Deposit percentage', 10, '{"percentage":25}'::jsonb),
     ('initial_payment_deadline', 'Initial-payment deadline', 20, '{"days":7}'::jsonb),
     ('balance_payment_deadline', 'Balance-payment deadline', 30, '{"days":42}'::jsonb)
 ) AS defaults(type, name, position_offset, action)
 WHERE NOT EXISTS (
   SELECT 1
     FROM pricing_rules existing
    WHERE existing.plan_id = p.id
      AND existing.type = defaults.type
      AND existing.enabled = TRUE
 );
