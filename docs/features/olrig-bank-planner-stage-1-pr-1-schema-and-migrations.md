# Proposed PR — Stage 1.1: Planner schema and migrations

## Status

- Epic: [Olrig Bank Planner](./epics/olrig-bank-planner-epic.md)
- Target branch: `development`
- Suggested feature branch: `feature/planner-schema`
- Depends on: none
- Enables: all later planner PRs

## Objective

Introduce the smallest durable data model needed by both administrator example
plans and later booking-linked guest plans. This PR establishes persistence,
validation boundaries and revision-based concurrency without adding a planner UI.

## Scope

- Add PostgreSQL migrations for `holiday_plans`, `plan_days`, `plan_items` and
  `plan_revisions`.
- Model example and booking-linked plans with one plan type discriminator and a
  nullable booking reference; Stage 1 creates example plans only.
- Add publication state, visibility, optional dates/duration, archive state,
  revision number, ordering values, actor attribution and timestamps.
- Give days and items stable opaque identifiers that remain valid across
  reordering and future AI proposals.
- Add item type and lifecycle status constraints, initially supporting the
  complete lifecycle required by the epic even if Stage 1 uses only part of it.
- Store an optional Local Guide reference as a stable content identifier (the
  current Local Guide is an Astro content collection), without copying guide
  descriptions into planner tables.
- Add typed planner repository operations and domain validation shared by all
  future planner routes.
- Increment a plan revision and append a meaningful revision record in the same
  transaction as each meaningful mutation.

## Architectural decisions

### One aggregate and one mutation boundary

`HolidayPlan` is the aggregate root. Day and item writes go through a planner
service/repository transaction which locks or revision-checks the plan, applies
the change, increments the revision and records history. Routes must not update
planner tables directly.

### Shared model from the outset

Do not create admin-only tables. A later booking-linked plan uses the same plan,
day, item and revision records, with additional participant records introduced
in Stage 2.

### Local Guide references remain references

The database stores the guide entry's stable content slug/ID. Rendering resolves
the current public content through the existing Astro collection. Plan-specific
timing and notes live on the plan item. The migration must not convert the Local
Guide to database-managed content or duplicate its descriptive fields.

### Revisions are concurrency controls, not just display history

Mutations accept an expected revision and fail explicitly when it is stale.
Ordering and status changes are audited like other meaningful mutations.

## Acceptance criteria

- Migrations apply cleanly to an existing database and can be exercised by the
  repository's migration test convention.
- An example plan with ordered days and ordered items can be persisted and read.
- Items may be custom or reference a valid Local Guide identifier.
- Invalid types, statuses, ordering values and parent references are rejected.
- A successful meaningful mutation increments the plan revision and creates a
  revision record atomically.
- A stale expected revision cannot silently overwrite newer work.
- Deleting or archiving a plan cannot accidentally delete Local Guide content.
- No administrator, public planner or guest editing interface is introduced.
- Existing booking, payment and Local Guide tests remain green.

## Tests

- Migration and constraint tests.
- Repository create/read/update transaction tests against PostgreSQL.
- Revision increment, rollback and stale-write tests.
- Ordered day/item and cascade-policy tests.
- Local Guide identifier validation and custom-item tests.
- `npm --prefix site run check`, relevant test suites and production build.

## Out of scope

- Admin pages and mutation routes.
- Publishing and public pages.
- Duplication.
- Participants, booking links, contributions and AI capabilities.
