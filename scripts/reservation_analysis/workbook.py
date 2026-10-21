"""XLSX presentation, formula lineage and independently computed formula caches."""
from __future__ import annotations

import calendar
import json
import math
from collections import Counter
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

import xlsxwriter
from xlsxwriter.utility import xl_col_to_name as col

from .model import PRODUCTS, SHEETS, accommodation, adjustment, numeric, statistics
MONEY = '"£"#,##0.00;[Red]("£"#,##0.00);"£"0.00'


def serial(value):
    return (date.fromisoformat(value) - date(1899, 12, 30)).days if value else None


def long_date(value, year=True):
    d = date.fromisoformat(value)
    return f'{d.day} {calendar.month_name[d.month]}' + (f' {d.year}' if year else '')


def word(number):
    return {0: 'zero', 1: 'one', 2: 'two', 3: 'three'}.get(number, str(number))


def bands(r):
    lead, count, party, pets = numeric(r['booking_lead_days']), int(r['nights']), numeric(r['party_size']), numeric(r['pets'])
    return [
        'Unknown' if lead is None else 'Negative lead' if lead < 0 else next(label for limit, label in [(7, '0–7 days'), (30, '8–30 days'), (90, '31–90 days'), (180, '91–180 days'), (math.inf, '181+ days')] if lead <= limit),
        '1 night' if count == 1 else '2 nights' if count == 2 else '3 nights' if count == 3 else '4–6 nights' if count <= 6 else '7+ nights',
        'Unknown' if party is None else next(label for limit, label in [(2, '1–2 people'), (4, '3–4 people'), (6, '5–6 people'), (8, '7–8 people'), (math.inf, '9+ people')] if party <= limit),
        'Unknown' if pets is None else 'No pets recorded' if pets == 0 else 'Pets recorded',
    ]


