# Proposed PR #111 — Occupancy Privacy, Regression and Epic Completion

## Status

- Parent branch: `agent/managing-occupancy-epic`
- Feature branch: `agent/pr-111-occupancy-regression-completion`
- Intended merge target: `agent/managing-occupancy-epic`
- Database changes: cleanup only if verified safe
- Production behaviour changes: hardening and completed coverage

## Objective

Complete the occupancy epic with privacy boundaries, deletion behaviour,
end-to-end regression coverage, migration evidence and operational guidance.

## Implementation

1. Exclude occupant, pet and allocation details from public pages, shared
   itineraries, analytics, indexing and AI representations.
2. Verify private routes use the existing no-store and noindex protections.
3. Extend booking deletion and retention handling to all new records and
   snapshots.
4. Cover policy drafting, modelling, publishing and archival in integration and
   browser tests.
5. Cover standard, bespoke and host-decision request journeys, optional names,
   mixed pets and service animals.
6. Cover pricing, emails, offers, resource conflicts, concurrent acceptance,
   cancellation and migration.
7. Run the complete booking and Planner regression suites against a clean local
   Docker deployment.
8. Document unresolved future work for direct standard booking separately from
   this epic.

## Acceptance criteria

- No private occupancy information appears in a public or shared response.
- Booking deletion handles every newly introduced dependent record.
- A fresh database and a migrated database produce equivalent supported
  behaviour.
- Lifecycle, integration, browser, Astro and production-build checks pass.
- Local Docker acceptance demonstrates standard and bespoke journeys without
  conflicting resources.
- The epic completion report identifies evidence for every epic acceptance
  criterion.

## Out of scope

- Introducing automatic standard booking acceptance.
- Search-engine work involving private booking information.
- Expanding occupancy rules beyond demonstrated operational needs.
