import { formatDate, isIsoDate, nightsBetween, parseDate } from '../booking/dates';
import type {
  PricingConditions,
  PricingLine,
  PricingPlan,
  PricingRule,
  PricingRuleExplanation,
  PricingSimulationInput,
  PricingSimulationResult,
} from './types';

const DAY_MS = 86_400_000;

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
  const stackingGroups = new Map<string, boolean>();
  const overriddenNights = new Set<number>();

  for (const rule of rules.filter((candidate) => !candidate.enabled)) {
    explanations.push(explanation(rule, false, 'rule is switched off'));
  }

  for (const rule of rules.filter((candidate) => candidate.enabled && candidate.type === 'minimum_stay')) {
    const failure = commonConditionFailure(rule, input, nights, leadDays);
    if (failure) {
      explanations.push(explanation(rule, false, failure));
      continue;
    }
    const minimum = integer(rule.action.nights, 1);
    if (nights < minimum) {
      eligible = false;
      lines.push(line(rule, 'restriction', 0, `Requires at least ${minimum} nights.`));
      explanations.push(explanation(rule, true, `stay is ${nights} nights; minimum is ${minimum}`));
    } else {
      explanations.push(explanation(rule, false, `minimum satisfied: ${nights} of ${minimum} nights`));
    }
  }

  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (rule.type === 'minimum_stay') continue;

    const datePerNight = rule.type === 'seasonal_adjustment' || rule.type === 'date_override';
    const failure = commonConditionFailure(rule, input, nights, leadDays, !datePerNight);
    if (failure) {
      explanations.push(explanation(rule, false, failure));
      continue;
    }

    if (rule.stackingGroup) {
      const existingStackable = stackingGroups.get(rule.stackingGroup);
      if (existingStackable !== undefined && (!existingStackable || !rule.stackable)) {
        explanations.push(explanation(rule, false, `another non-stackable rule in “${rule.stackingGroup}” already applied`));
        continue;
      }
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
          explanations.push(explanation(rule, false, 'stay contains no configured weekend nights'));
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
        lines.push(line(rule, delta < 0 ? 'discount' : 'accommodation', delta, `Accommodation replaced by a fixed ${packageNights}-night package total.`));
        applied = true;
        appliedReason = `${packageNights}-night package selected`;
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
        lines.push(line(rule, 'accommodation', amount, `${extraGuests} extra guest${extraGuests === 1 ? '' : 's'}${rule.action.perNight ? ` for ${nights} nights` : ''}.`));
        applied = true;
        appliedReason = `${extraGuests} extra guest${extraGuests === 1 ? '' : 's'} charged`;
        break;
      }
      case 'cleaning_fee': {
        const amount = Math.max(0, integer(rule.action.amountPence));
        feesPence += amount;
        lines.push(line(rule, 'fee', amount, 'Fixed charge per booking.'));
        applied = true;
        appliedReason = 'fixed booking fee added';
        break;
      }
      case 'pet_fee': {
        if (input.pets < 1) {
          explanations.push(explanation(rule, false, 'no pets entered'));
          continue;
        }
        const unit = Math.max(0, integer(rule.action.amountPence));
        const amount = unit * (rule.action.perPet ? input.pets : 1);
        feesPence += amount;
        lines.push(line(rule, 'fee', amount, rule.action.perPet ? `${input.pets} pet${input.pets === 1 ? '' : 's'}.` : 'Fixed pet fee per stay.'));
        applied = true;
        appliedReason = rule.action.perPet ? `${input.pets} pet${input.pets === 1 ? '' : 's'} charged` : 'pet stay charge added';
        break;
      }
      case 'channel_commission': {
        const percentage = Math.max(0, decimal(rule.action.percentage));
        const guestTotal = accommodationPence + feesPence;
        const amount = percentageAmount(guestTotal, percentage);
        commissionPence += amount;
        lines.push(line(rule, 'commission', -amount, `${percentage}% deducted from estimated owner revenue.`));
        applied = true;
        appliedReason = `${percentage}% ${input.channel} commission calculated`;
        break;
      }
    }

    if (applied) {
      if (rule.stackingGroup) stackingGroups.set(rule.stackingGroup, rule.stackable);
      explanations.push(explanation(rule, true, appliedReason));
    }
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
  };
}