class Workbook:
    def __init__(self, path, analysis, reconciliation=None):
        self.a = analysis
        self.reconciliation = reconciliation
        self.source = analysis['source']
        self.layout = json.loads(Path(__file__).with_name('layout.json').read_text(encoding='utf-8'))
        self.book = xlsxwriter.Workbook(path, {'strings_to_formulas': False, 'strings_to_urls': False})
        self.book.set_properties({'title': 'Reservation analysis', 'author': 'Olrig Bank', 'comments': 'Generated from reservation evidence; pricing method 1.1.'})
        self.sheets = {name: self.book.add_worksheet(name) for name in SHEETS}
        self.cells = {name: {} for name in SHEETS}
        self.formats = {}
        self.end = {}
        self.source_columns = {}
        self.line_rows = {l['financial_line_id']: i for i, l in enumerate(self.source['lines'], 6) if l['financial_line_id']}
        self.line_amounts = {l['financial_line_id']: int(l['amount_minor']) for l in self.source['lines'] if l['financial_line_id']}
        self.panel_first_rows = {}
        for i, line in enumerate(self.source['lines'], 6):
            self.panel_first_rows.setdefault((line['reservation_id'], line['financial_summary_id']), i)
        self.stay_rows = {s['raw']['reservation_id']: s['row'] for s in analysis['states']}
        counts = Counter(c['evidence_type'] for c in analysis['evidence']['adjustments'])
        audit_date = analysis['evidence']['audited_on']
        self.context = dict(archive=self.source['path'].name, sha256=self.source['sha256'], exported=self.source['exported'],
            as_of_long=long_date(analysis['as_of']), as_of_short=long_date(analysis['as_of'], False),
            audit_long=long_date(audit_date) if audit_date else 'no supplementary audit',
            audit_short=long_date(audit_date, False) if audit_date else 'no supplementary',
            reservation_count=len(analysis['states']), line_count=len(self.line_rows), panel_count=len(analysis['panel_rows']),
            adjustments=analysis['adjustments'], unknown_count=sum(s['raw']['normalised_status'] == 'unknown' for s in analysis['states']),
            card_count=counts['Confirmed booking card'], accepted_count_word=word(counts['Airbnb Request accepted service event']))
        for name, sheet in self.sheets.items():
            sheet.hide_gridlines(2)
            sheet.set_default_row(22)
            sheet.freeze_panes(5, 2)
            sheet.set_column(0, 99, 25, self.fmt())
            for address, value in self.layout['notes'][name].items():
                self.put(name, address, self.text(value), style='title' if address == 'A2' else 'note')
        if not analysis['adjustments']:
            self.put('Overview', 'A3', f"Original export retained; no supplementary status corrections. Analysis as-of {long_date(analysis['as_of'])}.", style='note')
            self.put('Status adjustments', 'A3', 'No supplementary status evidence supplied; original source statuses are used.', style='note')

    def text(self, value):
        return value.format(**self.context) if isinstance(value, str) else value

    def fmt(self, style=None):
        if style not in self.formats:
            spec = {'font_name': 'Arial', 'font_size': 10, 'font_color': '#243348', 'valign': 'vcenter'}
            spec.update({
                'title': {'font_size': 14, 'bold': True},
                'note': {'font_color': '#667085', 'italic': True},
                'header': {'bg_color': '#234B73', 'font_color': '#FFFFFF', 'bold': True, 'text_wrap': True},
                'section': {'bold': True, 'bg_color': '#DCE8F2'},
                'money': {'num_format': MONEY}, 'whole': {'num_format': '"£"#,##0'},
                'percent': {'num_format': '0.0%'}, 'date': {'num_format': 'dd mmm yyyy'},
                'decimal': {'num_format': '0.0'}, 'wrap': {'text_wrap': True},
                'input': {'bg_color': '#FFF2CC', 'border': 1},
                'input_percent': {'bg_color': '#FFF2CC', 'num_format': '0%', 'border': 1},
            }.get(style, {}))
            self.formats[style] = self.book.add_format(spec)
        return self.formats[style]

    def put(self, name, address, value=None, formula=None, style=None):
        if isinstance(value, str) and len(value) > 32767:
            raise ValueError('Generated text exceeds the XLSX cell limit; refusing to truncate evidence.')
        if formula and len(formula) > 8192:
            raise ValueError('Generated formula exceeds the Excel formula limit.')
        self.cells[name][address] = value
        sheet = self.sheets[name]
        if formula:
            sheet.write_formula(address, '=' + formula.lstrip('='), self.fmt(style), '' if value is None else value)
        elif value is None or value == '':
            sheet.write_blank(address, None, self.fmt(style))
        elif isinstance(value, str):
            sheet.write_string(address, value, self.fmt(style))
        else:
            sheet.write_number(address, value, self.fmt(style))

    def row(self, name, row, values, styles=None):
        for i, value in enumerate(values):
            self.put(name, f'{col(i)}{row}', value, style=(styles or {}).get(i))

    def table(self, name, headers=None, count=0, row=5, key=None):
        headers = headers or self.layout['headers'][name]
        sheet = self.sheets[name]
        sheet.set_row(row - 1, 48, self.fmt('header'))
        self.end[name] = row + count
        for i, header in enumerate(headers):
            self.put(name, f'{col(i)}{row}', header, style='header')
            width = 40 if header in ('Reservation ID', 'reservation_id') else 50 if 'listing' in header.lower() else 27
            sheet.set_column(i, i, width, self.fmt())
        # XlsxWriter requires a data row for a table. Empty samples keep headers only.
        if count:
            sheet.add_table(row - 1, 0, row + count - 1, len(headers) - 1, {
                'name': key or name.replace(' ', '') + 'Evidence', 'style': 'Table Style Medium 2',
                'columns': [{'header': h, 'header_format': self.fmt('header')} for h in headers]})

    def source_ref(self, name, field, row):
        return f"'{name}'!{self.source_columns[name][field]}{row}"

    def source_sum(self, ids):
        return 'SUM(' + ','.join(f"'Source lines'!W{self.line_rows[i]}" for i in ids) + ')' if ids else '0'

    def amount(self, ids):
        return sum(self.line_amounts[i] for i in ids) / 100

    def sources(self):
        for name, dataset in [('Source stays', 'reservations.csv'), ('Source lines', 'financial-lines.csv'), ('Columns', 'columns.csv')]:
            headers, rows = self.source['datasets'][dataset]
            self.source_columns[name] = {field: col(i) for i, field in enumerate(headers)}
            self.table(name, headers, len(rows))
            for ri, row in enumerate(rows, 6):
                for ci, field in enumerate(headers):
                    value = row[field] or None
                    kind = self.source['types'].get((dataset, field), 'text')
                    if value is not None and ('integer' in kind or 'decimal' in kind):
                        value = int(value) if 'integer' in kind else float(Decimal(value))
                    formula = '"' + value.replace('"', '""') + '"' if value and kind == 'UTC timestamp' else None
                    self.put(name, f'{col(ci)}{ri}', value, formula)
            if name == 'Columns':
                self.sheets[name].set_column('D:E', 85, self.fmt('wrap'))

    def stays(self):
        name = 'Stay analysis'
        states = self.a['states']
        self.table(name, count=len(states))
        pairs = Counter((s['product'], s['raw']['arrival'], s['raw']['departure']) for s in states)
        for s in states:
            r, i, chosen = s['raw'], s['row'], s['selected']
            change = s['change']
            s['bands'] = bands(r)
            s['positions'] = '; '.join(str(e['position']) for e in change['entries']) if change else None
            s['dates'] = '; '.join(e['displayed_date'] for e in change['entries']) if change else None
            s['basis'] = change['evidence_type'] if change else 'Original stored status'
            values = [r['reservation_id'], s['product'], r['source_listing_name'], s['effective'], serial(r['arrival']), serial(r['departure']), int(r['nights']),
                'Included' if s['eligible'] else 'Excluded', s['reason'], ('Estimated' if s['norm']['nights'][0]['estimated'] else 'Dated') if isinstance(s['norm'], dict) else None,
                None, None, None, None, *[numeric(r[k]) for k in ['booking_lead_days', 'party_size', 'adults', 'children', 'infants', 'pets']],
                r['cancellation_policy'] or None, serial(r['booking_date']), r['confirmation_code'] or None, r['quality_flags'] or None,
                s['semantic'], pairs[(s['product'], r['arrival'], r['departure'])] - 1, chosen['id'] if chosen else None, chosen['perspective'] if chosen else None,
                None, None, None, None, None, i, *s['bands'], r['normalised_status'], s['basis'], s['positions'], s['dates']]
            self.row(name, i, values, {4: 'date', 5: 'date', 21: 'date'})
            totals = []
            for dest, field in [('L', 'host_total_decimal'), ('M', 'guest_total_decimal')]:
                ref = self.source_ref('Source stays', field, i)
                v = float(r[field]) if r[field] else None
                totals.append(v)
                self.put(name, f'{dest}{i}', v, f'IF({ref}="","",{ref})', 'money')
            self.put(name, f'N{i}', totals[1] - totals[0] if all(v is not None for v in totals) else None,
                     f'IF(AND(ISNUMBER(L{i}),ISNUMBER(M{i})),M{i}-L{i},"")', 'money')
            for dest, perspective, kind in [('AE', 'host_earnings', 'host_service_fee'), ('AF', 'guest_paid', 'guest_service_fee')]:
                panel = next((p for p in s['panels'] if p['perspective'] == perspective), None)
                ids = [l['id'] for l in panel['lines'] if l['parentId'] is None and l['type'] == kind] if panel else []
                self.put(name, f'{dest}{i}', self.amount(ids) if panel else None, self.source_sum(ids) + '/100' if panel else '""', 'money')
            s['net'] = None
            if chosen:
                roots = [l for l in chosen['lines'] if l['parentId'] is None and l['type'] != 'total' and accommodation(l)]
                for dest, is_adjustment in [('AC', False), ('AD', True)]:
                    ids = [l['id'] for l in roots if bool(adjustment(l)) == is_adjustment]
                    self.put(name, f'{dest}{i}', self.amount(ids), self.source_sum(ids) + '/100', 'money')
                s['net'] = sum(l['amountPence'] for l in roots) / 100
                self.put(name, f'K{i}', s['net'], f'AC{i}+AD{i}', 'money')
                self.put(name, f'AG{i}', s['net'] / int(r['nights']), f'K{i}/G{i}', 'money')
            formulas = [
                f'IF(O{i}="","Unknown",IF(O{i}<0,"Negative lead",IF(O{i}<=7,"0–7 days",IF(O{i}<=30,"8–30 days",IF(O{i}<=90,"31–90 days",IF(O{i}<=180,"91–180 days","181+ days"))))))',
                f'IF(G{i}=1,"1 night",IF(G{i}=2,"2 nights",IF(G{i}=3,"3 nights",IF(G{i}<=6,"4–6 nights","7+ nights"))))',
                f'IF(P{i}="","Unknown",IF(P{i}<=2,"1–2 people",IF(P{i}<=4,"3–4 people",IF(P{i}<=6,"5–6 people",IF(P{i}<=8,"7–8 people","9+ people")))))',
                f'IF(T{i}="","Unknown",IF(T{i}=0,"No pets recorded","Pets recorded"))',
            ]
            for dest, v, f in zip(['AI', 'AJ', 'AK', 'AL'], s['bands'], formulas):
                self.put(name, f'{dest}{i}', v, f)
        self.sheets[name].set_column('I:I', 48)
        self.sheets[name].set_column('AN:AN', 52)

    def statuses(self):
        name = 'Status adjustments'
        self.table(name, count=len(self.a['states']))
        for s in self.a['states']:
            self.row(name, s['row'], [s['raw']['reservation_id'], s['raw']['confirmation_code'] or None, s['raw']['normalised_status'], s['effective'], s['basis'],
                s['positions'], s['dates'], self.a['evidence']['audit_reference'] if s['change'] else None,
                'Applied in workbook only' if s['change'] else 'No adjustment', 'Included' if s['eligible'] else 'Excluded', s['reason']])
        for c in ['E:E', 'H:H', 'K:K']:
            self.sheets[name].set_column(c, 65)

    def nightly(self):
        name = 'Night evidence'
        self.table(name, count=len(self.a['nights']))
        first = [set() for _ in range(4)]
        for n in self.a['nights']:
            i, sr = n['row'], n['state']['row']
            values = [n['reservationId'], n['product'], serial(n['date']), n['year'], n['month'], n['day'], None, None, None,
                      'Estimated' if n['estimated'] else 'Dated', int(n['estimated']), n['state']['selected']['id'], '; '.join(n['gross']) or None,
                      '; '.join(n['discount']) or None, sr, None, None, None, None]
            self.row(name, i, values, {2: 'date'})
            for c, ids in [('G', n['gross']), ('H', n['discount'])]:
                self.put(name, f'{c}{i}', None if n['estimated'] else self.amount(ids), '""' if n['estimated'] else self.source_sum(ids) + '/100', 'money')
            f = f'(QUOTIENT(ROUND(\'Stay analysis\'!K{sr}*100,0),\'Stay analysis\'!G{sr})+IF({n["offset"]}<MOD(ROUND(\'Stay analysis\'!K{sr}*100,0),\'Stay analysis\'!G{sr}),1,0))/100' if n['estimated'] else f'G{i}+H{i}'
            self.put(name, f'I{i}', n['amountPence'] / 100, f, 'money')
            for j, (c, by_year, by_day) in enumerate([('P', False, False), ('Q', True, False), ('R', False, True), ('S', True, True)]):
                key = (n['product'], n['month'], n['year'] if by_year else n['reservationId']) + ((n['day'],) if by_day else ())
                value = int(key not in first[j]); first[j].add(key)
                k = 'D' if by_year else 'A'
                day = f',$F$6:F{i},F{i}' if by_day else ''
                self.put(name, f'{c}{i}', value, f'IF(COUNTIFS($B$6:B{i},B{i},$E$6:E{i},E{i},${k}$6:{k}{i},{k}{i}{day})=1,1,0)')

    def prices(self):
        name = 'Price guide'
        self.table(name, count=len(PRODUCTS) * 36)
        groups = []
        for p in PRODUCTS:
            for month in range(1, 13):
                for day in ['All nights', 'Weekday', 'Weekend']:
                    sample = [n for n in self.a['nights'] if n['product'] == p and n['month'] == month and (day == 'All nights' or not n['estimated'] and n['day'] == day)]
                    groups.append(dict(product=p, month=month, day=day, row=len(groups) + 6, sample=sample, stats=statistics(sample)))
        self.groups = groups
        for g in groups:
            i, stats, sample = g['row'], g['stats'], g['sample']
            pool = next(p for p in groups if p['product'] == g['product'] and p['month'] == g['month'] and p['day'] == 'All nights')
            pi = pool['row']
            self.row(name, i, [g['product'], g['month'], g['day']])
            for c, key in [('D', 'reservations'), ('E', 'nights'), ('F', 'years')]:
                if sample:
                    start, end = sample[0]['row'], sample[-1]['row']
                    helper = ('Q' if g['day'] == 'All nights' else 'S') if c == 'F' else ('P' if g['day'] == 'All nights' else 'R')
                    f = f"COUNT('Night evidence'!I{start}:I{end})" if c == 'E' else f"SUM('Night evidence'!{helper}{start}:{helper}{end})"
                else:
                    f = '0'
                self.put(name, f'{c}{i}', stats[key], f)
            if sample:
                rng = f"'Night evidence'!I{sample[0]['row']}:I{sample[-1]['row']}"
                for c, key, f in [('G', 'lower', f'PERCENTILE({rng},0.25)'), ('H', 'median', f'MEDIAN({rng})'), ('I', 'upper', f'PERCENTILE({rng},0.75)'), ('J', 'mean', f'AVERAGE({rng})')]:
                    self.put(name, f'{c}{i}', stats[key] / 100, f, 'money')
                self.put(name, f'K{i}', stats['estimated'], f"SUM('Night evidence'!K{sample[0]['row']}:K{sample[-1]['row']})/E{i}", 'percent')
            own = f'AND(D{i}>=Overview!$B$8,E{i}>=Overview!$B$9,F{i}>=Overview!$B$10)'
            pooled = f'AND(D{pi}>=Overview!$B$8,E{pi}>=Overview!$B$9,F{pi}>=Overview!$B$10)'
            basis = stats if stats['supported'] else pool['stats'] if g['day'] != 'All nights' and pool['stats']['supported'] else None
            label = ('Supported monthly sample' if g['day'] == 'All nights' else 'Supported day-type sample') if stats['supported'] else 'Monthly fallback' if basis else 'Insufficient history'
            g['basis'], g['label'] = basis, label
            monthly = g['day'] == 'All nights'
            self.put(name, f'L{i}', label, f'IF({own},"Supported monthly sample","Insufficient history")' if monthly else f'IF({own},"Supported day-type sample",IF({pooled},"Monthly fallback","Insufficient history"))')
            baseline = basis['median'] / 100 if basis else None
            g['suggested'] = int(Decimal(str(baseline)).quantize(Decimal('1'), rounding=ROUND_HALF_UP)) if baseline is not None else None
            self.put(name, f'M{i}', baseline, f'IF({own},H{i},"")' if monthly else f'IF({own},H{i},IF({pooled},H{pi},""))', 'money')
            self.put(name, f'N{i}', g['suggested'], f'IF(ISNUMBER(M{i}),IF(AND(ISNUMBER(Overview!$B$6),Overview!$B$6>=-1,Overview!$B$6<=1),ROUND(M{i}*(1+Overview!$B$6),0),"Invalid uplift"),"")', 'whole')
            for c, source_c, key in [('O', 'D', 'reservations'), ('P', 'E', 'nights'), ('Q', 'F', 'years')]:
                self.put(name, f'{c}{i}', basis[key] if basis else None, f'IF(L{i}="Insufficient history","",IF(L{i}="Monthly fallback",{source_c}{pi},{source_c}{i}))')
        self.sheets[name].set_column('L:L', 36)

    def monthly(self):
        name = 'Monthly history'
        groups = [(p, period, [n for n in self.a['nights'] if n['product'] == p and n['date'].startswith(period)]) for p in PRODUCTS for period in sorted({n['date'][:7] for n in self.a['nights'] if n['product'] == p})]
        self.table(name, count=len(groups))
        for i, (p, period, nights) in enumerate(groups, 6):
            stats = statistics(nights)
            self.row(name, i, [p, period, stats['reservations']])
            refs = ','.join(f"'Night evidence'!I{n['row']}" for n in nights)
            for c, v, f, style in [('D', len(nights), f'COUNT({refs})', None), ('E', stats['total'] / 100, f'SUM({refs})', 'money'), ('F', stats['mean'] / 100, f'E{i}/D{i}', 'money'), ('G', stats['median'] / 100, f'MEDIAN({refs})', 'money')]:
                self.put(name, f'{c}{i}', v, f, style)
            sorted_nights = sorted(nights, key=lambda n: n['amountPence'])
            for c, q, key in [('H', .25, 'lower'), ('I', .75, 'upper')]:
                pos = (len(nights) - 1) * q
                a, b = sorted_nights[math.floor(pos)]['row'], sorted_nights[math.ceil(pos)]['row']
                self.put(name, f'{c}{i}', stats[key] / 100, f"'Night evidence'!I{a}+('Night evidence'!I{b}-'Night evidence'!I{a})*{pos-math.floor(pos)}", 'money')
            self.put(name, f'J{i}', stats['estimated'], 'SUM(' + ','.join(f"'Night evidence'!K{n['row']}" for n in nights) + f')/D{i}', 'percent')

    def patterns(self):
        name = 'Stay patterns'
        categories = [('Lead time', 'AI', ['0–7 days', '8–30 days', '31–90 days', '91–180 days', '181+ days', 'Unknown', 'Negative lead']),
            ('Length of stay', 'AJ', ['1 night', '2 nights', '3 nights', '4–6 nights', '7+ nights']),
            ('Party size', 'AK', ['1–2 people', '3–4 people', '5–6 people', '7–8 people', '9+ people', 'Unknown']),
            ('Pets', 'AL', ['No pets recorded', 'Pets recorded', 'Unknown']),
            ('Cancellation policy', 'U', sorted({s['raw']['cancellation_policy'] or 'Unknown' for s in self.a['states']}))]
        self.table(name, count=sum(len(c[2]) for c in categories))
        i = 6
        end = self.end['Stay analysis']
        rng = lambda c: f"'Stay analysis'!${c}$6:${c}${end}"
        for category, field, labels in categories:
            for label in labels:
                selected = [s for s in self.a['states'] if s['eligible'] and s['product'] == PRODUCTS[0] and (s['raw']['cancellation_policy'] or 'Unknown' if field == 'U' else s['bands'][['AI', 'AJ', 'AK', 'AL'].index(field)]) == label]
                leads = [numeric(s['raw']['booking_lead_days']) for s in selected if numeric(s['raw']['booking_lead_days']) is not None and numeric(s['raw']['booking_lead_days']) >= 0]
                count, nights = len(selected), sum(int(s['raw']['nights']) for s in selected)
                amount = sum(round(s['net'] * 100) for s in selected) / 100
                criterion = f'IF(B{i}="Unknown","",B{i})' if field == 'U' else f'B{i}'
                criteria = f'{rng("B")},Overview!$B$5,{rng("H")},"Included",{rng(field)},{criterion}'
                known = f'{criteria},{rng("AI")},"<>Unknown",{rng("AI")},"<>Negative lead"'
                self.row(name, i, [category, label])
                for c, v, f, style in [('C', count, f'COUNTIFS({criteria})', None), ('D', nights, f'SUMIFS({rng("G")},{criteria})', None), ('E', amount, f'SUMIFS({rng("K")},{criteria})', 'money'),
                    ('F', amount / nights if nights else None, f'IF(D{i}>0,E{i}/D{i},"")', 'money'), ('G', nights / count if count else None, f'IF(C{i}>0,D{i}/C{i},"")', 'decimal'),
                    ('H', len(leads), f'COUNTIFS({known})', 'decimal'), ('I', sum(leads) / len(leads) if leads else None, f'IF(H{i}>0,SUMIFS({rng("O")},{known})/H{i},"")', 'decimal')]:
                    self.put(name, f'{c}{i}', v, f, style)
                i += 1

    def audit(self):
        name = 'Panel audit'
        self.table(name, count=len(self.a['panel_rows']))
        self.audit_rows = {}
        i = 6
        end = max(6, self.end['Source lines'])
        for state in self.a['states']:
            for panel in state['panels']:
                first_row = self.panel_first_rows[(state['raw']['reservation_id'], panel['id'])]
                root_rows = [l for l in panel['rows'] if l['contributes_to_panel_total'] == 'true']
                total = sum(int(l['amount_minor']) for l in root_rows) / 100
                stored = panel['totalPence'] / 100
                expected = int(state['raw']['financial_line_count'])
                actual = sum(l['row_kind'] == 'financial_line' for l in self.a['reservation_lines'][state['raw']['reservation_id']])
                review = 'Check guest perspective' if state['semantic'] and panel['perspective'] == 'guest_paid' else None
                self.row(name, i, [state['raw']['reservation_id'], state['product'], panel['id'], panel['perspective'], panel['currency'], None, None, None,
                    panel['arithmeticStatus'], None, len(panel['lines']), len(root_rows), review, None, None, None])
                for c, v, f, style in [('F', stored, f"'Source lines'!AC{first_row}/100", 'money'),
                    ('G', total, f'SUMIFS(\'Source lines\'!$W$6:$W${end},\'Source lines\'!$J$6:$J${end},C{i},\'Source lines\'!$AB$6:$AB${end},"true")/100', 'money'),
                    ('H', round(total - stored, 2), f'ROUND(G{i}-F{i},2)', 'money'), ('J', 'Reconciles' if round(total - stored, 2) == 0 else 'Discrepancy', f'IF(H{i}=0,"Reconciles","Discrepancy")', None),
                    ('N', expected, f"'Source stays'!AR{state['row']}", None), ('O', actual, f'COUNTIFS(\'Source lines\'!$A$6:$A${end},A{i},\'Source lines\'!$I$6:$I${end},"financial_line")', None), ('P', actual - expected, f'O{i}-N{i}', None)]:
                    self.put(name, f'{c}{i}', v, f, style)
                self.audit_rows[panel['id']] = i
                i += 1

    def overview(self):
        name = 'Overview'
        sheet = self.sheets[name]
        sheet.freeze_panes(14, 1)
        sheet.set_column('A:A', 34); sheet.set_column('B:C', 22); sheet.set_column('D:I', 28)
        for address, value in self.layout['overview_labels'].items():
            if address not in ('A2', 'A3'):
                self.put(name, address, self.text(value), style='section' if address in ('A4', 'D4', 'A39') else None)
        self.put(name, 'B5', PRODUCTS[0], style='input')
        self.put(name, 'B6', 0, style='input_percent')
        sheet.data_validation('B5', {'validate': 'list', 'source': PRODUCTS})
        sheet.data_validation('B6', {'validate': 'decimal', 'criteria': 'between', 'minimum': -1, 'maximum': 1, 'input_title': 'Suggested-price uplift', 'input_message': 'Enter a percentage between -100% and 100%.', 'error_title': 'Invalid uplift', 'error_message': 'Enter a percentage between -100% and 100%.'})
        for c, v, style in [('B7', serial(self.a['as_of']), 'date'), ('B8', 5, None), ('B9', 20, None), ('B10', 2, None)]:
            self.put(name, c, v, style=style)
        se, le, ne = self.end['Stay analysis'], max(6, self.end['Source lines']), max(6, self.end['Night evidence'])
        whole = [s for s in self.a['states'] if s['eligible'] and s['product'] == PRODUCTS[0]]
        ns = [n for n in self.a['nights'] if n['product'] == PRODUCTS[0]]
        values = [('E5', len(self.a['states']), f"COUNTA('Source stays'!A6:A{se})", None), ('E6', len(self.line_rows), f"COUNTA('Source lines'!N6:N{le})", None),
            ('E7', len(whole), f'COUNTIFS(\'Stay analysis\'!B6:B{se},B5,\'Stay analysis\'!H6:H{se},"Included")', None),
            ('E8', len(ns), f"COUNTIFS('Night evidence'!B6:B{ne},B5)", None),
            ('E9', sum(n['estimated'] for n in ns) / len(ns) if ns else None, f'IF(E8>0,SUMIFS(\'Night evidence\'!K6:K{ne},\'Night evidence\'!B6:B{ne},B5)/E8,"")', 'percent'),
            ('E10', sum(n['amountPence'] for n in ns) / 100 if ns else None, f'IF(E8>0,SUMIFS(\'Night evidence\'!I6:I{ne},\'Night evidence\'!B6:B{ne},B5),"")', 'money')]
        for c, v, f, style in values:
            self.put(name, c, v, f, style)
        self.row(name, 14, ['Month', 'Reservations', 'Nights', 'Median', 'Lower quartile', 'Upper quartile', 'Weekday suggestion', 'Weekend suggestion', 'Evidence basis'])
        for ci in range(9):
            self.put(name, col(ci) + '14', self.cells[name][col(ci) + '14'], style='header')
        sheet.set_row(13, 44)
        for month in range(1, 13):
            i = month + 14
            pool = next(g for g in self.groups if g['product'] == PRODUCTS[0] and g['month'] == month and g['day'] == 'All nights')
            self.put(name, f'A{i}', calendar.month_name[month])
            for c, source_c, key, style in [('B', 'D', 'reservations', None), ('C', 'E', 'nights', None), ('D', 'H', 'median', 'money'), ('E', 'G', 'lower', 'money'), ('F', 'I', 'upper', 'money')]:
                f = f'SUMIFS(\'Price guide\'!${source_c}$6:${source_c}$149,\'Price guide\'!$A$6:$A$149,$B$5,\'Price guide\'!$B$6:$B$149,{month},\'Price guide\'!$C$6:$C$149,"All nights")'
                v = pool['stats'][key]
                if style:
                    v = v / 100 if v is not None else None
                    f = f'IF(C{i}>0,{f},"")'
                self.put(name, f'{c}{i}', v, f, style)
            for c, day in [('G', 'Weekday'), ('H', 'Weekend')]:
                g = next(g for g in self.groups if g['product'] == PRODUCTS[0] and g['month'] == month and g['day'] == day)
                criteria = f'\'Price guide\'!$A$6:$A$149,$B$5,\'Price guide\'!$B$6:$B$149,{month},\'Price guide\'!$C$6:$C$149,"{day}"'
                f = f'IF(COUNTIFS({criteria},\'Price guide\'!$M$6:$M$149,">0")>0,IF(AND(ISNUMBER($B$6),$B$6>=-1,$B$6<=1),SUMIFS(\'Price guide\'!$N$6:$N$149,{criteria}),"Invalid uplift"),"")'
                self.put(name, f'{c}{i}', g['suggested'], f, 'whole')
            self.put(name, f'I{i}', 'See Price guide basis' if pool['stats']['supported'] else 'Insufficient history',
                     f'IF(AND(B{i}>=$B$8,C{i}>=$B$9,SUMIFS(\'Price guide\'!$F$6:$F$149,\'Price guide\'!$A$6:$A$149,$B$5,\'Price guide\'!$B$6:$B$149,{month},\'Price guide\'!$C$6:$C$149,"All nights")>=$B$10),"See Price guide basis","Insufficient history")')
        self.row(name, 32, ['Source issue', 'Reservations', 'Meaning'])
        for c, v, f in [('B33', self.context['unknown_count'], f'COUNTIFS(\'Source stays\'!I6:I{se},"unknown")'),
            ('B34', sum(not s['raw']['booking_date'] for s in self.a['states']), f"COUNTBLANK('Source stays'!M6:M{se})"),
            ('B35', sum(bool(s['raw']['host_total_decimal']) and Decimal(s['raw']['host_total_decimal']) == 0 for s in self.a['states']), f'COUNTIFS(\'Source stays\'!AF6:AF{se},0,\'Source stays\'!AF6:AF{se},"<>")'),
            ('B36', sum(bool(s['semantic']) for s in self.a['states']), f'COUNTIFS(\'Stay analysis\'!Y6:Y{se},"Guest panel contains host service fee; check source")'),
            ('B37', sum(s['product'] == 'Unclassified' for s in self.a['states']), f'COUNTIFS(\'Stay analysis\'!B6:B{se},"Unclassified")'),
            ('B40', self.a['adjustments'], f'COUNTIFS(\'Status adjustments\'!I6:I{se},"Applied in workbook only")'),
            ('B41', self.a['remaining_unknown'], f'COUNTIFS(\'Status adjustments\'!D6:D{se},"unknown")')]:
            self.put(name, c, v, f)
        meanings = {33: f"{self.a['adjustments']} resolved in this workbook; raw export unchanged", 34: 'Lead-time comparisons are incomplete', 35: 'Retained in source; not evidence of a market rate', 36: 'Guest panel contains a host fee; inspect original evidence', 37: 'Requires accommodation classification', 40: 'Workbook only; database and ZIP unchanged', 41: 'One record still needs source review' if self.a['remaining_unknown'] == 1 else f"{self.a['remaining_unknown']} records still need source review", 42: 'Future, zero-value and financial checks still apply'}
        for row, value in meanings.items():
            self.put(name, f'C{row}', value)
        self.put(name, 'B42', self.a['added'])
        chart = self.book.add_chart({'type': 'column'})
        chart.add_series({'name': 'Nights', 'categories': '=Overview!$A$15:$A$26', 'values': '=Overview!$C$15:$C$26', 'fill': {'color': '#234B73'}, 'border': {'none': True}})
        chart.set_title({'name': 'Eligible nights by month'})
        chart.set_legend({'none': True}); chart.set_y_axis({'name': 'Nights', 'major_unit': 10})
        chart.set_size({'width': 720, 'height': 320})
        sheet.insert_chart('K4', chart)

    def unknown(self):
        name = 'Unknown status review'
        unknown = [s for s in self.a['states'] if s['raw']['normalised_status'] == 'unknown']
        headers = ['Analysis: ' + h for h in self.layout['headers']['Stay analysis']] + ['Source: ' + h for h in self.source['datasets']['reservations.csv'][0]]
        self.table(name, headers, len(unknown), 6, 'UnknownReservationDetails')
        for i, s in enumerate(unknown, 7):
            for offset, origin, width in [(0, 'Stay analysis', 42), (42, 'Source stays', len(self.source_columns['Source stays']))]:
                for c in range(width):
                    ref = f"'{origin}'!{col(c)}{s['row']}"
                    value = self.cells[origin].get(f'{col(c)}{s["row"]}')
                    style = 'date' if not offset and c in [4, 5, 21] else 'money' if not offset and c in [10, 11, 12, 13, 28, 29, 30, 31, 32] else None
                    self.put(name, f'{col(offset+c)}{i}', value, f'IF({ref}="","",{ref})', style)
        heading = len(unknown) + 13
        self.put(name, f'A{heading-3}', 'Financial evidence for the original unknown cohort; amounts remain unchanged.')
        self.put(name, f'A{heading-2}', 'Panel totals and audit values repeat. Select one perspective and sum only contributing root components.')
        ids = {s['raw']['reservation_id'] for s in unknown}
        rows = [(i, l) for i, l in enumerate(self.source['lines'], 6) if l['reservation_id'] in ids]
        headers = ['Financial: ' + h for h in self.source['datasets']['financial-lines.csv'][0]] + ['Panel audit: ' + h for h in self.layout['headers']['Panel audit']]
        self.table(name, headers, len(rows), heading, 'UnknownFinancialEvidence')
        for i, (origin_row, line) in enumerate(rows, heading + 1):
            for c in range(len(self.source_columns['Source lines'])):
                ref = f"'Source lines'!{col(c)}{origin_row}"
                self.put(name, f'{col(c)}{i}', self.cells['Source lines'].get(f'{col(c)}{origin_row}'), f'IF({ref}="","",{ref})')
            audit_row = self.audit_rows.get(line['financial_summary_id'])
            if audit_row:
                for c in range(16):
                    self.put(name, f'{col(c+43)}{i}', self.cells['Panel audit'].get(f'{col(c)}{audit_row}'))
        self.sheets[name].freeze_panes(6, 2)
        self.sheets[name].set_column('A:A', 42)
        self.sheets[name].set_column('B:B', 25)
        self.sheets[name].set_column('C:C', 54)

    def read_me(self, guide_name):
        name = 'Read me'
        self.table(name, ['Topic', 'Explanation'])
        self.sheets[name].set_column('A:A', 30)
        self.sheets[name].set_column('B:B', 110, self.fmt('wrap'))
        for r, (label, explanation) in self.layout['read_me'].items():
            i = int(r)
            value = self.text(explanation)
            if label == 'Usage guide':
                value = f'{guide_name} accompanies this workbook.'
            elif label == 'Known anomaly' and sum(bool(s['semantic']) for s in self.a['states']) != 1:
                value = f"{sum(bool(s['semantic']) for s in self.a['states'])} guest panels contain a host service fee; inspect the original evidence. Affected reservations remain excluded."
            elif label == 'Remaining unknown' and (self.a['remaining_unknown'] != 1 or not self.a['adjustments']):
                value = f"{self.a['remaining_unknown']} reservations remain unknown and excluded from pricing."
            elif label == 'Snapshot contract' and not self.a['adjustments']:
                value = 'Source tabs and ZIP are unchanged. No supplementary status corrections applied. Regenerate all derived sheets together for a new export.'
            self.put(name, f'A{i}', label)
            self.put(name, f'B{i}', value, '"' + value + '"' if label in ('Exported at', 'Schema version') else None, 'wrap')
            self.sheets[name].set_row(i - 1, 44)

    def build(self, guide_name):
        self.sources(); self.stays(); self.statuses(); self.nightly(); self.prices(); self.monthly()
        self.patterns(); self.audit(); self.overview(); self.unknown(); self.read_me(guide_name)
        if self.reconciliation is not None:
            from .reconciliation_workbook import ReconciliationWorkbook
            ReconciliationWorkbook(self, self.reconciliation).build()
        self.sheets['Overview'].activate()
        self.book.close()
