"""Optional reservation-page CSV evidence; independent of pricing calculations."""
from __future__ import annotations

import csv
import hashlib
import io
import re
from collections import Counter, defaultdict
from datetime import datetime
from decimal import Decimal
from pathlib import Path

DEFAULT_CSV_DIRECTORY = Path(__file__).resolve().parents[2] / 'docs/source-material/airbnb/airbnb-reservations-csv-exports'
RECONCILIATION_SHEETS = ['Review', 'Comparisons', 'CSV reservations', 'Extract reservations']
CSV_COLUMNS = ['Confirmation code', 'Status', 'Guest name', 'Contact', '# of adults', '# of children',
               '# of infants', 'Start date', 'End date', '# of nights', 'Booked', 'Listing', 'Earnings']
FIELDS = [
    ('Listing', 'Listing', 'source_listing_name', 'text'),
    ('Arrival', 'Start date', 'arrival', 'date'),
    ('Departure', 'End date', 'departure', 'date'),
    ('Nights', '# of nights', 'nights', 'integer'),
    ('Booking date', 'Booked', 'booking_date', 'date'),
    ('Booking state', 'Status', 'source_status_text', 'state'),
    ('Adults', '# of adults', 'adults', 'integer'),
    ('Children', '# of children', 'children', 'integer'),
    ('Infants', '# of infants', 'infants', 'integer'),
    ('Headline host earnings', 'Earnings', 'headline_host_total_decimal', 'headline'),
    ('Host-panel total', 'Earnings', 'host_total_decimal', 'host'),
]
METHOD_CODE = 'Confirmed code match'
METHOD_DATE = 'Provisional date match'
METHOD_NONE = 'No extract counterpart'


def discover_csv_files(directory=DEFAULT_CSV_DIRECTORY):
    if directory is None:
        return []
    directory = Path(directory)
    if not directory.exists():
        if directory.resolve() == DEFAULT_CSV_DIRECTORY.resolve():
            return []
        raise ValueError('Reservation CSV directory does not exist.')
    if not directory.is_dir():
        raise ValueError('Reservation CSV path must be a directory.')
    return sorted((p for p in directory.iterdir() if p.is_file() and p.suffix.lower() == '.csv'),
                  key=lambda p: (p.name.casefold(), p.name))


def key(value):
    return value.strip().casefold()


def booking_state(value):
    value = re.sub(' +', ' ', value.strip(' ')).lower()
    if value.startswith('cancelled'):
        return 'cancelled'
    if value in ('confirmed', 'past guest', 'currently hosting', 'review guest'):
        return 'confirmed'
    return None


def parse_earnings(value):
    if not value:
        return None, None
    match = re.fullmatch(r'(-?)(£|€|\$|GBP|EUR|USD)\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)', value.strip())
    if not match:
        raise ValueError('Invalid reservation CSV earnings; expected a currency and an amount with at most two decimal places.')
    sign, symbol, amount = match.groups()
    currency = {'£': 'GBP', '€': 'EUR', '$': 'Unknown ($)'}.get(symbol, symbol)
    pennies = int(Decimal(sign + amount.replace(',', '')) * 100)
    if abs(pennies) > 999_999_999_999_999:
        raise ValueError('Reservation CSV earnings exceed safe spreadsheet precision.')
    return currency, pennies


def load_csv_files(files):
    columns, records, provenance = [], [], []
    for path in files:
        payload = path.read_bytes()
        if len(payload) > 32 * 1024 * 1024:
            raise ValueError('Reservation CSV exceeds the 32 MiB input limit.')
        try:
            reader = csv.DictReader(io.StringIO(payload.decode('utf-8-sig'), newline=''), strict=True)
            headers = reader.fieldnames
            if (not headers or len(set(headers)) != len(headers) or not set(CSV_COLUMNS) <= set(headers)
                    or {'Source filename', 'Source row'} & set(headers)):
                raise ValueError('Reservation CSV headers are missing, duplicated or conflict with provenance columns.')
            columns.extend(h for h in headers if h not in columns)
            count = 0
            for source_row, row in enumerate(reader, 2):
                if None in row or None in row.values():
                    raise ValueError('Reservation CSV is not rectangular.')
                if any(len(value) > 32767 for value in row.values()):
                    raise ValueError('Reservation CSV text exceeds the spreadsheet cell limit.')
                typed = dict(row)
                for field in ('Start date', 'End date', 'Booked'):
                    value = row[field]
                    if value:
                        pattern = '%Y-%m-%d' if field == 'Booked' else '%d/%m/%Y'
                        parsed = datetime.strptime(value, pattern).date()
                        if parsed.strftime(pattern) != value:
                            raise ValueError('Invalid reservation CSV date format.')
                        typed[field] = parsed
                    else:
                        typed[field] = None
                for field in ('# of adults', '# of children', '# of infants', '# of nights'):
                    value = row[field]
                    if value and (not re.fullmatch(r'\d+', value) or int(value) > 999_999_999_999_999):
                        raise ValueError('Invalid reservation CSV guest count or stay length.')
                    typed[field] = int(value) if value else None
                currency, earnings = parse_earnings(row['Earnings'])
                typed['Earnings'] = earnings
                records.append(dict(raw=row, typed=typed, currency=currency, filename=path.name, source_row=source_row))
                count += 1
                if len(records) > 50_000:
                    raise ValueError('Reservation CSVs exceed the 50,000-row limit.')
            provenance.append(dict(filename=path.name, sha256=hashlib.sha256(payload).hexdigest(), rows=count))
        except (UnicodeError, csv.Error, OverflowError) as error:
            raise ValueError('Reservation CSV is not valid rectangular UTF-8 CSV.') from error
        except ValueError as error:
            # datetime errors include the supplied private cell value; never propagate it.
            if str(error).startswith(('time data ', 'unconverted data remains:', 'day is out of range', 'month must be', 'year ')):
                raise ValueError('Invalid reservation CSV date.') from error
            raise
    return columns, records, provenance


