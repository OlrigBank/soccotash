export type PricingPlanStatus = 'draft' | 'published' | 'archived';

export type PricingRuleCategory =
  | 'Base pricing'
  | 'Seasons and dates'
  | 'Stay rules'
  | 'Booking window'
  | 'Fees'
  | 'Channels';

export type PricingRuleType =
  | 'default_nightly_price'
  | 'weekend_adjustment'
  | 'seasonal_adjustment'
  | 'date_override'
  | 'minimum_stay'
  | 'maximum_stay'
  | 'arrival_day_restriction'
  | 'departure_day_restriction'
  | 'fixed_package'
  | 'price_floor'
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
  includesCleaning?: boolean;
  includesPetFee?: boolean;
  floorBasis?: 'nightly' | 'stay_total';
};

export type PricingRule = {
  id: string;
  planId: string;
  ruleDefinitionId: string | null;
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
  ruleType?: PricingRuleType;
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

export type PricingConflict = {
  code: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  ruleIds: string[];
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
  conflicts: PricingConflict[];
};

export type RuleCatalogEntry = {
  type: PricingRuleType;
  label: string;
  description: string;
  category: PricingRuleCategory;
};

export type PricingRuleDefinition = {
  id: string;
  baseType: PricingRuleType;
  label: string;
  description: string;
  category: PricingRuleCategory;
  defaultName: string;
  defaultPriority: number;
  defaultEnabled: boolean;
  defaultStackable: boolean;
  defaultStackingGroup: string | null;
  defaultConditions: PricingConditions;
  defaultAction: PricingAction;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};


export type PricingChannelMix = {
  direct: number;
  airbnb: number;
  booking_com: number;
};

export type PricingScenarioInput = {
  propertyId: string;
  name: string;
  startDate: string;
  endDate: string;
  occupancyPercent: number;
  averageStayNights: number;
  cancellationRatePercent: number;
  averageLeadDays: number;
  guests: number;
  pets: number;
  cancellationPlan: string;
  channelMix: PricingChannelMix;
};

export type PricingScenarioChannelResult = {
  channel: keyof PricingChannelMix;
  sharePercent: number;
  bookings: number;
  bookedNights: number;
  guestRevenuePence: number;
  commissionPence: number;
  ownerRevenuePence: number;
};

export type PricingScenarioMonthResult = {
  month: string;
  availableNights: number;
  modelledBookedNights: number;
  expectedOccupiedNights: number;
  bookings: number;
  guestRevenuePence: number;
  commissionPence: number;
  ownerRevenuePence: number;
};

export type PricingScenarioResult = {
  currency: string;
  periodNights: number;
  blockedNights: number;
  availableNights: number;
  targetBookedNights: number;
  modelledBookedNights: number;
  cancelledNights: number;
  expectedOccupiedNights: number;
  bookingCount: number;
  grossGuestRevenuePence: number;
  expectedGuestRevenuePence: number;
  expectedCommissionPence: number;
  expectedOwnerRevenuePence: number;
  averageDailyRatePence: number;
  revenuePerAvailableNightPence: number;
  shortGapNights: number;
  channelResults: PricingScenarioChannelResult[];
  monthlyResults: PricingScenarioMonthResult[];
  warnings: string[];
};

export type PricingScenarioRun = {
  id: string;
  publicId: string;
  planId: string;
  propertyId: string;
  name: string;
  input: PricingScenarioInput;
  result: PricingScenarioResult;
  createdAt: string;
};

export type PublishedPricingQuote = {
  plan: { id: string; name: string; version: number; publishedAt: string | null };
  input: PricingSimulationInput;
  result: PricingSimulationResult;
};
