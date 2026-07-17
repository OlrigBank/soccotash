export type PricingPlanStatus = 'draft' | 'published' | 'archived';

export type PricingRuleType =
  | 'default_nightly_price'
  | 'weekend_adjustment'
  | 'seasonal_adjustment'
  | 'date_override'
  | 'minimum_stay'
  | 'fixed_package'
  | 'length_discount'
  | 'early_booking_discount'
  | 'last_minute_discount'
  | 'extra_guest_charge'
  | 'cleaning_fee'
  | 'pet_fee'
  | 'channel_commission'
  | 'non_refundable_discount';

export type PricingConditions = {
  listingIds?: string[];
  arrivalDateFrom?: string;
  arrivalDateTo?: string;
  minimumNights?: number;
  maximumNights?: number;
  minimumLeadDays?: number;
  maximumLeadDays?: number;
  channel?: string;
  cancellationPlan?: string;
};

export type PricingAction = {
  amountPence?: number;
  percentage?: number;
  daysOfWeek?: number[];
  nights?: number;
  includedGuests?: number;
  perNight?: boolean;
  perPet?: boolean;
};

export type PricingRule = {
  id: string;
  planId: string;
  type: PricingRuleType;
  name: string;
  position: number;
  priority: number;
  enabled: boolean;
  stackable: boolean;
  stackingGroup: string | null;
  conditions: PricingConditions;
  action: PricingAction;
  createdAt?: string;
  updatedAt?: string;
};

export type PricingPlan = {
  id: string;
  propertyId: string;
  name: string;
  status: PricingPlanStatus;
  currency: string;
  version: number;
  basedOnPlanId: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  rules: PricingRule[];
};

export type PricingSimulationInput = {
  propertyId: string;
  arrival: string;
  departure: string;
  bookingDate: string;
  guests: number;
  pets: number;
  channel: 'direct' | 'airbnb' | 'booking_com' | string;
  cancellationPlan: 'flexible' | 'non_refundable' | string;
};

export type PricingLine = {
  ruleId: string;
  label: string;
  category: 'accommodation' | 'discount' | 'fee' | 'commission' | 'restriction';
  amountPence: number;
  detail: string;
};

export type PricingRuleExplanation = {
  ruleId: string;
  ruleName: string;
  applied: boolean;
  reason: string;
};

export type PricingSimulationResult = {
  eligible: boolean;
  currency: string;
  nights: number;
  leadDays: number;
  accommodationPence: number;
  feesPence: number;
  guestTotalPence: number;
  commissionPence: number;
  ownerRevenuePence: number;
  averageNightlyPence: number;
  lines: PricingLine[];
  explanations: PricingRuleExplanation[];
  warnings: string[];
};

export type RuleCatalogEntry = {
  type: PricingRuleType;
  label: string;
  description: string;
  category: 'Base pricing' | 'Seasons and dates' | 'Stay rules' | 'Booking window' | 'Fees' | 'Channels';
};
