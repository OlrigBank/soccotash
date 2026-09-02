# E07-F06 — Security, Accessibility and Release Verification

## Status

Proposed; depends on E07-F01 through E07-F05.

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
