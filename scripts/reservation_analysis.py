#!/usr/bin/env python3
"""Generate the reservation analysis XLSX and its Markdown usage guide."""
from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import tempfile
import zipfile
from pathlib import Path

from reservation_analysis.model import analyse, load_evidence, load_source, PRODUCTS
from reservation_analysis.workbook import Workbook


def usage_guide(analysis, workbook, filename):
    source = analysis['source']
    rows = []
    for product in PRODUCTS:
        states = [s for s in analysis['states'] if s['eligible'] and s['product'] == product]
        ns = [n for n in analysis['nights'] if n['product'] == product]
        rows.append(f"| {product} | {len(states)} | {len(ns)} | £{sum(n['amountPence'] for n in ns)/100:,.2f} |")
    supported = [g for g in workbook.groups if g['day'] == 'All nights' and g['stats']['supported']]
    prices = '\n'.join(f"| {g['product']} | {g['month']} | {g['stats']['reservations']} | {g['stats']['nights']} | £{g['suggested']:,} |" for g in supported) or '| No supported monthly sample | | | | |'
    return f"""# Reservation analysis: usage guide

This guide accompanies `{filename}`. It is generated from `{source['path'].name}`,
exported at `{source['exported']}`, with analysis as-of **{analysis['as_of']}**.
Source SHA-256: `{source['sha256']}`. Pricing normalisation method: **1.1**.

## Start here

Open **Overview**. Change yellow **B5** to select an accommodation product and
**B6** to apply an explicit uplift to supported suggestions. Enter `10%`, not
`10`; the valid range is −100% to +100%. The default is Whole house and 0% uplift.
The workbook contains calculated formula caches and can be read immediately.
Excel or LibreOffice recalculates the view when a control changes.

| Product | Eligible reservations | Nights | Net accommodation |
| --- | ---: | ---: | ---: |
{chr(10).join(rows)}
| All products | {sum(s['eligible'] for s in analysis['states'])} | {len(analysis['nights'])} | £{sum(n['amountPence'] for n in analysis['nights'])/100:,.2f} |

## Source and status evidence

The archive contains {len(source['reservations'])} reservations,
{len(workbook.line_rows)} original financial lines and {len(analysis['panel_rows'])}
panels. Every individual reservation CSV was compared with the combined file.
**Source stays**, **Source lines** and **Columns** preserve the export's values
and definitions. Identifiers are text, source dates remain ISO text and source
timestamps retain their exact strings, including microseconds.

**Status adjustments** shows original and effective statuses for every record.
{analysis['adjustments']} workbook-only corrections were supplied by the separate
archive-bound status-evidence file. Without that file no corrections are inferred.
There are {analysis['remaining_unknown']} effective unknown statuses.
Source status values and the ZIP remain unchanged. No database is read or changed.
The supplied evidence includes positions and dates, without names or private messages.

**Unknown status review** retains all {workbook.context['unknown_count']} originally
unknown records, including those now eligible. Its first table combines the
analysis and original reservation fields. The lower table reproduces their
original financial lines and panel audit fields. Use current eligibility and
exclusion reasons rather than assuming that every originally unknown stay is
still excluded. The financial section moves down when this cohort grows.

## Financial and pricing method

**Stay analysis** retains every reservation and its first applicable exclusion.
Only classified GBP, effective confirmed stays departed by the as-of date with
positive, reconcilable accommodation can inform prices. Duplicate confirmation
codes, ambiguous financial evidence and guest panels containing host service fees
are excluded. Source blanks mean missing, and known zeroes remain zero.

Accommodation is after identifiable discounts and before platform fees, cleaning,
pet charges and tax. It is neither guest payment nor host payout. Host and guest
perspectives must never be added together. Do not add parent charges to children
or repeatedly sum panel totals. **Panel audit** independently checks contributing
root amounts, panel totals and reservation line counts. An arithmetic match does
not establish the correct financial perspective or prove bank receipt.

**Night evidence** has one observation per eligible stayed night; departure is
exclusive. Complete dated accommodation and signed discounts are joined by date.
If any component lacks dated detail, allocate the whole net amount equally in
pennies, with residual pennies assigned to the earliest nights. Estimated nightly
gross and discount fields are blank. Allocations reconcile to each stay amount.

Calendar month comes from stayed date. Friday and Saturday nights are weekends.
Day-type samples use dated allocations only; pooled monthly samples may include
estimates. Statistics use equally weighted nights and linear-interpolated
quartiles. A supported sample requires **5 distinct reservations, 20 nights and
2 years**. Sparse day types use the supported pooled month and are labelled
**Monthly fallback**. Suggestions are the median × (1 + uplift), rounded half up
to whole pounds. No inflation adjustment or automatic price changes are applied.

Supported pooled monthly baselines at 0% uplift:

| Product | Month number | Reservations | Nights | Baseline suggestion |
| --- | ---: | ---: | ---: | ---: |
{prices}

**Price guide** exposes every sample and the actual fallback basis. **Monthly
history** separates years. **Stay patterns** groups the selected product by lead
time, stay length, party size, pets and cancellation policy. Unknown composition
and missing leads remain unknown; mean lead uses only known, non-negative values.
These associations do not establish causal price effects.

## Refresh and verification

Regenerate from a compatible ZIP to refresh the data; do not paste a new export
into source tabs, edit generated membership or sort generated rows in place.
Filters inspect data without changing pricing statistics. A status-evidence file
is valid only for its specified archive SHA-256. A later export needs its own
reviewed evidence file; absent evidence uses the stored statuses.

Generation validates inputs and computes cached results without a spreadsheet
application. Use `scripts/compare_reservation_analysis.py` to compare all tab
values with a reference. Native recalculation tests are a separate verification
step; generation alone does not assert that they have run.

The archive is historical reservation evidence, not an available-night inventory
or a complete ledger. Do not infer occupancy, RevPAR, price elasticity, market
demand, net profit or optimal future prices from it alone. Share the workbook only
with authorised recipients: reservation identifiers and financial text are private.
"""


