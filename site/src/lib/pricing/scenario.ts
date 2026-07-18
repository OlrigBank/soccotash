import { formatDate, isIsoDate, nightsBetween, parseDate } from '../booking/dates';
import type { BookingBlock } from '../booking/repository';
import { simulatePricing } from './engine';
import type {
  PricingChannelMix,
  PricingPlan,
  PricingScenarioChannelResult,
  PricingScenarioInput,
  PricingScenarioMonthResult,
  PricingScenarioResult,
  PricingSimulationResult,
} from './types';

const DAY_MS = 86_400_000;
const CHANNELS: Array<keyof PricingChannelMix> = ['direct', 'airbnb', 'booking_com'];

type Segment = { startIndex: number; length: number };
type ModelledStay = { arrival: string; departure: string; nights: number; month: string };

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function addDays(date: string, days: number): string {
  return formatDate(new Date(parseDate(date).getTime() + days * DAY_MS));
}

function pence(value: number): number {
  return Math.round(value);
}

function normalisedMix(mix: PricingChannelMix): PricingChannelMix {
  const values = {
    direct: Math.max(0, Number(mix.direct) || 0),
    airbnb: Math.max(0, Number(mix.airbnb) || 0),
    booking_com: Math.max(0, Number(mix.booking_com) || 0),
  };
  const total = values.direct + values.airbnb + values.booking_com;
  if (total <= 0) return { direct: 100, airbnb: 0, booking_com: 0 };
  return {
    direct: values.direct * 100 / total,
    airbnb: values.airbnb * 100 / total,
    booking_com: values.booking_com * 100 / total,
  };
}

function blockedNightSet(input: PricingScenarioInput, blocks: BookingBlock[]): Set<string> {
  const blocked = new Set<string>();
  for (const block of blocks) {
    const start = block.startsOn < input.startDate ? input.startDate : block.startsOn;
    const end = block.endsOn > input.endDate ? input.endDate : block.endsOn;
    if (!isIsoDate(start) || !isIsoDate(end) || start >= end) continue;
    for (let date = start; date < end; date = addDays(date, 1)) blocked.add(date);
  }
  return blocked;
}

function availableSegments(startDate: string, periodNights: number, blocked: Set<string>): Segment[] {
  const segments: Segment[] = [];
  let segmentStart = -1;
  for (let index = 0; index < periodNights; index += 1) {
    const available = !blocked.has(addDays(startDate, index));
    if (available && segmentStart < 0) segmentStart = index;
    if ((!available || index === periodNights - 1) && segmentStart >= 0) {
      const endExclusive = available && index === periodNights - 1 ? index + 1 : index;
      segments.push({ startIndex: segmentStart, length: endExclusive - segmentStart });
      segmentStart = -1;
    }
  }
  return segments;
}

function weightedResult(
  plan: PricingPlan,
  input: PricingScenarioInput,
  stay: ModelledStay,
  mix: PricingChannelMix,
): {
  guestRevenuePence: number;
  commissionPence: number;
  ownerRevenuePence: number;
  perChannel: Array<{ channel: keyof PricingChannelMix; share: number; result: PricingSimulationResult }>;
  eligible: boolean;
} {
  const perChannel = CHANNELS
    .filter((channel) => mix[channel] > 0)
    .map((channel) => ({
      channel,
      share: mix[channel] / 100,
      result: simulatePricing(plan, {
        propertyId: input.propertyId,
        arrival: stay.arrival,
        departure: stay.departure,
        bookingDate: addDays(stay.arrival, -Math.round(input.averageLeadDays)),
        guests: input.guests,
        pets: input.pets,
        channel,
        cancellationPlan: input.cancellationPlan,
      }),
    }));
  return {
    guestRevenuePence: pence(perChannel.reduce((sum, item) => sum + item.result.guestTotalPence * item.share, 0)),
    commissionPence: pence(perChannel.reduce((sum, item) => sum + item.result.commissionPence * item.share, 0)),
    ownerRevenuePence: pence(perChannel.reduce((sum, item) => sum + item.result.ownerRevenuePence * item.share, 0)),
    perChannel,
    eligible: perChannel.every((item) => item.result.eligible),
  };
}

