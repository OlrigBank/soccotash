/** Pure, deterministic analysis of imported Airbnb financial evidence. */
export const HISTORY_METHOD_VERSION = '1.0';
export const HISTORY_THRESHOLD = { reservations: 5, nights: 20, years: 2 } as const;
export interface HistoryRange { start: string; end: string }
export interface HistoryException {
  name: string;
  target: HistoryRange;
  historical: HistoryRange[];
}
export interface HistoryInput {
  propertyId: string;
  startDate: string;
  endDate: string;
  targetYear: number;
  upliftPercent: number;
  exceptions: HistoryException[];
}
export interface HistoryLine {
  id: string;
  parentId: string | null;
  type: string;
  description: string;
  serviceDate: string | null;
  amountPence: number;
}
export interface HistoryFinancial {
  perspective: 'guest_paid' | 'host_earnings';
  currency: string;
  totalPence: number;
  arithmeticStatus: string;
  lines: HistoryLine[];
}
export interface HistoryReservation {
  id: string;
  propertyId: string | null;
  arrival: string;
  departure: string;
  nights: number;
  status: string | null;
  currency: string;
  capturedAt: string;
  financials: HistoryFinancial[];
}
export interface HistoryNight {
  reservationId: string;
  date: string;
  amountPence: number;
  estimated: boolean;
}
export interface HistoryStatistics {
  reservations: number;
  nights: number;
  years: number[];
  medianPence: number | null;
  lowerPence: number | null;
  upperPence: number | null;
  revenuePerNightPence: number | null;
  accommodationRevenuePence: number;
  estimatedPercent: number;
  supported: boolean;
}
export interface HistoryRow {
  period: string;
  dayType: 'Weekday' | 'Weekend' | 'All nights';
  target: HistoryRange;
  statistics: HistoryStatistics;
  baselinePence: number | null;
  suggestedPence: number | null;
  evidence: 'Supported historical baseline' | 'Monthly baseline fallback' | 'Insufficient history';
  referencePence: number | null;
  referenceLabel: string | null;
}
export interface HistoryProfile {
  propertyId: string;
  year: number;
  reservations: number;
  nights: number;
  currencies: Record<string, number>;
  statuses: Record<string, number>;
  missingFinancials: number;
  discrepancies: number;
  datedNightlyLines: number;
}
export interface HistoryReport {
  input: HistoryInput;
  methodVersion: string;
  calculatedAt: string;
  asOfDate: string;
  sourceCapturedFrom: string | null;
  sourceCapturedTo: string | null;
  profile: HistoryProfile[];
  consideredReservations: number;
  includedReservations: number;
  exclusions: Record<string, number>;
  rows: HistoryRow[];
  yearly: Array<{ year: number; statistics: HistoryStatistics }>;
  fees: Array<{ type: string; reservations: number; totalPence: number; medianPence: number }>;
}

const DAY = 86_400_000;
export function validHistoryDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && value.slice(0, 4) !== '0000'
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function dateNumber(date: string): number { return Date.parse(`${date}T00:00:00Z`); }
function overlap(a: HistoryRange, b: HistoryRange): boolean { return a.start <= b.end && b.start <= a.end; }
export function defaultHistoryInput(propertyId: string, today = new Date()): HistoryInput {
  const year = today.getUTCFullYear();
  return { propertyId, startDate: `${year - 3}-01-01`, endDate: `${year - 1}-12-31`, targetYear: year + 1, upliftPercent: 0, exceptions: [] };
}