def stay_key(row, csv_record=False):
    if csv_record:
        values = row['typed']
        arrival, departure = values['Start date'], values['End date']
        return (key(values['Listing']), arrival.isoformat(), departure.isoformat()) if values['Listing'] and arrival and departure else None
    return (key(row['source_listing_name']), row['arrival'], row['departure']) if row['source_listing_name'] and row['arrival'] and row['departure'] else None


def compare_field(record, evidence, field):
    label, csv_field, extract_field, kind = field
    left, right = record['typed'][csv_field], evidence[extract_field]
    currency, difference, note = '', None, ''
    if kind in ('host', 'headline'):
        currency = evidence['host_currency' if kind == 'host' else 'reservation_currency']
        note = f'CSV currency: {record["currency"] or "missing"}; extract currency: {currency or "missing"}. No currency conversion.'
    if left is None or left == '' or right == '':
        result = 'Missing both' if (left is None or left == '') and right == '' else 'Missing in CSV' if left is None or left == '' else 'Missing in extract'
        return dict(field=label, kind=kind, result=result, difference=None, currency=currency, note=note)
    if kind in ('host', 'headline'):
        if record['currency'] != currency or record['currency'] not in ('GBP', 'EUR', 'USD'):
            result = 'Needs review'
        else:
            difference = left - int(Decimal(right) * 100)
            result = 'Equal' if difference == 0 else 'Different'
            note = 'Difference = CSV minus extract.'
    elif kind == 'state':
        a, b = booking_state(left), booking_state(right)
        result = 'Needs review' if a is None or b is None else 'Equivalent state' if a == b else 'Different'
        note = 'Compare confirmed/cancelled state. Original time-dependent labels and cancellation attribution are retained.'
    else:
        a = left.isoformat() if kind == 'date' else re.sub(' +', ' ', left.strip(' ')).lower() if kind == 'text' else left
        b = int(right) if kind == 'integer' else re.sub(' +', ' ', right.strip(' ')).lower() if kind == 'text' else right
        result = 'Equal' if a == b else 'Different'
    return dict(field=label, kind=kind, result=result, difference=difference, currency=currency, note=note)


