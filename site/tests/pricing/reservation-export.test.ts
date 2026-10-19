import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReservationArchive } from '../../src/lib/pricing/reservation-export.ts';
import { FINANCIAL_LINE_COLUMNS, RESERVATION_INDEX_COLUMNS } from '../../src/lib/pricing/reservation-export-columns.ts';
import { RESERVATION_EXPORT_MAX_BYTES, RESERVATION_EXPORT_MAX_RESERVATIONS, ReservationExportLimitError } from '../../src/lib/pricing/reservation-export-types.ts';
import { parseExportCsv, readReservationArchive, reservationExportFixture } from './reservation-export-fixtures.ts';

const now = new Date('2026-10-19T12:00:00Z');
const archive = (r = reservationExportFixture()) => readReservationArchive(buildReservationArchive([r], now, ['main-house']).archive);

test('individual CSVs and combined data contain every original line exactly once', () => {
  const a = reservationExportFixture(1), b = reservationExportFixture(2);
  const before = JSON.stringify([a, b]);
  const result = buildReservationArchive([a, b], now, ['main-house']);
  const files = readReservationArchive(result.archive);
  assert.equal(Object.keys(files).length, 5);
  const combined = parseExportCsv(files['financial-lines.csv']);
  const individual = [a, b].flatMap(r => parseExportCsv(files[`reservations/${r.reservation_id}.csv`]));
  assert.deepEqual(combined, individual);
  assert.equal(combined.length, [a, b].flatMap(r => r.panels).flatMap(p => p.lines).length);
  assert.equal(result.financialLineCount, combined.length);
  assert.equal(result.reservationCount, 2);
  assert.equal(new Set(combined.map(r => `${r.reservation_id}:${r.financial_line_id}`)).size, combined.length);
  assert.ok(Object.values(files).every(f => f.startsWith('\uFEFF')));
  assert.equal(JSON.stringify([a, b]), before);
});

test('parents, detail, totals and perspectives have explicit, independently reconciled roles', () => {
  const rows = parseExportCsv(archive()['financial-lines.csv']);
  for (const perspective of ['guest_paid', 'host_earnings']) {
    const panel = rows.filter(r => r.perspective === perspective);
    const sum = panel.filter(r => r.contributes_to_panel_total === 'true').reduce((s, r) => s + BigInt(r.amount_minor), 0n);
    assert.equal(sum.toString(), panel[0].panel_total_minor);
    assert.ok(panel.every(r => r.calculated_panel_total_minor === sum.toString() && r.calculated_arithmetic_difference_minor === '0'));
    assert.equal(panel.filter(r => r.panel_raw_display_text).length, 1);
    assert.ok(panel.filter(r => r.financial_role === 'panel_total').every(r => r.contributes_to_panel_total === 'false'));
  }
  const detail = rows.find(r => r.hierarchy_depth === '1')!;
  assert.equal(detail.financial_role, 'component_detail');
  assert.equal(detail.contributes_to_panel_total, 'false');
  assert.equal(rows.find(r => r.financial_line_id === detail.parent_line_id)!.has_children, 'true');
});

test('exact large amounts, negative currency values and fractional source quantities remain numeric', () => {
  const r = reservationExportFixture();
  const line = r.panels[0].lines[0];
  line.amount_minor = '9007199254740993123'; line.unit_amount_minor = '-1'; line.quantity = '1.250000';
  const files = archive(r), rows = parseExportCsv(files['financial-lines.csv']);
  const found = rows.find(row => row.financial_line_id === `line_${line.id}`)!;
  assert.equal(found.amount_minor, '9007199254740993123');
  assert.equal(found.amount_decimal, '90071992547409931.23');
  assert.equal(found.unit_amount_minor, '-1'); assert.equal(found.unit_amount_decimal, '-0.01');
  assert.equal(found.quantity, '1.250000');
  assert.equal(found.escaped_text_columns, '');
  assert.ok(found.quality_flags.includes('calculated_panel_discrepancy'));
});

