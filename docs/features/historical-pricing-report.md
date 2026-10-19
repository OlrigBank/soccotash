# Historical accommodation pricing

Implemented on `feature/historical-pricing-report`, 19 October 2026.

## Using the report

Open **Pricing → Historical pricing** at `/admin/pricing/history/`. Choose a
listing, historical dates, target year and optional percentage uplift, then
generate the report. The default range is the three completed calendar years;
the default target is next year. The historical end date is inclusive.

The table contains monthly weekday/weekend recommendations, evidence counts,
median and interquartile range, achieved accommodation revenue per night and
the share of estimated nightly allocations. Friday and Saturday are weekend
nights. Yearly comparisons, exclusions, identifiable fees and source coverage
are shown separately.

Holiday/event exceptions need a name, target dates and one or more comparable
historical periods. Dates within each historical period are inclusive. Periods
must not overlap; target dates must be within the selected target year.
Exception nights are removed from ordinary monthly samples. Exceptions take
precedence over the corresponding monthly rates. An unsupported exception can
show its starting month's historical baseline for reference; this is not an
exception recommendation and has no uplift applied.

**Download CSV** exports the exact calculation displayed, including method
version, settings, exception definitions, source capture range and exclusions.
Changing settings hides the old result and removes its download. Report
settings and exception definitions are not saved to the database; keep an
export to retain them. Generating a report never creates or publishes a pricing
plan. Existing admin authentication/session tracking remains unchanged.

## Calculation and source safeguards

- Accommodation is after identifiable accommodation discounts and before
  cleaning, pet charges, tax and platform fees. Payout and guest-total figures
  are never divided by nights to infer accommodation prices.
- Only past stays recorded as confirmed, for the selected recognised listing
  and in GBP, qualify. Confirmation in a captured export is not proof the stay
  occurred. Source coverage may be incomplete.
- Guest-side accommodation totals are preferred, with verified host-side
  accommodation as a fallback. Matching host-side dated detail can enrich a
  guest-side aggregate. Conflicting totals or dated prices are excluded.
- Parent totals and nightly children are counted once. Unknown adjustments,
  unsupported financial hierarchies, reconciliation discrepancies and invalid
  nightly breakdowns are excluded with a reason.
- A verified aggregate without complete dated detail is spread across the
  stay, with remainder pennies assigned to the earliest nights. This is an
  estimated allocation, never evidence of a weekday/weekend premium.
- Each eligible night has equal weight. The baseline is the median; percentiles
  use linear interpolation. Recommendations require five distinct reservations,
  twenty nights and two represented years. This threshold is not statistical
  confidence. Thin day-type samples use a supported pooled monthly baseline,
  whose counts/statistics are displayed and explicitly labelled as a fallback.
  Other unsupported recommendations remain blank.
- Optional uplift defaults to zero. Suggestions round half upwards to the
  nearest pound. No automatic inflation, channel adjustment, demand prediction
  or occupancy optimisation is applied. Historical party sizes, stay lengths
  and discounts remain part of the observed mix.
- Financial/source queries run within a read-only, repeatable-read transaction
  with a 15-second statement timeout and a 50,000-reservation limit. Inputs are
  bounded to twenty years, twenty exceptions and twenty historical periods per
  exception. Reports do not select names, contacts, conversations, private notes
  or access material. Database errors are not printed to application logs.

The source profile covers all listings overlapping the range, groups whole
stays by arrival year and counts dated lines across both financial perspectives.
Fee summaries describe whole eligible reservations, from one selected financial
perspective per reservation. They must not be interpreted as prorated fees or
combined host-and-guest fee totals.

## Interfaces and operational checks

- `POST /api/admin/pricing/history/`: authenticated JSON settings; returns
  `{ report, csv }` from one source snapshot. Private, non-cached responses.
- `POST /api/admin/pricing/history/report/`: same settings, freshly calculates
  and returns an attached CSV. For an exact displayed export use its download
  link, rather than recalculating through this endpoint.
- Inputs: `propertyId`, `startDate`, `endDate`, `targetYear`, `upliftPercent`,
  `exceptions: [{ name, target: { start, end }, historical: [{ start, end }] }]`.
