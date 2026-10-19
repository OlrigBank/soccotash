# Detailed reservation evidence export

Implemented on `feature/reservation-evidence-export` for Historical pricing.

## Download and contents

Open **Pricing → Historical pricing → Export imported reservation data** and
choose **Download reservation CSVs (ZIP)**. The archive includes all imported
reservations, across all listings and dates, including future, cancelled,
unknown-status, zero-price and unmapped-listing records. Pricing-report
settings and eligibility rules do not filter this export.

| Archive entry | Purpose |
| --- | --- |
| `reservations/<reservation-public-id>.csv` | Original financial lines for one reservation, including both financial perspectives |
| `financial-lines.csv` | The same financial rows combined for cross-reservation analysis |
| `reservations.csv` | One row per reservation, with stay characteristics, headline amounts and separate panel totals |
| `columns.csv` | Column name, type, meaning and aggregation rule for every heading, plus format instructions |

Every file is a rectangular UTF-8 CSV with BOM, one header row and CRLF record
separators. Quoted fields retain commas, quotation marks and embedded line
breaks. The reservation index has 50 columns; financial files share 43 columns.
No source files, financial records or ZIP archives are written to the server.

## Columns

The authoritative, versioned definitions are in
`site/src/lib/pricing/reservation-export-columns.ts` and are included in every
archive as `columns.csv`. Export schema version: **1.0**.

### Reservation index

| Group | Headings |
| --- | --- |
| Identification and original status | `reservation_id`, `confirmation_code`, `property_id`, `source_listing_name`, `source_status_text` |
| Original stay | `arrival`, `departure`, `nights`, `check_in_time`, `check_out_time`, `booking_date`, `party_size`, `adults`, `children`, `infants`, `pets`, `cancellation_policy` |
| Derived stay characteristics | `normalised_status`, `stay_phase`, `booking_lead_days`, `arrival_year`, `arrival_month`, `arrival_weekday`, `departure_weekday` |
| Original headline | `reservation_currency`, `reservation_minor_unit_scale`, `headline_host_total_minor`, `headline_host_total_decimal` |
| Host panel | `host_currency`, `host_minor_unit_scale`, `host_total_minor`, `host_total_decimal`, `host_arithmetic_status`, `host_arithmetic_difference_minor`, `host_arithmetic_difference_decimal` |
| Guest panel | `guest_currency`, `guest_minor_unit_scale`, `guest_total_minor`, `guest_total_decimal`, `guest_arithmetic_status`, `guest_arithmetic_difference_minor`, `guest_arithmetic_difference_decimal` |
| Completeness and provenance | `financial_summary_count`, `financial_line_count`, `quality_flags`, `source_captured_at`, `reservation_updated_at`, `exported_at`, `export_schema_version`, `escaped_text_columns` |

### Individual and combined financial rows

| Group | Headings |
| --- | --- |
| Reservation context | `reservation_id`, `confirmation_code`, `property_id`, `source_listing_name`, `source_status_text`, `arrival`, `departure`, `nights` |
| Financial identity | `row_kind`, `financial_summary_id`, `perspective`, `currency`, `currency_minor_unit_scale`, `financial_line_id`, `parent_line_id`, `line_position` |
| Original line evidence | `source_item_type`, `description`, `service_date`, `quantity`, `unit_amount_minor`, `unit_amount_decimal`, `amount_minor`, `amount_decimal` |
| Hierarchy and summation | `hierarchy_depth`, `has_children`, `financial_role`, `contributes_to_panel_total` |
| Reconciliation | `panel_total_minor`, `panel_total_decimal`, `calculated_panel_total_minor`, `source_arithmetic_status`, `source_arithmetic_difference_minor`, `calculated_arithmetic_difference_minor` |
| Original display text | `line_raw_display_text`, `panel_raw_display_text` |
| Quality and provenance | `quality_flags`, `reservation_captured_at`, `panel_captured_at`, `line_created_at`, `exported_at`, `export_schema_version`, `escaped_text_columns` |

## Spreadsheet interpretation

Join the datasets using `reservation_id`, a public UUID. Financial identifiers
use `summary_<database id>` and `line_<database id>` so spreadsheets do not
truncate long numeric identifiers. Treat confirmation codes and identifiers as
text on import.

Each original financial line is exported exactly once. Its stored item type,
position, quantity, unit amount, signed amount, description and parent link
remain intact. There is no financial normalisation, removal of ambiguous
charges, daily redistribution, discount merging or inferred unit price.

`perspective` distinguishes `guest_paid` from `host_earnings`: these are two
views of a reservation and must not be added together as income. Filter by one
perspective and currency before analysing money.

`financial_role` distinguishes `panel_total`, `component` and
`component_detail`. To reproduce a panel total, sum `amount_minor` or
`amount_decimal` only where `contributes_to_panel_total=true`. Those are root
components excluding displayed total lines. Accommodation parents, nightly
detail and multiple discounts remain present; adding every amount would count
the same evidence more than once.

Panel totals and other panel metadata are repeated across a panel's financial
rows. Do not sum those repeated totals; use the reservation index or one row per
`financial_summary_id`. Original panel display text is populated only on the
first exported row for each panel. Original line display text is retained on
each line's own row.

