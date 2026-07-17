import type { PricingAction, PricingConditions, PricingRuleType, RuleCatalogEntry } from './types';

export const RULE_CATALOG: RuleCatalogEntry[] = [
  { type: 'default_nightly_price', label: 'Default nightly price', description: 'Starting accommodation price for every night.', category: 'Base pricing' },
  { type: 'weekend_adjustment', label: 'Weekend surcharge', description: 'Adjust selected days of the week.', category: 'Base pricing' },
  { type: 'seasonal_adjustment', label: 'Seasonal price', description: 'Percentage adjustment inside a date range.', category: 'Seasons and dates' },
  { type: 'date_override', label: 'Date override', description: 'Replace the nightly amount on selected dates.', category: 'Seasons and dates' },
  { type: 'minimum_stay', label: 'Minimum stay', description: 'Reject stays shorter than the configured minimum.', category: 'Stay rules' },
  { type: 'fixed_package', label: 'Fixed stay package', description: 'Use a fixed total for an exact number of nights.', category: 'Stay rules' },
  { type: 'length_discount', label: 'Length-of-stay discount', description: 'Discount bookings meeting a night threshold.', category: 'Stay rules' },
  { type: 'early_booking_discount', label: 'Early-booking discount', description: 'Discount bookings made far in advance.', category: 'Booking window' },
  { type: 'last_minute_discount', label: 'Last-minute discount', description: 'Discount stays booked close to arrival.', category: 'Booking window' },
  { type: 'extra_guest_charge', label: 'Extra-guest charge', description: 'Charge above the included guest count.', category: 'Fees' },
  { type: 'cleaning_fee', label: 'Cleaning fee', description: 'Fixed mandatory charge per booking.', category: 'Fees' },
  { type: 'pet_fee', label: 'Pet charge', description: 'Fixed fee per booking or per pet.', category: 'Fees' },
  { type: 'channel_commission', label: 'Channel commission', description: 'Deduct platform commission from owner revenue.', category: 'Channels' },
  { type: 'non_refundable_discount', label: 'Non-refundable discount', description: 'Discount the non-refundable rate plan.', category: 'Channels' },
];

export function catalogEntry(type: PricingRuleType): RuleCatalogEntry {
  const entry = RULE_CATALOG.find((candidate) => candidate.type === type);
  if (!entry) throw new Error(`Unknown pricing rule type: ${type}`);
  return entry;
}

export function defaultRuleValues(type: PricingRuleType): {
  name: string;
  conditions: PricingConditions;
  action: PricingAction;
  priority: number;
  stackable: boolean;
  stackingGroup: string | null;
} {
  const name = catalogEntry(type).label;
  switch (type) {
    case 'default_nightly_price':
      return { name, conditions: {}, action: { amountPence: 39500 }, priority: 100, stackable: true, stackingGroup: null };
    case 'weekend_adjustment':
      return { name, conditions: {}, action: { percentage: 15, daysOfWeek: [5, 6] }, priority: 70, stackable: true, stackingGroup: 'day-of-week' };
    case 'seasonal_adjustment':
      return { name, conditions: { arrivalDateFrom: '2027-07-01', arrivalDateTo: '2027-08-31' }, action: { percentage: 20 }, priority: 60, stackable: false, stackingGroup: 'seasonal-price' };
    case 'date_override':
      return { name, conditions: { arrivalDateFrom: '2027-12-24', arrivalDateTo: '2028-01-02' }, action: { amountPence: 54500 }, priority: 90, stackable: false, stackingGroup: 'date-price' };
    case 'minimum_stay':
      return { name, conditions: {}, action: { nights: 3 }, priority: 100, stackable: true, stackingGroup: 'stay-restriction' };
    case 'fixed_package':
      return { name, conditions: {}, action: { nights: 3, amountPence: 163500 }, priority: 80, stackable: false, stackingGroup: 'stay-package' };
    case 'length_discount':
      return { name, conditions: { minimumNights: 7 }, action: { percentage: 10 }, priority: 50, stackable: false, stackingGroup: 'length-of-stay-discount' };
    case 'early_booking_discount':
      return { name, conditions: { minimumLeadDays: 180 }, action: { percentage: 10 }, priority: 45, stackable: false, stackingGroup: 'booking-window-discount' };
    case 'last_minute_discount':
      return { name, conditions: { maximumLeadDays: 14 }, action: { percentage: 12 }, priority: 45, stackable: false, stackingGroup: 'booking-window-discount' };
    case 'extra_guest_charge':
      return { name, conditions: {}, action: { includedGuests: 8, amountPence: 3000, perNight: true }, priority: 35, stackable: true, stackingGroup: 'occupancy-charge' };
    case 'cleaning_fee':
      return { name, conditions: {}, action: { amountPence: 15000 }, priority: 30, stackable: false, stackingGroup: 'cleaning' };
    case 'pet_fee':
      return { name, conditions: {}, action: { amountPence: 4000, perPet: true }, priority: 30, stackable: true, stackingGroup: 'pet-charge' };
    case 'channel_commission':
      return { name, conditions: { channel: 'airbnb' }, action: { percentage: 15.5 }, priority: 20, stackable: false, stackingGroup: 'channel-commission' };
    case 'non_refundable_discount':
      return { name, conditions: { cancellationPlan: 'non_refundable' }, action: { percentage: 10 }, priority: 40, stackable: false, stackingGroup: 'rate-plan-discount' };
  }
}