/** End dates are inclusive; reservation departures remain exclusive. */
export function parseHistoryInput(raw: unknown, propertyIds: string[], today = new Date()): HistoryInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Choose valid report settings.');
  const value = raw as Record<string, unknown>;
  const propertyId = String(value.propertyId ?? '');
  if (!propertyIds.includes(propertyId)) throw new Error('Choose a recognised listing.');
  if (!validHistoryDate(value.startDate) || !validHistoryDate(value.endDate)
    || value.startDate > value.endDate || value.endDate >= today.toISOString().slice(0, 10)
    || dateNumber(value.endDate) - dateNumber(value.startDate) > 20 * 366 * DAY) {
    throw new Error('Choose a historical range of at most 20 years ending before today.');
  }
  const targetYear = value.targetYear;
  const upliftPercent = value.upliftPercent;
  if (typeof targetYear !== 'number' || !Number.isInteger(targetYear) || targetYear < today.getUTCFullYear() || targetYear > today.getUTCFullYear() + 10) {
    throw new Error('Choose a target year from this year to ten years ahead.');
  }
  if (typeof upliftPercent !== 'number' || !Number.isFinite(upliftPercent) || upliftPercent < -100 || upliftPercent > 500) {
    throw new Error('The uplift must be between −100% and 500%.');
  }
  if (!Array.isArray(value.exceptions) || value.exceptions.length > 20) throw new Error('Add at most 20 exception periods.');
  function range(rawRange: unknown): HistoryRange {
    const r = rawRange as HistoryRange | null;
    if (!r || !validHistoryDate(r.start) || !validHistoryDate(r.end) || r.start > r.end) throw new Error('Each exception needs a valid start and end date.');
    return { start: r.start, end: r.end };
  }
  const exceptions = value.exceptions.map((entry: unknown): HistoryException => {
    if (!entry || typeof entry !== 'object') throw new Error('Check the exception periods.');
    const e = entry as Record<string, unknown>;
    const name = typeof e.name === 'string' ? e.name.trim() : '';
    if (!name || name.length > 80) throw new Error('Give each exception a name of 1–80 characters.');
    const target = range(e.target);
    if (target.start < `${targetYear}-01-01` || target.end > `${targetYear}-12-31`) throw new Error('Target exception dates must fall within the target year.');
    if (!Array.isArray(e.historical) || !e.historical.length || e.historical.length > 20) throw new Error('Each exception needs 1–20 comparable historical periods.');
    const historical = e.historical.map(range);
    if (historical.some(r => r.start < String(value.startDate) || r.end > String(value.endDate))) throw new Error('Historical exceptions must fall within the report range.');
    return { name, target, historical };
  });
  const targets: HistoryRange[] = [];
  const historical: HistoryRange[] = [];
  const names = new Set<string>();
  for (const exception of exceptions) {
    if (names.has(exception.name.toLowerCase())) throw new Error('Exception names must be unique.');
    names.add(exception.name.toLowerCase());
    if (targets.some(r => overlap(r, exception.target))) throw new Error('Target exception periods must not overlap.');
    targets.push(exception.target);
    for (const r of exception.historical) {
      if (historical.some(other => overlap(other, r))) throw new Error('Historical exception periods must not overlap.');
      historical.push(r);
    }
  }
  return { propertyId, startDate: value.startDate, endDate: value.endDate, targetYear, upliftPercent, exceptions };
}

function percentile(values: number[], fraction: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  return sorted[lower] + (sorted[Math.ceil(position)] - sorted[lower]) * (position - lower);
}
export function historyStatistics(nights: HistoryNight[]): HistoryStatistics {
  const amounts = nights.map(n => n.amountPence);
  const reservations = new Set(nights.map(n => n.reservationId)).size;
  const years = [...new Set(nights.map(n => Number(n.date.slice(0, 4))))].sort();
  const accommodationRevenuePence = amounts.reduce((sum, amount) => sum + amount, 0);
  return {
    reservations, nights: nights.length, years,
    medianPence: percentile(amounts, 0.5), lowerPence: percentile(amounts, 0.25), upperPence: percentile(amounts, 0.75),
    revenuePerNightPence: nights.length ? accommodationRevenuePence / nights.length : null,
    accommodationRevenuePence,
    estimatedPercent: nights.length ? nights.filter(n => n.estimated).length / nights.length * 100 : 0,
    supported: reservations >= HISTORY_THRESHOLD.reservations && nights.length >= HISTORY_THRESHOLD.nights && years.length >= HISTORY_THRESHOLD.years,
  };
}