def reconcile(source, files):
    """Return supplementary evidence only. Never mutate the source or analysis."""
    columns, records, provenance = load_csv_files(files)
    evidence = source['reservations']
    csv_codes = Counter(key(row['raw']['Confirmation code']) for row in records if row['raw']['Confirmation code'].strip())
    extract_codes, dates = defaultdict(list), defaultdict(list)
    for i, row in enumerate(evidence):
        if row['confirmation_code'].strip():
            extract_codes[key(row['confirmation_code'])].append(i)
        elif stay_key(row):
            dates[stay_key(row)].append(i)
    review, comparisons, references, confirmed = [], [], defaultdict(list), set()
    for csv_index, record in enumerate(records):
        code = key(record['raw']['Confirmation code'])
        matches = extract_codes.get(code, []) if code else []
        if code and (csv_codes[code] > 1 or len(matches) > 1):
            method, candidates = 'Duplicate confirmation code', matches
        elif len(matches) == 1:
            method, candidates = METHOD_CODE, matches
            confirmed.add(matches[0])
        else:
            candidates = dates.get(stay_key(record, True), [])
            method = METHOD_DATE if len(candidates) == 1 else 'Multiple provisional candidates' if candidates else METHOD_NONE
        item = dict(csv_index=csv_index, method=method, candidates=list(candidates), differences=0, missing=0, needs_review=0, fields=[])
        for extract_index in candidates:
            references[extract_index].append(csv_index)
            for field in FIELDS:
                comparison = compare_field(record, evidence[extract_index], field)
                comparison.update(csv_index=csv_index, extract_index=extract_index, method=method)
                comparisons.append(comparison)
                outcome = comparison['result']
                if outcome == 'Different':
                    item['differences'] += 1
                    item['fields'].append(field[0])
                elif outcome.startswith('Missing'):
                    item['missing'] += 1
                elif outcome == 'Needs review':
                    item['needs_review'] += 1
            if len(comparisons) > 500_000:
                raise ValueError('Reservation reconciliation exceeds the comparison-row limit.')
        item['fields'] = list(dict.fromkeys(item['fields']))
        review.append(item)
    # Explain host discrepancies using contributing roots, never repeated totals.
    host_components = defaultdict(list)
    for line in source['lines']:
        if line['perspective'] == 'host_earnings' and line['contributes_to_panel_total'] == 'true':
            host_components[line['reservation_id']].append(line)
    for comparison in comparisons:
        if comparison['field'] != 'Host-panel total' or comparison['result'] != 'Different':
            continue
        row = evidence[comparison['extract_index']]
        lines = host_components[row['reservation_id']]
        if (lines and len({line['financial_summary_id'] for line in lines}) == 1
                and all(line['currency'] == row['host_currency'] and line['currency_minor_unit_scale'] == '2' and line['amount_minor'] for line in lines)):
            total = sum(int(line['amount_minor']) for line in lines)
            comparison['note'] += f' Extract contributing host components total {row["host_currency"]} {Decimal(total)/100:.2f}; stored host panel {row["host_total_decimal"]}; arithmetic status {row["host_arithmetic_status"]}. This does not establish why the CSV differs.'
    summary = dict(csv_files=len(files), csv_reservations=len(records), extract_reservations=len(evidence),
                   confirmed_matches=sum(r['method'] == METHOD_CODE for r in review),
                   provisional_matches=sum(r['method'] == METHOD_DATE for r in review),
                   unmatched_csv=sum(r['method'] == METHOD_NONE for r in review),
                   ambiguous_csv=sum(r['method'] not in (METHOD_CODE, METHOD_DATE, METHOD_NONE) for r in review),
                   extract_without_confirmed_match=len(evidence)-len(confirmed),
                   extract_without_candidate=sum(i not in references for i in range(len(evidence))),
                   different_fields=sum(c['result'] == 'Different' for c in comparisons),
                   missing_fields=sum(c['result'].startswith('Missing') for c in comparisons),
                   needs_review=sum(c['result'] == 'Needs review' for c in comparisons),
                   earnings_discrepancies=sum(c['field'] == 'Host-panel total' and c['result'] == 'Different' for c in comparisons))
    return dict(columns=columns, records=records, provenance=provenance, review=review, comparisons=comparisons,
                references=references, confirmed=confirmed, summary=summary)


def guide_section(data):
    if data is None:
        return ''
    s = data['summary']
    sources = '\n'.join(f'| {p["filename"].replace("|", "&#124;")} | {p["rows"]} | `{p["sha256"]}` |' for p in data['provenance'])
    return f'''\n## Reservation CSV reconciliation

The supplementary **Review**, **Comparisons**, **CSV reservations** and
**Extract reservations** tabs compare {s['csv_reservations']} CSV reservations
with {s['extract_reservations']} reservations from the selected ZIP.
There are {s['confirmed_matches']} confirmed code matches, {s['provisional_matches']}
unique provisional date/listing matches, {s['unmatched_csv']} CSV rows without an
extract counterpart and {s['ambiguous_csv']} rows with ambiguous keys or candidates.
{s['extract_without_confirmed_match']} extract records have no confirmed code match;
{s['extract_without_candidate']} have no CSV candidate at all. The provisional CSV
rows and unresolved extract records overlap and must not be added together.

**Comparisons** contains {s['different_fields']} differing field comparisons,
{s['missing_fields']} missing field comparisons and {s['needs_review']} comparisons
needing review. {s['earnings_discrepancies']} host-panel earnings comparisons differ.
Filter the results to inspect both source values. Missing data is distinct from
zero. Booking-state comparisons preserve original status labels and do not infer
a confirmed state from ambiguous labels such as “Trip change sent”. Earnings
differences are CSV minus extract in the same currency, calculated in pennies.
Headline and panel totals are checked separately; host and guest perspectives
are never combined. Guest names and contacts originate only from the CSV exports.

**Review** lists every CSV row and every extract record without a confirmed code
match. A unique match on listing, arrival and departure is only a suggestion for
records lacking extract confirmation codes. Duplicate codes, multiple candidates
and candidate reuse remain visible. Neither suggestions nor CSV statuses change
pricing, eligibility or reviewed status adjustments.

**CSV reservations** preserves original columns and adds source filename and
logical CSV record number (header = 1). Dates and amounts are typed for sorting;
identifiers, contacts and literal formula-looking text remain text. The separate
**Extract reservations** tab retains all original index fields. Source files are
unchanged. Refresh by regenerating from the intended ZIP and CSV files; adding or
editing source rows in the workbook does not rerun matching or classification.

| CSV file | Rows | SHA-256 |
| --- | ---: | --- |
{sources}

These CSV exports do not carry an archive binding. Their inclusion does not
establish that they were captured at the same time as the ZIP. An empty CSV
directory adds no tabs; header-only exports add empty CSV/review tables and keep
all extract reservations visible. Use `--no-reservation-csvs` for the historical
13-tab output or `--reservation-csv-dir PATH` for another directory.
'''
