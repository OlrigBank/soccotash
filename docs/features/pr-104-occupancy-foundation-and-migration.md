# Proposed PR #104 — Occupancy Foundation and Data Migration

## Status

- Parent branch: `agent/managing-occupancy-epic`
- Feature branch: `agent/pr-104-occupancy-foundation`
- Intended merge target: `agent/managing-occupancy-epic`
- Database changes: yes
- Public interface changes: none

## Objective

Introduce authoritative adult, child and infant counts without changing the
public booking journey, and migrate every existing guest total to adults using
the approved one-time assumption.

## Implementation

1. Add non-negative adult, child and infant counts to provisional bookings.
2. Require at least one adult at the database and service boundaries.
3. Backfill `adults = guests`, `children = 0` and `infants = 0` while retaining
   the existing pet count.
4. Define one compatibility total for existing consumers and document whether
   it is stored temporarily or derived.
5. Add typed party-composition values and shared validation utilities.
6. Keep the existing public form and downstream output operational during this
   transitional PR.

## Acceptance criteria

- The migration is deterministic and repeatable through the normal migration
  runner.
- Every existing booking has its former guest total recorded as adults.
- Existing pet counts are unchanged.
- Negative counts and a party without an adult are rejected server-side.
- Existing booking pages, pricing and tests remain operational.

## Out of scope

- Occupancy policy administration.
- Public adult, child or infant controls.
- Named occupants, pet details or bespoke resource allocation.