function feeType(line: HistoryLine): string | null {
  if (['host_service_fee', 'guest_service_fee', 'tax'].includes(line.type)) return line.type;
  if (line.type === 'other' && /\bcleaning\b/i.test(line.description)) return 'cleaning';
  if (line.type === 'other' && /\b(pet|pets|dog|dogs)\b/i.test(line.description)) return 'pets';
  return null;
}
function accommodationAdjustment(line: HistoryLine): boolean {
  return line.type === 'adjustment' && /nightly|room|accommodation|non-refundable|(?:length.of.stay|weekly|monthly|weekly stay|monthly stay) discount/i.test(line.description);
}
interface NormalisedFinancial { totalPence: number; amounts: number[]; estimated: boolean; fees: Array<{ type: string; amountPence: number }> }
function normaliseFinancial(summary: HistoryFinancial, dates: string[]): NormalisedFinancial | string {
  if (summary.arithmeticStatus === 'discrepancy') return 'Financial reconciliation discrepancy';
  if (summary.currency !== 'GBP' || summary.arithmeticStatus !== 'verified') return 'Unverified financial summary';
  if (![summary.totalPence, ...summary.lines.map(l => l.amountPence)].every(Number.isSafeInteger)) return 'Invalid monetary amount';
  const ids = new Set(summary.lines.map(l => l.id));
  const roots = summary.lines.filter(l => l.parentId === null && l.type !== 'total');
  if (ids.size !== summary.lines.length || summary.lines.some(l => l.parentId !== null && (!ids.has(l.parentId) || l.id === l.parentId))) return 'Invalid financial hierarchy';
  if (roots.reduce((sum, l) => sum + l.amountPence, 0) !== summary.totalPence
    || summary.lines.some(l => l.type === 'total' && (l.parentId !== null || l.amountPence !== summary.totalPence))) return 'Financial reconciliation discrepancy';
  const accommodation = roots.filter(l => l.type === 'accommodation' || accommodationAdjustment(l) || l.type === 'nightly_charge');
  if (!accommodation.some(l => l.type === 'accommodation' || l.type === 'nightly_charge')) return 'Missing accommodation charges';
  if (roots.some(l => !accommodation.includes(l) && !feeType(l))) return 'Ambiguous financial line or adjustment';
  if (accommodation.filter(l => l.type === 'accommodation').length > 1
    || (accommodation.some(l => l.type === 'accommodation') && accommodation.some(l => l.type === 'nightly_charge'))
    || accommodation.some(l => l.type === 'nightly_charge' && (!l.serviceDate || !dates.includes(l.serviceDate)))) return 'Ambiguous accommodation breakdown';
  // Only one level of nightly children is supported; never silently discard deeper financial evidence.
  if (summary.lines.some(l => l.parentId !== null && !accommodation.some(parent => parent.id === l.parentId))) return 'Ambiguous financial hierarchy';
  const totalPence = accommodation.reduce((sum, l) => sum + l.amountPence, 0);
  if (!Number.isSafeInteger(totalPence) || totalPence <= 0) return 'Non-positive accommodation charge';
  const dated = Array(dates.length).fill(0) as number[];
  let complete = true;
  for (const root of accommodation) {
    const children = summary.lines.filter(l => l.parentId === root.id);
    if (children.length) {
      if (children.reduce((sum, l) => sum + l.amountPence, 0) !== root.amountPence
        || children.some(l => l.type !== 'nightly_charge' || !l.serviceDate || !dates.includes(l.serviceDate))
        || new Set(children.map(l => l.serviceDate)).size !== children.length) return 'Nightly breakdown discrepancy';
      if (root.type === 'accommodation' && children.length !== dates.length) return 'Incomplete accommodation nightly breakdown';
      for (const child of children) dated[dates.indexOf(child.serviceDate!)] += child.amountPence;
    } else if (root.type === 'nightly_charge' && root.serviceDate && dates.includes(root.serviceDate)) {
      if (accommodation.filter(l => l.type === 'nightly_charge' && l.serviceDate === root.serviceDate).length !== 1) return 'Duplicate dated nightly charge';
      dated[dates.indexOf(root.serviceDate)] += root.amountPence;
    } else complete = false;
  }
  if (!accommodation.some(root => root.type === 'accommodation') && accommodation.filter(root => root.type === 'nightly_charge').length !== dates.length) return 'Incomplete accommodation nightly breakdown';
  // A stay-level adjustment without dates makes the whole allocation estimated.
  const base = Math.floor(totalPence / dates.length);
  const amounts = complete ? dated : dates.map((_, index) => base + (index < totalPence % dates.length ? 1 : 0));
  if (amounts.some(amount => amount < 0) || amounts.reduce((sum, n) => sum + n, 0) !== totalPence) return 'Nightly breakdown discrepancy';
  return { totalPence, amounts, estimated: !complete, fees: roots.filter(l => feeType(l)).map(l => ({ type: feeType(l)!, amountPence: l.amountPence })) };
}

