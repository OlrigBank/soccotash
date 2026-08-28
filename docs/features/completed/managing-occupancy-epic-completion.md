# Managing Occupancy Epic — Completion Report

## Outcome

This candidate completes the epic when PR 111 is merged into
`agent/managing-occupancy-epic`. It introduces explicit
party composition, versioned occupancy policy, optional private occupant and pet
details, flexible accommodation resources, and conflict-safe bespoke offer
allocation while retaining administrator review for every booking.

## Acceptance evidence

| Epic requirement | Delivered evidence |
| --- | --- |
| Adults, children and infants captured independently; at least one adult | Migration 046, `party-composition.ts`, public request controls and validation tests |
| Booker required; other names optional and grant no access | Migration 049, private shared editor and optional-occupant contract/integration tests |
| Arrangement-specific standard, bespoke and host-decision classification | Versioned policies in migration 047, evaluator, administrator modeller and policy lifecycle integration tests |
| Excess capacity remains reviewable | Booker-safe assessment reasons and non-rejecting request API |
| Pet species, mixed groups and service animals | Structured pet rows, dynamic request controls and PR 108 tests |
| Legacy guests migrate to adults without losing pets | Migration 046 and fresh/migrated equivalence tests |
| Immutable assessment snapshot | Migration 048 and occupancy policy integration tests |
| Consistent pricing, email and booking summaries | Shared party formatter and PR 107 lifecycle contracts |
| Flexible resources and deterministic standard bundles | Migrations 050–051 and resource model tests |
| Bespoke offer allocation remains separate from requested occupancy | Immutable offer allocation snapshot and Booker/email presentation tests |
| Accepted allocations cannot conflict | Advisory locks, active reservation overlap exclusion constraint and concurrent integration test |
| Cancellation and deletion cover new records | Reservation release plus cascade/isolation integration assertions |
| Private information stays private | Shared Planner/AI/public-response privacy contracts, private no-store/noindex headers and administrator middleware |
| Existing booking and Planner behaviour remains supported | Complete lifecycle, integration, booking browser and Planner browser suites |

## Operational decisions recorded

- Unaccepted overlapping offers use a warning policy rather than speculative
  resource holds. Acceptance is first-come and transactionally protected.
- The initial resource inventory distinguishes Olrig Bank core accommodation,
  rear bedrooms 5 and 6, rear bathroom/WC/landing, and independent Cottage
  living space. Administrators may create host-approved bundles.
- Standard bookings continue through administrator review and offer. Future
  direct processing is specified separately in
  [Future Direct Standard Booking](future-direct-standard-booking.md).

## Verification

- 60 booking lifecycle/contract tests passed.
- 19 PostgreSQL integration tests passed against local Docker, including fresh
  versus migrated schemas, concurrent allocation and dependent deletion.
- Local Docker booking regression passed the bespoke negotiation, allocation,
  acceptance and cancellation journey.
- All 3 local Docker Planner/Local Guide browser regressions passed.
- Astro check and production build passed in the Docker image build.
- Local health check passed after deployment.

## Remaining policy choices

Operational thresholds for children, infants, pets and service animals still
need to be agreed before publishing the corresponding production policies.
Those values are administrator-managed policy data, not missing epic code.