def generate(source_path, evidence_path, output, as_of=None, force=False):
    output = Path(output).resolve()
    if output.suffix.lower() != '.xlsx':
        raise ValueError('Output must have an .xlsx extension.')
    guide = output.with_name(output.stem + '-guide.md')
    if not force and (output.exists() or guide.exists()):
        raise ValueError('Output or guide already exists; choose another path or use --force.')
    if output == Path(source_path).resolve() or evidence_path and output == Path(evidence_path).resolve():
        raise ValueError('Output cannot replace an input.')
    source = load_source(source_path)
    evidence = load_evidence(evidence_path, source)
    analysis = analyse(source, evidence, as_of)
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.reservation-analysis-', dir=output.parent) as temp:
        draft = Path(temp) / output.name
        workbook = Workbook(draft, analysis)
        workbook.build(guide.name)
        guide_draft = Path(temp) / guide.name
        guide_draft.write_text(usage_guide(analysis, workbook, output.name), encoding='utf-8')
        for src, dest in [(draft, output), (guide_draft, guide)]:
            os.chmod(src, 0o600)
            if force:
                os.replace(src, dest)
            else:
                os.link(src, dest)  # Atomic, and never replaces a concurrently created file.
    return dict(output=str(output), guide=str(guide), source_sha256=source['sha256'], reservations=len(analysis['states']),
                financial_lines=len(workbook.line_rows), panels=len(analysis['panel_rows']), status_adjustments=analysis['adjustments'],
                eligible_reservations=sum(s['eligible'] for s in analysis['states']), eligible_nights=len(analysis['nights']))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True, help='Reservation-evidence export ZIP (schema 1.0).')
    parser.add_argument('--status-evidence', type=Path, help='Optional reviewed status evidence bound to the archive SHA-256.')
    parser.add_argument('--output', type=Path, required=True, help='New XLSX path; also writes a companion -guide.md.')
    parser.add_argument('--as-of', help='Eligibility cutoff YYYY-MM-DD; defaults to the export date in Europe/London.')
    parser.add_argument('--force', action='store_true', help='Replace an existing output and guide.')
    args = parser.parse_args()
    try:
        print(json.dumps(generate(args.source, args.status_evidence, args.output, args.as_of, args.force)))
        return 0
    except (ValueError, KeyError, OSError, zipfile.BadZipFile, csv.Error) as error:
        # Errors intentionally identify structure, never print reservation rows or financial text.
        print(f'Reservation analysis failed: {error}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