export function normaliseHistoryReservation(reservation: HistoryReservation): { nights: HistoryNight[]; fees: NormalisedFinancial['fees'] } | string {
  if (!validHistoryDate(reservation.arrival) || !validHistoryDate(reservation.departure)
    || reservation.nights < 1 || reservation.nights > 3660
    || (dateNumber(reservation.departure) - dateNumber(reservation.arrival)) / DAY !== reservation.nights) return 'Invalid stay dates';
  const dates = Array.from({ length: reservation.nights }, (_, index) => new Date(dateNumber(reservation.arrival) + index * DAY).toISOString().slice(0, 10));
  const summaries = [...reservation.financials].sort((a, b) => Number(b.perspective === 'guest_paid') - Number(a.perspective === 'guest_paid'));
  if (new Set(summaries.map(s => s.perspective)).size !== summaries.length) return 'Duplicate financial perspective';
  const candidates = summaries.map(summary => normaliseFinancial(summary, dates));
  // A supplied discrepant panel cannot be silently replaced by a more convenient panel.
  const discrepancy = candidates.find(c => typeof c === 'string' && /discrepancy|Ambiguous|hierarchy|Invalid|Duplicate|Incomplete|Non-positive/.test(c));
  if (typeof discrepancy === 'string') return discrepancy;
  const valid = candidates.filter((c): c is NormalisedFinancial => typeof c !== 'string');
  if (!valid.length) return typeof candidates[0] === 'string' ? candidates[0] : 'Missing financial summaries';
  if (valid.some(c => c.totalPence !== valid[0].totalPence)) return 'Conflicting accommodation figures';
  const dated = valid.filter(c => !c.estimated);
  if (dated.length > 1 && dated.some(c => c.amounts.some((amount, i) => amount !== dated[0].amounts[i]))) return 'Conflicting dated nightly prices';
  // Prefer guest accommodation totals; enrich with matching host-side dated evidence.
  const selected = valid.find(c => !c.estimated) ?? valid[0];
  return { nights: dates.map((date, index) => ({ reservationId: reservation.id, date, amountPence: selected.amounts[index], estimated: selected.estimated })), fees: valid[0].fees };
}

