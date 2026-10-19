import { zipSync, strToU8, type Zippable } from 'fflate';
import { FINANCIAL_LINE_COLUMNS, RESERVATION_INDEX_COLUMNS, type ExportColumn } from './reservation-export-columns.ts';
import { ReservationExportLimitError, RESERVATION_EXPORT_MAX_BYTES, RESERVATION_EXPORT_MAX_RESERVATIONS, RESERVATION_EXPORT_SCHEMA_VERSION, type ReservationExportSource, type ReservationExportPanel, type ReservationExportLine } from './reservation-export-types.ts';

interface ExactNumber { numeric: string }
type Cell = string | number | boolean | null | ExactNumber;
type Row = Record<string, Cell>;
// The imported monetary model is established for these currencies. Others keep exact minor units only.
const SCALES: Record<string, number> = { GBP: 2, EUR: 2, USD: 2 };
const scale = (currency: string) => Object.hasOwn(SCALES, currency) ? SCALES[currency] : null;
const numeric = (value: string | null): Cell => value === null ? null : /^-?\d+(?:\.\d+)?$/.test(value) ? { numeric: value } : value;
export function exportMoneyDecimal(value: string | null, currency: string): Cell {
  const places = scale(currency);
  if (value === null || places === null) return null;
  const amount = BigInt(value), negative = amount < 0n;
  const digits = (negative ? -amount : amount).toString().padStart(places + 1, '0');
  return { numeric: `${negative ? '-' : ''}${places ? `${digits.slice(0, -places)}.${digits.slice(-places)}` : digits}` };
}
const iso = (value: string) => {
  // Preserve PostgreSQL microseconds while converting the offset to UTC.
  const fraction = value.match(/\.(\d+)(?:Z|[+-]\d{2}(?::?\d{2})?)$/)?.[1];
  return new Date(value).toISOString().slice(0, 19) + (fraction ? `.${fraction}` : '') + 'Z';
};
function londonDate(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)!.value).join('-');
}
const difference = (end: string, start: string) => Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000);
const weekday = (date: string) => new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' }).format(new Date(date));
const status = (value: string | null) => ['confirmed', 'cancelled'].includes(value?.trim().toLowerCase() ?? '') ? value!.trim().toLowerCase() : 'unknown';

export function exportCsvRow(columns: readonly ExportColumn[], row: Row): string {
  const escaped = columns.filter(c => typeof row[c.name] === 'string' && /^[\s]*[=+@-]/u.test(row[c.name] as string)).map(c => c.name);
  const withEscapes: Row = { ...row, escaped_text_columns: escaped.join(';') };
  return columns.map(c => {
    const value = withEscapes[c.name];
    const text = value === null || value === undefined ? '' : typeof value === 'object' ? value.numeric : String(value);
    return `"${(escaped.includes(c.name) ? "'" + text : text).replaceAll('"', '""')}"`;
  }).join(',') + '\r\n';
}
const csvHeader = (columns: readonly ExportColumn[]) => '\uFEFF' + columns.map(c => `"${c.name}"`).join(',') + '\r\n';