function candidateLengths(preferred: number, remainingSegment: number, remainingTarget: number): number[] {
  const maximum = Math.min(remainingSegment, Math.max(1, remainingTarget));
  return Array.from({ length: maximum }, (_, index) => index + 1)
    .sort((left, right) => Math.abs(left - preferred) - Math.abs(right - preferred) || right - left);
}

export function modelPricingScenario(
  plan: PricingPlan,
  input: PricingScenarioInput,
  blocks: BookingBlock[],
): PricingScenarioResult {
  if (!isIsoDate(input.startDate) || !isIsoDate(input.endDate)) throw new Error('SCENARIO_DATES_REQUIRED');
  const periodNights = nightsBetween(input.startDate, input.endDate);
  if (periodNights < 1 || periodNights > 731) throw new Error('SCENARIO_DATE_RANGE');
  if (plan.propertyId !== input.propertyId) throw new Error('SCENARIO_PLAN_PROPERTY');

  const occupancy = clamp(Number(input.occupancyPercent) || 0, 0, 100);
  const averageStay = clamp(Number(input.averageStayNights) || 1, 1, 60);
  const cancellationRate = clamp(Number(input.cancellationRatePercent) || 0, 0, 100);
  const mix = normalisedMix(input.channelMix);
  const blocked = blockedNightSet(input, blocks);
  const segments = availableSegments(input.startDate, periodNights, blocked);
  const availableNights = periodNights - blocked.size;
  const targetBookedNights = Math.round(availableNights * occupancy / 100);
  const warnings: string[] = [];
  const stays: ModelledStay[] = [];
  let remainingTarget = targetBookedNights;

  for (const segment of segments) {
    if (remainingTarget <= 0) break;
    const segmentTarget = Math.min(
      segment.length,
      Math.max(0, Math.round(targetBookedNights * segment.length / Math.max(1, availableNights))),
      remainingTarget,
    );
    if (!segmentTarget) continue;
    const projectedBookings = Math.max(1, Math.ceil(segmentTarget / averageStay));
    const unused = Math.max(0, segment.length - segmentTarget);
    const spacing = unused / (projectedBookings + 1);
    let cursor = segment.startIndex + Math.floor(spacing);
    let segmentBooked = 0;

    while (segmentBooked < segmentTarget && cursor < segment.startIndex + segment.length) {
      const remainingSegment = segment.startIndex + segment.length - cursor;
      const remainingAllocation = segmentTarget - segmentBooked;
      let selected: ModelledStay | null = null;
      const preferredLength = Math.max(1, Math.round((stays.length + 1) * averageStay) - Math.round(stays.length * averageStay));
      for (const length of candidateLengths(preferredLength, remainingSegment, remainingAllocation)) {
        const arrival = addDays(input.startDate, cursor);
        const departure = addDays(arrival, length);
        const stay = { arrival, departure, nights: length, month: arrival.slice(0, 7) };
        const result = weightedResult(plan, input, stay, mix);
        if (result.eligible) {
          selected = stay;
          break;
        }
      }
      if (!selected) {
        cursor += 1;
        continue;
      }
      stays.push(selected);
      segmentBooked += selected.nights;
      remainingTarget -= selected.nights;
      cursor += selected.nights + Math.floor(spacing);
      if (remainingTarget <= 0) break;
    }
  }

  const modelledBookedNights = stays.reduce((sum, stay) => sum + stay.nights, 0);
  if (modelledBookedNights < targetBookedNights) {
    warnings.push(`${targetBookedNights - modelledBookedNights} target booked night(s) could not be placed because of availability or pricing restrictions.`);
  }

  const channelMap = new Map<keyof PricingChannelMix, PricingScenarioChannelResult>();
  for (const channel of CHANNELS) {
    channelMap.set(channel, {
      channel,
      sharePercent: mix[channel],
      bookings: 0,
      bookedNights: 0,
      guestRevenuePence: 0,
      commissionPence: 0,
      ownerRevenuePence: 0,
    });
  }
  const monthMap = new Map<string, PricingScenarioMonthResult>();
  for (let index = 0; index < periodNights; index += 1) {
    const date = addDays(input.startDate, index);
    const month = date.slice(0, 7);
    const current = monthMap.get(month) ?? {
      month,
      availableNights: 0,
      modelledBookedNights: 0,
      expectedOccupiedNights: 0,
      bookings: 0,
      guestRevenuePence: 0,
      commissionPence: 0,
      ownerRevenuePence: 0,
    };
    if (!blocked.has(date)) current.availableNights += 1;
    monthMap.set(month, current);
  }

  let grossGuestRevenuePence = 0;
  let grossCommissionPence = 0;
  let grossOwnerRevenuePence = 0;
  for (const stay of stays) {
    const weighted = weightedResult(plan, input, stay, mix);
    grossGuestRevenuePence += weighted.guestRevenuePence;
    grossCommissionPence += weighted.commissionPence;
    grossOwnerRevenuePence += weighted.ownerRevenuePence;
    for (const item of weighted.perChannel) {
      const channel = channelMap.get(item.channel)!;
      channel.bookings += item.share;
      channel.bookedNights += stay.nights * item.share;
      channel.guestRevenuePence += item.result.guestTotalPence * item.share;
      channel.commissionPence += item.result.commissionPence * item.share;
      channel.ownerRevenuePence += item.result.ownerRevenuePence * item.share;
    }
    const nightsByMonth = new Map<string, number>();
    for (let index = 0; index < stay.nights; index += 1) {
      const monthKey = addDays(stay.arrival, index).slice(0, 7);
      nightsByMonth.set(monthKey, (nightsByMonth.get(monthKey) ?? 0) + 1);
    }
    for (const [monthKey, monthNights] of nightsByMonth) {
      const month = monthMap.get(monthKey)!;
      const share = monthNights / stay.nights;
      if (monthKey === stay.month) month.bookings += 1;
      month.modelledBookedNights += monthNights;
      month.guestRevenuePence += pence(weighted.guestRevenuePence * share);
      month.commissionPence += pence(weighted.commissionPence * share);
      month.ownerRevenuePence += pence(weighted.ownerRevenuePence * share);
    }
  }

  const retention = 1 - cancellationRate / 100;
  const cancelledNights = Math.round(modelledBookedNights * cancellationRate / 100);
  const expectedOccupiedNights = modelledBookedNights - cancelledNights;
  for (const channel of channelMap.values()) {
    channel.bookings = Number((channel.bookings * retention).toFixed(2));
    channel.bookedNights = Number((channel.bookedNights * retention).toFixed(2));
    channel.guestRevenuePence = pence(channel.guestRevenuePence * retention);
    channel.commissionPence = pence(channel.commissionPence * retention);
    channel.ownerRevenuePence = pence(channel.ownerRevenuePence * retention);
  }
  for (const month of monthMap.values()) {
    month.expectedOccupiedNights = Math.round(month.modelledBookedNights * retention);
    month.guestRevenuePence = pence(month.guestRevenuePence * retention);
    month.commissionPence = pence(month.commissionPence * retention);
    month.ownerRevenuePence = pence(month.ownerRevenuePence * retention);
  }

  const shortGapNights = segments.filter((segment) => segment.length <= 2).reduce((sum, segment) => sum + segment.length, 0);
  const expectedGuestRevenuePence = pence(grossGuestRevenuePence * retention);
  const expectedCommissionPence = pence(grossCommissionPence * retention);
  const expectedOwnerRevenuePence = pence(grossOwnerRevenuePence * retention);

  return {
    currency: plan.currency,
    periodNights,
    blockedNights: blocked.size,
    availableNights,
    targetBookedNights,
    modelledBookedNights,
    cancelledNights,
    expectedOccupiedNights,
    bookingCount: stays.length,
    grossGuestRevenuePence,
    expectedGuestRevenuePence,
    expectedCommissionPence,
    expectedOwnerRevenuePence,
    averageDailyRatePence: expectedOccupiedNights ? pence(expectedGuestRevenuePence / expectedOccupiedNights) : 0,
    revenuePerAvailableNightPence: availableNights ? pence(expectedGuestRevenuePence / availableNights) : 0,
    shortGapNights,
    channelResults: Array.from(channelMap.values()),
    monthlyResults: Array.from(monthMap.values()).sort((a, b) => a.month.localeCompare(b.month)),
    warnings,
  };
}
