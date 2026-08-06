# Proposed feature — Stage 2: Deterministic Local Guide data migration

## Status

- Epic: [Local Guide Database Migration](./epics/local-guide-database-migration-epic.md)
- Depends on: [Stage 1](./local-guide-stage-1-foundation-and-baseline.md)
- Enables: database-backed planner and public consumers

## Objective

Capture every existing Local Guide entry in PostgreSQL through a deterministic numbered migration, with no production-only import step.

## Scope

- Generate migration-owned data from `site/src/content/local-guide/*.md`.
- Preserve filename/content ID, canonical slug, legacy ID, title, summary, legacy text, complete Markdown body, category, image, external link and recommendation state.
- Create one initial immutable revision and published revision pointer for every currently public entry.
- Store a source fingerprint for reconciliation.
- Generate human-readable and machine-readable reconciliation reports.
- Fail generation for duplicate slugs, category-route collisions, unknown categories, malformed frontmatter or content-count differences.
- Warn explicitly about missing or suspicious image paths.
- Make the numbered database migration atomic.

## Acceptance criteria

- Every baseline entry maps to exactly one database entry and initial revision.
- Database values and body fingerprints match the Stage 1 manifest.
- Entry counts, category counts, ordering and recommended results reconcile.
- Failure rolls back the complete content migration.
- Applying the repository migrations produces the same baseline in every environment.
- Runtime still uses the current implementation until the planned cutover.

## Tests

- Migration generation determinism.
- Valid and malformed frontmatter fixtures.
- Duplicate, category and route-collision detection.
- Transaction rollback and reconciliation tests.

## Out of scope

- A reusable runtime importer.
- Public cutover or Markdown fallback.
- Editing imported entries.

