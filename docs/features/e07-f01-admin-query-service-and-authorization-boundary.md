# E07-F01 — Admin Query Service and Authorization Boundary

## Status

Proposed; depends on E06-F01 through E06-F05.

## Parent epic

[`E07 — Airbnb Administration Dashboard`](epics/e07-f00-airbnb-admin-dashboard.md)

## Objective

Create the typed service/repository boundary used by every Airbnb admin screen,
with bounded pagination and an explicit sensitive-field exclusion contract.

## Scope

- Add `site/src/lib/airbnb-admin/` query types and repository functions.
- Define summary read models for reservations, reviews and reconciliation
  workload counts.
- Define detail read models for later features without returning encrypted
  access codes, encryption metadata or unrestricted raw extraction.
- Implement shared parsing for page, page size, sort direction, property, date,
  status and text filters using allow-lists and bounds.
- Use stable `public_id` values at the page/service boundary.
- Add an Airbnb card to the admin dashboard and an Airbnb entry to both admin
  navigation variants; its initial page may show counts and feature links.
- Document that middleware is the route authorization boundary and add tests
  proving admin pages/APIs cannot be reached anonymously.

## Service contracts

- `getAirbnbDashboardSummary()` returns aggregate review, reservation and
  proposed-reconciliation counts only.
- `listAirbnbReservations(query)` returns `{ items, page, pageSize, total }`.
- `listAirbnbReviews(query)` follows the same pagination envelope.
- No method accepts raw SQL fragments or arbitrary column names.

## Tests

- Page-size minimum, maximum and invalid-value handling.
- Stable ordering when sort values are equal.
- Parameterized text and property filtering.
- Service result keys exclude private ciphertext and raw payloads.
- Anonymous page redirect and API `401` behavior.
- Existing administrator navigation on desktop and mobile.

## Acceptance criteria

1. Later features can build screens without placing SQL in Astro pages.
2. Pagination never returns more than the configured maximum.
3. All external identifiers used by UI routes are UUIDs.
4. Sensitive excluded columns cannot be selected through service options.
5. The admin dashboard reports the imported domain without exposing content.