function lineDepth(line: ReservationExportLine, lines: Map<string, ReservationExportLine>): number | null {
  const visited = new Set([line.id]);
  let parent = line.parent_id, depth = 0;
  while (parent !== null) {
    if (visited.has(parent) || !lines.has(parent)) return null;
    visited.add(parent); depth++;
    parent = lines.get(parent)!.parent_id;
  }
  return depth;
}
function panelDetails(panel: ReservationExportPanel) {
  const roots = panel.lines.filter(l => l.parent_id === null && l.item_type !== 'total');
  const calculated = roots.length ? roots.reduce((sum, l) => sum + BigInt(l.amount_minor), 0n).toString() : null;
  const delta = calculated === null ? null : (BigInt(panel.total_minor) - BigInt(calculated)).toString();
  const lines = new Map(panel.lines.map(l => [l.id, l]));
  const flags: string[] = [];
  if (!panel.lines.length) flags.push('missing_financial_lines');
  if (calculated === null) flags.push('no_panel_components');
  if (panel.arithmetic_status !== 'verified') flags.push(`source_arithmetic_${panel.arithmetic_status}`);
  if (delta !== null && delta !== '0') flags.push('calculated_panel_discrepancy');
  if (panel.lines.some(l => l.item_type === 'total' && l.amount_minor !== panel.total_minor)) flags.push('displayed_total_discrepancy');
  if (scale(panel.currency) === null) flags.push('unknown_currency_scale');
  if (panel.lines.some(l => lineDepth(l, lines) === null)) flags.push('invalid_financial_hierarchy');
  if (panel.lines.some(l => l.quantity !== null && !/^-?\d+(?:\.\d+)?$/.test(l.quantity))) flags.push('non_finite_quantity');
  return { calculated, delta, lines, flags };
}
function reservationFlags(r: ReservationExportSource, knownIds: readonly string[]): string[] {
  const flags: string[] = [];
  if (status(r.source_status_text) === 'unknown') flags.push('unknown_status');
  if (!r.property_id || (knownIds.length && !knownIds.includes(r.property_id))) flags.push('unmapped_listing');
  if (!r.booking_date) flags.push('missing_booking_date');
  if (r.booking_date && difference(r.arrival, r.booking_date) < 0) flags.push('booking_after_arrival');
  if (!r.panels.length) flags.push('missing_financial_panels');
  if (scale(r.currency) === null) flags.push('unknown_reservation_currency_scale');
  return [...new Set([...flags, ...r.panels.flatMap(p => panelDetails(p).flags)])];
}
function context(r: ReservationExportSource): Row {
  return { reservation_id: r.reservation_id, confirmation_code: r.confirmation_code, property_id: r.property_id,
    source_listing_name: r.source_listing_name, source_status_text: r.source_status_text, arrival: r.arrival, departure: r.departure, nights: r.nights };
}
function financialRows(r: ReservationExportSource, common: Row, flags: string[]): Row[] {
  const base: Row = { ...context(r), ...common, reservation_captured_at: iso(r.source_captured_at), quality_flags: flags.join(';') };
  if (!r.panels.length) return [{ ...base, row_kind: 'reservation_only', contributes_to_panel_total: false }];
  return [...r.panels].sort((a, b) => a.perspective.localeCompare(b.perspective)).flatMap(panel => {
    const detail = panelDetails(panel);
    const panelRow: Row = { ...base, financial_summary_id: `summary_${panel.id}`, perspective: panel.perspective,
      currency: panel.currency, currency_minor_unit_scale: scale(panel.currency),
      panel_total_minor: numeric(panel.total_minor), panel_total_decimal: exportMoneyDecimal(panel.total_minor, panel.currency),
      calculated_panel_total_minor: numeric(detail.calculated), source_arithmetic_status: panel.arithmetic_status,
      source_arithmetic_difference_minor: numeric(panel.arithmetic_difference_minor), calculated_arithmetic_difference_minor: numeric(detail.delta),
      panel_captured_at: iso(panel.captured_at) };
    if (!panel.lines.length) return [{ ...panelRow, row_kind: 'summary_only', panel_raw_display_text: panel.raw_display_text, contributes_to_panel_total: false }];
    const parents = new Set(panel.lines.map(l => l.parent_id).filter(Boolean));
    return [...panel.lines].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)).map((line, i): Row => ({
      ...panelRow, row_kind: 'financial_line', financial_line_id: `line_${line.id}`, parent_line_id: line.parent_id === null ? null : `line_${line.parent_id}`,
      line_position: line.position, source_item_type: line.item_type, description: line.description, service_date: line.service_date,
      quantity: numeric(line.quantity), unit_amount_minor: numeric(line.unit_amount_minor), unit_amount_decimal: exportMoneyDecimal(line.unit_amount_minor, panel.currency),
      amount_minor: numeric(line.amount_minor), amount_decimal: exportMoneyDecimal(line.amount_minor, panel.currency),
      hierarchy_depth: lineDepth(line, detail.lines), has_children: parents.has(line.id),
      financial_role: line.item_type === 'total' ? 'panel_total' : line.parent_id === null ? 'component' : 'component_detail',
      contributes_to_panel_total: line.parent_id === null && line.item_type !== 'total',
      line_raw_display_text: line.raw_display_text, panel_raw_display_text: i === 0 ? panel.raw_display_text : null, line_created_at: iso(line.created_at),
    }));
  });
}

