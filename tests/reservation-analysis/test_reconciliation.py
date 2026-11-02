"""Public synthetic fixtures for optional reservation-page CSV reconciliation."""
import copy
import csv
import hashlib
from datetime import date
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from test_analysis import cli, fixture, write_fixture, ROOT
from reservation_analysis.comparison import read_workbook
from reservation_analysis.model import SHEETS, load_source
from reservation_analysis import reconciliation as rec


def csv_row(evidence, **changes):
    row = dict(zip(rec.CSV_COLUMNS, [
        evidence['confirmation_code'], 'Past guest', 'Test guest', '+44 0000 000000', '2', '0', '0',
        date.fromisoformat(evidence['arrival']).strftime('%d/%m/%Y'),
        date.fromisoformat(evidence['departure']).strftime('%d/%m/%Y'), evidence['nights'],
        evidence['booking_date'], evidence['source_listing_name'], '£100.01']))
    row.update(changes)
    return row


class ReconciliationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.csv_dir = self.base / 'exports'; self.csv_dir.mkdir()
        self.rows, self.lines = fixture(3)
        self.source = dict(reservations=self.rows, lines=self.lines)

    def write_csv(self, rows, name='reservations.csv', headers=None):
        path = self.csv_dir / name
        with path.open('w', encoding='utf-8-sig', newline='') as handle:
            writer = csv.DictWriter(handle, fieldnames=headers or rec.CSV_COLUMNS)
            writer.writeheader(); writer.writerows(rows)
        return path

    def reconcile(self):
        return rec.reconcile(self.source, rec.discover_csv_files(self.csv_dir))

    def generate(self, name='analysis.xlsx', directory='default'):
        source = self.base / 'evidence.zip'
        if not source.exists():
            write_fixture(source, self.rows, self.lines)
        output = self.base / name
        result = cli.generate(source, None, output, reservation_csv_dir=self.csv_dir if directory == 'default' else directory)
        return result, read_workbook(output), output

    def test_discovery_is_optional_non_recursive_and_deterministic(self):
        with patch.object(rec, 'DEFAULT_CSV_DIRECTORY', self.base / 'absent'):
            self.assertEqual(rec.discover_csv_files(self.base / 'absent'), [])
        self.assertEqual(rec.discover_csv_files(None), [])
        self.assertEqual(rec.discover_csv_files(self.csv_dir), [])
        with self.assertRaises(ValueError): rec.discover_csv_files(self.base / 'missing-override')
        a = self.write_csv([], 'b.CSV'); b = self.write_csv([], 'A.csv')
        (self.csv_dir / 'ignored.txt').write_text('not CSV')
        child = self.csv_dir / 'subdirectory'; child.mkdir()
        (child / 'hidden.csv').write_text('not CSV')
        self.assertEqual(rec.discover_csv_files(self.csv_dir), [b, a])
        with self.assertRaises(ValueError): rec.discover_csv_files(a)

    def test_code_and_provisional_matches_do_not_mutate_sources(self):
        self.rows[1]['confirmation_code'] = ''
        self.rows[1]['source_listing_name'] = 'Separate listing'
        self.write_csv([csv_row(self.rows[0]), csv_row(self.rows[1], **{'Confirmation code':'OTHER'}),
                        csv_row(self.rows[2], **{'Confirmation code':'ABSENT'})])
        original = copy.deepcopy(self.source)
        result = self.reconcile()
        self.assertEqual([r['method'] for r in result['review']], [rec.METHOD_CODE, rec.METHOD_DATE, rec.METHOD_NONE])
        self.assertEqual(result['summary']['extract_without_candidate'], 1)
        self.assertEqual(self.source, original)

    def test_duplicate_codes_multiple_candidates_and_candidate_reuse_are_visible(self):
        self.write_csv([csv_row(self.rows[0]), csv_row(self.rows[0])])
        result = self.reconcile()
        self.assertTrue(all(r['method']=='Duplicate confirmation code' for r in result['review']))
        self.assertEqual(result['summary']['confirmed_matches'], 0)
        self.assertEqual(len(result['records']), 2)
        self.write_csv([csv_row(self.rows[0])])
        self.rows[1]['confirmation_code'] = self.rows[0]['confirmation_code']
        self.assertEqual(self.reconcile()['review'][0]['method'], 'Duplicate confirmation code')
        for row in self.rows:
            row['confirmation_code'] = ''
        self.assertEqual(self.reconcile()['review'][0]['method'], 'Multiple provisional candidates')
        self.source['reservations'] = self.rows[:1]
        self.write_csv([csv_row(self.rows[0], **{'Confirmation code':'FIRST'}), csv_row(self.rows[0], **{'Confirmation code':'SECOND'})])
        result = self.reconcile()
        self.assertEqual(result['summary']['provisional_matches'], 2)
        self.assertEqual(result['references'][0], [0, 1])

    def test_missing_values_zero_statuses_currencies_and_exact_pennies(self):
        row = self.rows[0]
        row.update(adults='0', children='', infants='0', host_currency='GBP', host_total_decimal='0.00',
                   reservation_currency='GBP', headline_host_total_decimal='0.00')
        record = csv_row(row, **{'# of adults':'0', '# of infants':'', 'Earnings':'-£77.11', 'Status':'Cancelled by you'})
        self.write_csv([record])
        result = self.reconcile()
        fields = {c['field']:c for c in result['comparisons']}
        self.assertEqual(fields['Adults']['result'], 'Equal')
        self.assertEqual(fields['Children']['result'], 'Missing in extract')
        self.assertEqual(fields['Infants']['result'], 'Missing in CSV')
        self.assertEqual(fields['Booking state']['result'], 'Different')
        self.assertEqual(fields['Host-panel total']['difference'], -7711)
        row['source_status_text'] = 'Cancelled'
        self.assertEqual({c['field']:c for c in self.reconcile()['comparisons']}['Booking state']['result'], 'Equivalent state')
        record.update(Earnings='£0.01', Status='Trip change sent'); self.write_csv([record])
        fields = {c['field']:c for c in self.reconcile()['comparisons']}
        self.assertEqual(fields['Host-panel total']['difference'], 1)
        self.assertEqual(fields['Booking state']['result'], 'Needs review')
        for amount in ['€0.01', '$0.01']:
            record['Earnings'] = amount; self.write_csv([record])
            field = {c['field']:c for c in self.reconcile()['comparisons']}['Host-panel total']
            self.assertEqual(field['result'], 'Needs review'); self.assertIsNone(field['difference'])

    def test_all_bad_csv_inputs_fail_before_publishing_private_values(self):
        invalid = [
            (['Confirmation code'], [['PRIVATE']]),
            (rec.CSV_COLUMNS + ['Status'], []),
            (rec.CSV_COLUMNS, [['PRIVATE']]),
        ]
        for headers, values in invalid:
            with (self.csv_dir/'bad.csv').open('w', newline='') as handle:
                writer = csv.writer(handle); writer.writerow(headers); writer.writerows(values)
            with self.assertRaises(ValueError) as caught: self.generate()
            self.assertNotIn('PRIVATE', str(caught.exception))
            self.assertFalse((self.base/'analysis.xlsx').exists())
            self.assertFalse((self.base/'analysis-guide.md').exists())
        (self.csv_dir/'bad.csv').unlink()
        for change in [{'Start date':'PRIVATE'}, {'Booked':'2026-02-30'}, {'# of adults':'-2'}, {'Earnings':'£1.001'},
                       {'Earnings':'£9999999999999999.00'}, {'Guest name':'x'*32768}]:
            self.write_csv([csv_row(self.rows[0], **change)])
            with self.assertRaises(ValueError) as caught: self.generate()
            self.assertNotIn('PRIVATE', str(caught.exception))
            self.assertFalse((self.base/'analysis.xlsx').exists())
        (self.csv_dir/'reservations.csv').write_bytes(b'\xffinvalid')
        with self.assertRaises(ValueError): self.generate()

    def test_header_only_exports_preserve_unmatched_extract_and_empty_tables(self):
        self.write_csv([])
        result, workbook, output = self.generate()
        self.assertEqual(list(workbook), SHEETS + rec.RECONCILIATION_SHEETS)
        self.assertEqual(result['reconciliation']['csv_reservations'], 0)
        self.assertEqual(result['reconciliation']['extract_without_candidate'], 3)
        self.assertEqual(workbook['Review']['B7']['value'], 0)
        self.assertEqual(workbook['Review']['B8']['value'], 3)
        self.assertFalse(any(cell['error'] for sheet in workbook.values() for cell in sheet.values()))

    def test_full_workbook_preserves_original_cells_and_private_literal_text(self):
        original_result, original, original_output = self.generate(name='original/analysis.xlsx', directory=None)
        a = csv_row(self.rows[0], **{'Guest name':'=SUM(A1:A2)', 'Contact':'+44 0000 000000'})
        self.write_csv([a], 'b.CSV')
        b = csv_row(self.rows[1], **{'Guest name':'Guest, with\nnewline'})
        self.write_csv([b], 'a.csv')
        result, workbook, output = self.generate(name='new/analysis.xlsx')
        self.assertEqual(list(workbook), SHEETS + rec.RECONCILIATION_SHEETS)
        for name in SHEETS:
            self.assertEqual(original[name], workbook[name], name)
        self.assertEqual(original_result['eligible_reservations'], result['eligible_reservations'])
        self.assertEqual(workbook['CSV reservations']['C9']['value'], '=SUM(A1:A2)')
        self.assertIsNone(workbook['CSV reservations']['C9']['formula'])
        self.assertEqual(workbook['CSV reservations']['D9']['value'], '+44 0000 000000')
        self.assertEqual(workbook['CSV reservations']['N8']['value'], 'a.csv')
        self.assertEqual(workbook['CSV reservations']['O9']['value'], 2)
        guide = output.with_name('analysis-guide.md').read_text()
        self.assertIn('## Reservation CSV reconciliation', guide)
        self.assertIn(result['reservation_csv_sources'][0]['sha256'], guide)
        self.assertEqual(output.stat().st_mode & 0o777, 0o600)
        self.assertFalse(any(cell['error'] for sheet in workbook.values() for cell in sheet.values()))
        with self.assertRaises(ValueError): self.generate(name='new/analysis.xlsx')
        # Blanks, known zeroes and unsupported currencies must have truthful caches.
        self.assertIn('Missing in extract', [cell['value'] for cell in workbook['Comparisons'].values()])

    def test_default_auto_discovery_and_cli_disabling(self):
        self.write_csv([csv_row(self.rows[0])])
        source = self.base/'evidence.zip'; write_fixture(source,self.rows,self.lines)
        files = rec.discover_csv_files(self.csv_dir)
        with patch.object(cli, 'discover_csv_files', return_value=files) as discovery:
            self.assertEqual(cli.generate(source,None,self.base/'auto.xlsx')['reconciliation']['csv_reservations'],1)
            discovery.assert_called_once_with(rec.DEFAULT_CSV_DIRECTORY)
        proc = subprocess.run([sys.executable,str(ROOT/'scripts/reservation_analysis.py'),'--source',str(source),
                               '--output',str(self.base/'cli.xlsx'),'--no-reservation-csvs'],cwd=self.base,capture_output=True,text=True)
        self.assertEqual(proc.returncode,0,proc.stderr)
        self.assertNotIn('reconciliation',json.loads(proc.stdout))
        self.assertEqual(list(read_workbook(self.base/'cli.xlsx')),SHEETS)
        override = subprocess.run([sys.executable,str(ROOT/'scripts/reservation_analysis.py'),'--source',str(source),
                                   '--output',str(self.base/'override.xlsx'),'--reservation-csv-dir',str(self.csv_dir)],
                                  cwd=self.base,capture_output=True,text=True)
        self.assertEqual(override.returncode,0,override.stderr)
        self.assertEqual(len(read_workbook(self.base/'override.xlsx')),17)
        conflict = subprocess.run([sys.executable,str(ROOT/'scripts/reservation_analysis.py'),'--source',str(source),
                                  '--output',str(self.base/'bad.xlsx'),'--no-reservation-csvs','--reservation-csv-dir',str(self.csv_dir)],capture_output=True,text=True)
        self.assertNotEqual(conflict.returncode,0)

    def test_dynamic_earnings_section_does_not_overlap_review_records(self):
        self.rows,self.lines=fixture(30)
        for row in self.rows:
            row.update(host_currency='GBP',host_total_decimal='0.00')
        self.write_csv([csv_row(row) for row in self.rows])
        result,workbook,_=self.generate()
        self.assertEqual(result['reconciliation']['earnings_discrepancies'],30)
        cells=workbook['Review']
        self.assertEqual(cells['D37']['value'],'TEST29')
        headers=[int(address[1:]) for address,cell in cells.items() if address.startswith('A') and cell['value']=='Confirmation code']
        self.assertEqual(len(headers),1)
        header=headers[0]
        self.assertGreater(header,37)
        self.assertEqual(cells[f'A{header+30}']['value'],'TEST29')

    def test_private_current_export_when_available(self):
        archive = ROOT/'airbnb-reservation-evidence-2026-10-21.zip'
        files = rec.discover_csv_files()
        if not archive.exists() or len(files) != 3:
            self.skipTest('Private acceptance inputs are not included in Git.')
        expected_hashes = {
            '8d91078872b9f07e2955355257b277b42a4e526f2f6cbf4ea0ad67a4583f9aa5',
            '239a7439ddb59aa82e8f990db0e9d3507689665a8bc582b9ee8e869bfe67d8ea',
            'c126d51934232a75b12cffbbac6fc9b9fb1568601b1c90ded09ed8a2a2adbe32',
        }
        if {hashlib.sha256(path.read_bytes()).hexdigest() for path in files} != expected_hashes:
            self.skipTest('Local CSV exports differ from the 21 October acceptance snapshot.')
        result = rec.reconcile(load_source(archive),files)
        s = result['summary']
        self.assertEqual([s[k] for k in ('csv_reservations','extract_reservations','confirmed_matches','provisional_matches','unmatched_csv','earnings_discrepancies')], [95,93,50,43,2,3])
        self.assertEqual(s['different_fields'],38)
        self.assertEqual(s['missing_fields'],266)


if __name__ == '__main__':
    unittest.main()
