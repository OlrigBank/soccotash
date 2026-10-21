export interface ExportColumn { name: string; type: string; meaning: string; aggregation: string }
const column = (name: string, type: string, meaning: string, aggregation = 'Not additive') => ({ name, type, meaning, aggregation });
const text = (name: string, meaning: string) => column(name, 'text', meaning);
const money = (name: string, meaning: string, aggregation?: string) => column(name, 'exact signed integer', meaning, aggregation);
const decimal = (name: string, meaning: string, aggregation?: string) => column(name, 'exact signed decimal', meaning, aggregation);
const date = (name: string, meaning: string) => column(name, 'ISO date', meaning);
const timestamp = (name: string, meaning: string) => column(name, 'UTC timestamp', meaning);
const count = (name: string, meaning: string, aggregation?: string) => column(name, 'integer', meaning, aggregation);
export const RESERVATION_CONTEXT_COLUMNS: ExportColumn[] = [
  text('reservation_id', 'Stable reservation public UUID; joins every dataset.'),
  text('confirmation_code', 'Original Airbnb confirmation code, if captured. Import as text.'),
  text('property_id', 'Stored listing mapping; blank where unmapped.'),
  text('source_listing_name', 'Listing name displayed by the source.'),
  text('source_status_text', 'Original reservation status; blank remains unknown.'),
  date('arrival', 'First stay date.'), date('departure', 'Exclusive departure date; not a stayed night.'),
  count('nights', 'Original number of stay nights; repeated financial-row values must not be summed.'),
];
export const EXPORT_PROVENANCE_COLUMNS: ExportColumn[] = [
  timestamp('exported_at', 'One common timestamp for this entire archive.'),
  text('export_schema_version', 'Version of the export columns and interpretation.'),
  text('escaped_text_columns', 'Semicolon-separated names of text cells prefixed with one apostrophe for spreadsheet safety. Remove that one apostrophe only for these cells to recover source text.'),
];
export const RESERVATION_INDEX_COLUMNS: ExportColumn[] = [
  ...RESERVATION_CONTEXT_COLUMNS,
  text('normalised_status', 'confirmed, cancelled or unknown; original status is retained separately.'),
  text('stay_phase', 'past, in_progress or future against the export date in Europe/London; does not prove occupancy.'),
  text('check_in_time', 'Original local arrival time, where captured.'), text('check_out_time', 'Original local departure time, where captured.'),
  date('booking_date', 'Original booking date, if captured.'), count('booking_lead_days', 'Arrival minus booking date in calendar days; blank if unknown. Negative values are retained and flagged.'),
  count('arrival_year', 'Calendar year of arrival.'), count('arrival_month', 'Calendar month of arrival (1–12).'),
  text('arrival_weekday', 'Arrival weekday in British English.'), text('departure_weekday', 'Departure weekday in British English.'),
  ...['party_size', 'adults', 'children', 'infants', 'pets'].map(n => count(n, `Original ${n.replaceAll('_', ' ')}; missing stays blank, zero stays zero.`)),
  text('cancellation_policy', 'Original cancellation-policy label.'), text('reservation_currency', 'Currency recorded on the reservation.'),
  count('reservation_minor_unit_scale', 'Established decimal scale for this currency; blank when unknown.'),
  money('headline_host_total_minor', 'Original reservation headline host total in minor units.'), decimal('headline_host_total_decimal', 'Headline host total in currency units, without conversion.'),
  ...['host', 'guest'].flatMap(p => [
    text(`${p}_currency`, `Currency of the ${p} panel; do not combine different currencies.`),
    count(`${p}_minor_unit_scale`, 'Established decimal scale; blank when unknown.'),
    money(`${p}_total_minor`, `Reported ${p} panel total.`, `Sum once per reservation within the same currency and ${p} perspective only.`),
    decimal(`${p}_total_decimal`, `Reported ${p} total in currency units.`, `Sum once per reservation within the same currency and ${p} perspective only.`),
    text(`${p}_arithmetic_status`, `Stored reconciliation status for the ${p} panel.`),
    money(`${p}_arithmetic_difference_minor`, 'Stored arithmetic difference; blank is not zero.'),
    decimal(`${p}_arithmetic_difference_decimal`, 'Stored arithmetic difference in currency units.'),
  ]),
  count('financial_summary_count', 'Number of stored financial panels.', 'Sum across distinct reservation index rows.'),
  count('financial_line_count', 'Number of original financial lines, including totals and parent/detail rows.', 'Sum across distinct reservation index rows.'),
  text('quality_flags', 'Semicolon-separated missing-data, hierarchy and reconciliation observations; no record is excluded.'),
  timestamp('source_captured_at', 'Reservation source capture timestamp.'), timestamp('reservation_updated_at', 'Last stored reservation update.'),
  ...EXPORT_PROVENANCE_COLUMNS,
];
export const FINANCIAL_LINE_COLUMNS: ExportColumn[] = [
  ...RESERVATION_CONTEXT_COLUMNS,
  text('row_kind', 'financial_line; summary_only for a panel with no lines; reservation_only when no panels exist.'),
  text('financial_summary_id', 'summary_<database id>, prefixed to prevent spreadsheet identifier truncation.'),
  text('perspective', 'host_earnings or guest_paid. These are separate views, not additive income streams.'),
  text('currency', 'Currency of this financial panel.'), count('currency_minor_unit_scale', 'Established decimal scale; blank when unknown.'),
  text('financial_line_id', 'line_<database id>; unique original line identity.'), text('parent_line_id', 'Prefixed original parent-line identity, if any.'),
  count('line_position', 'Original zero-based position within the financial panel.'),
  text('source_item_type', 'Unmodified stored type, including accommodation, nightly_charge, adjustment, fees, tax, total and other.'),
  text('description', 'Original financial-line description.'), date('service_date', 'Original dated charge/adjustment date, where captured; never estimated.'),
  decimal('quantity', 'Original decimal quantity; never inferred.'),
  money('unit_amount_minor', 'Original unit amount in minor units; never inferred.'), decimal('unit_amount_decimal', 'Original unit amount in currency units.'),
  money('amount_minor', 'Original signed line amount in minor units.', 'Sum only rows with contributes_to_panel_total=true, grouped by summary and currency. Never add parents and children.'),
  decimal('amount_decimal', 'Original signed amount in currency units.', 'Same aggregation rule as amount_minor; negative amounts remain numeric.'),
  count('hierarchy_depth', 'Zero for roots; parent-chain depth for details. Blank for invalid chains or placeholders.'),
  column('has_children', 'boolean', 'Whether this original line has stored child lines.'),
  text('financial_role', 'panel_total, component or component_detail. Blank for placeholder rows.'),
  column('contributes_to_panel_total', 'boolean', 'True only for a root financial component whose source type is not total.'),
  money('panel_total_minor', 'Reported panel total repeated on each panel row.', 'Never sum repeated panel totals; use the reservation index or one row per financial_summary_id.'),
  decimal('panel_total_decimal', 'Repeated reported panel total in currency units.'),
  money('calculated_panel_total_minor', 'Independent sum of root components excluding displayed total lines. Blank if no components exist.'),
  text('source_arithmetic_status', 'Original stored arithmetic status.'),
  money('source_arithmetic_difference_minor', 'Original stored arithmetic difference; blank stays blank.'),
  money('calculated_arithmetic_difference_minor', 'Reported panel total minus independently calculated component sum; blank if not determinable.'),
  text('line_raw_display_text', 'Original financial-line display text, preserving punctuation and embedded line breaks.'),
  text('panel_raw_display_text', 'Original panel display text, populated once on the first exported row of that panel.'),
  text('quality_flags', 'Reservation and panel observations; records with discrepancies remain in the export.'),
  timestamp('reservation_captured_at', 'Reservation capture timestamp.'), timestamp('panel_captured_at', 'Financial-panel capture timestamp.'),
  timestamp('line_created_at', 'Timestamp when the original financial line was stored.'),
  ...EXPORT_PROVENANCE_COLUMNS,
];
