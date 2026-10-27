#!/usr/bin/env python3
"""Optional LibreOffice recalculation and control verification on disposable copies.

Run with the system Python that provides python3-uno, not the generation venv.
"""
import argparse
import json
import math
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import uuid
import zipfile
from xml.etree import ElementTree as ET

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from reservation_analysis.comparison import compare, read_workbook
from reservation_analysis.model import SHEETS
from reservation_analysis.reconciliation import RECONCILIATION_SHEETS


def main():
    import uno
    from com.sun.star.beans import PropertyValue

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workbook', type=Path, required=True)
    parser.add_argument('--reference', type=Path)
    args = parser.parse_args()
    original = args.workbook.resolve()
    saved = read_workbook(original)
    assert list(saved) in (SHEETS, SHEETS + RECONCILIATION_SHEETS)
    assert not any(c['error'] for s in saved.values() for c in s.values())
    products = ['Whole house', 'Cottage', 'Double bedroom', 'Large bedroom']
    expected = {p: dict(stays=0, nights=0, pennies=0) for p in products}
    for address, cell in saved['Stay analysis'].items():
        if address.startswith('A') and address[1:].isdigit() and int(address[1:]) >= 6:
            r = address[1:]
            if saved['Stay analysis'].get('H'+r, {}).get('value') == 'Included':
                p = saved['Stay analysis']['B'+r]['value']; expected[p]['stays'] += 1
                expected[p]['nights'] += saved['Stay analysis']['G'+r]['value']
                expected[p]['pennies'] += round(saved['Stay analysis']['K'+r]['value'] * 100)

    def prop(name, value):
        p = PropertyValue(); p.Name = name; p.Value = value
        return p

    with tempfile.TemporaryDirectory(prefix='reservation-native-') as temp:
        base = Path(temp); copied = base / original.name; shutil.copyfile(original, copied)
        pipe = 'reservation_' + uuid.uuid4().hex
        process = subprocess.Popen(['libreoffice', '-env:UserInstallation=' + (base / 'profile').as_uri(), '--headless', '--norestore', '--nodefault', f'--accept=pipe,name={pipe};urp;StarOffice.ServiceManager'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        document = desktop = None
        try:
            local = uno.getComponentContext()
            resolver = local.ServiceManager.createInstanceWithContext('com.sun.star.bridge.UnoUrlResolver', local)
            deadline = time.monotonic() + 30
            while time.monotonic() < deadline:
                try:
                    context = resolver.resolve(f'uno:pipe,name={pipe};urp;StarOffice.ComponentContext'); break
                except Exception:
                    if process.poll() is not None:
                        raise RuntimeError('Isolated LibreOffice process exited before connecting.')
                    time.sleep(.2)
            else:
                raise RuntimeError('Timed out connecting to isolated LibreOffice.')
            desktop = context.ServiceManager.createInstanceWithContext('com.sun.star.frame.Desktop', context)
            document = desktop.loadComponentFromURL(copied.as_uri(), '_blank', 0, (prop('Hidden', True), prop('UpdateDocMode', 0), prop('MacroExecutionMode', uno.getConstantByName('com.sun.star.document.MacroExecMode.NEVER_EXECUTE'))))
            assert document is not None
            overview = document.Sheets.getByName('Overview')
            value = lambda address: overview.getCellRangeByName(address).getValue()
            text = lambda address: overview.getCellRangeByName(address).getString()

            def save(path):
                document.calculateAll()
                document.storeToURL(path.as_uri(), (prop('FilterName', 'Calc MS Excel 2007 XML'), prop('Overwrite', True)))

            recalculated = base / 'recalculated.xlsx'
            save(recalculated)
            initial = compare(original, recalculated)
            assert initial['matched'], initial
            if args.reference:
                reference = compare(args.reference, recalculated)
                assert reference['matched'], reference
            reconciliation_checks = []
            if 'Comparisons' in saved:
                comparison_sheet = document.Sheets.getByName('Comparisons')
                review_sheet = document.Sheets.getByName('Review')
                comparison_rows = sorted(int(address[1:]) for address, cell in saved['Comparisons'].items()
                                         if address.startswith('D') and address[1:].isdigit() and int(address[1:]) >= 8)
                for r in comparison_rows:
                    original_cells = saved['Comparisons']
                    if (original_cells.get(f'D{r}', {}).get('value') == 'Host-panel total'
                            and original_cells.get(f'E{r}', {}).get('value') == 'Equal'):
                        input_cell = comparison_sheet.getCellRangeByName(f'F{r}')
                        original_formula = input_cell.getFormula()
                        original_value = input_cell.getValue()
                        count = review_sheet.getCellRangeByName('B16').getValue()
                        input_cell.setValue(original_value + .01); document.calculateAll()
                        assert comparison_sheet.getCellRangeByName(f'E{r}').getString() == 'Different'
                        assert round(comparison_sheet.getCellRangeByName(f'I{r}').getValue()*100) == 1
                        assert review_sheet.getCellRangeByName('B16').getValue() == count+1
                        input_cell.setFormula(original_formula); document.calculateAll()
                        reconciliation_checks.append('1p earnings change and summary refresh')
                        break
                for r in comparison_rows:
                    if (saved['Comparisons'].get(f'D{r}', {}).get('value') in ('Adults','Children','Infants')
                            and saved['Comparisons'].get(f'F{r}', {}).get('value') == 0
                            and saved['Comparisons'].get(f'E{r}', {}).get('value') == 'Missing in extract'):
                        input_cell = comparison_sheet.getCellRangeByName(f'G{r}')
                        original_formula = input_cell.getFormula()
                        count = review_sheet.getCellRangeByName('B17').getValue()
                        input_cell.setValue(0); document.calculateAll()
                        assert comparison_sheet.getCellRangeByName(f'E{r}').getString() == 'Equal'
                        assert review_sheet.getCellRangeByName('B17').getValue() == count-1
                        input_cell.setFormula(original_formula); document.calculateAll()
                        assert comparison_sheet.getCellRangeByName(f'E{r}').getString() == 'Missing in extract'
                        reconciliation_checks.append('blank versus zero and summary refresh')
                        break
                save(recalculated)
                assert compare(original,recalculated)['matched'], 'Reconciliation controls were not restored.'
            for p in products:
                overview.getCellRangeByName('B5').setString(p); document.calculateAll()
                assert value('E7') == expected[p]['stays'], ('product stays', p)
                assert value('E8') == expected[p]['nights'], ('product nights', p)
                assert round(value('E10') * 100) == expected[p]['pennies'], ('product accommodation', p)
                patterns = document.Sheets.getByName('Stay patterns')
                totals = {}
                for r in range(6, patterns.getRows().Count):
                    category = patterns.getCellRangeByName('A'+str(r)).getString()
                    if not category:
                        break
                    group = totals.setdefault(category, [0, 0, 0])
                    group[0] += patterns.getCellRangeByName('C'+str(r)).getValue()
                    group[1] += patterns.getCellRangeByName('D'+str(r)).getValue()
                    group[2] += round(patterns.getCellRangeByName('E'+str(r)).getValue() * 100)
                assert len(totals) == 5
                for totals_for_category in totals.values():
                    assert totals_for_category == [expected[p]['stays'], expected[p]['nights'], expected[p]['pennies']], ('stay patterns', p)
                current = base / 'product.xlsx'; save(current)
                with zipfile.ZipFile(current) as archive:
                    chart = next(n for n in archive.namelist() if n.startswith('xl/charts/chart') and n.endswith('.xml'))
                    ns = {'c': 'http://schemas.openxmlformats.org/drawingml/2006/chart'}
                    points = ET.fromstring(archive.read(chart)).findall('.//c:ser/c:val/c:numRef/c:numCache/c:pt/c:v', ns)
                    assert [float(v.text) for v in points] == [value('C'+str(r)) for r in range(15, 27)], ('chart refresh', p)
            overview.getCellRangeByName('B5').setString('Whole house')
            for uplift in [.1, -1, 1]:
                overview.getCellRangeByName('B6').setValue(uplift); document.calculateAll()
                for r in range(15, 27):
                    for c, day in [('G', 'Weekday'), ('H', 'Weekend')]:
                        matches = [address[1:] for address, cell in saved['Price guide'].items() if address.startswith('A') and address[1:].isdigit() and cell['value'] == 'Whole house' and saved['Price guide'].get('B'+address[1:], {}).get('value') == r-14 and saved['Price guide'].get('C'+address[1:], {}).get('value') == day]
                        row = matches[0]; baseline = saved['Price guide'].get('M'+row, {}).get('value')
                        if baseline in (None, ''):
                            assert text(c+str(r)) == ''
                        else:
                            assert value(c+str(r)) == math.floor(baseline * (1+uplift) + .5), ('uplift', uplift, r, day)
            overview.getCellRangeByName('B6').setString('bad'); document.calculateAll()
            for r in range(15, 27):
                if saved['Overview'].get('G'+str(r), {}).get('value') not in (None, ''):
                    assert text('G'+str(r)) == 'Invalid uplift'
            overview.getCellRangeByName('B6').setValue(0); save(recalculated)
            restored = compare(original, recalculated)
            assert restored['matched'], restored
            assert overview.Charts.Count == 1
            assert document.Sheets.getByName('Read me').getCellRangeByName('B9').getString() == saved['Read me']['B9']['value']
            print(json.dumps(dict(matched=True, cells_checked=initial['cells_checked'], controls='all four products, +10%, -100%, +100%, invalid uplift, restored defaults', reconciliation=reconciliation_checks, chart='all four products refreshed', source_unchanged=True)))
        finally:
            if document is not None:
                document.close(True)
            if desktop is not None:
                desktop.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.terminate(); process.wait(timeout=10)
    return 0


if __name__ == '__main__':
    sys.exit(main())