test('original multiline text is recoverable, formulas are neutralised and apostrophes stay distinguishable', () => {
  const r = reservationExportFixture(); const line = r.panels[0].lines[0];
  line.description = '=HYPERLINK("example")'; line.raw_display_text = '-£9.00\n"Original, detail"';
  const rows = parseExportCsv(archive(r)['financial-lines.csv']);
  const found = rows.find(row => row.financial_line_id === `line_${line.id}`)!;
  for (const field of ['description', 'line_raw_display_text'] as const) {
    assert.ok(found.escaped_text_columns.split(';').includes(field));
    assert.equal(found[field].slice(1), line[field === 'description' ? 'description' : 'raw_display_text']);
  }
  line.description = "'=HYPERLINK";
  const originalApostrophe = parseExportCsv(archive(r)['financial-lines.csv']).find(row => row.financial_line_id === `line_${line.id}`)!;
  assert.equal(originalApostrophe.description, line.description);
  assert.ok(!originalApostrophe.escaped_text_columns.split(';').includes('description'));
});

test('all statuses, future dates, unmapped listings and zero prices are retained', () => {
  const records = [1, 2, 3, 4].map(reservationExportFixture);
  records[0].source_status_text = 'Cancelled';
  records[1].source_status_text = null; records[1].property_id = null;
  records[2].arrival = '2027-01-01'; records[2].departure = '2027-01-08';
  records[3].panels = []; records[3].headline_host_total_minor = '0'; records[3].booking_date = null; records[3].pets = 0;
  const files = readReservationArchive(buildReservationArchive(records, now).archive);
  const index = parseExportCsv(files['reservations.csv']);
  assert.equal(index.length, 4);
  assert.equal(index.find(r => r.reservation_id === records[0].reservation_id)!.normalised_status, 'cancelled');
  const unknown = index.find(r => r.reservation_id === records[1].reservation_id)!;
  assert.ok(unknown.quality_flags.includes('unmapped_listing'));
  assert.equal(unknown.normalised_status, 'unknown');
  assert.equal(index.find(r => r.reservation_id === records[2].reservation_id)!.stay_phase, 'future');
  const empty = index.find(r => r.reservation_id === records[3].reservation_id)!;
  assert.equal(empty.booking_lead_days, ''); assert.equal(empty.pets, '0');
  assert.equal(empty.headline_host_total_decimal, '0.00'); assert.equal(empty.host_total_minor, '');
  const placeholder = parseExportCsv(files[`reservations/${records[3].reservation_id}.csv`]);
  assert.equal(placeholder.length, 1); assert.equal(placeholder[0].row_kind, 'reservation_only');
  assert.equal(placeholder[0].amount_minor, '');
});

test('panels without lines retain reported totals, raw evidence and blank independent arithmetic', () => {
  const r = reservationExportFixture(); r.panels = [r.panels[0]]; r.panels[0].lines = [];
  const row = parseExportCsv(archive(r)['financial-lines.csv'])[0];
  assert.equal(row.row_kind, 'summary_only'); assert.equal(row.panel_total_minor, r.panels[0].total_minor);
  assert.equal(row.panel_raw_display_text, r.panels[0].raw_display_text);
  assert.equal(row.calculated_panel_total_minor, ''); assert.equal(row.calculated_arithmetic_difference_minor, '');
  assert.equal(row.source_arithmetic_difference_minor, ''); assert.equal(row.contributes_to_panel_total, 'false');
});

test('discrepancies, ambiguous item types and damaged hierarchies stay visible without normalisation', () => {
  const r = reservationExportFixture(); const p = r.panels[0], l = p.lines[0];
  p.arithmetic_status = 'discrepancy'; p.arithmetic_difference_minor = '123';
  l.item_type = 'other'; l.description = 'Unclassified imported charge'; l.parent_id = l.id;
  const row = parseExportCsv(archive(r)['financial-lines.csv']).find(row => row.financial_line_id === `line_${l.id}`)!;
  assert.equal(row.source_item_type, 'other'); assert.equal(row.description, l.description);
  assert.equal(row.hierarchy_depth, ''); assert.ok(row.quality_flags.includes('invalid_financial_hierarchy'));
  assert.equal(row.source_arithmetic_difference_minor, '123'); assert.ok(row.quality_flags.includes('source_arithmetic_discrepancy'));
});

