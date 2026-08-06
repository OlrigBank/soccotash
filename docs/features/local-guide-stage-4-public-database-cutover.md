# Proposed feature — Stage 4: Database-backed public Local Guide cutover

## Status

- Epic: [Local Guide Database Migration](./epics/local-guide-database-migration-epic.md)
- Base and merge target: `agent/local-guide-db-migration-epic`
- Feature branch: `agent/local-guide-stage-4-public-cutover`
- Completion: test, merge locally into the epic branch, recheck, then delete this feature branch
- Implementation: complete
- Depends on: [Stage 3](./local-guide-stage-3-planner-place-pool.md)
- Enables: retirement of the Markdown runtime implementation

## Objective

Make PostgreSQL the sole runtime source for every public Local Guide read.

## Scope

- Switch the index, category pages, entry pages, recommendations and all remaining consumers to the database repository.
- Convert the current static entry route to server-side resolution.
- Resolve application-managed category routes, canonical entry slugs and aliases without namespace ambiguity.
- Redirect aliases to canonical URLs.
- Return a non-disclosing 404 for drafts, unpublished and archived entries.
- Render only the published immutable revision.
- Add one controlled server-side Markdown renderer shared with future preview pages.
- Reject or sanitise raw HTML, dangerous URLs, event handlers and active embedded content.
- Define cache headers so publication and unpublication are immediately effective.
- Add safe diagnostics for lookup and database failures.
- Do not implement a Markdown runtime fallback.

## Acceptance criteria

- Every URL in the migration manifest resolves to reconciled database content.
- Categories, ordering, summaries and recommendations match the baseline.
- Aliases redirect to canonical URLs.
- Non-published content returns 404 and leaks no private metadata.
- New database publications appear without a build and unpublication is immediate.
- Planner and example-plan links resolve database metadata.
- Non-Local-Guide content collections are unaffected.

## Tests

- Canonical, alias, category and 404 route tests.
- Safe Markdown fixtures including malicious and malformed input.
- Database failure and cache-behaviour tests.
- Public and planner browser acceptance tests.

## Out of scope

- Runtime fallback to the old collection.
- Administrator editing pages.

## Implementation record

- Public index, category, featured recommendation and entry reads now use published PostgreSQL revisions exclusively.
- The entry/category route is server-rendered, resolves canonical slugs and aliases, returns non-disclosing 404 responses, and disables response caching so publication changes take effect immediately.
- A shared controlled Markdown renderer escapes raw HTML and permits only a limited safe URL and formatting subset.
- Other Astro content collections remain unchanged.

## Verification record

- All 39 migration-baseline entry URLs returned HTTP 200 from the local Docker deployment.
- Canonical entry and category responses return `Cache-Control: no-store, private`.
- `npm run test:booking-lifecycle`: 35 passed.
- `npm run check`: 0 errors; one pre-existing unused-variable hint in `src/pages/admin/login.astro`.
- `npm run build`: passed.
