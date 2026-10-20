"""Read saved XLSX values directly, without recalculation or Excel dependencies."""
import math
import posixpath
import zipfile
from xml.etree import ElementTree as ET

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}


def read_workbook(path):
    result = {}
    with zipfile.ZipFile(path) as archive:
        strings = []
        if 'xl/sharedStrings.xml' in archive.namelist():
            for item in ET.fromstring(archive.read('xl/sharedStrings.xml')):
                strings.append(''.join(t.text or '' for t in item.findall('.//m:t', NS)))
        relationships = {r.get('Id'): r.get('Target') for r in ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))}
        sheets = ET.fromstring(archive.read('xl/workbook.xml')).find('m:sheets', NS)
        for sheet in sheets:
            rel = sheet.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')
            target = relationships[rel]
            target = target.lstrip('/') if target.startswith('/') else posixpath.normpath('xl/' + target)
            root = ET.fromstring(archive.read(target))
            cells = {}
            for cell in root.findall('.//m:sheetData/m:row/m:c', NS):
                kind = cell.get('t')
                node = cell.find('m:v', NS)
                value = node.text if node is not None else None
                if kind == 's':
                    value = strings[int(value)]
                elif kind == 'inlineStr':
                    value = ''.join(t.text or '' for t in cell.findall('.//m:t', NS))
                elif kind == 'b':
                    value = bool(int(value))
                elif value is not None and kind not in ('str', 'e', 'd'):
                    value = float(value)
                formula = cell.find('m:f', NS)
                cells[cell.get('r')] = dict(value=value, formula=formula.text if formula is not None else None, error=kind == 'e')
            result[sheet.get('name')] = cells
    return result


def equivalent(a, b):
    if a in (None, '') and b in (None, ''):
        return True
    if type(a) is bool or type(b) is bool:
        return type(a) == type(b) and a == b
    if isinstance(a, (float, int)) and isinstance(b, (float, int)):
        return math.isfinite(a) and math.isfinite(b) and abs(a - b) <= 1e-7
    return type(a) == type(b) and a == b


def compare(reference, actual, limit=50):
    expected, observed = read_workbook(reference), read_workbook(actual)
    differences, checked, total_differences = [], 0, 0

    def mismatch(sheet, cell, reason):
        nonlocal total_differences
        total_differences += 1
        if len(differences) < limit:
            # Cell addresses and reasons are sufficient; private cell values stay out of logs.
            differences.append(dict(sheet=sheet, cell=cell, reason=reason))

    if list(expected) != list(observed):
        mismatch(None, None, 'Worksheet names or order differ')
    for name in dict.fromkeys([*expected, *observed]):
        for address in sorted(set(expected.get(name, {})) | set(observed.get(name, {}))):
            a = expected.get(name, {}).get(address, {})
            b = observed.get(name, {}).get(address, {})
            if a.get('value') not in (None, '') or b.get('value') not in (None, '') or a.get('formula') or b.get('formula'):
                checked += 1
                if a.get('error') or b.get('error'):
                    mismatch(name, address, 'Saved formula error')
                elif not equivalent(a.get('value'), b.get('value')):
                    mismatch(name, address, 'Cell values differ')
                elif a.get('formula') and not b.get('formula'):
                    mismatch(name, address, 'Reference formula replaced by a constant')
    return dict(matched=total_differences == 0, worksheets=len(observed), cells_checked=checked,
                difference_count=total_differences, differences=differences)
