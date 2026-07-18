import { formatDate, isIsoDate, nightsBetween, parseDate } from '../booking/dates';
import type {
  PricingConditions,
  PricingConflict,
  PricingLine,
  PricingPlan,
  PricingRule,
  PricingRuleExplanation,
  PricingSimulationInput,
  PricingSimulationResult,
} from './types';

const DAY_MS = 86_400_000;
const RESTRICTION_TYPES = new Set([
  'minimum_stay',
  'maximum_stay',
  'arrival_day_restriction',
  'departure_day_restriction',
]);
const FEE_TYPES = new Set(['cleaning_fee', 'pet_fee']);

function integer(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

function decimal(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stayDates(arrival: string, nights: number): string[] {
  const start = parseDate(arrival);
  return Array.from({ length: nights }, (_, index) => formatDate(new Date(start.getTime() + index * DAY_MS)));
}

function dateInRange(date: string, conditions: PricingConditions): boolean {
  if (conditions.arrivalDateFrom && date < conditions.arrivalDateFrom) return false;
  if (conditions.arrivalDateTo && date > conditions.arrivalDateTo) return false;
  return true;
}

function commonConditionFailure(
  rule: PricingRule,
  input: PricingSimulationInput,
  nights: number,
  leadDays: number,
  checkArrivalRange = true,
): string | null {
  const conditions = rule.conditions;
  if (conditions.listingIds?.length && !conditions.listingIds.includes(input.propertyId)) {
    return 'listing is not included';
  }
  if (checkArrivalRange && !dateInRange(input.arrival, conditions)) {
    return 'arrival is outside the configured date range';
  }
  if (conditions.minimumNights !== undefined && nights < conditions.minimumNights) {
    return `stay is under ${conditions.minimumNights} nights`;
  }
  if (conditions.maximumNights !== undefined && nights > conditions.maximumNights) {
    return `stay is over ${conditions.maximumNights} nights`;
  }
  if (conditions.minimumLeadDays !== undefined && leadDays < conditions.minimumLeadDays) {
    return `booking is fewer than ${conditions.minimumLeadDays} days ahead`;
  }
  if (conditions.maximumLeadDays !== undefined && leadDays > conditions.maximumLeadDays) {
    return `booking is more than ${conditions.maximumLeadDays} days ahead`;
  }
  if (conditions.channel && conditions.channel !== input.channel) {
    return `sales channel is ${input.channel}`;
  }
  if (conditions.cancellationPlan && conditions.cancellationPlan !== input.cancellationPlan) {
    return `rate plan is ${input.cancellationPlan}`;
  }
  return null;
}

function percentageAmount(amountPence: number, percentage: number): number {
  return Math.round(amountPence * percentage / 100);
}

function distributeTotal(totalPence: number, nights: number): number[] {
  if (nights <= 0) return [];
  const each = Math.floor(totalPence / nights);
  const values = Array.from({ length: nights }, () => each);
  values[values.length - 1] += totalPence - each * nights;
  return values;
}

function explanation(rule: PricingRule, applied: boolean, reason: string): PricingRuleExplanation {
  return { ruleId: rule.id, ruleName: rule.name, applied, reason };
}

function line(rule: PricingRule, category: PricingLine['category'], amountPence: number, detail: string): PricingLine {
  return { ruleId: rule.id, label: rule.name, category, amountPence, detail };
}

function rulesOverlap(a: PricingRule, b: PricingRule): boolean {
  const aFrom = a.conditions.arrivalDateFrom ?? '0000-01-01';
  const aTo = a.conditions.arrivalDateTo ?? '9999-12-31';
  const bFrom = b.conditions.arrivalDateFrom ?? '0000-01-01';
  const bTo = b.conditions.arrivalDateTo ?? '9999-12-31';
  if (aFrom > bTo || bFrom > aTo) return false;

  const aListings = a.conditions.listingIds ?? [];
  const bListings = b.conditions.listingIds ?? [];
  if (aListings.length && bListings.length && !aListings.some((id) => bListings.includes(id))) return false;
  if (a.conditions.channel && b.conditions.channel && a.conditions.channel !== b.conditions.channel) return false;
  if (a.conditions.cancellationPlan && b.conditions.cancellationPlan && a.conditions.cancellationPlan !== b.conditions.cancellationPlan) return false;
  return true;
}

function conflict(code: string, severity: PricingConflict['severity'], message: string, rules: PricingRule[]): PricingConflict {
  return { code, severity, message, ruleIds: rules.map((rule) => rule.id) };
}

function pairs(rules: PricingRule[]): Array<[PricingRule, PricingRule]> {
  const output: Array<[PricingRule, PricingRule]> = [];
  rules.forEach((left, index) => rules.slice(index + 1).forEach((right) => output.push([left, right])));
  return output;
}

export function findPricingConflicts(plan: PricingPlan): PricingConflict[] {
  const rules = plan.rules.filter((rule) => rule.enabled);
  const conflicts: PricingConflict[] = [];

  const bases = rules.filter((rule) => rule.type === 'default_nightly_price');
  if (bases.length > 1) {
    conflicts.push(conflict('multiple_default_prices', 'error', `More than one default nightly price is enabled: ${bases.map((rule) => rule.name).join(', ')}.`, bases));
  }

  for (const [left, right] of pairs(rules.filter((rule) => rule.type === 'date_override'))) {
    if (rulesOverlap(left, right)) conflicts.push(conflict('overlapping_date_overrides', 'error', `Date overrides “${left.name}” and “${right.name}” overlap. A stay night could receive two replacement prices.`, [left, right]));
  }

  for (const [left, right] of pairs(rules.filter((rule) => rule.type === 'fixed_package'))) {
    if (integer(left.action.nights) === integer(right.action.nights) && rulesOverlap(left, right)) {
      conflicts.push(conflict('overlapping_fixed_packages', 'error', `Fixed packages “${left.name}” and “${right.name}” both target ${integer(left.action.nights)} nights in an overlapping scope.`, [left, right]));
    }
  }

  const minimumRules = rules.filter((rule) => rule.type === 'minimum_stay');
  const maximumRules = rules.filter((rule) => rule.type === 'maximum_stay');
  for (const minimum of minimumRules) {
    for (const maximum of maximumRules) {
      if (rulesOverlap(minimum, maximum) && integer(minimum.action.nights, 1) > integer(maximum.action.nights, 1)) {
        conflicts.push(conflict('minimum_exceeds_maximum', 'error', `“${minimum.name}” requires at least ${integer(minimum.action.nights)} nights, but “${maximum.name}” permits at most ${integer(maximum.action.nights)} nights.`, [minimum, maximum]));
      }
    }
  }

  for (const type of ['arrival_day_restriction', 'departure_day_restriction'] as const) {
    const dayRules = rules.filter((rule) => rule.type === type);
    for (const [left, right] of pairs(dayRules)) {
      if (!rulesOverlap(left, right)) continue;
      const leftDays = left.action.daysOfWeek ?? [];
      const rightDays = right.action.daysOfWeek ?? [];
      if (leftDays.length && rightDays.length && !leftDays.some((day) => rightDays.includes(day))) {
        conflicts.push(conflict(`${type}_empty_intersection`, 'error', `“${left.name}” and “${right.name}” allow no common ${type === 'arrival_day_restriction' ? 'arrival' : 'departure'} day in their overlapping scope.`, [left, right]));
      }
    }
  }

  const packages = rules.filter((rule) => rule.type === 'fixed_package');
  for (const packageRule of packages) {
    const packageNights = integer(packageRule.action.nights, 1);
    for (const minimum of minimumRules) {
      if (rulesOverlap(packageRule, minimum) && packageNights < integer(minimum.action.nights, 1)) {
        conflicts.push(conflict('package_below_minimum_stay', 'error', `Package “${packageRule.name}” is ${packageNights} nights but “${minimum.name}” requires at least ${integer(minimum.action.nights)} nights.`, [packageRule, minimum]));
      }
    }
    for (const maximum of maximumRules) {
      if (rulesOverlap(packageRule, maximum) && packageNights > integer(maximum.action.nights, 1)) {
        conflicts.push(conflict('package_above_maximum_stay', 'error', `Package “${packageRule.name}” is ${packageNights} nights but “${maximum.name}” permits at most ${integer(maximum.action.nights)} nights.`, [packageRule, maximum]));
      }
    }
  }

  const cleaningRules = rules.filter((rule) => rule.type === 'cleaning_fee');
  for (const [left, right] of pairs(cleaningRules)) {
    if (rulesOverlap(left, right)) conflicts.push(conflict('duplicate_cleaning_fees', 'warning', `Cleaning rules “${left.name}” and “${right.name}” overlap and may both charge unless stacking prevents it.`, [left, right]));
  }

  const petRules = rules.filter((rule) => rule.type === 'pet_fee');
  for (const packageRule of packages) {
    if (packageRule.action.includesCleaning) {
      for (const fee of cleaningRules.filter((rule) => rulesOverlap(packageRule, rule))) {
        conflicts.push(conflict('package_includes_cleaning', 'info', `Package “${packageRule.name}” includes cleaning, so “${fee.name}” will be skipped whenever that package applies.`, [packageRule, fee]));
      }
    }
    if (packageRule.action.includesPetFee) {
      for (const fee of petRules.filter((rule) => rulesOverlap(packageRule, rule))) {
        conflicts.push(conflict('package_includes_pet_fee', 'info', `Package “${packageRule.name}” includes the pet charge, so “${fee.name}” will be skipped whenever that package applies.`, [packageRule, fee]));
      }
    }
  }

  const floors = rules.filter((rule) => rule.type === 'price_floor');
  for (const [left, right] of pairs(floors)) {
    if (rulesOverlap(left, right)) conflicts.push(conflict('overlapping_price_floors', 'warning', `Price floors “${left.name}” and “${right.name}” overlap. The simulator will enforce the higher applicable floor.`, [left, right]));
  }
  for (const packageRule of packages) {
    const packageNights = integer(packageRule.action.nights, 1);
    const packageAmount = integer(packageRule.action.amountPence);
    for (const floor of floors.filter((rule) => rulesOverlap(packageRule, rule))) {
      const floorAmount = integer(floor.action.amountPence) * (floor.action.floorBasis === 'stay_total' ? 1 : packageNights);
      if (packageAmount < floorAmount) {
        conflicts.push(conflict('package_below_price_floor', 'warning', `Package “${packageRule.name}” is below “${floor.name}”; the floor will raise the calculated accommodation total.`, [packageRule, floor]));
      }
    }
  }

  return conflicts;
}

export function simulatePricing(plan: PricingPlan, input: PricingSimulationInput): PricingSimulationResult {
  if (![input.arrival, input.departure, input.bookingDate].every(isIsoDate)) {
    throw new Error('Arrival, departure and booking date must be valid ISO dates.');
  }
  const nights = nightsBetween(input.arrival, input.departure);
  const leadDays = nightsBetween(input.bookingDate, input.arrival);
  if (nights <= 0 || nights > 365) throw new Error('The stay must be between 1 and 365 nights.');
  if (leadDays < 0) throw new Error('The booking date cannot be after arrival.');
  if (!Number.isInteger(input.guests) || input.guests < 1) throw new Error('Guest count must be a positive whole number.');
  if (!Number.isInteger(input.pets) || input.pets < 0) throw new Error('Pet count cannot be negative.');

  const rules = [...plan.rules].sort((a, b) => a.position - b.position || b.priority - a.priority || Number(a.id) - Number(b.id));
  const dates = stayDates(input.arrival, nights);
  let nightPrices = Array.from({ length: nights }, () => 0);
  let hasBasePrice = false;
  let accommodationPence = 0;
  let feesPence = 0;
  let commissionPence = 0;
  let eligible = true;
  const lines: PricingLine[] = [];
  const explanations: PricingRuleExplanation[] = [];
  const warnings: string[] = [];
  const conflicts = findPricingConflicts(plan);
  const stackingGroups = new Map<string, boolean>();
  const overriddenNights = new Set<number>();
  const includedFees = new Set<'cleaning_fee' | 'pet_fee'>();

  for (const rule of rules.filter((candidate) => !candidate.enabled)) {
    explanations.push(explanation(rule, false, 'rule is switched off'));
  }

  for (const rule of rules.filter((candidate) => candidate.enabled && RESTRICTION_TYPES.has(candidate.type))) {
    const failure = commonConditionFailure(rule, input, nights, leadDays);
    if (failure) {
      explanations.push(explanation(rule, false, failure));
      continue;
    }
    if (rule.type === 'minimum_stay') {
      const minimum = integer(rule.action.nights, 1);
      if (nights < minimum) {
        eligible = false;
        lines.push(line(rule, 'restriction', 0, `Requires at least ${minimum} nights.`));
        explanations.push(explanation(rule, true, `stay is ${nights} nights; minimum is ${minimum}`));
      } else explanations.push(explanation(rule, false, `minimum satisfied: ${nights} of ${minimum} nights`));
    }
    if (rule.type === 'maximum_stay') {
      const maximum = integer(rule.action.nights, 1);
      if (nights > maximum) {
        eligible = false;
        lines.push(line(rule, 'restriction', 0, `Permits at most ${maximum} nights.`));
        explanations.push(explanation(rule, true, `stay is ${nights} nights; maximum is ${maximum}`));
      } else explanations.push(explanation(rule, false, `maximum satisfied: ${nights} of ${maximum} nights`));
    }
    if (rule.type === 'arrival_day_restriction' || rule.type === 'departure_day_restriction') {
      const days = rule.action.daysOfWeek ?? [];
      const date = rule.type === 'arrival_day_restriction' ? input.arrival : input.departure;
      const day = parseDate(date).getUTCDay();
      const label = rule.type === 'arrival_day_restriction' ? 'arrival' : 'departure';
      if (!days.length || !days.includes(day)) {
        eligible = false;
        lines.push(line(rule, 'restriction', 0, `${label[0].toUpperCase()}${label.slice(1)} weekday is not permitted.`));
        explanations.push(explanation(rule, true, `${label} weekday ${day} is not in the allowed set`));
      } else explanations.push(explanation(rule, false, `${label} weekday is permitted`));
    }
  }

  function stackingFailure(rule: PricingRule): string | null {
    if (!rule.stackingGroup) return null;
    const existingStackable = stackingGroups.get(rule.stackingGroup);
    if (existingStackable !== undefined && (!existingStackable || !rule.stackable)) {
      return `another non-stackable rule in “${rule.stackingGroup}” already applied`;
    }
    return null;
  }
  function markStacking(rule: PricingRule): void {
    if (rule.stackingGroup) stackingGroups.set(rule.stackingGroup, rule.stackable);
  }

  for (const rule of rules) {
    if (!rule.enabled || RESTRICTION_TYPES.has(rule.type) || FEE_TYPES.has(rule.type) || rule.type === 'price_floor' || rule.type === 'channel_commission') continue;

    const datePerNight = rule.type === 'seasonal_adjustment' || rule.type === 'date_override';
    const failure = commonConditionFailure(rule, input, nights, leadDays, !datePerNight);
    if (failure) {
      explanations.push(explanation(rule, false, failure));
      continue;
    }
    const stackFailure = stackingFailure(rule);
    if (stackFailure) {
      explanations.push(explanation(rule, false, stackFailure));
      continue;
    }

    let applied = false;
    let appliedReason = '';

    switch (rule.type) {
      case 'default_nightly_price': {
        if (hasBasePrice) {
          explanations.push(explanation(rule, false, 'a default nightly price has already been applied'));
          continue;
        }
        const amount = Math.max(0, integer(rule.action.amountPence));
        nightPrices = Array.from({ length: nights }, () => amount);
        accommodationPence = amount * nights;
        hasBasePrice = true;
        lines.push(line(rule, 'accommodation', accommodationPence, `${nights} nights at the default nightly amount.`));
        applied = true;
        appliedReason = `${nights} nights priced`;
        break;
      }
      case 'date_override': {
        if (!hasBasePrice) {
          explanations.push(explanation(rule, false, 'a default nightly price must be applied first'));
          continue;
        }
        const amount = Math.max(0, integer(rule.action.amountPence));
        let delta = 0;
        let affected = 0;
        dates.forEach((date, index) => {
          if (!dateInRange(date, rule.conditions)) return;
          if (overriddenNights.has(index)) warnings.push(`${date} is affected by more than one date override; later rule order wins.`);
          overriddenNights.add(index);
          delta += amount - nightPrices[index];
          nightPrices[index] = amount;
          affected += 1;
        });
        if (!affected) {
          explanations.push(explanation(rule, false, 'no stay nights fall inside the override date range'));
          continue;
        }
        accommodationPence += delta;
        lines.push(line(rule, 'accommodation', delta, `${affected} night${affected === 1 ? '' : 's'} replaced with the fixed nightly amount.`));
        applied = true;
        appliedReason = `${affected} night${affected === 1 ? '' : 's'} overridden`;
        break;
      }
      case 'weekend_adjustment': {
        if (!hasBasePrice) {
          explanations.push(explanation(rule, false, 'a default nightly price must be applied first'));
          continue;
        }
        const percentage = decimal(rule.action.percentage);
        const days = rule.action.daysOfWeek?.length ? rule.action.daysOfWeek : [5, 6];
        let delta = 0;
        let affected = 0;
        dates.forEach((date, index) => {
          const day = parseDate(date).getUTCDay();
          if (!days.includes(day)) return;
          const change = percentageAmount(nightPrices[index], percentage);
          nightPrices[index] += change;
          delta += change;
          affected += 1;
        });
        if (!affected) {
          explanations.push(explanation(rule, false, 'stay contains no configured adjusted weekdays'));
          continue;
        }
        accommodationPence += delta;
        lines.push(line(rule, delta < 0 ? 'discount' : 'accommodation', delta, `${percentage >= 0 ? '+' : ''}${percentage}% on ${affected} selected night${affected === 1 ? '' : 's'}.`));
        applied = true;
        appliedReason = `${affected} selected night${affected === 1 ? '' : 's'} adjusted`;
        break;
      }
      case 'seasonal_adjustment': {
        if (!hasBasePrice) {
          explanations.push(explanation(rule, false, 'a default nightly price must be applied first'));
          continue;
        }
        const percentage = decimal(rule.action.percentage);
        let delta = 0;
        let affected = 0;
        dates.forEach((date, index) => {
          if (!dateInRange(date, rule.conditions)) return;
          const change = percentageAmount(nightPrices[index], percentage);
          nightPrices[index] += change;
          delta += change;
          affected += 1;
        });
        if (!affected) {
          explanations.push(explanation(rule, false, 'no stay nights fall inside the seasonal date range'));
          continue;
        }
        accommodationPence += delta;
        lines.push(line(rule, delta < 0 ? 'discount' : 'accommodation', delta, `${percentage >= 0 ? '+' : ''}${percentage}% on ${affected} seasonal night${affected === 1 ? '' : 's'}.`));
        applied = true;
        appliedReason = `${affected} seasonal night${affected === 1 ? '' : 's'} adjusted`;
        break;
      }
      case 'fixed_package': {
        const packageNights = integer(rule.action.nights);
        if (nights !== packageNights) {
          explanations.push(explanation(rule, false, `stay is ${nights} nights, not the required ${packageNights}`));
          continue;
        }
        const amount = Math.max(0, integer(rule.action.amountPence));
        const delta = amount - accommodationPence;
        accommodationPence = amount;
        nightPrices = distributeTotal(amount, nights);
        hasBasePrice = true;
        includedFees.clear();
        if (rule.action.includesCleaning) includedFees.add('cleaning_fee');
        if (rule.action.includesPetFee) includedFees.add('pet_fee');
        const inclusions = [rule.action.includesCleaning ? 'cleaning' : '', rule.action.includesPetFee ? 'pet charge' : ''].filter(Boolean);
        lines.push(line(rule, delta < 0 ? 'discount' : 'accommodation', delta, `Accommodation replaced by a fixed ${packageNights}-night package total${inclusions.length ? ` including ${inclusions.join(' and ')}` : ''}.`));
        applied = true;
        appliedReason = `${packageNights}-night package selected${inclusions.length ? `; ${inclusions.join(' and ')} included` : ''}`;
        break;
      }
      case 'length_discount':
      case 'early_booking_discount':
      case 'last_minute_discount':
      case 'non_refundable_discount': {
        if (!hasBasePrice) {
          explanations.push(explanation(rule, false, 'a default or package price must be applied first'));
          continue;
        }
        const percentage = Math.max(0, decimal(rule.action.percentage));
        const discount = percentageAmount(accommodationPence, percentage);
        accommodationPence -= discount;
        nightPrices = distributeTotal(accommodationPence, nights);
        lines.push(line(rule, 'discount', -discount, `${percentage}% reduction from accommodation.`));
        applied = true;
        appliedReason = `${percentage}% discount applied`;
        break;
      }
      case 'extra_guest_charge': {
        const includedGuests = Math.max(0, integer(rule.action.includedGuests));
        const extraGuests = Math.max(0, input.guests - includedGuests);
        if (!extraGuests) {
          explanations.push(explanation(rule, false, `guest count does not exceed ${includedGuests}`));
          continue;
        }
        const unit = Math.max(0, integer(rule.action.amountPence));
        const amount = unit * extraGuests * (rule.action.perNight ? nights : 1);
        accommodationPence += amount;
        nightPrices = distributeTotal(accommodationPence, nights);
        lines.push(line(rule, 'accommodation', amount, `${extraGuests} extra guest${extraGuests === 1 ? '' : 's'}${rule.action.perNight ? ` for ${nights} nights` : ''}.`));
        applied = true;
        appliedReason = `${extraGuests} extra guest${extraGuests === 1 ? '' : 's'} charged`;
        break;
      }
      default:
        break;
    }

    if (applied) {
      markStacking(rule);
      explanations.push(explanation(rule, true, appliedReason));
    }
  }

  const matchingFloors: Array<{ rule: PricingRule; requiredPence: number }> = [];
  for (const rule of rules.filter((candidate) => candidate.enabled && candidate.type === 'price_floor')) {
    const failure = commonConditionFailure(rule, input, nights, leadDays);
    if (failure) {
      explanations.push(explanation(rule, false, failure));
      continue;
    }
    const amount = Math.max(0, integer(rule.action.amountPence));
    matchingFloors.push({ rule, requiredPence: rule.action.floorBasis === 'stay_total' ? amount : amount * nights });
  }
  matchingFloors.sort((a, b) => b.requiredPence - a.requiredPence || b.rule.priority - a.rule.priority);
  const selectedFloor = matchingFloors[0];
  for (const candidate of matchingFloors.slice(1)) {
    explanations.push(explanation(candidate.rule, false, `a higher applicable floor of £${(selectedFloor.requiredPence / 100).toFixed(2)} takes precedence`));
  }
  if (selectedFloor) {
    if (!hasBasePrice) {
      explanations.push(explanation(selectedFloor.rule, false, 'a default or package price must be applied first'));
    } else if (accommodationPence < selectedFloor.requiredPence) {
      const delta = selectedFloor.requiredPence - accommodationPence;
      accommodationPence = selectedFloor.requiredPence;
      nightPrices = distributeTotal(accommodationPence, nights);
      lines.push(line(selectedFloor.rule, 'accommodation', delta, `Accommodation raised to the ${selectedFloor.rule.action.floorBasis === 'stay_total' ? 'stay-total' : 'nightly'} price floor.`));
      explanations.push(explanation(selectedFloor.rule, true, `price floor raised accommodation by £${(delta / 100).toFixed(2)}`));
      warnings.push(`The price floor raised accommodation by £${(delta / 100).toFixed(2)} after discounts and package pricing.`);
    } else {
      explanations.push(explanation(selectedFloor.rule, false, 'calculated accommodation is already above the floor'));
    }
  }

  for (const rule of rules.filter((candidate) => candidate.enabled && FEE_TYPES.has(candidate.type))) {
    const failure = commonConditionFailure(rule, input, nights, leadDays);
    if (failure) {
      explanations.push(explanation(rule, false, failure));
      continue;
    }
    if (includedFees.has(rule.type as 'cleaning_fee' | 'pet_fee')) {
      explanations.push(explanation(rule, false, `${rule.type === 'cleaning_fee' ? 'cleaning' : 'pet charge'} is included in the selected fixed package`));
      continue;
    }
    const stackFailure = stackingFailure(rule);
    if (stackFailure) {
      explanations.push(explanation(rule, false, stackFailure));
      continue;
    }
    if (rule.type === 'cleaning_fee') {
      const amount = Math.max(0, integer(rule.action.amountPence));
      feesPence += amount;
      lines.push(line(rule, 'fee', amount, 'Fixed charge per booking.'));
      explanations.push(explanation(rule, true, 'fixed booking fee added'));
      markStacking(rule);
    }
    if (rule.type === 'pet_fee') {
      if (input.pets < 1) {
        explanations.push(explanation(rule, false, 'no pets entered'));
        continue;
      }
      const unit = Math.max(0, integer(rule.action.amountPence));
      const amount = unit * (rule.action.perPet ? input.pets : 1);
      feesPence += amount;
      lines.push(line(rule, 'fee', amount, rule.action.perPet ? `${input.pets} pet${input.pets === 1 ? '' : 's'}.` : 'Fixed pet fee per stay.'));
      explanations.push(explanation(rule, true, rule.action.perPet ? `${input.pets} pet${input.pets === 1 ? '' : 's'} charged` : 'pet stay charge added'));
      markStacking(rule);
    }
  }

  for (const rule of rules.filter((candidate) => candidate.enabled && candidate.type === 'channel_commission')) {
    const failure = commonConditionFailure(rule, input, nights, leadDays);
    if (failure) {
      explanations.push(explanation(rule, false, failure));
      continue;
    }
    const stackFailure = stackingFailure(rule);
    if (stackFailure) {
      explanations.push(explanation(rule, false, stackFailure));
      continue;
    }
    const percentage = Math.max(0, decimal(rule.action.percentage));
    const guestTotal = accommodationPence + feesPence;
    const amount = percentageAmount(guestTotal, percentage);
    commissionPence += amount;
    lines.push(line(rule, 'commission', -amount, `${percentage}% deducted from estimated owner revenue.`));
    explanations.push(explanation(rule, true, `${percentage}% ${input.channel} commission calculated`));
    markStacking(rule);
  }

  if (!hasBasePrice) warnings.push('No default nightly price or fixed package applied; accommodation is £0.');
  if (!eligible) warnings.push('The stay fails one or more availability restrictions and should not be offered for booking.');

  const guestTotalPence = accommodationPence + feesPence;
  const ownerRevenuePence = guestTotalPence - commissionPence;
  return {
    eligible,
    currency: plan.currency,
    nights,
    leadDays,
    accommodationPence,
    feesPence,
    guestTotalPence,
    commissionPence,
    ownerRevenuePence,
    averageNightlyPence: nights ? Math.round(accommodationPence / nights) : 0,
    lines,
    explanations,
    warnings,
    conflicts,
  };
}
