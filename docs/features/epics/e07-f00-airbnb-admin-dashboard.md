# E07 — Airbnb Administration Dashboard

## Status

Active. E07-F01 and E07-F02 are complete. This epic is based on the completed
E06 private import branch and is not merged into `development`.

## Epic summary

Provide authenticated administrators with a usable, private interface for the
Airbnb reviews, reservations, conversations, financial records, provenance and
reconciliation decisions stored by E06. The UI will live within the existing
Astro administration dashboard and use a dedicated read/service boundary over
the `airbnb_*` tables.

## Starting point

- [`E06 — Storing Exported Airbnb Data`](e06-f00-storing-exported-airbnb-data.md)
  supplies the normalized schema, imported data and reconciliation rules.
- Existing middleware protects `/admin/*` pages and `/api/admin/*` endpoints
  using database-backed administrator sessions.
- `AdminLayout.astro` supplies responsive navigation, `noindex,nofollow` and
  established administration components.
- The imported Airbnb domain remains separate from live direct bookings.

## Desired outcome

1. Administrators can find and inspect imported Airbnb reservations and reviews.
2. Reservation details expose ordered conversations, financial perspectives,
   private notes and source provenance without mixing them into live bookings.
3. Review details expose category scores, tags, private feedback and the linked
   reservation.
4. Proposed reconciliation candidates can be confirmed or rejected through an
   explicit, audited action.
5. Large result sets are paginated and filtered in PostgreSQL, not loaded and
   filtered in the browser.
6. Sensitive values are minimized: encrypted access codes are not returned or
   displayed by this epic.
7. No imported Airbnb data is reachable through public routes, page payloads,
   logs or search indexing.

## Architectural boundary

The UI reads through `site/src/lib/airbnb-admin/` service/repository modules.
Pages must not embed ad-hoc SQL. Read models expose only fields required for the
current screen and must never contain `access_code_ciphertext`, raw encryption
keys or unrestricted `raw_extraction` payloads.

Server-rendered `/admin/airbnb/*` pages are preferred for lists and detail
views. Mutations use authenticated same-origin `/api/admin/airbnb/*` POST
endpoints with explicit input validation and existing administrator audit
identity. No public endpoint is added.

## Feature sequence

### E07-F01 — Admin query service and authorization boundary

[Feature record](../completed/e07-f01-admin-query-service-and-authorization-boundary.md)

Delivered typed, paginated read models and proved the admin-only privacy
boundary.

### E07-F02 — Reservation list and filtering

[Feature record](../completed/e07-f02-reservation-list-and-filtering.md)

Delivered the Airbnb administration landing page and searchable, responsive
reservation list.

### E07-F03 — Reservation detail, conversation and finances

[Feature record](../e07-f03-reservation-detail-conversation-and-finances.md)

Display a reservation's stay, party, private context, ordered conversation,
financial panels and provenance.

### E07-F04 — Review list and detail

[Feature record](../e07-f04-review-list-and-detail.md)

Add review discovery and a complete review detail screen linked to its stay.

### E07-F05 — Reconciliation review workflow

[Feature record](../e07-f05-reconciliation-review-workflow.md)

Provide an audited UI for proposed candidate confirmation and rejection.

### E07-F06 — Security, accessibility and release verification

[Feature record](../e07-f06-security-accessibility-and-release-verification.md)

Complete responsive, privacy, authorization, accessibility and regression
verification before the branch is considered merge-ready.

## Cross-cutting requirements

- Use stable UUID public identifiers in URLs; never expose internal sequence IDs.
- Parameterize every query and allow-list sort/filter values.
- Paginate lists with deterministic ordering and a bounded page size.
- Preserve filter/query state in navigation between lists and details where
  practical.
- Render private text as text, never unsanitized HTML.
- Do not log guest names, messages, review text, financial amounts,
  confirmation codes, private notes or raw source payloads.
- Do not decrypt or display access codes.
- Do not create notifications or mutate Airbnb/direct-booking records while
  browsing.
- Use semantic headings, tables/lists, visible focus and narrow-screen layouts.

## Epic acceptance criteria

1. An authenticated administrator can complete each read and reconciliation
   workflow on desktop and mobile-sized layouts.
2. Unauthenticated page requests redirect to login and unauthenticated API
   requests return `401` without private payloads.
3. All list filters and pagination are database-backed, deterministic and
   covered by integration tests.
4. Sensitive excluded columns cannot enter ordinary service results.
5. Reconciliation actions are POST-only, validated, conflict-safe and audited.
6. Public routes and generated public artifacts contain no imported private
   data.
7. Existing booking, review and application regression suites remain green.
