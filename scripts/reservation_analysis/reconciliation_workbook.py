"""Presentation and formula caches for optional supplementary reconciliation."""
from datetime import date
from decimal import Decimal
from math import ceil

from xlsxwriter.utility import xl_col_to_name as col

from .reconciliation import FIELDS, METHOD_CODE, METHOD_DATE, METHOD_NONE, RECONCILIATION_SHEETS


def excel_date(value):
    return (value - date(1899, 12, 30)).days if value else None


def missing(value):
    return value is None or value == ''


class ReconciliationWorkbook:
    def __init__(self, workbook, data):
        self.w = workbook
        self.data = data
        self.source = workbook.source
        self.date_fmt = self.w.book.add_format({'font_name': 'Arial', 'font_size': 10, 'num_format': 'dd/mm/yyyy', 'valign': 'vcenter'})
        self.currency_formats = {}
        self.decimal_fmt = self.w.book.add_format({'font_name':'Arial','font_size':10,'num_format':'#,##0.00;[Red]-#,##0.00'})
        self.csv_columns = [*data['columns'], 'Source filename', 'Source row']
        self.extract_columns = self.source['datasets']['reservations.csv'][0]
        for name in RECONCILIATION_SHEETS:
            sheet = self.w.book.add_worksheet(name)
            self.w.sheets[name] = sheet
            self.w.cells[name] = {}
            sheet.hide_gridlines(2)
            sheet.set_default_row(22)
            sheet.set_column(0, 49, 23, self.w.fmt())
            sheet.freeze_panes(7, 1)
        self.w.sheets['Review'].set_tab_color('#234B73')

    def put(self, name, address, value=None, formula=None, style=None):
        self.w.put(name, address, value, formula, style)

    def title(self, name, heading, note):
        self.put(name, 'A2', heading, style='title')
        self.put(name, 'A4', note, style='note')

    def table(self, name, headers, values, row=7, key=None):
        self.w.table(name, headers, len(values), row, key)
        for i, record in enumerate(values, row + 1):
            self.w.row(name, i, record)
        return row + len(values)

    def date_cell(self, name, address, value, formula=None):
        self.put(name, address, value, formula)
        if formula:
            self.w.sheets[name].write_formula(address, '=' + formula, self.date_fmt, '' if value is None else value)
        elif value is not None:
            self.w.sheets[name].write_number(address, value, self.date_fmt)

    def money_cell(self, name, address, pennies, currency, formula=None):
        if currency not in self.currency_formats:
            symbol = {'GBP': '£', 'EUR': '€', 'USD': '$', 'Unknown ($)': '$'}.get(currency, '')
            number_format = f'"{symbol}"#,##0.00;[Red]-"{symbol}"#,##0.00' if symbol else '#,##0.00;[Red]-#,##0.00'
            self.currency_formats[currency] = self.w.book.add_format({'font_name': 'Arial', 'font_size': 10, 'num_format': number_format, 'valign': 'vcenter'})
        value = None if pennies is None else pennies / 100
        self.put(name, address, value, formula)
        sheet, fmt = self.w.sheets[name], self.currency_formats[currency]
        if formula:
            sheet.write_formula(address, '=' + formula, fmt, '' if value is None else value)
        elif value is not None:
            sheet.write_number(address, value, fmt)

    def raw_ref(self, name, field, row):
        columns = self.csv_columns if name == 'CSV reservations' else self.extract_columns
        ref = f"'{name}'!{col(columns.index(field))}{row}"
        return f'IF(ISBLANK({ref}),"",{ref})'

    def sources(self):
        name = 'CSV reservations'
        self.title(name, 'Combined Airbnb reservations', 'Original export values, with source filename and logical CSV record number. Amounts and dates are typed.')
        values = [[None] * len(self.csv_columns) for _ in self.data['records']]
        self.table(name, self.csv_columns, values, key='CombinedReservations')
        for i, record in enumerate(self.data['records'], 8):
            for j, field in enumerate(self.data['columns']):
                address, value = f'{col(j)}{i}', record['typed'].get(field)
                if field in ('Start date', 'End date', 'Booked'):
                    self.date_cell(name, address, excel_date(value))
                elif field == 'Earnings':
                    self.money_cell(name, address, value, record['currency'])
                else:
                    self.put(name, address, value)
            self.put(name, f'{col(len(self.data["columns"]))}{i}', record['filename'])
            self.put(name, f'{col(len(self.data["columns"])+1)}{i}', record['source_row'])
        sheet = self.w.sheets[name]
        for i, field in enumerate(self.csv_columns):
            sheet.set_column(i, i, 54 if field == 'Listing' else 29 if field in ('Guest name', 'Status') else 23)
        self.put(name, 'A5', 'Source files: ' + ', '.join(p['filename'] for p in self.data['provenance']), style='note')

        name = 'Extract reservations'
        self.title(name, 'Reservation evidence extract', f'Source: {self.source["path"].name} — reservations.csv. All original index columns retained.')
        self.put(name, 'A5', 'Blank values remain blank. Original text escapes and exact timestamp text are retained.', style='note')
        rows = self.source['reservations']
        self.table(name, self.extract_columns, [[None]*len(self.extract_columns) for _ in rows], key='ExtractReservations')
        for i, record in enumerate(rows, 8):
            for j, field in enumerate(self.extract_columns):
                value, address = record[field] or None, f'{col(j)}{i}'
                kind = self.source['types'].get(('reservations.csv', field), 'text')
                if field in ('arrival', 'departure', 'booking_date'):
                    self.date_cell(name, address, excel_date(date.fromisoformat(value)) if value else None)
                else:
                    if value is not None and ('integer' in kind or 'decimal' in kind):
                        value = int(value) if 'integer' in kind else float(Decimal(value))
                    self.put(name, address, value)
                    if value is not None and field.endswith('_decimal'):
                        self.w.sheets[name].write_number(address, value, self.decimal_fmt)
        self.w.sheets[name].freeze_panes(7, 2)

    @staticmethod
    def state_formula(cell):
        cell = f'TRIM({cell})'
        return f'IF(LEFT(LOWER({cell}),9)="cancelled","cancelled",IF(OR(LOWER({cell})="confirmed",LOWER({cell})="past guest",LOWER({cell})="currently hosting",LOWER({cell})="review guest"),"confirmed",""))'

    def comparisons(self):
        name = 'Comparisons'
        self.title(name, 'Reservation field comparisons', 'Provisional comparisons do not confirm identity. Filter Result to Different, Missing in extract or Needs review.')
        self.put(name, 'A5', 'Snapshot: source or membership changes require regeneration. Differences are CSV minus extract, with no currency conversion.', style='note')
        headers = ['Confirmation code', 'Match method', 'Extract reservation ID', 'Field', 'Result', 'CSV value', 'Extract value',
                   'Currency', 'Difference (CSV − extract)', 'Source filename', 'Source row', 'Notes']
        end = self.table(name, headers, [[None]*len(headers) for _ in self.data['comparisons']], key='FieldComparisons')
        fields = {f[0]: f for f in FIELDS}
        self.comp_rows = {}
        for r, comparison in enumerate(self.data['comparisons'], 8):
            s, e = comparison['csv_index'], comparison['extract_index']
            self.comp_rows.setdefault(s, []).append((r, comparison))
            record, evidence = self.data['records'][s], self.source['reservations'][e]
            label, csv_field, extract_field, kind = fields[comparison['field']]
            left, right = record['typed'][csv_field], evidence[extract_field] or None
            self.w.row(name, r, [record['raw']['Confirmation code'], comparison['method'], evidence['reservation_id'], label, None,
                                 None, None, comparison['currency'], None, record['filename'], record['source_row'], comparison['note']])
            if len(comparison['note']) > 100:
                self.put(name, f'L{r}', comparison['note'], style='wrap')
                self.w.sheets[name].set_row(r-1, 22*ceil(len(comparison['note'])/90))
            f, g = self.raw_ref('CSV reservations', csv_field, s+8), self.raw_ref('Extract reservations', extract_field, e+8)
            if kind == 'date':
                self.date_cell(name, f'F{r}', excel_date(left), f)
                self.date_cell(name, f'G{r}', excel_date(date.fromisoformat(right)) if right else None, g)
            elif kind in ('host', 'headline'):
                self.money_cell(name, f'F{r}', left, record['currency'], f)
                self.money_cell(name, f'G{r}', int(Decimal(right)*100) if right else None, comparison['currency'], g)
            else:
                self.put(name, f'F{r}', left, f)
                self.put(name, f'G{r}', int(right) if kind == 'integer' and right is not None else right, g)
            blank_f = f'AND(NOT(ISNUMBER(F{r})),F{r}="")'
            blank_g = f'AND(NOT(ISNUMBER(G{r})),G{r}="")'
            if kind == 'state':
                a, b = self.state_formula(f'F{r}'), self.state_formula(f'G{r}')
                check = f'IF(OR({a}="",{b}=""),"Needs review",IF({a}={b},"Equivalent state","Different"))'
            elif kind in ('host', 'headline'):
                supported = record['currency'] == comparison['currency'] and record['currency'] in ('GBP', 'EUR', 'USD')
                check = f'IF(ROUND(F{r}*100,0)=ROUND(G{r}*100,0),"Equal","Different")' if supported else '"Needs review"'
                if supported:
                    self.money_cell(name, f'I{r}', comparison['difference'], comparison['currency'],
                                    f'IF(OR(NOT(ISNUMBER(F{r})),NOT(ISNUMBER(G{r}))),"",(ROUND(F{r}*100,0)-ROUND(G{r}*100,0))/100)')
            elif kind == 'text':
                check = f'IF(LOWER(TRIM(F{r}))=LOWER(TRIM(G{r})),"Equal","Different")'
            else:
                check = f'IF(F{r}=G{r},"Equal","Different")'
            formula = f'IF(AND({blank_f},{blank_g}),"Missing both",IF({blank_f},"Missing in CSV",IF({blank_g},"Missing in extract",{check})))'
            self.put(name, f'E{r}', comparison['result'], formula)
        sheet = self.w.sheets[name]
        for column, width in [('B:B', 30), ('C:C', 42), ('E:E', 24), ('F:G', 54), ('I:I', 27), ('L:L', 100)]:
            sheet.set_column(column, width)
        if end >= 8:
            sheet.conditional_format(f'E8:E{end}', {'type': 'formula', 'criteria': '=E8="Different"', 'format': self.w.book.add_format({'bg_color':'#FCE8E6','font_color':'#9D2525','bold':True})})
            sheet.conditional_format(f'E8:E{end}', {'type': 'formula', 'criteria': '=OR(LEFT(E8,7)="Missing",E8="Needs review")', 'format': self.w.book.add_format({'bg_color':'#FFF2D6','font_color':'#79530C'})})
        self.comp_end = end

    def count_formula(self, outcome, csv_index=None, field=None):
        if self.comp_end < 8:
            return '0'
        pairs = [f"'Comparisons'!$E$8:$E${self.comp_end}", f'"{outcome}"']
        if csv_index is not None:
            record = self.data['records'][csv_index]
            escaped = record['filename'].replace('~', '~~').replace('*', '~*').replace('?', '~?').replace('"', '""')
            pairs += [f"'Comparisons'!$J$8:$J${self.comp_end}", f'"{escaped}"', f"'Comparisons'!$K$8:$K${self.comp_end}", str(record['source_row'])]
        if field:
            pairs += [f"'Comparisons'!$D$8:$D${self.comp_end}", f'"{field}"']
        return 'COUNTIFS(' + ','.join(pairs) + ')'

    def review(self):
        name, d = 'Review', self.data
        self.title(name, 'Airbnb reservation reconciliation', f'ZIP exported {self.source["exported"]}. Code matches are confirmed; date/listing suggestions remain provisional.')
        self.w.row(name, 6, ['Reservation coverage', 'Count'])
        s = d['summary']
        summary = [
            ('CSV reservations', s['csv_reservations'], None),
            ('Extract reservations', s['extract_reservations'], None),
            ('Confirmed code matches', s['confirmed_matches'], None),
            ('Provisional date matches', s['provisional_matches'], None),
            ('No extract counterpart', s['unmatched_csv'], None),
            ('Extract without code match', s['extract_without_confirmed_match'], None),
            ('CSVs with different fields', sum(r['differences']>0 for r in d['review']), None),
            ('CSVs with missing fields', sum(r['missing']>0 for r in d['review']), None),
            ('CSVs needing review', sum(r['needs_review']>0 for r in d['review']), None),
            ('Different field comparisons', s['different_fields'], self.count_formula('Different')),
            ('Missing field comparisons', s['missing_fields'], '+'.join(self.count_formula(v) for v in ['Missing both','Missing in CSV','Missing in extract'])),
            ('Earnings discrepancies', s['earnings_discrepancies'], self.count_formula('Different', field='Host-panel total')),
            ('Ambiguous CSV reservations', s['ambiguous_csv'], None),
        ]
        for i, (label, value, formula) in enumerate(summary, 7):
            self.put(name, f'A{i}', label)
            self.put(name, f'B{i}', value, formula)
        self.put(name, 'D6', 'Earnings differences', style='section')
        for column, value in zip('DEFGH', ['Confirmation code', 'Match method', 'CSV earnings', 'Extract host', 'Difference']):
            self.put(name, f'{column}7', value, style='header')
        erow = 8
        for r, c in [(r, c) for records in self.comp_rows.values() for r, c in records if c['field']=='Host-panel total' and c['result']=='Different']:
            record = d['records'][c['csv_index']]
            evidence = self.source['reservations'][c['extract_index']]
            self.put(name, f'D{erow}', record['raw']['Confirmation code'])
            self.put(name, f'E{erow}', c['method'])
            self.money_cell(name, f'F{erow}', record['typed']['Earnings'], record['currency'], f"'Comparisons'!F{r}")
            self.money_cell(name, f'G{erow}', int(Decimal(evidence['host_total_decimal'])*100), c['currency'], f"'Comparisons'!G{r}")
            self.money_cell(name, f'H{erow}', c['difference'], c['currency'], f"'Comparisons'!I{r}")
            erow += 1
        notes_start = max(erow+1, 12)
        notes = [
            f"{s['different_fields']} differing field comparisons; {s['missing_fields']} missing fields; {s['needs_review']} need review.",
            'Blank guest counts are missing evidence, not zero. Filter Comparisons to inspect the source values.',
            'Extract records without a confirmed match overlap provisional CSV rows. Do not add these populations.',
            'Snapshot: regenerate for new inputs. CSV evidence does not change pricing or eligibility.',
        ]
        for i, note in enumerate(notes, notes_start):
            self.put(name, f'D{i}', note, style='note')
        self.put(name, f'D{notes_start+5}', 'CSV rows without an extract counterpart', style='section')
        row = notes_start+6
        for item in d['review']:
            if item['method'] == METHOD_NONE:
                record = d['records'][item['csv_index']]
                self.put(name, f'D{row}', record['raw']['Confirmation code'])
                self.put(name, f'E{row}', record['raw']['Status'])
                self.date_cell(name, f'F{row}', excel_date(record['typed']['Start date']))
                self.date_cell(name, f'G{row}', excel_date(record['typed']['End date']))
                row += 1
        header = max(26, row+3, notes_start+6)
        self.review_header = header
        self.put(name, f'A{header-2}', 'CSV reservations: identity, differences and missing evidence', style='section')
        headers = ['Confirmation code','Guest name','Arrival','Departure','Match method','CSV status','Extract ID / candidate IDs',
                   'Candidates','Different fields','Missing fields','Needs review','Different field names','CSV earnings','Extract host','Difference','Shared candidate']
        self.table(name, headers, [[None]*len(headers) for _ in d['review']], header, 'ReservationReview')
        for i, item in enumerate(d['review'], header+1):
            index = item['csv_index']
            record = d['records'][index]
            ids = '; '.join(self.source['reservations'][e]['reservation_id'] for e in item['candidates'])
            shared = any(len(d['references'][e])>1 for e in item['candidates'])
            self.w.row(name, i, [record['raw']['Confirmation code'],record['raw']['Guest name'],None,None,item['method'],record['raw']['Status'],ids,len(item['candidates']),None,None,None,', '.join(item['fields']),None,None,None,'Yes' if shared else ''])
            self.date_cell(name, f'C{i}', excel_date(record['typed']['Start date']))
            self.date_cell(name, f'D{i}', excel_date(record['typed']['End date']))
            self.put(name, f'I{i}', item['differences'], self.count_formula('Different', index))
            self.put(name, f'J{i}', item['missing'], '+'.join(self.count_formula(v, index) for v in ['Missing both','Missing in CSV','Missing in extract']))
            self.put(name, f'K{i}', item['needs_review'], self.count_formula('Needs review', index))
            self.money_cell(name, f'M{i}', record['typed']['Earnings'], record['currency'])
            if len(item['candidates']) == 1:
                e = item['candidates'][0]
                evidence = self.source['reservations'][e]
                pennies = int(Decimal(evidence['host_total_decimal'])*100) if evidence['host_total_decimal'] else None
                self.money_cell(name, f'N{i}', pennies, evidence['host_currency'], self.raw_ref('Extract reservations','host_total_decimal', e+8))
                if record['currency'] == evidence['host_currency'] and record['currency'] in ('GBP','EUR','USD'):
                    difference = record['typed']['Earnings']-pennies if record['typed']['Earnings'] is not None and pennies is not None else None
                    self.money_cell(name, f'O{i}', difference, record['currency'], f'IF(OR(NOT(ISNUMBER(M{i})),NOT(ISNUMBER(N{i}))),"",(ROUND(M{i}*100,0)-ROUND(N{i}*100,0))/100)')
        unresolved = [(i,r) for i,r in enumerate(self.source['reservations']) if i not in d['confirmed']]
        second_header = header + len(d['review']) + 6
        self.put(name, f'A{second_header-3}', 'Extract reservations without a confirmed code match', style='section')
        self.put(name, f'A{second_header-2}', 'Candidate codes refer to provisional or ambiguous CSV rows above, not confirmed matches.', style='note')
        headers = ['Extract reservation ID','Confirmation code','Arrival','Departure','Listing','Source status','Provisional CSV code(s)','CSV candidates']
        self.table(name, headers, [[None]*len(headers) for _ in unresolved], second_header, 'UnconfirmedExtract')
        for r, (i, evidence) in enumerate(unresolved, second_header+1):
            codes = '; '.join(d['records'][j]['raw']['Confirmation code'] or '(missing code)' for j in d['references'].get(i, []))
            self.w.row(name, r, [evidence['reservation_id'],evidence['confirmation_code'],None,None,evidence['source_listing_name'],evidence['source_status_text'],codes,len(d['references'].get(i,[]))])
            self.date_cell(name, f'C{r}', excel_date(date.fromisoformat(evidence['arrival'])))
            self.date_cell(name, f'D{r}', excel_date(date.fromisoformat(evidence['departure'])))
            self.w.sheets[name].set_row(r-1, 44)
        sheet = self.w.sheets[name]
        for column, width in [('A:A',38),('B:B',29),('C:D',18),('E:E',54),('F:F',30),('G:G',44),('H:K',17),('L:L',48),('M:O',22)]:
            sheet.set_column(column,width)
        if unresolved:
            for r in range(second_header+1, second_header+len(unresolved)+1):
                for c in ('A','E'):
                    self.put(name, f'{c}{r}', self.w.cells[name][f'{c}{r}'], style='wrap')
        # Keep the opening summary scrollable rather than freezing a large dynamic block.
        sheet.freeze_panes(0, 1)
        if d['review']:
            start,end=header+1,header+len(d['review'])
            amber=self.w.book.add_format({'bg_color':'#FFF2D6','font_color':'#79530C'})
            red=self.w.book.add_format({'bg_color':'#FCE8E6','font_color':'#9D2525','bold':True})
            sheet.conditional_format(f'E{start}:E{end}',{'type':'formula','criteria':f'=E{start}="{METHOD_NONE}"','format':red})
            sheet.conditional_format(f'E{start}:E{end}',{'type':'formula','criteria':f'=E{start}<>"{METHOD_CODE}"','format':amber})
            sheet.conditional_format(f'I{start}:K{end}',{'type':'cell','criteria':'>','value':0,'format':amber})
        # Count records, including rows with blank confirmation codes.
        if d['records']:
            end=header+len(d['review'])
            for address, method, cached in [('B9',METHOD_CODE,s['confirmed_matches']),('B10',METHOD_DATE,s['provisional_matches']),('B11',METHOD_NONE,s['unmatched_csv'])]:
                self.put(name,address,cached,f'COUNTIF(E{header+1}:E{end},"{method}")')
            for address,column,cached in [('B13','I',summary[6][1]),('B14','J',summary[7][1]),('B15','K',summary[8][1])]:
                self.put(name,address,cached,f'COUNTIF({column}{header+1}:{column}{end},">0")')

    def build(self):
        self.sources()
        self.comparisons()
        self.review()
