# E06-F01 — Private Import Schema and Provenance

## Status

Proposed.

## Parent epic

[`E06 — Storing Exported Airbnb Data`](epics/e06-f00-storing-exported-airbnb-data.md)

## Objective

Create the complete private PostgreSQL foundation required to import Airbnb
review and booking PDFs without affecting the operational direct-booking
tables.

## Scope

- Add the twelve `airbnb_*` tables defined by E06.
- Add primary, foreign, unique, check and ordering constraints.
- Add indexes for external IDs, stay dates, import batches, conversation order,
  review publication dates and unresolved reconciliation links.
- Store document paths relative to the repository/private source root and
  require SHA-256 hashes.
- Define source-document and import-batch status values.
- Separate access-code material into restricted private details.
- Add table and sensitive-column comments explaining the privacy boundary.

## Implementation notes

- Use the next ordered migration after the current highest migration.
- External Airbnb IDs are `TEXT`, not numeric database identities.
- Financial values use signed `BIGINT` minor units and currency codes.
- Nullable resolved message timestamps must be accompanied by displayed source
  date/time and a precision value.
- Do not add foreign keys from imported reservations to
  `provisional_bookings`; an optional mapped `property_id` is descriptive only.
- Migration rollback will be tested on a disposable schema rather than added to
  the production migration runner.

## Tests

- Fresh migration succeeds.
- Migration succeeds over the current development schema.
- Duplicate review IDs, conversation IDs and document hashes are rejected.
- Invalid dates, ratings, currencies, ordering positions and perspectives are
  rejected.
- Cascade/restrict behavior preserves provenance as designed.
- Existing booking integration tests remain unchanged and pass.

## Acceptance criteria

1. All E06 tables and indexes exist with documented constraints.
2. No existing direct-booking table changes behavior.
3. Source duplicates can map to one canonical reservation.
4. Sensitive details are structurally separated from ordinary reservation
   queries.
5. Synthetic insert and constraint tests pass against PostgreSQL.
