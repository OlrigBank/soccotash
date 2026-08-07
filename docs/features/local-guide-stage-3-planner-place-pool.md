# Proposed feature — Stage 3: Database place pool for example plans

## Status

- Epic: [Local Guide Database Migration](./epics/local-guide-database-migration-epic.md)
- Base and merge target: `agent/local-guide-db-migration-epic`
- Feature branch: `agent/local-guide-stage-3-planner-place-pool`
- Completion: test, merge locally into the epic branch, recheck, then delete this feature branch
- Implementation: complete
- Depends on: [Stage 2](./local-guide-stage-2-deterministic-data-migration.md)
- Enables: stable planner references and public cutover

## Objective

Use migrated Local Guide entries as the stable pool of places administrators select when creating and editing example plans.

## Scope

- Implement the canonical database repository for entry lookup, category listing, recommendations and planner selection.
- Add nullable `plan_items.local_guide_entry_id` and backfill existing `local_guide_slug` references.
- Produce an unresolved or ambiguous reference report and block cutover until it is clear.
- Update new planner writes to store the stable entry ID.
- Retain the old slug temporarily as a historical snapshot and rollback aid.
- Replace the example-plan Local Guide selector with a database-backed place picker filtered by title, category and recommendation state.
- Allow only published places to be selected for new plan items.
- Resolve current place metadata without copying the complete guide body into plan items.
- Preserve plan-specific title, timing, description, location, reservation notes and ordering.

## Acceptance criteria

- Every resolvable existing planner reference has a stable entry ID.
- An administrator can select a migrated place for an example plan.
- Slug changes do not break plan references.
- Unpublished entries cannot be newly selected.
- Existing plans remain readable when a referenced entry is unavailable.
- Planner duplication, publication and printing continue to work.

## Tests

- Reference backfill and unresolved-reference integration tests.
- Place-picker permission, filtering and selection tests.
- Slug-change, unpublished-reference and copied-plan tests.
- Existing planner browser regression suite.

## Out of scope

- Public Local Guide cutover.
- Local Guide editing and publication UI.

## Implementation record

- Migration `035_planner_local_guide_entry_references.sql` adds the stable Local Guide entry reference, backfills legacy slugs through canonical slugs or aliases, and aborts atomically when a reference cannot be resolved.
- Planner reads join the current database entry while retaining the recorded slug as a historical snapshot, so slug changes do not break existing plans and unavailable entries remain readable.
- Admin, Booker and participant mutations now select published database entries by stable public ID; copied plans preserve both the stable reference and slug snapshot.
- The example-plan place pickers are database-backed and expose title, category and recommendation state for filtering and selection.

## Verification record

- `npm run test:booking-lifecycle`: 34 passed.
- `npm run test:booking-integration` with the local PostgreSQL test database and `TZ=UTC`: 10 passed.
- `npm run check`: 0 errors; one pre-existing unused-variable hint in `src/pages/admin/login.astro`.
- `npm run build`: passed.
- `git diff --check`: passed.
