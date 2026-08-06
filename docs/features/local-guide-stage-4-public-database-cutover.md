# Proposed feature — Stage 4: Database-backed public Local Guide cutover

## Status

- Epic: [Local Guide Database Migration](./epics/local-guide-database-migration-epic.md)
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