- Existing admin authentication and same-origin checks protect both endpoints.
  There are no database migrations, scheduled jobs or public quote changes.

With `DATABASE_URL` securely supplied for the intended database, an operator
can run a read-only aggregate profile without a deployment:

```sh
npm run pricing:history-report -- --from 2023-01-01 --to 2025-12-31 --format profile
```

Use `--property cottage` to select a listing, `--format json` for the report,
or `--format csv` for an export; `--year` and `--uplift` override defaults.
The command deliberately does not load a local environment file automatically.
Never paste the connection string into a feature record or shell transcript.

Production profiling and manual financial-line reconciliation remain pending:
the Render connector repeatedly returned an authentication request instead of
database access during this implementation. No production connection, data
change, migration, deployment or live-price change was performed. Before
release, run the profile and reconcile representative eligible and excluded
bookings, including a discounted stay and a stay crossing a month boundary.

## UI pattern names

| Pattern | Implementation |
| --- | --- |
| Historical rate table | Custom report pattern using a semantic HTML table inside a named, keyboard-scrollable region |
| Evidence badge | Custom text badge identifying supported, fallback and insufficient-history evidence |
| Exception period editor | Custom repeatable fieldsets with add/remove controls |
| Report settings | Native browser select, date and number controls, buttons and details/summary disclosure |

## Verification record

- `npm run test:pricing-history`: 12 passing calculation/render/export tests,
  including discounts, fees, hierarchy deduplication, leap days, range clipping,
  penny allocation, evidence thresholds, exceptions, uplift rounding and safe
  owner text.
- `npm run test:pricing-history-integration`: disposable local PostgreSQL
  schema; verifies read-only repeatable-read transactions, deterministic output,
  listing separation, private-field exclusion, CLI profiling and unchanged
  reservation/financial/pricing data.
- `npm run test:pricing-history-ui`: 15 passing Playwright checks across
  1440×1000, 768×1024 and 390×844. Covers anonymous access, exact CSV agreement,
  authenticated CSV endpoint, rate/fallback/empty/insufficient states, settings,
  exceptions, validation, cross-origin rejection, keyboard focus and scrolling,
  request failure, stale responses and document/local overflow.
- `npm run check`: zero errors/warnings, three pre-existing hints in unrelated
  login, booking creation and local-guide pages. Production build passes.
- Chrome DevTools inspected the rebuilt disposable application at 1440×1000,
  768×1024 and an explicitly emulated 390×844. Checked semantic structure,
  named table regions, Tab focus, a visible 3px outline, ArrowRight scrolling,
  Enter-operated exception additions with focus moved to the new date input,
  form layout, successful results, empty results and server validation.
  Document overflow was absent at the final widths; wide tables scroll locally.
- The initial tablet inspection found expanding grid tracks; these were fixed.
  The initial Lighthouse accessibility score was 96 due to intro text contrast;
  that colour was corrected. Repeated desktop and 390px mobile snapshot audits
  of generated results scored accessibility 100, best practices 100 and agentic
  browsing 100. SEO remained 80 for the shared admin layout's missing meta
  description; this private no-index page is not intended for search indexing.
  The final keyboard-focus change was also inspected and audited in the expanded
  exception editor at 390px, retaining accessibility/best-practice scores of 100.
- DevTools network inspection confirmed successful local page/script/report
  requests. The successful workflow had no console warnings/errors; intentionally
  invalid settings produced the expected HTTP 400 resource message and visible
  validation text, with no stale download. No customer credentials or contact
  channels were used. Lighthouse snapshot audits do not measure performance.

Reproduce with a rebuilt application:

```sh
npm run build
npm run test:pricing-history
npm run test:pricing-history-integration
npm run test:pricing-history-ui
```

`npm run preview:pricing-history` starts a disposable local schema and preview
on port 8096. Visit `/__pricing-history-preview/` to establish its disposable
admin session. Stop with SIGINT/SIGTERM to remove the fixture schema. The
fixture helper rejects non-local database hosts and disables notifying services.
