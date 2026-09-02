# E07-F02 — Reservation List and Filtering

## Status

Proposed; depends on E07-F01.

## Parent epic

[`E07 — Airbnb Administration Dashboard`](epics/e07-f00-airbnb-admin-dashboard.md)

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

