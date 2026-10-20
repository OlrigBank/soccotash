"""Deterministic interpretation of reservation evidence (pricing method 1.1).

No database, workbook, network or application-runtime dependencies.
Amounts remain integer pennies until presentation.
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
import re
import zipfile
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from zoneinfo import ZoneInfo

METHOD_VERSION = '1.1'
PRODUCTS = ['Whole house', 'Cottage', 'Double bedroom', 'Large bedroom']
SHEETS = ['Overview', 'Price guide', 'Monthly history', 'Stay patterns', 'Stay analysis', 'Night evidence',
          'Source stays', 'Source lines', 'Columns', 'Panel audit', 'Read me', 'Unknown status review', 'Status adjustments']
SAFE_INTEGER = 2**53 - 1
ADJUSTMENT = re.compile(r'nightly|room|accommodation|non-refundable|(?:length.of.stay|weekly|monthly|weekly stay|monthly stay|early[ -]bird|top-rated guests?) discount', re.I)


def integer(value):
    if not isinstance(value, str) or not re.fullmatch(r'-?\d+', value):
        raise ValueError('Invalid integer in source data.')
    result = int(value)
    if abs(result) > SAFE_INTEGER:
        raise ValueError('Source integer exceeds spreadsheet safe precision.')
    return result


def numeric(value):
    return None if value == '' else integer(value)


def product(reservation):
    label = reservation['source_listing_name']
    if 'Olrig Bank: Spacious' in label:
        return PRODUCTS[0]
    for prefix, name in [('Cosy Cottage', PRODUCTS[1]), ('Double bedroom', PRODUCTS[2]), ('Large bedroom', PRODUCTS[3])]:
        if label.startswith(prefix):
            return name
    return 'Unclassified'


def adjustment(line):
    return line['type'] == 'adjustment' and bool(ADJUSTMENT.search(line['description']))


def accommodation(line):
    return line['type'] in ('accommodation', 'nightly_charge') or (line['type'] == 'other' and line['description'].strip().lower() == 'accommodation') or adjustment(line)


def fee_type(line):
    if line['type'] in ('host_service_fee', 'guest_service_fee', 'tax'):
        return line['type']
    if line['type'] == 'other':
        if re.search(r'\bcleaning\b', line['description'], re.I):
            return 'cleaning'
        if re.search(r'\b(pet|pets|dog|dogs)\b', line['description'], re.I):
            return 'pets'
    return None


def normalise_financial(panel, dates):
    lines = [dict(l, type='accommodation') if l['type'] == 'other' and l['description'].strip().lower() == 'accommodation' else l for l in panel['lines']]
    if panel['arithmeticStatus'] == 'discrepancy':
        return 'Financial reconciliation discrepancy'
    if panel['currency'] != 'GBP' or panel['arithmeticStatus'] != 'verified':
        return 'Unverified financial summary'
    if any(type(n) is not int or abs(n) > SAFE_INTEGER for n in [panel['totalPence'], *[l['amountPence'] for l in lines]]):
        return 'Invalid monetary amount'
    identities = {l['id'] for l in lines}
    roots = [l for l in lines if l['parentId'] is None and l['type'] != 'total']
    if len(identities) != len(lines) or any(l['parentId'] is not None and (l['parentId'] not in identities or l['id'] == l['parentId']) for l in lines):
        return 'Invalid financial hierarchy'
    if sum(l['amountPence'] for l in roots) != panel['totalPence'] or any(l['type'] == 'total' and (l['parentId'] is not None or l['amountPence'] != panel['totalPence']) for l in lines):
        return 'Financial reconciliation discrepancy'
    charges = [l for l in roots if l['type'] in ('accommodation', 'nightly_charge') or adjustment(l)]
    if not any(l['type'] in ('accommodation', 'nightly_charge') for l in charges):
        return 'Missing accommodation charges'
    if any(l not in charges and not fee_type(l) for l in roots):
        return 'Ambiguous financial line or adjustment'
    if sum(l['type'] == 'accommodation' for l in charges) > 1 or (any(l['type'] == 'accommodation' for l in charges) and any(l['type'] == 'nightly_charge' for l in charges)) or any(l['type'] == 'nightly_charge' and l['serviceDate'] not in dates for l in charges):
        return 'Ambiguous accommodation breakdown'
    if any(l['parentId'] is not None and not any(p['id'] == l['parentId'] for p in charges) for l in lines):
        return 'Ambiguous financial hierarchy'
    total = sum(l['amountPence'] for l in charges)
    if total <= 0 or abs(total) > SAFE_INTEGER:
        return 'Non-positive accommodation charge'
    dated = [0] * len(dates)
    complete = True
    for root in charges:
        children = [l for l in lines if l['parentId'] == root['id']]
        if children:
            keys = [(l['serviceDate'], l['description'].strip().lower()) if root['type'] == 'adjustment' else l['serviceDate'] for l in children]
            if sum(l['amountPence'] for l in children) != root['amountPence'] or any((l['type'] != 'nightly_charge' and not (root['type'] == 'adjustment' and adjustment(l))) or l['serviceDate'] not in dates for l in children) or len(set(keys)) != len(children):
                return 'Nightly breakdown discrepancy'
            if root['type'] == 'accommodation' and len(children) != len(dates):
                return 'Incomplete accommodation nightly breakdown'
            for child in children:
                dated[dates.index(child['serviceDate'])] += child['amountPence']
        elif root['type'] == 'nightly_charge' and root['serviceDate'] in dates:
            if sum(l['type'] == 'nightly_charge' and l['serviceDate'] == root['serviceDate'] for l in charges) != 1:
                return 'Duplicate dated nightly charge'
            dated[dates.index(root['serviceDate'])] += root['amountPence']
        else:
            complete = False
    if not any(l['type'] == 'accommodation' for l in charges) and sum(l['type'] == 'nightly_charge' for l in charges) != len(dates):
        return 'Incomplete accommodation nightly breakdown'
    amounts = dated if complete else [total // len(dates) + (i < total % len(dates)) for i in range(len(dates))]
    if any(n < 0 for n in amounts) or sum(amounts) != total:
        return 'Nightly breakdown discrepancy'
    return dict(totalPence=total, amounts=amounts, estimated=not complete,
                fees=[dict(type=fee_type(l), amountPence=l['amountPence']) for l in roots if fee_type(l)])


def normalise_reservation(reservation, panels):
    try:
        start = date.fromisoformat(reservation['arrival'])
        end = date.fromisoformat(reservation['departure'])
        count = integer(reservation['nights'])
        if not 1 <= count <= 3660 or (end - start).days != count:
            raise ValueError()
    except (ValueError, TypeError):
        return 'Invalid stay dates'
    dates = [(start + timedelta(days=i)).isoformat() for i in range(count)]
    panels = sorted(panels, key=lambda p: p['perspective'] != 'guest_paid')
    if len({p['perspective'] for p in panels}) != len(panels):
        return 'Duplicate financial perspective'
    candidates = [normalise_financial(p, dates) for p in panels]
    for candidate in candidates:
        if isinstance(candidate, str) and re.search(r'discrepancy|Ambiguous|hierarchy|Invalid|Duplicate|Incomplete|Non-positive', candidate):
            return candidate
    valid = [c for c in candidates if isinstance(c, dict)]
    if not valid:
        return candidates[0] if candidates else 'Missing financial summaries'
    if any(c['totalPence'] != valid[0]['totalPence'] for c in valid):
        return 'Conflicting accommodation figures'
    dated = [c for c in valid if not c['estimated']]
    if any(c['amounts'] != dated[0]['amounts'] for c in dated[1:]):
        return 'Conflicting dated nightly prices'
    selected = dated[0] if dated else valid[0]
    return dict(nights=[dict(reservationId=reservation['reservation_id'], date=d, amountPence=selected['amounts'][i], estimated=selected['estimated']) for i, d in enumerate(dates)], fees=valid[0]['fees'])


def percentile(values, fraction):
    if not values:
        return None
    values = sorted(values)
    position = (len(values) - 1) * fraction
    lower = int(position)
    return values[lower] + (values[min(lower + 1, len(values) - 1)] - values[lower]) * (position - lower)


def statistics(nights):
    amounts = [n['amountPence'] for n in nights]
    reservations = len({n['reservationId'] for n in nights})
    years = len({n['date'][:4] for n in nights})
    return dict(reservations=reservations, nights=len(nights), years=years,
                lower=percentile(amounts, .25), median=percentile(amounts, .5), upper=percentile(amounts, .75),
                total=sum(amounts), mean=sum(amounts) / len(nights) if nights else None,
                estimated=sum(n['estimated'] for n in nights) / len(nights) if nights else None,
                supported=reservations >= 5 and len(nights) >= 20 and years >= 2)


def read_csv(archive, name):
    reader = csv.DictReader(io.StringIO(archive.read(name).decode('utf-8-sig'), newline=''), strict=True)
    headers = reader.fieldnames
    if not headers or len(set(headers)) != len(headers):
        raise ValueError(f'Invalid CSV headers: {name}')
    rows = list(reader)
    if any(None in r or None in r.values() for r in rows):
        raise ValueError(f'Non-rectangular CSV: {name}')
    return headers, rows


def load_source(path):
    path = Path(path)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)) or sum(i.file_size for i in archive.infolist()) > 64 * 1024 * 1024:
            raise ValueError('Duplicate ZIP members or archive exceeds 64 MiB uncompressed.')
        datasets = {n: read_csv(archive, n) for n in ('reservations.csv', 'financial-lines.csv', 'columns.csv')}
        rh, reservations = datasets['reservations.csv']
        lh, lines = datasets['financial-lines.csv']
        _, dictionary = datasets['columns.csv']
        schema = json.loads(Path(__file__).with_name('layout.json').read_text(encoding='utf-8'))['headers']
        if rh != schema['Source stays'] or lh != schema['Source lines']:
            raise ValueError('Unsupported schema 1.0 column names or order.')
        for name, headers in [('reservations.csv', rh), ('financial-lines.csv', lh)]:
            declared = [d['column'] for d in dictionary if d['dataset'].startswith(name)]
            if headers != declared:
                raise ValueError(f'Column dictionary does not match {name}.')
        required = {'reservation_id', 'arrival', 'departure', 'normalised_status', 'reservation_currency', 'financial_line_count', 'source_listing_name', 'nights'}
        if not required <= set(rh) or not {'financial_line_id', 'financial_summary_id', 'amount_minor', 'row_kind'} <= set(lh):
            raise ValueError('Required export columns are missing.')
        if not reservations:
            raise ValueError('The export has no reservations; no analysis can be generated.')
        identities = [r['reservation_id'] for r in reservations]
        identity_set = set(identities)
        if len(identities) > 50_000 or len(set(identities)) != len(identities) or any(not re.fullmatch(r'[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}', rid) for rid in identities):
            raise ValueError('Invalid, duplicate or excessive reservation identities.')
        grouped = defaultdict(list)
        seen_lines = set()
        for line in lines:
            if line['reservation_id'] not in identity_set:
                raise ValueError('Financial row references an absent reservation.')
            grouped[line['reservation_id']].append(line)
            if line['row_kind'] not in ('financial_line', 'summary_only', 'reservation_only'):
                raise ValueError('Unknown financial row kind.')
            if line['row_kind'] == 'financial_line':
                identity = line['financial_line_id']
                if not identity or identity in seen_lines:
                    raise ValueError('Missing or duplicate financial line identity.')
                seen_lines.add(identity)
        for r in reservations:
            rid = r['reservation_id']
            h, individual = read_csv(archive, f'reservations/{rid}.csv')
            if h != lh or individual != grouped[rid]:
                raise ValueError('Individual reservation file differs from combined financial data.')
            if integer(r['financial_line_count']) != sum(l['row_kind'] == 'financial_line' for l in grouped[rid]):
                raise ValueError('Reservation financial line count does not match source rows.')
            if r['normalised_status'] not in ('confirmed', 'cancelled', 'unknown'):
                raise ValueError('Unknown normalised source status.')
        expected_files = {'reservations.csv', 'financial-lines.csv', 'columns.csv'} | {f'reservations/{rid}.csv' for rid in identities}
        if set(names) != expected_files:
            raise ValueError('Unexpected or missing source archive members.')
    all_rows = reservations + lines
    for row in all_rows + dictionary:
        if any(len(value) > 32767 for value in row.values()):
            raise ValueError('Source text exceeds the XLSX cell limit; refusing to truncate evidence.')
    timestamps = {r['exported_at'] for r in all_rows}
    if len(timestamps) != 1 or any(r['export_schema_version'] != '1.0' for r in all_rows):
        raise ValueError('Mixed export timestamps or unsupported export schema; expected 1.0.')
    exported = timestamps.pop()
    default_date = datetime.fromisoformat(exported.replace('Z', '+00:00')).astimezone(ZoneInfo('Europe/London')).date().isoformat()
    types = {(d['dataset'].split(' and ')[0], d['column']): d['data_type'] for d in dictionary}
    # Validate all numeric cells before any output is created. Keep source text untouched.
    for name, (_, rows) in datasets.items():
        if name == 'columns.csv':
            continue
        for row in rows:
            for key, value in row.items():
                kind = types.get((name, key), 'text')
                if value and 'integer' in kind:
                    integer(value)
                elif value and 'decimal' in kind:
                    if not re.fullmatch(r'-?\d+(?:\.\d+)?', value) or abs(Decimal(value)) > SAFE_INTEGER:
                        raise ValueError('Invalid or unsafe source decimal.')
    return dict(path=path, sha256=digest, datasets=datasets, reservations=reservations, lines=lines,
                types=types, exported=exported, as_of=default_date)


def load_evidence(path, source):
    if path is None:
        return dict(audited_on=None, audit_reference=None, adjustments=[])
    evidence = json.loads(Path(path).read_text(encoding='utf-8'))
    if evidence.get('schema_version') != '1.0' or evidence.get('archive_sha256') != source['sha256']:
        raise ValueError('Status evidence schema or archive SHA-256 does not match.')
    date.fromisoformat(evidence['audited_on'])
    records = {r['reservation_id']: r for r in source['reservations']}
    seen = set()
    for change in evidence['adjustments']:
        rid = change['reservation_id']
        if rid not in records or rid in seen:
            raise ValueError('Unknown or duplicate status-evidence reservation.')
        seen.add(rid)
        if records[rid]['normalised_status'] != change['original_status'] or change['original_status'] != 'unknown' or change['effective_status'] != 'confirmed' or change['cancellation_phrase_count'] != 0:
            raise ValueError('Unsupported or conflicting status adjustment.')
        if change['evidence_type'] not in ('Confirmed booking card', 'Airbnb Request accepted service event') or not change['entries']:
            raise ValueError('Status adjustment requires an explicit supported evidence marker.')
        for entry in change['entries']:
            if type(entry['position']) is not int or entry['position'] < 0 or not isinstance(entry['displayed_date'], str):
                raise ValueError('Invalid status-evidence position or displayed date.')
    return evidence


def analyse(source, evidence, as_of=None):
    as_of = as_of or source['as_of']
    date.fromisoformat(as_of)
    changes = {c['reservation_id']: c for c in evidence['adjustments']}
    panel_rows = defaultdict(list)
    reservation_lines = defaultdict(list)
    for line in source['lines']:
        reservation_lines[line['reservation_id']].append(line)
        if line['financial_summary_id']:
            panel_rows[(line['reservation_id'], line['financial_summary_id'])].append(line)
    panel_owners = {}
    for rid, pid in panel_rows:
        if pid in panel_owners and panel_owners[pid] != rid:
            raise ValueError('A financial panel identity belongs to multiple reservations.')
        panel_owners[pid] = rid
    panels = defaultdict(list)
    for (rid, pid), rows in panel_rows.items():
        first = rows[0]
        for row in rows:
            if any(row[k] != first[k] for k in ('perspective', 'currency', 'panel_total_minor', 'source_arithmetic_status')):
                raise ValueError('Inconsistent repeated financial panel metadata.')
        panels[rid].append(dict(id=pid, perspective=first['perspective'], currency=first['currency'],
            totalPence=integer(first['panel_total_minor']), arithmeticStatus=first['source_arithmetic_status'], rows=rows,
            lines=[dict(id=l['financial_line_id'], parentId=l['parent_line_id'] or None, type=l['source_item_type'],
                        description=l['description'], serviceDate=l['service_date'] or None, amountPence=integer(l['amount_minor'])) for l in rows if l['row_kind'] == 'financial_line']))
    codes = Counter(r['confirmation_code'] for r in source['reservations'] if r['confirmation_code'])
    states = []
    for i, r in enumerate(source['reservations'], 6):
        rid = r['reservation_id']
        change = changes.get(rid)
        effective = change['effective_status'] if change else r['normalised_status']
        financials = panels[rid]
        if integer(r['financial_summary_count']) != len(financials):
            raise ValueError('Reservation panel count does not match source rows.')
        norm = normalise_reservation(r, financials)
        semantic = 'Guest panel contains host service fee; check source' if any(p['perspective'] == 'guest_paid' and any(l['type'] == 'host_service_fee' for l in p['lines']) for p in financials) else None
        reason = ('Non-GBP currency' if r['reservation_currency'] != 'GBP' else
                  'Cancelled or unknown effective status' if effective != 'confirmed' else
                  'Stay has not ended' if r['departure'] > as_of else
                  'Unclassified accommodation' if product(r) == 'Unclassified' else
                  norm if isinstance(norm, str) else
                  'Financial perspective requires source review' if semantic else None)
        if r['confirmation_code'] and codes[r['confirmation_code']] > 1:
            reason = 'Duplicate confirmation code'
        selected = None
        if isinstance(norm, dict):
            choices = [(p, normalise_reservation(r, [p])) for p in financials]
            choices = [(p, n) for p, n in choices if isinstance(n, dict)]
            selected = next((p for p, n in choices if not n['nights'][0]['estimated']), None) or next((p for p, _ in choices if p['perspective'] == 'guest_paid'), None) or choices[0][0]
        states.append(dict(raw=r, row=i, effective=effective, change=change, panels=financials, norm=norm,
                           semantic=semantic, reason=reason, eligible=reason is None, selected=selected, product=product(r)))
    nights = []
    for state in states:
        if state['eligible']:
            for i, night in enumerate(state['norm']['nights']):
                nights.append(dict(night, state=state, offset=i, product=state['product'], month=int(night['date'][5:7]),
                                   year=int(night['date'][:4]), day='Weekend' if date.fromisoformat(night['date']).weekday() in (4, 5) else 'Weekday'))
    nights.sort(key=lambda n: (PRODUCTS.index(n['product']), n['month'], n['estimated'], n['day'], n['date'], n['reservationId']))
    for row, n in enumerate(nights, 6):
        n['row'] = row
        n['gross'], n['discount'] = [], []
        if not n['estimated']:
            lines = n['state']['selected']['lines']
            for root in [l for l in lines if l['parentId'] is None and l['type'] != 'total' and accommodation(l)]:
                children = [l for l in lines if l['parentId'] == root['id']] or [root]
                n['discount' if adjustment(root) else 'gross'].extend(l['id'] for l in children if l['serviceDate'] == n['date'])
    if len(nights) > 1_048_570:
        raise ValueError('Eligible nightly evidence exceeds the XLSX worksheet row limit.')
    return dict(source=source, evidence=evidence, as_of=as_of, states=states, nights=nights,
                panel_rows=panel_rows, reservation_lines=reservation_lines,
                adjustments=len(changes), remaining_unknown=sum(s['effective'] == 'unknown' for s in states),
                added=sum(s['eligible'] and s['raw']['normalised_status'] != 'confirmed' for s in states))
