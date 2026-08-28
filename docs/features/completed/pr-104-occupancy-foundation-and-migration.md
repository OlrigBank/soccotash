# Proposed PR #104 — Occupancy Foundation and Data Migration

## Status

- Parent branch: `agent/managing-occupancy-epic`
- Feature branch: `agent/pr-104-occupancy-foundation`
- Intended merge target: `agent/managing-occupancy-epic`
- Current status: implemented and verified; ready for review
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

## Implemented outcome

- Migration `046_booking_party_composition.sql` adds authoritative adult, child
  and infant counts, backfills every legacy guest as an adult and retains pets.
- `guests` remains temporarily available with the documented meaning **adults
  plus children**, excluding infants. A database trigger supports legacy writes
  while preventing structured counts and the compatibility total from drifting.
- Shared typed validation rejects fractional or negative counts and requires at
  least one adult before booking creation performs database work.
- The unchanged public form explicitly maps its current guest count to adults.
- Booking repository reads expose the three authoritative counts while existing
  displays continue to use their current aggregate presentation.

## Verification

- Booking lifecycle tests: 55 passed.
- PostgreSQL integration tests: 14 passed, including migration backfill,
  repeat execution, legacy inserts, structured inserts and invalid constraints.
- Astro check: passed with no errors.
- Production build: passed.
- `git diff --check`: passed.
