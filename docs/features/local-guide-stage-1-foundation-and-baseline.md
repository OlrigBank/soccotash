# Proposed feature — Stage 1: Local Guide foundation and baseline

## Status

- Epic: [Local Guide Database Migration](./epics/local-guide-database-migration-epic.md)
- Base and merge target: `agent/local-guide-db-migration-epic`
- Feature branch: `agent/local-guide-stage-1-foundation`
- Completion: test, merge locally into the epic branch, recheck, then delete this feature branch
- Depends on: none
- Enables: all later Local Guide migration features

## Objective

Capture the current Local Guide contract and introduce the database domain needed to migrate it without changing runtime behaviour.

## Scope

- Generate a machine-readable inventory of every current entry, URL, slug, legacy identifier, category, image, recommendation flag, summary and body hash.
- Record baseline entry counts, category counts, ordering and featured results.
- Add `local_guide_entries`, immutable `local_guide_revisions` and `local_guide_slug_aliases`.
- Separate working and published revision pointers so editing published content does not change the live page.
- Add lifecycle state, optimistic locking, actor attribution, timestamps, constraints and indexes.
- Add typed contracts, validation, repository and transactional service boundaries.
- Reject canonical slugs and aliases that collide with each other or application-managed category route IDs.

## Acceptance criteria

- The baseline accounts for every Markdown entry and reports invalid or ambiguous data.
- Migrations apply to empty and populated databases.
- Draft creation, immutable revision creation and lifecycle transitions work transactionally.
- Stale writes cannot overwrite a newer revision.
- Editing a published entry changes only its working revision.
- Existing public and planner behaviour remains unchanged.

## Tests

- Baseline inventory and content-contract tests.
- PostgreSQL migration and constraint tests.
- Revision, lifecycle, rollback and stale-write integration tests.
- Slug, alias and category-route collision tests.

## Out of scope

- Migrating the Markdown data.
- Changing public or planner reads.
- Administration pages.
