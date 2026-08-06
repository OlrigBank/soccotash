# Proposed feature — Stage 2: Deterministic Local Guide data migration

## Status

- Implementation: complete
- Epic: [Local Guide Database Migration](./epics/local-guide-database-migration-epic.md)
- Base and merge target: `agent/local-guide-db-migration-epic`
- Feature branch: `agent/local-guide-stage-2-data-migration`
- Completion: test, merge locally into the epic branch, recheck, then delete this feature branch
- Depends on: [Stage 1](./local-guide-stage-1-foundation-and-baseline.md)
- Enables: database-backed planner and public consumers

### Completion evidence

- Generated migration `034_local_guide_content_migration.sql` captures all 39 source entries as published database records and immutable initial revisions.
- The committed reconciliation report includes baseline and payload fingerprints plus per-entry body and source fingerprints.
- Database integration tests reconcile every metadata field and body hash and prove complete rollback on a deliberate conflict.
- One pre-existing missing image path, `/media/images/local-guide/olrigbank.png`, is retained and reported as a non-blocking warning.
- Baseline, determinism, lifecycle, Astro, build and complete PostgreSQL integration checks pass.

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
