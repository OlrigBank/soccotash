# Standalone reservation analysis

The Python generator recreates the reservation analysis from the original export
ZIP, optional reviewed status evidence and optional reservation-page CSV exports.
It needs no Codex installation, account,
AI service, database connection, Node.js, existing workbook or spreadsheet
application. Python 3.10 or later and the pinned XlsxWriter and timezone-data dependencies are required.
Pricing normalisation is deliberately pinned to method **1.1** for reproducibility.

## Guided command (recommended for new exports)

From the repository root, run:

```bash
npm run airbnb:analyse
```

This provides prompts similar to `airbnb:import`, but works entirely from local
export files and never connects to a database. No database URL or encryption key
is required. Choose the ZIP exported from your desired environment.

The prompts ask for the ZIP path, optional matching status-evidence JSON,
optional cutoff date and output workbook path. Paths may be absolute or relative
to the repository root, may contain spaces and may be pasted with surrounding
quotes. Leave status evidence blank unless you have reviewed evidence for that
exact ZIP. Leave the cutoff blank to use the export date, not today's date.

A fresh timestamped output directory is suggested. Existing workbooks and guides
are never overwritten by this command. Confirm the displayed choices to generate
both files. On first use it offers to create the local Python environment and
install the pinned dependencies; this requires Python 3.10+ with venv support and
may require internet access. Later runs reuse that environment. Ctrl+C cancels.

When `docs/source-material/airbnb/airbnb-reservations-csv-exports/` contains CSV
files, the confirmation summary lists them and generation automatically appends
four reconciliation tabs. They compare those files against the ZIP selected in
this run. They do not alter pricing, eligibility or reviewed status adjustments.

The export can stay in Downloads or be placed under
`docs/source-material/airbnb/`. ZIPs in that repository directory, `outputs/` and
the local Python environment are ignored by Git. Keep other private paths out of
commits too. The direct commands below remain available for reproducibility and
private diagnosis. The wrapper reports a failed generation without printing
potentially private validation details.

On a system without npm, run `python3 scripts/run_reservation_analysis.py`.
On Windows, use `py -3 scripts/run_reservation_analysis.py` if `python3` is not
available.

## Install and reproduce the current analysis

All runtime source files are versioned: the guided launcher, generator,
`scripts/reservation_analysis/` package (including both reconciliation modules
and `layout.json`) and pinned requirements file. The CSV input directory contains
a tracked README so a fresh checkout has the documented destination. Install
the pinned Python dependencies as below and supply your own private exports;
neither existing workbooks nor files under `/tmp` are runtime dependencies.

Run these commands from the repository root. The virtual environment can instead
live anywhere you prefer; its location is not part of the calculation.

```bash
python3 -m venv scripts/.venv-reservation-analysis
scripts/.venv-reservation-analysis/bin/python -m pip install -r scripts/requirements-reservation-analysis.txt

scripts/.venv-reservation-analysis/bin/python scripts/reservation_analysis.py \
  --source docs/source-material/airbnb/airbnb-reservation-evidence-2026-10-19.zip \
  --status-evidence docs/source-material/airbnb/status-evidence/2026-10-19.json \
  --no-reservation-csvs \
  --output outputs/reservation-analysis-script-2026-10-20/reservation-analysis.xlsx
```

This writes the workbook and `reservation-analysis-guide.md` beside it. The
command prints a small JSON summary and exits successfully only after generation.
Use `--force` to replace an existing output and guide. Inputs remain unchanged.
The generated files contain private financial evidence and use owner-only file
permissions on systems that support them.

The historical command explicitly disables CSV reconciliation so it reproduces
the original 13-tab reference even when newer CSV exports are present locally.
For new work, omit `--no-reservation-csvs` to discover the default CSV directory,
or supply `--reservation-csv-dir PATH` to use a different directory. These two
options are mutually exclusive. The default directory is resolved relative to
the repository, regardless of the current working directory; explicit relative
directory overrides follow the direct command's working directory.

For Windows, use the virtual environment's `Scripts/python.exe` in place of
`bin/python`. The generator and comparator use ordinary filesystem paths.