Missing values remain blank, including unknown party composition and missing
financial differences. A known zero remains zero. Panels without lines receive
a `summary_only` row; reservations without panels receive a `reservation_only`
row. Missing financial amounts are never invented for these placeholders.

Money uses exact integer strings from PostgreSQL and integer-based decimal
formatting, without JavaScript floating-point arithmetic. Established scales
are GBP/EUR/USD=2. Other currencies retain minor-unit amounts with blank decimal
equivalents and a quality flag; no currency conversion or scale guessing occurs.
CSV values can preserve more digits than Excel's numeric cells: import amounts
beyond fifteen significant digits as text when exact digit retention is needed.
Negative numeric amounts are not prefixed with an apostrophe.

Potential spreadsheet formulas in **text** fields are prefixed with one
apostrophe. `escaped_text_columns` lists exactly which cells were escaped, so a
future reader can remove that one apostrophe from those fields only. This
distinguishes an added escape from an apostrophe present in the original text.

Timestamps are UTC, retaining source fractional precision. Stay dates and
booking lead days use date-only calendar arithmetic. `stay_phase` uses the
Europe/London date at export: `past` when departure is on or before that date,
`future` when arrival is later, otherwise `in_progress`. A past date does not
prove a stay took place. Negative booking lead days are preserved and flagged.

Quality flags record missing data, unmapped listings, unknown currency scales,
non-verified source arithmetic, independently calculated discrepancies and
invalid hierarchy chains. The original stored arithmetic status/difference is
kept separately from the independently calculated component sum and difference.
A panel with no root components has blank calculated values, not fabricated
zeroes. No quality flag excludes a source record from the export.

## Endpoint and bounds

`POST /api/admin/pricing/history/reservations/export/` needs an authenticated
administrator and passes the existing same-origin check. It has no filter or
pricing inputs and returns `application/zip` with a dated attachment filename,
`private, no-store`, `nosniff`, reservation count and original financial-line
count headers. Empty imports return 404 with a useful message, oversized
exports return 422, and source/creation failures return 503 without logging
financial text, customer details or connection errors.

The repository query selects only the reservation/financial allowlist. Names,
contacts, conversations, guest profile material, private notes, access details,
source PDFs and raw source extraction payloads are not selected. Original
financial display text is deliberately part of the export.

Source reads use a read-only, repeatable-read transaction with a 15-second
statement timeout. A cursor fetches reservations in batches of 100 and checks
the source byte budget before accumulating the next batch. The limits are
50,000 reservations and 32 MiB of source JSON or total uncompressed archive
content; oversized exports fail rather than silently truncating. Compression
happens after the source transaction is released, using the pinned server-side
`fflate` dependency. The browser prevents duplicate clicks and offers retry
after errors, with a 45-second download timeout.

There are no database migrations, public pricing changes or spreadsheet
re-import/calibration behaviour in this feature. It provides source evidence
for a later historical-pricing input feature.

## UI patterns

**Reservation evidence export** is a custom UI pattern: a named section
explains the independent export scope and contains a native browser submit
button plus a polite live status region. The button is disabled during
preparation, with `aria-busy` set on the form, and is restored on completion or
failure. ZIP and CSV downloads use standard browser download behaviour.

## Verification

- `npm run test:reservation-export`: 12 passing tests covering archive contents,
  individual/combined agreement, source hierarchy and perspectives, exact large
  and negative amounts, fractional quantities, multiline text, reversible
  formula protection, all statuses, future/zero/missing records, currency-scale
  gaps, discrepancies, timestamp precision, guide coverage and size/path limits.
- `npm run test:reservation-export-integration`: two passing disposable
  PostgreSQL tests. They verify the read-only repeatable snapshot, SQL field
  precision, missing-panel placeholders, cross-batch completeness, original
  line counts, private-field exclusion, unchanged source/pricing fingerprints
  and rollback/release on a limit failure.
- `npm run test:pricing-history`: all fifteen existing calculation tests pass.
- `npm run test:pricing-history-ui`: 24 passing Playwright checks at 1440×1000,
  768×1024 and 390×844. Nine new checks cover anonymous/cross-origin rejection,
  keyboard ZIP download, all imported records despite conflicting pricing
  settings, archive contents, unchanged report continuation, progress,
  empty/failure/size-limit responses and successful retry.
- Export unit/integration and the complete pricing browser suite are wired into
  the existing Airbnb regression GitHub Actions workflow.
- Production build and Astro checks pass. The three existing unrelated hints
  remain in login, booking creation and local-guide pages.
- Chrome DevTools inspected the rebuilt disposable fixture application at all
  three widths: accessible section/button/status names, Tab/Shift+Tab/Enter,
  visible 3px focus outline, successful ZIP downloads, document overflow and
  network/console behaviour. Successful page, script and export requests
  returned 200 with no console warnings/errors. Empty and failure states were
  inspected using injected non-notifying response fixtures, followed by a real
  local export retry. No real customer credentials or contact channels were used.
- Lighthouse snapshot audits on desktop and mobile scored accessibility 100,
  best practices 100 and agentic browsing 100. SEO remains 80 for the existing
  private admin layout's missing meta description. Snapshot audits do not
  measure performance. No additional SEO change was made to the no-index page.

Browser verification uses disposable records, not production financial data.
No production export, deployment or production-data change was performed.
