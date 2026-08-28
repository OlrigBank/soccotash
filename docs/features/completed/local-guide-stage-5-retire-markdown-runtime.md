# Proposed feature — Stage 5: Retire the Local Guide Markdown runtime

## Status

- Epic: [Local Guide Database Migration](./epics/local-guide-database-migration-epic.md)
- Base and merge target: `agent/local-guide-db-migration-epic`
- Feature branch: `agent/local-guide-stage-5-retire-markdown`
- Completion: test, merge locally into the epic branch, recheck, then delete this feature branch
- Implementation: complete
- Depends on: [Stage 4](./local-guide-stage-4-public-database-cutover.md)
- Enables: a single unambiguous source of truth

## Objective

Remove the existing Local Guide content-collection implementation immediately after database cutover acceptance.

## Scope

- Remove `localGuide` from the Astro content collection configuration.
- Remove collection-backed Local Guide helpers and planner adapters.
- Remove static Local Guide entry path generation.
- Verify that every public, planner, print and example-plan consumer uses PostgreSQL.
- Retain the original Markdown only as a clearly labelled migration snapshot until recovery acceptance is complete.
- Document that the snapshot is not an application input and cannot be used as runtime fallback.

## Acceptance criteria

- No runtime code calls `getCollection('localGuide')` or reads `site/src/content/local-guide`.
- Public and planner acceptance tests pass with the content collection removed.
- Pages, spaces and accommodation collections remain unchanged.
- PostgreSQL is the sole Local Guide source of truth.

## Tests

- Static contract check for forbidden Local Guide collection reads.
- Production build and public smoke tests.
- Planner selection, rendering and print regression tests.

## Out of scope

- Deleting the migration snapshot before recovery is verified.
- Administration or contribution workflows.

## Implementation record

- The `localGuide` Astro collection, generated collection types and all runtime collection reads were removed.
- Public, planner, print and example-plan consumers now resolve Local Guide data exclusively from PostgreSQL.
- At the user's explicit request, the retired Markdown files were deleted after successful database cutover acceptance rather than retained as a temporary filesystem snapshot.
- The immutable baseline, generated migration SQL and reconciliation report remain in version control as migration and recovery evidence; none is a runtime fallback.
- Pages, listings and spaces content collections remain unchanged.

## Verification record

- Static search found no `getCollection('localGuide')` or Local Guide collection declarations.
- `npm run test:booking-lifecycle`: 35 passed.
- `npm run test:booking-integration` with PostgreSQL and `TZ=UTC`: 10 passed.
- `npm run check` and `npm run build`: passed.
- The cleaned Docker deployment was healthy; all 39 migrated entry URLs and the published 39-place example plan returned HTTP 200.