## Prove that the data matches

```bash
scripts/.venv-reservation-analysis/bin/python scripts/compare_reservation_analysis.py \
  --reference outputs/reservation-analysis-2026-10-19/reservation-analysis.xlsx \
  --actual outputs/reservation-analysis-script-2026-10-20/reservation-analysis.xlsx
```

The comparator uses the Python standard library. It reads saved formula caches
and checks **every populated cell across every worksheet**: 13 without CSV
reconciliation, or 17 with it. This includes source
values, derived amounts, headers, narrative text, audit fields and exclusions.
It checks worksheet names/order and that existing formulas have not become
constants. Formula expressions may differ when they produce the same result and
retain the required behaviour. Native control tests exercise that behaviour.

Text, identifiers, categories and counts must match exactly. Numeric values have
an absolute tolerance of `1e-7` pounds or units, which is considerably smaller
than one penny. Missing and empty-string formula results are equivalent; numeric
zero is distinct. Formula errors fail the comparison. Formatting, ZIP packaging
and document metadata do not form part of value equality. The output identifies
up to 50 differing cell addresses, counts every difference and excludes private
cell values from logs. Any difference returns exit status 1.

The private source archive and reference workbook are deliberately not test
fixtures in Git. Supply them locally for the full historical acceptance test.
The reference workbook is read **only by verification**, never by generation.
Using another output basename changes the guide-name reference in Read me and
therefore correctly appears as a content difference.

## Future exports

Supply another compatible schema-1.0 ZIP through `--source`. The same three root
CSVs and individual reservation files are required. New schema versions, changed
column order, duplicate identities, inconsistent individual files, mixed snapshots,
unsafe monetary integers and oversized cell text fail explicitly. Empty archives
are rejected; an archive with reservations but no eligible stays produces the
normal workbook with empty samples and no supported suggestions.

`--as-of YYYY-MM-DD` overrides the eligibility cutoff. Otherwise the export
timestamp's date in Europe/London is used, rather than the computer's current date.
The snapshot reproduction therefore keeps **19 October 2026** as its cutoff.
Whole house, Cottage, Double bedroom and Large bedroom remain separate under the
documented listing-name rules. Unrecognised listings remain visible and excluded.

The financial interpretation, additional eligibility checks, evidence thresholds,
Friday/Saturday weekend definition and monthly fallback are documented in the
generated guide. Formula caches are computed in Python so the file contains all
derived data immediately. Excel/LibreOffice can recalculate the product selector
and uplift afterwards. Source changes, classifications, eligibility and sample
membership require regeneration; they are not workbook input controls.

## Optional reservation CSV reconciliation

Place reservation-page exports in
`docs/source-material/airbnb/airbnb-reservations-csv-exports/`. All files ending
in `.csv` (case-insensitive) directly inside that directory are processed in
deterministic filename order; subdirectories and other files are ignored.
Private files in the directory and generated outputs are ignored by Git because
they contain guest and financial information; only the input-directory README
is tracked. No private source files are test fixtures.

The default directory may be absent or empty: generation then retains the
existing 13-tab workbook and guide. An explicit directory override must exist.
Header-only CSVs still add the four tabs with no CSV records and all extract
reservations visible. Invalid headers, non-rectangular rows, invalid dates,
counts or monetary values fail before a workbook or guide is published.

The four supplementary tabs reproduce the reconciliation structure introduced
in `outputs/airbnb-reconciliation-2026-10-21/airbnb-reservation-reconciliation.xlsx`.
That file is a review reference, never a runtime dependency:

| Tab | Contents |
| --- | --- |
| Review | Coverage counts, earnings discrepancies, every CSV row and a separate list of extract reservations without a confirmed code match |
| Comparisons | Source values, result, currency and differences for listing, arrival, departure, nights, booking date, booking state, adults, children, infants, headline host earnings and host-panel total |
| CSV reservations | All original columns and records, with source filename and logical CSV record number (header = 1) |
| Extract reservations | Every reservation and original column from the selected ZIP's index |

