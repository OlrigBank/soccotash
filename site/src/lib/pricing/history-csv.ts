import { HISTORY_THRESHOLD, type HistoryReport, type HistoryStatistics } from './history.ts';

const pounds = (pence: number | null) => pence === null ? '' : (pence / 100).toFixed(2);
const stats = (s: HistoryStatistics) => [s.reservations, s.nights, s.years.join('; '), pounds(s.medianPence), pounds(s.lowerPence), pounds(s.upperPence), pounds(s.revenuePerNightPence), pounds(s.accommodationRevenuePence), s.estimatedPercent.toFixed(1)];
const statsHeadings = ['Bookings', 'Nights', 'Years', 'Median GBP', '25th percentile GBP', '75th percentile GBP', 'Accommodation revenue per night GBP', 'Accommodation revenue GBP', 'Estimated allocation %'];

/** Protect spreadsheet users from formulas in owner-defined exception names. */
function cell(value: unknown): string {
  let text = String(value ?? '');
  if (/^[\s]*[=+@-]/u.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function historyCsv(report: HistoryReport): string {
  const rows: unknown[][] = [
    ['Historical accommodation pricing'], ['Listing', report.input.propertyId],
    ['Calculated at', report.calculatedAt], ['As of', report.asOfDate], ['Method version', report.methodVersion],
    ['Historical dates (inclusive)', report.input.startDate, report.input.endDate],
    ['Target year', report.input.targetYear], ['Uplift %', report.input.upliftPercent],
    ['Included source captured from/to', report.sourceCapturedFrom, report.sourceCapturedTo],
    ['Evidence threshold', `${HISTORY_THRESHOLD.reservations} reservations; ${HISTORY_THRESHOLD.nights} nights; ${HISTORY_THRESHOLD.years} years`],
    ['Method', 'Equal weight per night; median; linear-interpolated percentiles; Friday/Saturday weekend; nearest-pound suggestions; no automatic inflation adjustment'],
    ['Limitations', 'Recorded confirmed past bookings; not proof of completed stays. Historical party, stay-length and discount mix. No revenue-optimisation or demand claim. Fees excluded from rates.'],
    ['Fallback', 'Monthly baseline fallback counts/statistics use all eligible regular nights in that month. Estimated allocations cannot establish a weekday/weekend premium.'],
    ['Considered reservations', report.consideredReservations], ['Included reservations', report.includedReservations], [],
    ['Rates'], ['Listing', 'Period', 'Day type', 'Target start', 'Target end', ...statsHeadings, 'Baseline GBP', 'Suggested GBP', 'Evidence', 'Reference GBP', 'Reference label'],
    ...report.rows.map(r => [report.input.propertyId, r.period, r.dayType, r.target.start, r.target.end, ...stats(r.statistics), pounds(r.baselinePence), pounds(r.suggestedPence), r.evidence, pounds(r.referencePence), r.referenceLabel]),
    [], ['Yearly comparison (including exception nights)'], ['Year', ...statsHeadings],
    ...report.yearly.map(y => [y.year, ...stats(y.statistics)]), [],
    ['Exclusions'], ['Reason', 'Reservations'], ...Object.entries(report.exclusions), [],
    ['Fees (whole reservations overlapping the selected range; one financial perspective only)'],
    ['Type', 'Reservations', 'Total GBP', 'Median per reservation GBP'], ...report.fees.map(f => [f.type, f.reservations, pounds(f.totalPence), pounds(f.medianPence)]), [],
    ['Source profile (whole stays grouped by arrival year; all listings; nightly lines can appear in both perspectives)'],
    ['Listing', 'Arrival year', 'Reservations', 'Stay nights', 'Currencies', 'Statuses', 'Missing financials', 'Recorded discrepancies', 'Dated nightly lines'],
    ...report.profile.map(p => [p.propertyId, p.year, p.reservations, p.nights, JSON.stringify(p.currencies), JSON.stringify(p.statuses), p.missingFinancials, p.discrepancies, p.datedNightlyLines]), [],
    ['Exception definitions'], ['Name', 'Target start', 'Target end', 'Historical start', 'Historical end'],
    ...report.input.exceptions.flatMap(e => e.historical.map(h => [e.name, e.target.start, e.target.end, h.start, h.end])),
  ];
  return '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