export function analyseHistory(reservations: HistoryReservation[], input: HistoryInput, now = new Date()): HistoryReport {
  const asOfDate = now.toISOString().slice(0, 10);
  const inRange = reservations.filter(r => r.arrival <= input.endDate && r.departure > input.startDate);
  const profiles = new Map<string, HistoryProfile>();
  for (const r of inRange) {
    const year = Number(r.arrival.slice(0, 4));
    const key = `${r.propertyId ?? 'Unmapped'}:${year}`;
    const profile = profiles.get(key) ?? { propertyId: r.propertyId ?? 'Unmapped', year, reservations: 0, nights: 0, currencies: {}, statuses: {}, missingFinancials: 0, discrepancies: 0, datedNightlyLines: 0 };
    profile.reservations++; profile.nights += r.nights;
    profile.currencies[r.currency] = (profile.currencies[r.currency] ?? 0) + 1;
    const status = r.status?.trim().toLowerCase() || 'unknown';
    profile.statuses[status] = (Object.hasOwn(profile.statuses, status) ? profile.statuses[status] : 0) + 1;
    profile.missingFinancials += Number(!r.financials.length);
    profile.discrepancies += Number(r.financials.some(f => f.arithmeticStatus === 'discrepancy'));
    profile.datedNightlyLines += r.financials.flatMap(f => f.lines).filter(l => l.type === 'nightly_charge' && l.serviceDate).length;
    profiles.set(key, profile);
  }
  const relevant = inRange.filter(r => r.propertyId === input.propertyId);
  const exclusions: Record<string, number> = {};
  const nights: HistoryNight[] = [];
  const fees = new Map<string, number[]>();
  const captures: string[] = [];
  let includedReservations = 0;
  for (const r of relevant) {
    let reason = r.currency !== 'GBP' ? 'Non-GBP currency'
      : r.status?.trim().toLowerCase() !== 'confirmed' ? 'Cancelled or unknown status'
      : r.departure > asOfDate ? 'Stay has not ended' : null;
    const normalised = reason ? reason : normaliseHistoryReservation(r);
    if (typeof normalised === 'string') reason = normalised;
    if (reason || typeof normalised === 'string') { exclusions[reason!] = (exclusions[reason!] ?? 0) + 1; continue; }
    includedReservations++;
    captures.push(r.capturedAt);
    nights.push(...normalised.nights.filter(n => n.date >= input.startDate && n.date <= input.endDate));
    const reservationFees = new Map<string, number>();
    for (const fee of normalised.fees) reservationFees.set(fee.type, (reservationFees.get(fee.type) ?? 0) + fee.amountPence);
    for (const [type, amount] of reservationFees) fees.set(type, [...(fees.get(type) ?? []), amount]);
  }
  const matches = (date: string, range: HistoryRange) => date >= range.start && date <= range.end;
  const regular = nights.filter(n => !input.exceptions.some(e => e.historical.some(r => matches(n.date, r))));
  const rows: HistoryRow[] = [];
  function row(period: string, dayType: HistoryRow['dayType'], target: HistoryRange, sample: HistoryNight[], fallback?: HistoryStatistics): HistoryRow {
    const observed = historyStatistics(sample);
    const statistics = !observed.supported && fallback?.supported ? fallback : observed;
    const baselinePence = statistics.supported ? statistics.medianPence : null;
    const suggestedPounds = baselinePence === null ? null : baselinePence * (100 + input.upliftPercent) / 10000;
    return { period, dayType, target, statistics, baselinePence,
      suggestedPence: suggestedPounds === null ? null : Math.round(suggestedPounds + Math.abs(suggestedPounds) * Number.EPSILON) * 100,
      evidence: observed.supported ? 'Supported historical baseline' : baselinePence !== null ? 'Monthly baseline fallback' : 'Insufficient history',
      referencePence: null, referenceLabel: null };
  }
  for (let month = 1; month <= 12; month++) {
    const monthText = String(month).padStart(2, '0');
    const target = { start: `${input.targetYear}-${monthText}-01`, end: new Date(Date.UTC(input.targetYear, month, 0)).toISOString().slice(0, 10) };
    const sample = regular.filter(n => Number(n.date.slice(5, 7)) === month);
    const pooled = historyStatistics(sample);
    const period = new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' }).format(new Date(target.start));
    for (const dayType of ['Weekday', 'Weekend'] as const) {
      const exact = sample.filter(n => !n.estimated && ([5, 6].includes(new Date(n.date).getUTCDay()) === (dayType === 'Weekend')));
      rows.push(row(period, dayType, target, exact, pooled));
    }
  }
  for (const exception of input.exceptions) {
    const sample = nights.filter(n => exception.historical.some(r => matches(n.date, r)));
    const exceptionRow = row(exception.name, 'All nights', exception.target, sample);
    const month = Number(exception.target.start.slice(5, 7));
    const reference = historyStatistics(regular.filter(n => Number(n.date.slice(5, 7)) === month));
    if (!exceptionRow.statistics.supported && reference.supported) {
      exceptionRow.referencePence = reference.medianPence;
      exceptionRow.referenceLabel = `Monthly baseline for ${exception.target.start.slice(0, 7)} (reference only)`;
    }
    rows.push(exceptionRow);
  }
  captures.sort();
  return { input, methodVersion: HISTORY_METHOD_VERSION, calculatedAt: now.toISOString(), asOfDate,
    sourceCapturedFrom: captures[0] ?? null, sourceCapturedTo: captures.at(-1) ?? null,
    profile: [...profiles.values()].sort((a, b) => a.propertyId.localeCompare(b.propertyId) || a.year - b.year),
    consideredReservations: relevant.length, includedReservations, exclusions, rows,
    yearly: [...new Set(nights.map(n => Number(n.date.slice(0, 4))))].sort().map(year => ({ year, statistics: historyStatistics(nights.filter(n => Number(n.date.slice(0, 4)) === year)) })),
    fees: [...fees].map(([type, amounts]) => ({ type, reservations: amounts.length, totalPence: amounts.reduce((a, b) => a + b, 0), medianPence: percentile(amounts, 0.5)! })) };
}