Unique, non-blank confirmation codes establish confirmed matches. Duplicate
codes remain ambiguous and no record is selected arbitrarily. Extract rows
without codes receive provisional suggestions using listing, arrival and
departure. Multiple candidates and reuse of one candidate by several CSV rows
remain visible. No guessed match is promoted to confirmed. Every source row is
retained, including overlapping exports, cancellations and negative earnings.

Blank fields remain missing, including blank guest counts. A known zero remains
zero. Status labels retain their original wording; comparisons distinguish
confirmed/cancelled booking state from labels such as “Past guest”. Ambiguous
labels such as “Trip change sent” require review. Earnings differences are CSV
minus extract, calculated in exact pennies for matching supported currencies.
Headline host earnings and host-panel totals are separate comparisons; host and
guest financial perspectives are never added. Currency mismatches require review
without conversion, and an unqualified `$` symbol does not establish a currency.
Contributing host financial lines explain discrepancies where available, without
claiming why Airbnb and the extract differ.

Original CSV values are preserved in meaning, with typed dates and monetary
amounts for sorting. Identifiers, contact numbers and formula-looking strings
remain literal text. The generated guide records CSV filenames, row counts and
SHA-256 hashes; the JSON summary adds `reconciliation` counts and
`reservation_csv_sources` provenance. Neither contains guest names or contacts.

These exports are supplementary evidence, not corrections. They never change
pricing inputs, eligibility, status adjustments or the selected ZIP. CSV files
are not cryptographically bound to the ZIP and may represent a different capture
time. Refresh by regenerating with the intended sources, not by pasting rows or
editing membership in the workbook. Provisional CSV rows overlap the extract's
unconfirmed records, so those two populations must not be added together.

The **Reservation reconciliation table**, **Field comparison filter** and
**Provisional match review** patterns use standard spreadsheet tables, filters
and conditional formatting. They add no website UI or workflow.

## Supplementary status evidence

The ZIP does not contain conversations. Its stored unknown statuses cannot by
themselves establish the 28 confirmations discovered in the administration audit.
The supplied JSON records those reviewed findings separately, without names or
message bodies. It binds them to archive SHA-256
`6b7fac33df0446a9a02f3182bad73fa477d60c25eec5c2e8e8fd0cd655914a8c`.
Original status and financial source values are preserved.

Omit `--status-evidence` to analyse stored statuses alone. This reproduces 52
eligible stays/150 nights for the current extract, rather than the amended
74/208. A mismatching evidence-file hash is an error; corrections are never
silently reused for a later export. Review new evidence for each new snapshot.

The evidence interface is JSON with:

- `schema_version`: `"1.0"`.
- `archive_sha256`: SHA-256 of the exact input ZIP.
- `audited_on`: ISO date of the source review.
- `audit_reference`: human-readable evidence location.
- `adjustments`: one entry per correction with `reservation_id`,
  `original_status: "unknown"`, `effective_status: "confirmed"`,
  `cancellation_phrase_count: 0`, `evidence_type` and `entries`.
- `evidence_type`: `"Confirmed booking card"` or
  `"Airbnb Request accepted service event"`.
- `entries`: captured evidence locations, each containing integer `position` and
  text `displayed_date`, in the original audited order.

Unknown/duplicate reservation IDs, conflicting original statuses and attempts to
override cancellations are rejected. Evidence positions are review references;
the generator does not re-audit conversations absent from the ZIP.

## Automated checks

```bash
scripts/.venv-reservation-analysis/bin/python -m unittest discover -s tests/reservation-analysis -v
```

Synthetic fixtures cover dated and estimated allocations, signed discounts,
residual pennies, conflicting panels, hierarchy/reconciliation failures,
missing versus zero data, literal formula-looking text, exact timestamps,
duplicate codes, cutoff dates, evidence binding, empty/missing panels, changed
record counts, unknown cohorts larger than the original and overwrite protection.
The full reference comparison also runs when the private files are available;
otherwise that individual test is explicitly skipped.
CSV reconciliation fixtures cover optional discovery and overrides, header-only
exports, malformed inputs, duplicate and missing keys, ambiguous/reused
candidates, missing versus zero counts, booking states, currencies, negative
earnings, penny differences, literal text and expanding review sections. They
also compare every original tab's cells and formulas with reconciliation enabled
and disabled. A separate optional private check recognises the 21 October inputs.
The dedicated GitHub Actions workflow runs the synthetic suite without uploading
or requiring private source files.

