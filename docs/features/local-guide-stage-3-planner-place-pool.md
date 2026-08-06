# Proposed feature — Stage 3: Database place pool for example plans

## Status

- Epic: [Local Guide Database Migration](./epics/local-guide-database-migration-epic.md)
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

