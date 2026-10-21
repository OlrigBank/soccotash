"""Synthetic, non-private regression coverage for the standalone generator."""
import copy
import csv
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import uuid
import zipfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
from reservation_analysis.model import (analyse, load_evidence, load_source, normalise_financial,
    normalise_reservation, statistics, percentile, SAFE_INTEGER)
from reservation_analysis.comparison import compare, read_workbook

spec = importlib.util.spec_from_file_location('generator_cli', ROOT / 'scripts/reservation_analysis.py')
cli = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cli)
HEADERS = json.loads((ROOT / 'scripts/reservation_analysis/layout.json').read_text())['headers']


def fixture(count=1, status='confirmed', amount=10001):
    """Build a complete public export fixture, independent of private snapshots."""
    reservations, lines = [], []
    for i in range(count):
        rid = str(uuid.uuid5(uuid.NAMESPACE_URL, f'https://example.test/reservation/{i}'))
        r = dict.fromkeys(HEADERS['Source stays'], '')
        r.update(reservation_id=rid, confirmation_code=f'TEST{i}', property_id='main-house',
            source_listing_name='Olrig Bank: Spacious, but cosy, with large garden', source_status_text=status.title(),
            normalised_status=status, arrival='2025-05-01', departure='2025-05-03', nights='2', stay_phase='past',
            cancellation_policy='Firm', arrival_year='2025', arrival_month='5', arrival_weekday='Thursday', departure_weekday='Saturday',
            reservation_currency='GBP', reservation_minor_unit_scale='2', guest_currency='GBP', guest_minor_unit_scale='2',
            guest_total_minor=str(amount), guest_total_decimal=f'{amount / 100:.2f}', guest_arithmetic_status='verified',
            financial_summary_count='1', financial_line_count='1', source_captured_at='2026-09-01T08:19:50.352Z',
            reservation_updated_at='2026-09-03T10:01:17.782799Z', exported_at='2026-10-19T19:26:18.233Z', export_schema_version='1.0')
        l = dict.fromkeys(HEADERS['Source lines'], '')
        for field in ['reservation_id', 'confirmation_code', 'property_id', 'source_listing_name', 'source_status_text', 'arrival', 'departure', 'nights', 'exported_at', 'export_schema_version']:
            l[field] = r[field]
        l.update(row_kind='financial_line', financial_summary_id=f'summary_{i}', perspective='guest_paid', currency='GBP',
            currency_minor_unit_scale='2', financial_line_id=f'line_{i}', line_position='0', source_item_type='accommodation',
            description='Accommodation', amount_minor=str(amount), amount_decimal=f'{amount / 100:.2f}', hierarchy_depth='0',
            has_children='false', financial_role='component', contributes_to_panel_total='true', panel_total_minor=str(amount),
            panel_total_decimal=f'{amount / 100:.2f}', calculated_panel_total_minor=str(amount), source_arithmetic_status='verified',
            calculated_arithmetic_difference_minor='0', reservation_captured_at=r['source_captured_at'], panel_captured_at=r['source_captured_at'],
            line_created_at=r['reservation_updated_at'])
        reservations.append(r); lines.append(l)
    return reservations, lines


def write_fixture(path, reservations, lines, mutate_individual=False):
    integer_fields = {'nights', 'booking_lead_days', 'arrival_year', 'arrival_month', 'party_size', 'adults', 'children', 'infants', 'pets', 'financial_summary_count', 'financial_line_count', 'hierarchy_depth', 'line_position'}
    dictionary = []
    for name, headers in [('reservations.csv', HEADERS['Source stays']), ('financial-lines.csv and reservations/*.csv', HEADERS['Source lines'])]:
        for field in headers:
            kind = 'integer' if field in integer_fields or field.endswith('_scale') or field.endswith('_minor') else 'exact signed decimal' if field.endswith('_decimal') or field == 'quantity' else 'UTC timestamp' if field.endswith('_at') else 'text'
            dictionary.append(dict(dataset=name, column=field, data_type=kind, meaning=field, aggregation_rule='Test fixture'))
    def encoded(headers, rows):
        stream = io.StringIO(newline=''); writer = csv.DictWriter(stream, fieldnames=headers, lineterminator='\r\n')
        writer.writeheader(); writer.writerows(rows)
        return '\ufeff' + stream.getvalue()
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('reservations.csv', encoded(HEADERS['Source stays'], reservations))
        z.writestr('financial-lines.csv', encoded(HEADERS['Source lines'], lines))
        z.writestr('columns.csv', encoded(HEADERS['Columns'], dictionary))
        for r in reservations:
            individual = [copy.deepcopy(l) for l in lines if l['reservation_id'] == r['reservation_id']]
            if mutate_individual and individual:
                individual[0]['description'] = 'Different evidence'
            z.writestr(f'reservations/{r["reservation_id"]}.csv', encoded(HEADERS['Source lines'], individual))


