-- Extend the deterministic pricing rule vocabulary without changing existing JSON rule records.
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
    'extra_guest_charge',
    'cleaning_fee',
    'pet_fee',
    'channel_commission',
    'non_refundable_discount'
  ));