/** No files are persisted: all archive entries share a schema, snapshot and timestamp. */
export function buildReservationArchive(source: ReservationExportSource[], now = new Date(), knownPropertyIds: readonly string[] = []) {
  if (source.length > RESERVATION_EXPORT_MAX_RESERVATIONS) throw new ReservationExportLimitError('There are too many reservations to export in one archive.');
  const common: Row = { exported_at: now.toISOString(), export_schema_version: RESERVATION_EXPORT_SCHEMA_VERSION };
  const asOf = londonDate(now);
  const files: Zippable = {};
  let bytes = 0, financialLineCount = 0;
  const add = (name: string, content: string) => {
    const data = strToU8(content); bytes += data.length;
    if (bytes > RESERVATION_EXPORT_MAX_BYTES) throw new ReservationExportLimitError('The reservation evidence is too large to export in one archive.');
    files[name] = data;
  };
  const index: string[] = [csvHeader(RESERVATION_INDEX_COLUMNS)];
  const combined: string[] = [csvHeader(FINANCIAL_LINE_COLUMNS)];
  const identities = new Set<string>();
  for (const r of [...source].sort((a, b) => a.arrival.localeCompare(b.arrival) || a.reservation_id.localeCompare(b.reservation_id))) {
    if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(r.reservation_id) || identities.has(r.reservation_id)) throw new Error('Invalid or duplicate export reservation identity.');
    identities.add(r.reservation_id);
    const flags = reservationFlags(r, knownPropertyIds);
    const record: Row = { ...context(r), ...common, normalised_status: status(r.source_status_text),
      stay_phase: r.departure <= asOf ? 'past' : r.arrival > asOf ? 'future' : 'in_progress',
      check_in_time: r.check_in_time, check_out_time: r.check_out_time, booking_date: r.booking_date,
      booking_lead_days: r.booking_date === null ? null : difference(r.arrival, r.booking_date),
      arrival_year: Number(r.arrival.slice(0, 4)), arrival_month: Number(r.arrival.slice(5, 7)), arrival_weekday: weekday(r.arrival), departure_weekday: weekday(r.departure),
      party_size: r.party_size, adults: r.adults, children: r.children, infants: r.infants, pets: r.pets, cancellation_policy: r.cancellation_policy,
      reservation_currency: r.currency, reservation_minor_unit_scale: scale(r.currency), headline_host_total_minor: numeric(r.headline_host_total_minor), headline_host_total_decimal: exportMoneyDecimal(r.headline_host_total_minor, r.currency),
      financial_summary_count: r.panels.length, financial_line_count: r.panels.reduce((sum, p) => sum + p.lines.length, 0),
      quality_flags: flags.join(';'), source_captured_at: iso(r.source_captured_at), reservation_updated_at: iso(r.updated_at),
    };
    for (const [prefix, perspective] of [['host', 'host_earnings'], ['guest', 'guest_paid']] as const) {
      const panel = r.panels.find(p => p.perspective === perspective);
      if (!panel) { flags.push(`missing_${prefix}_panel`); continue; }
      Object.assign(record, { [`${prefix}_currency`]: panel.currency, [`${prefix}_minor_unit_scale`]: scale(panel.currency),
        [`${prefix}_total_minor`]: numeric(panel.total_minor), [`${prefix}_total_decimal`]: exportMoneyDecimal(panel.total_minor, panel.currency),
        [`${prefix}_arithmetic_status`]: panel.arithmetic_status, [`${prefix}_arithmetic_difference_minor`]: numeric(panel.arithmetic_difference_minor),
        [`${prefix}_arithmetic_difference_decimal`]: exportMoneyDecimal(panel.arithmetic_difference_minor, panel.currency) });
    }
    record.quality_flags = flags.join(';');
    index.push(exportCsvRow(RESERVATION_INDEX_COLUMNS, record));
    const rows = financialRows(r, common, flags).map(row => exportCsvRow(FINANCIAL_LINE_COLUMNS, row));
    financialLineCount += r.panels.reduce((sum, p) => sum + p.lines.length, 0);
    add(`reservations/${r.reservation_id}.csv`, csvHeader(FINANCIAL_LINE_COLUMNS) + rows.join(''));
    combined.push(...rows);
  }
  add('reservations.csv', index.join(''));
  add('financial-lines.csv', combined.join(''));
  const guideColumns = ['dataset', 'column', 'data_type', 'meaning', 'aggregation_rule'].map(name => ({ name, type: 'text', meaning: '', aggregation: '' }));
  const guide = [csvHeader(guideColumns)];
  for (const [dataset, columns] of [['reservations.csv', RESERVATION_INDEX_COLUMNS], ['financial-lines.csv and reservations/*.csv', FINANCIAL_LINE_COLUMNS]] as const) {
    for (const c of columns) guide.push(exportCsvRow(guideColumns, { dataset, column: c.name, data_type: c.type, meaning: c.meaning, aggregation_rule: c.aggregation }));
  }
  guide.push(exportCsvRow(guideColumns, { dataset: 'all', column: '(format)', data_type: 'UTF-8 CSV with BOM', meaning: 'One rectangular table per CSV. Blank means missing, never zero. Date-only fields have no timezone. Export phase uses Europe/London. Established currency scales: GBP/EUR/USD=2; other currencies retain integer minor units with blank decimal values and a flag. Import identifiers as text. No pricing eligibility filters, inferred nightly allocations or currency conversion.', aggregation_rule: 'Choose one perspective and currency; filter contributes_to_panel_total=true for original panel component sums. Both parent and child evidence are retained, so summing every amount is incorrect.' }));
  add('columns.csv', guide.join(''));
  return { archive: zipSync(files, { level: 1, mtime: now }), reservationCount: source.length, financialLineCount, filename: `airbnb-reservation-evidence-${asOf}.zip` };
}
