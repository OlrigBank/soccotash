# E07-F02 — Reservation List and Filtering

## Status

Complete.

## Parent epic

[`E07 — Airbnb Administration Dashboard`](../epics/e07-f00-airbnb-admin-dashboard.md)

## Objective

Provide a fast, server-rendered way to find imported Airbnb reservations from
the administration dashboard.

## Scope

- Add `/admin/airbnb/` with reservation/review/reconciliation summary cards.
- Add `/admin/airbnb/reservations/` using the F01 paginated service.
- Show property, stay dates, nights, party summary, booker/group display label,
  derived source status, confirmation-code presence and review-link state.
- Filter by property, arrival/departure range, confirmed/cancelled/unset source
  status, linked/unlinked review and free-text guest/group name.
- Support allow-listed stay-date sorting and retain filter state across pages.
- Use an accessible table at wide widths and readable stacked rows on narrow
  screens.
- Link each row to a stable UUID detail URL.

## Tests

- Default and alternate sort order.
- Each filter alone and representative combined filters.
- Empty, one-page and multi-page results.
- Escaped wildcard/search characters and Unicode display names.
- Query-string state in pagination and clear-filter links.
- Keyboard-accessible row actions and narrow viewport behavior.

## Acceptance criteria

1. An administrator can locate a reservation without scanning all 89 records.
2. Counts and page boundaries remain correct under combined filters.
3. No conversation, private note, financial value or access material is loaded
   for the list.
4. Invalid query values fall back safely and never alter SQL structure.

## Delivered implementation

- Replaced the reservation placeholder with a server-rendered, database-backed
  list using the E07-F01 privacy-minimized read model.
- Added guest/group search plus property, arrival range, source status and
  review-link filters, with safe ascending/latest-arrival and latest-capture
  ordering.
- Added deterministic pagination at 10, 25, 50 or 100 records per page while
  retaining the complete query string across previous/next navigation.
- Displayed property, stay, party size, source status, confirmation-code
  presence and review-link state without loading detail-only private data.
- Added UUID detail links, an accessible wide-screen table, narrow-screen cards,
  empty results and a live result-count summary.

## Validation

- The live Agent2 list returns all 89 reservations: 55 confirmed, five
  cancelled and 29 with no source status.
- Review-state filters return 52 reservations with confirmed links, three with
  proposals and 37 without any review candidate; categories may overlap where
  a confirmed reservation also has a proposed alternative.
- Integration coverage verifies literal `%` and `_` searches, combined filters,
  date bounds, stable tie ordering, page bounds, empty results and invalid input.
- Route contract coverage verifies filter-state pagination, UUID links and both
  responsive representations.
- Astro checks and the production server build pass.