def line(identity, amount, kind='accommodation', parent=None, when=None, description='Accommodation'):
    return dict(id=identity, amountPence=amount, type=kind, parentId=parent, serviceDate=when, description=description)


def panel(lines, total=None, perspective='guest_paid'):
    return dict(lines=lines, totalPence=total if total is not None else sum(l['amountPence'] for l in lines if not l['parentId'] and l['type'] != 'total'),
                currency='GBP', arithmeticStatus='verified', perspective=perspective)


class FinancialTests(unittest.TestCase):
    dates = ['2025-05-01', '2025-05-02']

    def test_estimates_allocate_residual_penny_to_first_night(self):
        result = normalise_financial(panel([line('room', 10001)]), self.dates)
        self.assertEqual(result['amounts'], [5001, 5000]); self.assertTrue(result['estimated'])

    def test_dated_discounts_and_fees_are_separate(self):
        source = panel([line('room', 12000), line('d1', 5000, 'nightly_charge', 'room', self.dates[0]),
            line('d2', 7000, 'nightly_charge', 'room', self.dates[1]), line('discount', -1000, 'adjustment', description='Weekly discount'),
            line('a1', -400, 'adjustment', 'discount', self.dates[0], 'Weekly discount'), line('a2', -600, 'adjustment', 'discount', self.dates[1], 'Weekly discount'),
            line('fee', 1800, 'guest_service_fee')])
        result = normalise_financial(source, self.dates)
        self.assertEqual(result['amounts'], [4600, 6400]); self.assertFalse(result['estimated'])

    def test_multiple_distinct_discount_children_on_same_night(self):
        source = panel([line('room', 10000), line('r1', 5000, 'nightly_charge', 'room', self.dates[0]), line('r2', 5000, 'nightly_charge', 'room', self.dates[1]),
            line('discount', -300, 'adjustment', description='Weekly discount'), line('a1', -100, 'adjustment', 'discount', self.dates[0], 'Weekly discount'),
            line('a2', -200, 'adjustment', 'discount', self.dates[0], 'Early-bird discount')])
        self.assertEqual(normalise_financial(source, self.dates)['amounts'], [4700, 5000])

    def test_undated_discount_makes_entire_allocation_estimated(self):
        source = panel([line('room', 10000), line('r1', 4000, 'nightly_charge', 'room', self.dates[0]), line('r2', 6000, 'nightly_charge', 'room', self.dates[1]), line('discount', -1000, 'adjustment', description='Weekly discount')])
        self.assertEqual(normalise_financial(source, self.dates)['amounts'], [4500, 4500])

    def test_rejects_invalid_hierarchies_and_arithmetic(self):
        cases = [([line('x', 100), line('x', 100)], None, 'Invalid financial hierarchy'),
                 ([line('x', 100, parent='absent')], 100, 'Invalid financial hierarchy'),
                 ([line('x', 100)], 99, 'Financial reconciliation discrepancy'),
                 ([line('x', 0)], None, 'Non-positive accommodation charge'),
                 ([line('x', 100, 'other', description='Total Stay Price')], None, 'Missing accommodation charges'),
                 ([line('x', 100), line('d', 100, 'nightly_charge', 'x', self.dates[0])], None, 'Incomplete accommodation nightly breakdown')]
        for lines, total, reason in cases:
            with self.subTest(reason=reason): self.assertEqual(normalise_financial(panel(lines, total), self.dates), reason)

    def test_conflicting_panels_are_not_silently_selected(self):
        r = dict(reservation_id='test', arrival=self.dates[0], departure='2025-05-03', nights='2')
        self.assertEqual(normalise_reservation(r, [panel([line('a', 100)]), panel([line('b', 101)], perspective='host_earnings')]), 'Conflicting accommodation figures')
        self.assertEqual(normalise_reservation(r, [panel([line('a', 100)]), panel([line('b', 100)])]), 'Duplicate financial perspective')
        self.assertEqual(normalise_reservation(dict(r, nights='3'), []), 'Invalid stay dates')

    def test_statistics_threshold_and_linear_quartiles(self):
        self.assertEqual(percentile([100, 200, 300, 400], .25), 175)
        nights = [dict(reservationId=str(i % 5), date=f'{2024+i%2}-05-{i+1:02}', amountPence=10001, estimated=True) for i in range(20)]
        self.assertTrue(statistics(nights)['supported'])
        self.assertFalse(statistics(nights[:19])['supported'])


class GeneratorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name); self.source = self.base / 'evidence.zip'

    def make(self, count=1, status='confirmed'):
        rows, lines = fixture(count, status)
        write_fixture(self.source, rows, lines)
        return rows, lines

    def test_dynamic_sizes_empty_unknown_and_no_eligible_samples(self):
        for count, status in [(1, 'confirmed'), (32, 'unknown'), (2, 'cancelled')]:
            self.make(count, status)
            output = self.base / f'analysis-{count}.xlsx'
            result = cli.generate(self.source, None, output, reservation_csv_dir=None)
            self.assertEqual(result['eligible_reservations'], count if status == 'confirmed' else 0)
            w = read_workbook(output)
            self.assertEqual(len(w), 13)
            self.assertEqual(w['Overview']['B40']['value'], 0)
            self.assertEqual(w['Overview']['B41']['value'], count if status == 'unknown' else 0)
            if status == 'unknown':
                self.assertEqual(w['Unknown status review'][f'A{count+13}']['value'], 'Financial: reservation_id')
            self.assertFalse(any(c['error'] for s in w.values() for c in s.values()))

    def test_missing_zero_and_literal_text_preserved(self):
        rows, lines = self.make()
        rows[0]['pets'] = '0'; rows[0]['source_listing_name'] = "'=private-looking formula"; rows[0]['escaped_text_columns'] = 'source_listing_name'
        lines[0]['source_listing_name'] = rows[0]['source_listing_name']
        write_fixture(self.source, rows, lines)
        output = self.base / 'analysis.xlsx'; cli.generate(self.source, None, output, reservation_csv_dir=None)
        w = read_workbook(output)
        self.assertEqual(w['Source stays']['W6']['value'], 0)
        self.assertIsNone(w['Source stays']['S6']['value'])
        self.assertEqual(w['Source stays']['D6']['value'], rows[0]['source_listing_name'])
        self.assertIsNone(w['Source stays']['D6']['formula'])
        self.assertEqual(w['Source stays']['AU6']['value'], '2026-09-03T10:01:17.782799Z')

    def test_bad_input_does_not_publish_output(self):
        for issue in ['duplicate reservation', 'duplicate line', 'unsafe amount', 'individual mismatch', 'mixed timestamp']:
            rows, lines = fixture(2)
            if issue == 'duplicate reservation': rows[1]['reservation_id'] = rows[0]['reservation_id']
            if issue == 'duplicate line': lines[1]['financial_line_id'] = lines[0]['financial_line_id']
            if issue == 'unsafe amount': lines[0]['amount_minor'] = str(SAFE_INTEGER + 1)
            if issue == 'mixed timestamp': lines[1]['exported_at'] = '2026-10-20T00:00:00Z'
            write_fixture(self.source, rows, lines, mutate_individual=issue == 'individual mismatch')
            output = self.base / 'bad.xlsx'
            with self.subTest(issue=issue), self.assertRaises((ValueError, KeyError)):
                cli.generate(self.source, None, output, reservation_csv_dir=None)
            self.assertFalse(output.exists())

    def test_cancellation_and_evidence_archive_binding(self):
        rows, _ = self.make(status='cancelled')
        source = load_source(self.source)
        e = dict(schema_version='1.0', archive_sha256=source['sha256'], audited_on='2026-10-20', audit_reference='Synthetic audit', adjustments=[dict(
            reservation_id=rows[0]['reservation_id'], original_status='cancelled', effective_status='confirmed', cancellation_phrase_count=0,
            evidence_type='Confirmed booking card', entries=[dict(position=2, displayed_date='May 2025')])])
        path = self.base / 'evidence.json'; path.write_text(json.dumps(e))
        with self.assertRaises(ValueError): load_evidence(path, source)
        e['archive_sha256'] = '0' * 64; path.write_text(json.dumps(e))
        with self.assertRaises(ValueError): load_evidence(path, source)

    def test_missing_and_empty_panels_retain_source_without_inventing_zeroes(self):
        for kind in ['reservation_only', 'summary_only']:
            rows, lines = fixture()
            rows[0]['financial_line_count'] = '0'
            rows[0]['host_total_decimal'] = ''
            if kind == 'reservation_only':
                rows[0]['financial_summary_count'] = '0'
                for key in list(rows[0]):
                    if key.startswith('guest_'): rows[0][key] = ''
            for key in ['financial_line_id', 'parent_line_id', 'line_position', 'source_item_type', 'description', 'amount_minor', 'amount_decimal', 'hierarchy_depth', 'has_children', 'financial_role']:
                lines[0][key] = ''
            lines[0]['row_kind'] = kind; lines[0]['contributes_to_panel_total'] = 'false'
            if kind == 'reservation_only':
                for key in ['financial_summary_id', 'perspective', 'currency', 'panel_total_minor', 'panel_total_decimal', 'calculated_panel_total_minor', 'source_arithmetic_status']:
                    lines[0][key] = ''
            write_fixture(self.source, rows, lines)
            output = self.base / (kind + '.xlsx')
            result = cli.generate(self.source, None, output, reservation_csv_dir=None)
            self.assertEqual(result['financial_lines'], 0)
            self.assertEqual(result['eligible_reservations'], 0)
            workbook = read_workbook(output)
            self.assertEqual(workbook['Source lines']['I6']['value'], kind)
            self.assertEqual(workbook['Overview']['B35']['value'], 0)

    def test_duplicate_confirmation_future_and_as_of(self):
        rows, lines = self.make(2)
        rows[1]['confirmation_code'] = rows[0]['confirmation_code']; lines[1]['confirmation_code'] = rows[1]['confirmation_code']
        write_fixture(self.source, rows, lines)
        a = analyse(load_source(self.source), dict(adjustments=[]))
        self.assertEqual([s['reason'] for s in a['states']], ['Duplicate confirmation code'] * 2)
        self.make()
        a = analyse(load_source(self.source), dict(adjustments=[]), as_of='2025-05-02')
        self.assertEqual(a['states'][0]['reason'], 'Stay has not ended')
        self.assertTrue(analyse(load_source(self.source), dict(adjustments=[]), as_of='2025-05-03')['states'][0]['eligible'])

    def test_no_overwrite_and_comparator_detects_changed_cell(self):
        self.make(); a = self.base / 'one.xlsx'; b = self.base / 'two.xlsx'
        cli.generate(self.source, None, a, reservation_csv_dir=None)
        with self.assertRaises(ValueError): cli.generate(self.source, None, a, reservation_csv_dir=None)
        cli.generate(self.source, None, b, reservation_csv_dir=None)
        # Different guide filenames are content, so must not be silently ignored.
        self.assertFalse(compare(a, b)['matched'])
        self.assertTrue(compare(a, a)['matched'])
        result = subprocess.run([sys.executable, str(ROOT / 'scripts/compare_reservation_analysis.py'), '--reference', str(a), '--actual', str(b)], capture_output=True)
        self.assertEqual(result.returncode, 1)

    def test_reference_snapshot_when_private_inputs_available(self):
        source = ROOT / 'docs/source-material/airbnb/airbnb-reservation-evidence-2026-10-19.zip'
        reference = ROOT / 'outputs/reservation-analysis-2026-10-19/reservation-analysis.xlsx'
        if not source.exists() or not reference.exists():
            self.skipTest('Private archive and reference are not included in a clean checkout; pass local inputs to the documented comparison command.')
        output = self.base / 'reservation-analysis.xlsx'
        result = cli.generate(source, ROOT / 'docs/source-material/airbnb/status-evidence/2026-10-19.json', output, reservation_csv_dir=None)
        self.assertEqual((result['eligible_reservations'], result['eligible_nights']), (74, 208))
        comparison = compare(reference, output)
        self.assertTrue(comparison['matched'], comparison)


if __name__ == '__main__':
    unittest.main()
