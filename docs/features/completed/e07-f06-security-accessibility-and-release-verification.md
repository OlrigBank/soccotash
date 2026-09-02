# E07-F06 — Security, Accessibility and Release Verification

## Status

Complete on `agent2/e07-airbnb-admin-dashboard`; not merged into `development`.

## Parent epic

[`E07 — Airbnb Administration Dashboard`](epics/e07-f00-airbnb-admin-dashboard.md)

## Objective

Verify that the complete Airbnb administration experience is private,
accessible, responsive, operationally safe and ready for review without yet
merging it into `development`.

## Scope

- Add route-level integration tests for every Airbnb page and mutation endpoint.
- Audit service result types and rendered output for excluded access-code and
  raw-extraction fields.
- Verify private text never enters public pages, sitemaps, structured data,
  client logs or ordinary server logs.
- Exercise pagination/filter query plans and add indexes only where measured
  behavior requires them.
- Complete keyboard, focus, heading, table/list, status-message and contrast
  checks.
- Verify phone, tablet and desktop layouts with long names, messages, review
  text and financial descriptions.
- Add dashboard operating notes for administrators and document the intentionally
  unavailable access-code reveal.
- Run the E06 source/database verifier and all existing application suites.

## Verification matrix

- Authenticated and anonymous pages.
- Authenticated, anonymous, invalid and replayed mutations.
- Empty, sparse, ordinary and maximum-content records.
- Proposed, automatic-confirmed, manual-confirmed and rejected links.
- Exact, year-unknown and unresolved message timestamps.
- Narrow mobile viewport, keyboard-only navigation and zoomed text.

## Acceptance criteria

1. No imported Airbnb data is returned to an unauthenticated request.
2. No forbidden sensitive field appears in service results or rendered output.
3. Core workflows pass keyboard and representative responsive checks.
4. Queries remain bounded and deterministic for the imported baseline and
   realistic growth.
5. E06 verification, PostgreSQL integration, review and application checks all
   pass.
6. The E07 branch is documented and review-ready but remains unmerged until the
   user explicitly authorizes a merge into `development`.

## Delivered

- Applied `private, no-store` and `X-Robots-Tag` headers to every admin page,
  admin API response, redirect and maintenance-token response.
- Added static privacy contracts covering all Airbnb UI routes, forbidden
  service/render fields and representative public-route isolation.
- Made the shared skip-link target programmatically focusable.
- Added a three-viewport Playwright suite covering anonymous and authenticated
  behavior, keyboard skip navigation, semantic headings, real reservation and
  review details, and horizontal-overflow checks.
- Added administrator operating notes covering private-data handling,
  reconciliation decisions and the intentionally unavailable access-code
  reveal.

## Completion evidence

- Playwright: 6/6 across desktop, 768 px tablet and 390 px phone Chromium
  profiles.
- Booking lifecycle: 242/242.
- PostgreSQL integration: 28/28.
- Review pipeline: 27/27.
- E06 verifier: 155 PDFs, 52 reviews, 89 reservations, 1,084 conversation
  entries, 178 financial summaries, 52 confirmed and 6 proposed links.
- Production Docker build: Astro check and build passed (one pre-existing unused
  local hint in `admin/login.astro`).
- `EXPLAIN ANALYZE` for reservation, review and proposal lists completed in
  0.142 ms, 0.066 ms and 0.096 ms respectively on the imported baseline. The
  small relations correctly use bounded top-N sorts/sequential scans; no new
  index is justified at this size.