An optional **verification-only** native test needs LibreOffice and the system
Python UNO bridge (`libreoffice-calc` and `python3-uno` on Debian/Ubuntu):

```bash
python3 tests/reservation-analysis/verify_native.py \
  --workbook outputs/reservation-analysis-script-2026-10-20/reservation-analysis.xlsx \
  --reference outputs/reservation-analysis-2026-10-19/reservation-analysis.xlsx
```

It starts an isolated LibreOffice profile, uses disposable copies, recalculates
all cells, compares saved results, exercises all four products and the stay-pattern
totals, tests +10%, −100%, +100% and invalid uplift, checks chart refresh for every
product, restores defaults and checks all values again. It does not alter the
generated or reference files and never connects to the database.
It accepts both the 13-tab and 17-tab layouts. When suitable reconciliation rows
exist, it also changes earnings by 1p and a missing count to zero, checks the
comparison and summary responses, and restores every temporary change.

## Implementation and verification record

The generator separates CSV/evidence validation and pure pricing calculations,
workbook/formula presentation, and an independent saved-value comparator. The
presentation JSON contains headings and parameterised explanatory text only;
it contains no reservation records, cached financial results or workbook template.
The runtime reads no temporary files or Codex dependencies.

Verified on 20 October 2026 using Python 3.12 and XlsxWriter 3.2.9:

- All **71,522** compared cells match the amended reference across **13 tabs**.
- 89 source reservations, 933 original financial lines, 178 panels, 28 status
  corrections and **74 eligible stays / 208 nights** were reproduced.
- Whole house: 68 stays, 190 nights and £61,409.51 net accommodation.
- HMSKTAZKYZ is included with £750 net accommodation. May/June/August suggestions
  remain £293/£295/£350 at zero uplift.
- LibreOffice recalculation, product selection, uplift boundaries, invalid uplift,
  restored defaults and chart caches passed.
- Representative ranges on every sheet and the chart were rendered and reviewed.
  The preview importer coerces some metadata text into numbers; native saved-value
  and displayed-text checks confirm the actual workbook retains exact timestamps.

CSV reconciliation verified on 21 October 2026 using the selected 21 October ZIP:

- All **31 tests** pass, including the historical reference comparison and the
  optional current CSV acceptance check. Synthetic enabled/disabled comparisons
  retain every original analysis cell and formula.
- The generated **17-tab** workbook includes 95 CSV rows and 93 extract records:
  **50 confirmed matches, 43 provisional matches, two unmatched CSV rows** and
  **three host-earnings discrepancies**. The 1,023 field comparisons identify
  38 differing fields, 266 missing fields and one uncertain status comparison.
- LibreOffice recalculation matches all **89,556** populated cells. Product,
  uplift and chart checks pass, along with temporary 1p earnings and missing-to-zero
  edits, summary refreshes and restoration of defaults. The sandboxed office
  process could not connect; verification passed outside the sandbox using the
  same isolated-profile, disposable-copy workflow.
- Representative ranges on all four added tabs, including unresolved records,
  financial amounts and provenance notes, were rendered and reviewed. Long
  financial explanations wrap rather than being clipped. Source data is retained
  and outputs remain private and Git-ignored.

A clean export of the staged repository was also checked using a newly created
Python environment installed only from the tracked requirements file. The
synthetic suite and both command help entry points run without private inputs,
local temporary builders, Codex dependencies or an existing workbook. The two
private acceptance tests are explicitly skipped when their inputs are absent.

No website UI or workflow is changed, so browser/Lighthouse checks do not apply.
The retained **Product selector**, **Uplift input** and **Filtered evidence table**
patterns use standard spreadsheet validation and table controls, rather than
custom application UI. No merge, deployment or database write is part of this work.