test('unknown currency scale retains exact integers and never invents a decimal conversion', () => {
  const r = reservationExportFixture(); r.currency = 'ZZZ'; r.panels[0].currency = 'ZZZ';
  const files = archive(r), index = parseExportCsv(files['reservations.csv'])[0];
  assert.equal(index.headline_host_total_minor, '77500'); assert.equal(index.headline_host_total_decimal, '');
  const row = parseExportCsv(files['financial-lines.csv']).find(r => r.perspective === 'guest_paid')!;
  assert.equal(row.amount_minor, '80000'); assert.equal(row.amount_decimal, '');
  assert.ok(row.quality_flags.includes('unknown_currency_scale'));
});

test('London calendar phase and booking lead dates are explicit, with negative lead retained', () => {
  const r = reservationExportFixture(); r.arrival = '2026-07-01'; r.departure = '2026-07-02'; r.booking_date = '2026-07-03';
  const files = readReservationArchive(buildReservationArchive([r], new Date('2026-07-01T23:30:00Z')).archive);
  const index = parseExportCsv(files['reservations.csv'])[0];
  assert.equal(index.stay_phase, 'past'); assert.equal(index.booking_lead_days, '-2');
  assert.ok(index.quality_flags.includes('booking_after_arrival'));
  assert.equal(index.arrival_weekday, 'Wednesday');
});

test('original timestamp fractions survive UTC conversion without millisecond truncation', () => {
  const r = reservationExportFixture();
  r.source_captured_at = '2026-09-01T01:00:00.123456+01:00';
  r.panels[0].captured_at = '2026-09-01T00:00:00.654321Z';
  r.panels[0].lines[0].created_at = '2026-09-01T00:00:00.000001Z';
  const files = archive(r);
  assert.equal(parseExportCsv(files['reservations.csv'])[0].source_captured_at, '2026-09-01T00:00:00.123456Z');
  const row = parseExportCsv(files['financial-lines.csv']).find(row => row.financial_line_id === `line_${r.panels[0].lines[0].id}`)!;
  assert.equal(row.panel_captured_at, '2026-09-01T00:00:00.654321Z');
  assert.equal(row.line_created_at, '2026-09-01T00:00:00.000001Z');
});

test('column guide covers every heading and explains the repeated-total aggregation rule', () => {
  const guide = parseExportCsv(archive()['columns.csv']);
  for (const [dataset, columns] of [['reservations.csv', RESERVATION_INDEX_COLUMNS], ['financial-lines.csv and reservations/*.csv', FINANCIAL_LINE_COLUMNS]] as const) {
    assert.equal(new Set(columns.map(c => c.name)).size, columns.length);
    for (const c of columns) {
      const entry = guide.find(g => g.dataset === dataset && g.column === c.name);
      assert.ok(entry?.meaning); assert.ok(entry?.data_type); assert.ok(entry?.aggregation_rule);
    }
  }
  assert.match(guide.find(g => g.column === 'panel_total_minor')!.aggregation_rule, /Never sum/);
});

test('oversized exports and unsafe or duplicate entry names fail rather than truncating', () => {
  const r = reservationExportFixture();
  assert.throws(() => buildReservationArchive(Array(RESERVATION_EXPORT_MAX_RESERVATIONS + 1).fill(r), now), ReservationExportLimitError);
  assert.throws(() => buildReservationArchive([r, r], now), /duplicate/);
  assert.throws(() => buildReservationArchive([{ ...r, reservation_id: '../../outside' }], now), /identity/);
  r.panels[0].raw_display_text = 'x'.repeat(RESERVATION_EXPORT_MAX_BYTES + 1);
  assert.throws(() => buildReservationArchive([r], now), ReservationExportLimitError);
});
