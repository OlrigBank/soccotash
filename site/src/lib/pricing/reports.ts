import type { PricingScenarioRun } from './types';

function csvCell(value: unknown): string {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function row(values: unknown[]): string {
  return values.map(csvCell).join(',');
}

function money(pence: number): string {
  return (Number(pence || 0) / 100).toFixed(2);
}

export function pricingScenarioCsv(run: PricingScenarioRun): string {
  const { input, result } = run;
  const rows: string[] = [
    row(['Soccotash pricing scenario report']),
    row(['Scenario', run.name]),
    row(['Property', run.propertyId]),
    row(['Plan ID', run.planId]),
    row(['Created', run.createdAt]),
    row(['Period', input.startDate, input.endDate]),
    '',
    row(['Assumption', 'Value']),
    row(['Occupancy (%)', input.occupancyPercent]),
    row(['Average stay (nights)', input.averageStayNights]),
    row(['Cancellation rate (%)', input.cancellationRatePercent]),
    row(['Average booking lead (days)', input.averageLeadDays]),
    row(['Guests', input.guests]),
    row(['Pets', input.pets]),
    row(['Cancellation plan', input.cancellationPlan]),
    row(['Direct channel share (%)', input.channelMix.direct]),
    row(['Airbnb channel share (%)', input.channelMix.airbnb]),
    row(['Booking.com channel share (%)', input.channelMix.booking_com]),
    '',
    row(['Summary', 'Value']),
    row(['Period nights', result.periodNights]),
    row(['Blocked nights', result.blockedNights]),
    row(['Available nights', result.availableNights]),
    row(['Target booked nights', result.targetBookedNights]),
    row(['Modelled booked nights', result.modelledBookedNights]),
    row(['Cancelled nights', result.cancelledNights]),
    row(['Expected occupied nights', result.expectedOccupiedNights]),
    row(['Modelled bookings', result.bookingCount]),
    row(['Gross guest revenue', money(result.grossGuestRevenuePence)]),
    row(['Expected guest revenue', money(result.expectedGuestRevenuePence)]),
    row(['Expected channel commission', money(result.expectedCommissionPence)]),
    row(['Expected owner revenue', money(result.expectedOwnerRevenuePence)]),
    row(['Average daily rate', money(result.averageDailyRatePence)]),
    row(['Revenue per available night', money(result.revenuePerAvailableNightPence)]),
    row(['Short gap nights', result.shortGapNights]),
    '',
    row(['Channel', 'Share (%)', 'Expected bookings', 'Expected booked nights', 'Guest revenue', 'Commission', 'Owner revenue']),
    ...result.channelResults.map((item) => row([
      item.channel,
      item.sharePercent.toFixed(2),
      item.bookings.toFixed(2),
      item.bookedNights.toFixed(2),
      money(item.guestRevenuePence),
      money(item.commissionPence),
      money(item.ownerRevenuePence),
    ])),
    '',
    row(['Month', 'Available nights', 'Modelled booked nights', 'Expected occupied nights', 'Bookings', 'Guest revenue', 'Commission', 'Owner revenue']),
    ...result.monthlyResults.map((item) => row([
      item.month,
      item.availableNights,
      item.modelledBookedNights,
      item.expectedOccupiedNights,
      item.bookings,
      money(item.guestRevenuePence),
      money(item.commissionPence),
      money(item.ownerRevenuePence),
    ])),
  ];
  if (result.warnings.length) {
    rows.push('', row(['Warnings']), ...result.warnings.map((warning) => row([warning])));
  }
  return `${rows.join('\r\n')}\r\n`;
}
